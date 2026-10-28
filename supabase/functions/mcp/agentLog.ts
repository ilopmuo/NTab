/**
 * Lo que hacen los asistentes (Claude, Hermes…) en LUNO, para poder fiarse:
 * cada llamada que cambia algo queda apuntada con quién, qué y cómo estaba
 * antes (ajuste `agentLog`, las últimas 40), y se puede deshacer una a una.
 * Si una petición se repite con el mismo `peticion_id` (un reintento), no se
 * vuelve a hacer. Sin dependencias.
 */
import type { Row } from './ntab.ts'

export const LOG_KEY = 'agentLog'
const MAX_ENTRIES = 40
/** Más grande que esto, se apunta pero sin poder deshacerse (no cabe) */
const MAX_UNDO_CHARS = 60_000

export interface LogChange {
  tbl: string
  id: string
  /** cómo estaba (null: no existía) */
  before: Record<string, unknown> | null
  /** huella de cómo quedó (null: se borró): si ha cambiado después, deshacer no lo pisa */
  after: string | null
}

export interface LogEntry {
  id: string
  at: number
  via: string
  tool: string
  /** el peticion_id que mandó el asistente */
  req?: string
  summary: string
  changes: LogChange[]
  /** demasiado grande para guardar cómo estaba */
  noUndo?: boolean
  undone?: number
}

/** JSON con las claves ordenadas (Postgres no conserva el orden de las claves) */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v ?? null)
}

/** Huella corta de un registro (FNV-1a) */
export function fingerprint(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null
  const s = canonical(data)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(36)}.${s.length}`
}

export function readLog(rows: Row[]): LogEntry[] {
  const v = rows.find((r) => r.tbl === 'settings' && r.id === LOG_KEY)?.data.value
  return Array.isArray(v) ? (v as LogEntry[]) : []
}

export const logRow = (entries: LogEntry[]): Row => ({ tbl: 'settings', id: LOG_KEY, data: { key: LOG_KEY, value: entries.slice(-MAX_ENTRIES) } })

/**
 * Va juntando lo que cambia una llamada: de cada registro, cómo estaba antes de
 * la llamada (la primera vez que se toca) y cómo queda al final.
 */
export function changeRecorder(rows: Row[]) {
  const before = new Map(rows.map((r) => [`${r.tbl}/${r.id}`, r.data]))
  const changes = new Map<string, LogChange>()
  return {
    add(writes: Row[], deletes: Row[] = []) {
      for (const w of writes) {
        if (w.tbl === 'settings' && w.id === LOG_KEY) continue
        const key = `${w.tbl}/${w.id}`
        const prev = changes.get(key)
        changes.set(key, { tbl: w.tbl, id: w.id, before: prev ? prev.before : (before.get(key) ?? null), after: fingerprint(w.data) })
      }
      for (const d of deletes) {
        const key = `${d.tbl}/${d.id}`
        const prev = changes.get(key)
        changes.set(key, { tbl: d.tbl, id: d.id, before: prev ? prev.before : (before.get(key) ?? null), after: null })
      }
    },
    get list() {
      // Lo que no cambió nada (escribir lo mismo que había) no cuenta
      return [...changes.values()].filter((c) => fingerprint(c.before) !== c.after)
    },
  }
}

export function newEntry(args: { id: string; at: number; via: string; tool: string; req?: string; summary: string; changes: LogChange[] }): LogEntry {
  const entry: LogEntry = { ...args, summary: args.summary.replace(/\s+/g, ' ').slice(0, 160) }
  if (!entry.req) delete entry.req
  if (canonical(entry.changes).length > MAX_UNDO_CHARS) {
    entry.changes = entry.changes.map((c) => ({ ...c, before: null }))
    entry.noUndo = true
  }
  return entry
}

/** Lo que haría falta escribir y borrar para dejarlo como estaba; lo que cambió después no se toca */
export function undoPlan(entry: LogEntry, rows: Row[]) {
  const now = new Map(rows.map((r) => [`${r.tbl}/${r.id}`, r]))
  const writes: Row[] = []
  const deletes: Row[] = []
  const skipped: string[] = []
  for (const c of [...entry.changes].reverse()) {
    const current = now.get(`${c.tbl}/${c.id}`)
    if (fingerprint(current?.data ?? null) !== c.after) {
      skipped.push(describe(c, current))
      continue
    }
    if (c.before) writes.push({ tbl: c.tbl, id: c.id, data: c.before })
    else if (current) deletes.push({ tbl: c.tbl, id: c.id, data: current.data })
  }
  return { writes, deletes, skipped }
}

function describe(c: LogChange, current?: Row) {
  const d = (current?.data ?? c.before ?? {}) as Record<string, unknown>
  const name = d.title ?? d.name ?? d.note ?? d.key ?? c.id
  return `${c.tbl} «${String(name)}»`
}

const ago = (ms: number) => {
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'ahora mismo'
  if (min < 60) return `hace ${min} min`
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`
  return `hace ${Math.round(min / 1440)} días`
}

/** ver_historial: lo último que han hecho los asistentes, para revisarlo o deshacerlo */
export function historyText(entries: LogEntry[], now: number, n = 15): string {
  if (!entries.length) return 'Ningún asistente ha cambiado nada todavía.'
  return entries
    .slice(-n)
    .reverse()
    .map((e) => `- [${e.id}] ${ago(now - e.at)} · ${e.via} · ${e.tool}: ${e.summary} (${e.changes.length} ${e.changes.length === 1 ? 'cambio' : 'cambios'})${e.undone ? ' · DESHECHA' : e.noUndo ? ' · no se puede deshacer' : ''}`)
    .join('\n')
}
