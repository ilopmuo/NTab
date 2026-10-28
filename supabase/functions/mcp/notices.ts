/**
 * Los avisos que ya le han dado los asistentes (el resumen de la mañana, un
 * recordatorio, el seguimiento de una espera): qué, cuándo, por dónde y si ha
 * contestado. Para que Hermes no le repita lo mismo por la mañana, por correo
 * y en el seguimiento de esperas. Cada aviso es un registro aparte (tabla
 * `agentNotices` de `records`, que la app no sincroniza), para que dos
 * asistentes que avisan a la vez no se pisen; los de antes siguen en el ajuste
 * `agentNotices` (una lista) y se leen junto a los nuevos. Con lo mínimo: no
 * guarda el mensaje entero, solo de qué iba.
 *
 * Retención: se ven (y se pueden responder) los de las últimas dos semanas,
 * como mucho los 60 últimos; se guardan 30 días, y a partir de ahí se borran
 * al apuntar uno nuevo. Solo se borra por edad, nunca por número ni por lo que
 * se acaba de leer: lo que otro asistente apunte a la vez es siempre reciente
 * (y solo se responde a lo que se ve), así que no se borra con una lectura
 * vieja. Un peticion_id se reconoce mientras su aviso esté guardado (30 días).
 *
 * No es un cambio de sus cosas: no entra en el historial ni se deshace.
 */
import { hhmmIn, ymdIn, addDays } from '../_shared/time.ts'
import { cleanExcerpt } from '../_shared/waitReplies.ts'
import { fingerprint } from './agentLog.ts'
import type { Env, Row, WriteResult } from './ntab.ts'

export const NOTICES_KEY = 'agentNotices'
/** Un registro por aviso (no está entre las tablas de la app: ni se descarga ni se sube desde ella) */
export const NOTICES_TBL = 'agentNotices'
/** Y uno por respuesta: dos respuestas a la vez no se pisan */
export const REPLIES_TBL = 'agentNoticeReplies'
const MAX = 60
/** se ven */
const KEEP_MS = 14 * 864e5
/** se guardan */
const PURGE_MS = 30 * 864e5

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
  /** la última respuesta (en el formato de antes, la única) */
  respuesta?: { at: number; text: string }
  /** al leer: las anteriores, de la más antigua a la más reciente */
  antes?: string[]
}

/** Una respuesta a un aviso (registro aparte) */
interface Reply {
  id: string
  aviso: string
  at: number
  via: string
  text: string
  /** el peticion_id: su reintento con lo mismo no escribe nada; con otra cosa, es un conflicto */
  req?: string
}

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Los de la lista de antes (ajuste) */
function legacyNotices(rows: Row[]): Notice[] {
  const v = rows.find((r) => r.tbl === 'settings' && r.id === NOTICES_KEY)?.data.value
  return Array.isArray(v) ? (v as Notice[]) : []
}

/** Todos los guardados: los de la lista de antes y los registros nuevos, por orden; si uno está en los dos, manda el registro */
function allNotices(rows: Row[]): Notice[] {
  const byId = new Map(legacyNotices(rows).map((n) => [n.id, n]))
  for (const r of rows) if (r.tbl === NOTICES_TBL) byId.set(r.id, r.data as unknown as Notice)
  // Las respuestas: la que traía el aviso y las de sus registros, por orden; manda la última
  const replies = new Map<string, { at: number; text: string }[]>()
  for (const n of byId.values()) if (n.respuesta) replies.set(n.id, [n.respuesta])
  for (const r of rows) {
    if (r.tbl !== REPLIES_TBL) continue
    const x = r.data as unknown as Reply
    if (byId.has(x.aviso)) replies.set(x.aviso, [...(replies.get(x.aviso) ?? []), { at: x.at, text: x.text }])
  }
  for (const [id, list] of replies) {
    list.sort((a, b) => a.at - b.at)
    const last = list.at(-1)!
    const antes = [...new Set(list.slice(0, -1).map((x) => x.text))].filter((t) => t !== last.text)
    byId.set(id, { ...byId.get(id)!, respuesta: last, ...(antes.length ? { antes } : {}) })
  }
  return [...byId.values()].sort((a, b) => a.at - b.at)
}

/** Los que se ven: de las dos últimas semanas, como mucho los MAX últimos */
export function readNotices(rows: Row[], now: number): Notice[] {
  return allNotices(rows)
    .filter((n) => now - n.at < KEEP_MS)
    .slice(-MAX)
}

/**
 * Id estable de un aviso con peticion_id, por asistente: dos reintentos que
 * lleguen a la vez escriben el mismo registro en vez de dos, y el mismo
 * peticion_id de otro asistente da otro. Dos huellas FNV-1a de 32 bits
 * (empieza por «p»: no se confunde con los de 8 cifras sin peticion_id).
 */
export function requestNoticeId(via: string, req: string) {
  const key = `${via}\u0000${req}`
  const fnv = (h: number) => {
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193)
    return (h >>> 0).toString(36).padStart(7, '0')
  }
  return `p${fnv(0x811c9dc5)}${fnv(0x2f9be6cc)}`
}

/** Id nuevo sin peticion_id: el UUID entero (sin guiones), para que dos que empiecen igual no se pisen */
const fullId = (env: Env) => env.newId().replace(/-/g, '')

const noticeRow = (n: Notice): Row => ({ tbl: NOTICES_TBL, id: n.id, data: n as unknown as Data })

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
  if (n.respuesta) return `respondió: «${n.respuesta.text}»${n.antes?.length ? ` (antes: «${n.antes.join('», «')}»)` : ''}`
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

/** Lo que se borra al apuntar uno: avisos y respuestas de hace más de 30 días (la lista de antes no se toca) */
function purged(rows: Row[], now: number): Row[] {
  return rows.filter((r) => (r.tbl === NOTICES_TBL || r.tbl === REPLIES_TBL) && now - Number(r.data.at) >= PURGE_MS)
}

/**
 * apuntar_aviso: lo que acaba de decirle (con `sobre` y `tema`) o, con `aviso`
 * y `respuesta`, lo que ha contestado.
 *
 * peticion_id (por asistente): si ya se apuntó con lo mismo, no se escribe
 * nada; si se usó para otra cosa (otro tema, otra respuesta u otro aviso), es
 * un conflicto y no se pisa lo que había. Dos llamadas con el mismo peticion_id
 * que lleguen a la vez escriben el mismo registro: con lo mismo da igual; con
 * contenido distinto queda el último (sin una escritura condicional en el
 * almacén no se puede garantizar que gane el primero).
 */
export function saveNotice(rows: Row[], args: Data, env: Env): WriteResult & { deletes?: Row[]; error?: boolean } {
  // Se responde a lo que se ve; un peticion_id se busca en todo lo guardado
  const list = readNotices(rows, env.now)
  const all = allNotices(rows)
  const tasks = tasksById(rows)
  const via = env.via || 'asistente'
  const req = str(args.peticion_id).trim().slice(0, 100)
  const id = str(args.aviso).trim()
  if (id) {
    const n = list.find((x) => x.id === id)
    if (!n) return { writes: [], report: [`No encuentro el aviso ${id}. Mira AVISOS YA DADOS en ver_resumen o ver_novedades.`], error: true }
    const text = cleanExcerpt(args.respuesta, 80)
    if (!text) return { writes: [], report: ['Falta la respuesta («hecho», «lo pospone», «no le interesa»…).'], error: true }
    const prev = req ? rows.map((r) => (r.tbl === REPLIES_TBL ? (r.data as unknown as Reply) : undefined)).find((x) => x && x.req === req && x.via === via) : undefined
    if (prev) {
      if (prev.aviso === id && prev.text === text) return { writes: [], report: [`Ya estaba apuntada (peticion_id ${req}): al aviso [${id}] respondió «${text}».`] }
      return { writes: [], report: [`No la apunto: el peticion_id ${req} ya se usó para otra respuesta (al aviso [${prev.aviso}]: «${prev.text}»). Si es otra respuesta, usa otro peticion_id.`], error: true }
    }
    // Un registro por respuesta: dos a la vez no se pisan
    const reply: Reply = { id: req ? requestNoticeId(via, req) : fullId(env), aviso: id, at: env.now, via, text, ...(req ? { req } : {}) }
    return { writes: [{ tbl: REPLIES_TBL, id: reply.id, data: reply as unknown as Data }], report: [`Apuntado: al aviso [${id}] («${n.tema}») respondió «${text}».`] }
  }
  const tema = cleanExcerpt(args.tema, 140)
  const refs = [
    ...new Set(
      (Array.isArray(args.sobre) ? args.sobre : [])
        .map((x) => cleanExcerpt(x, 60))
        .filter(Boolean)
        .slice(0, 10),
    ),
  ]
  const canal = cleanExcerpt(args.canal, 20).toLowerCase()
  const again = req ? all.find((x) => x.req === req && x.via === via) : undefined
  if (again) {
    const same = again.tema === tema && (again.canal ?? '') === canal && [...again.sobre.map((x) => x.ref)].sort().join('\u0000') === [...refs].sort().join('\u0000')
    if (same) return { writes: [], report: [`Ya estaba apuntado (peticion_id ${req}): aviso [${again.id}].`] }
    return { writes: [], report: [`No lo apunto: el peticion_id ${req} ya se usó para otro aviso [${again.id}] («${again.tema}»). Si es otro aviso, usa otro peticion_id.`], error: true }
  }
  if (!tema || !refs.length) return { writes: [], report: ['Falta qué le has dicho (tema) y sobre qué (sobre: ids de tareas o «resumen», «medicación»…).'], error: true }
  const notice: Notice = {
    id: req ? requestNoticeId(via, req) : fullId(env),
    at: env.now,
    via,
    ...(canal ? { canal } : {}),
    tema,
    sobre: refs.map((ref) => (tasks.has(ref) ? { ref, fp: taskFp(tasks.get(ref))! } : { ref })),
    ...(req ? { req } : {}),
  }
  return {
    writes: [noticeRow(notice)],
    deletes: purged(rows, env.now),
    report: [`Aviso apuntado [${notice.id}]: «${tema}» (sobre: ${about(notice, tasks)}). Cuando conteste, apuntar_aviso con aviso=${notice.id} y su respuesta.`],
  }
}

/** Para el resumen: lo que ya se le ha dicho en las últimas 24 h */
export function noticeLines(rows: Row[], env: Env): string[] {
  const recent = readNotices(rows, env.now).filter((n) => env.now - n.at < 864e5)
  if (!recent.length) return []
  const tasks = tasksById(rows)
  return [
    `\nAVISOS QUE YA LE HAN DADO LOS ASISTENTES (últimas 24 h) — no repitas lo mismo si no hay novedad ni ha respondido:`,
    ...recent.reverse().map((n) => line(n, tasks, env)),
  ]
}

/** El último aviso sobre una tarea (de la última semana), para ver_esperas */
export function lastNoticeAbout(rows: Row[], env: Env, taskId: string): string | undefined {
  const n = readNotices(rows, env.now)
    .filter((x) => env.now - x.at < 7 * 864e5 && x.sobre.some((s) => s.ref === taskId))
    .at(-1)
  return n ? `AVISADO ${whenLabel(n.at, env)}${n.canal ? ` por ${n.canal}` : ''} (${n.via}): ${state(n, tasksById(rows)).toLowerCase()} [aviso ${n.id}]` : undefined
}

/** Para ver_novedades: avisos desde la última revisión y respuestas nuevas (sin los de `except`, que ya los sabe) */
export function noticesSince(rows: Row[], env: Env, since: number, except?: string): string[] {
  const tasks = tasksById(rows)
  const list = readNotices(rows, env.now).filter((n) => n.via !== except && (n.at >= since || (n.respuesta && n.respuesta.at >= since)))
  return list.length ? [`\nAVISOS DESDE ENTONCES (${list.length}):`, ...list.map((n) => line(n, tasks, env))] : []
}
