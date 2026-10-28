/**
 * Los avisos que ya le han dado los asistentes (el resumen de la mañana, un
 * recordatorio, el seguimiento de una espera): qué, cuándo, por dónde y si ha
 * contestado. Para que Hermes no le repita lo mismo por la mañana, por correo
 * y en el seguimiento de esperas. En el ajuste `agentNotices` (los de las
 * últimas dos semanas, como mucho 60), con lo mínimo: no guarda el mensaje
 * entero, solo de qué iba.
 *
 * No es un cambio de sus cosas: no entra en el historial ni se deshace.
 */
import { hhmmIn, ymdIn, addDays } from '../_shared/time.ts'
import { cleanExcerpt } from '../_shared/waitReplies.ts'
import { fingerprint } from './agentLog.ts'
import type { Env, Row, WriteResult } from './ntab.ts'

export const NOTICES_KEY = 'agentNotices'
const MAX = 60
const KEEP_MS = 14 * 864e5

export interface Notice {
  id: string
  at: number
  /** quién avisó: hermes, claude… */
  via: string
  /** por dónde: telegram, whatsapp, correo… */
  canal?: string
  /** de qué iba, en pocas palabras */
  tema: string
  /** sobre qué: ids de tareas (con la huella de cómo estaban) o temas generales («resumen») */
  sobre: { ref: string; fp?: string }[]
  /** el peticion_id: un reintento no lo apunta dos veces */
  req?: string
  respuesta?: { at: number; text: string }
}

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function readNotices(rows: Row[]): Notice[] {
  const v = rows.find((r) => r.tbl === 'settings' && r.id === NOTICES_KEY)?.data.value
  return Array.isArray(v) ? (v as Notice[]) : []
}

const noticesRow = (list: Notice[], now: number): Row => ({
  tbl: 'settings',
  id: NOTICES_KEY,
  data: { key: NOTICES_KEY, value: list.filter((n) => now - n.at < KEEP_MS).slice(-MAX) },
})

/** Lo que cuenta de una tarea para saber si ha cambiado desde el aviso */
const taskFp = (d: Data | undefined) => (d ? fingerprint({ done: d.done, dueDate: d.dueDate, dueTime: d.dueTime, waitingFor: d.waitingFor, title: d.title }) : null)
const tasksById = (rows: Row[]) => new Map(rows.filter((r) => r.tbl === 'tasks').map((r) => [r.id, r.data]))

/** «hoy 08:02», «ayer 21:30», «2026-09-20 10:00» */
export function whenLabel(ms: number, env: Env) {
  const day = ymdIn(ms, env.tz)
  const today = ymdIn(env.now, env.tz)
  return `${day === today ? 'hoy' : day === addDays(today, -1) ? 'ayer' : day} ${hhmmIn(ms, env.tz)}`
}

/** Cómo está: contestado, ha cambiado algo de lo que trataba o sin respuesta */
function state(n: Notice, tasks: Map<string, Data>) {
  if (n.respuesta) return `respondió: «${n.respuesta.text}»`
  const changed = n.sobre
    .filter((s) => s.fp)
    .map((s) => {
      const t = tasks.get(s.ref)
      if (!t) return `«${s.ref}» ya no existe`
      if (taskFp(t) === s.fp) return ''
      return `«${str(t.title)}»${t.done ? ' está hecha' : ' ha cambiado'}`
    })
    .filter(Boolean)
  return changed.length ? `sin respuesta, pero desde el aviso ${changed.join(', ')}` : 'SIN RESPUESTA'
}

function about(n: Notice, tasks: Map<string, Data>) {
  return n.sobre.map((s) => (s.fp ? `«${str(tasks.get(s.ref)?.title) || s.ref}» [${s.ref}]` : s.ref)).join(', ')
}

const line = (n: Notice, tasks: Map<string, Data>, env: Env) =>
  `- [${n.id}] ${whenLabel(n.at, env)} · ${n.via}${n.canal ? ` por ${n.canal}` : ''} · «${n.tema}» · sobre: ${about(n, tasks)} · ${state(n, tasks)}`

/**
 * apuntar_aviso: lo que acaba de decirle (con `sobre` y `tema`) o, con `aviso`
 * y `respuesta`, lo que ha contestado.
 */
export function saveNotice(rows: Row[], args: Data, env: Env): WriteResult {
  const list = readNotices(rows)
  const tasks = tasksById(rows)
  const id = str(args.aviso).trim()
  if (id) {
    const n = list.find((x) => x.id === id)
    if (!n) return { writes: [], report: [`No encuentro el aviso ${id}. Mira AVISOS YA DADOS en ver_resumen o ver_novedades.`] }
    const text = cleanExcerpt(args.respuesta, 80)
    if (!text) return { writes: [], report: ['Falta la respuesta («hecho», «lo pospone», «no le interesa»…).'] }
    const next = list.map((x) => (x.id === id ? { ...x, respuesta: { at: env.now, text } } : x))
    return { writes: [noticesRow(next, env.now)], report: [`Apuntado: al aviso [${id}] («${n.tema}») respondió «${text}».`] }
  }
  const req = str(args.peticion_id).trim().slice(0, 100)
  const again = req ? list.find((x) => x.req === req) : undefined
  if (again) return { writes: [], report: [`Ya estaba apuntado (peticion_id ${req}): aviso [${again.id}].`] }
  const tema = cleanExcerpt(args.tema, 140)
  const refs = (Array.isArray(args.sobre) ? args.sobre : [])
    .map((x) => cleanExcerpt(x, 60))
    .filter(Boolean)
    .slice(0, 10)
  if (!tema || !refs.length) return { writes: [], report: ['Falta qué le has dicho (tema) y sobre qué (sobre: ids de tareas o «resumen», «medicación»…).'] }
  const notice: Notice = {
    id: env.newId().replace(/-/g, '').slice(0, 8),
    at: env.now,
    via: env.via || 'asistente',
    ...(cleanExcerpt(args.canal, 20) ? { canal: cleanExcerpt(args.canal, 20).toLowerCase() } : {}),
    tema,
    sobre: [...new Set(refs)].map((ref) => (tasks.has(ref) ? { ref, fp: taskFp(tasks.get(ref))! } : { ref })),
    ...(req ? { req } : {}),
  }
  return {
    writes: [noticesRow([...list, notice], env.now)],
    report: [`Aviso apuntado [${notice.id}]: «${tema}» (sobre: ${about(notice, tasks)}). Cuando conteste, apuntar_aviso con aviso=${notice.id} y su respuesta.`],
  }
}

/** Para el resumen: lo que ya se le ha dicho en las últimas 24 h */
export function noticeLines(rows: Row[], env: Env): string[] {
  const recent = readNotices(rows).filter((n) => env.now - n.at < 864e5)
  if (!recent.length) return []
  const tasks = tasksById(rows)
  return [
    `\nAVISOS QUE YA LE HAN DADO LOS ASISTENTES (últimas 24 h) — no repitas lo mismo si no hay novedad ni ha respondido:`,
    ...recent.reverse().map((n) => line(n, tasks, env)),
  ]
}

/** El último aviso sobre una tarea (de la última semana), para ver_esperas */
export function lastNoticeAbout(rows: Row[], env: Env, taskId: string): string | undefined {
  const n = readNotices(rows)
    .filter((x) => env.now - x.at < 7 * 864e5 && x.sobre.some((s) => s.ref === taskId))
    .at(-1)
  return n ? `AVISADO ${whenLabel(n.at, env)}${n.canal ? ` por ${n.canal}` : ''} (${n.via}): ${state(n, tasksById(rows)).toLowerCase()} [aviso ${n.id}]` : undefined
}

/** Para ver_novedades: avisos desde la última revisión y respuestas nuevas (sin los de `except`, que ya los sabe) */
export function noticesSince(rows: Row[], env: Env, since: number, except?: string): string[] {
  const tasks = tasksById(rows)
  const list = readNotices(rows).filter((n) => n.via !== except && (n.at >= since || (n.respuesta && n.respuesta.at >= since)))
  return list.length ? [`\nAVISOS DESDE ENTONCES (${list.length}):`, ...list.map((n) => line(n, tasks, env))] : []
}
