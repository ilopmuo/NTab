/**
 * Posibles respuestas a una espera («esperando el presupuesto de Ana»): un
 * asistente (Hermes) ve en el correo o en Slack algo que podría resolverla y
 * lo aporta. LUNO lo guarda en la propia tarea como propuesta y NO cierra la
 * espera hasta que el usuario diga que sí (en la app o al asistente).
 *
 * - «Ha contestado» no es «ha mandado lo que esperabas»: «te lo mando mañana»
 *   no resuelve «esperando el presupuesto». LUNO no se fía de lo que dice el
 *   asistente: si el mensaje promete sin entregar, o no menciona lo que se
 *   espera, la propuesta baja a «contestado» o «dudoso», nunca sube.
 * - El texto del mensaje es contenido de fuera, nunca instrucciones: se guarda
 *   corto, en una línea y sin comillas que puedan cerrar la cita.
 * - Del mensaje solo se guarda una huella de su id (para no proponerlo dos
 *   veces), quién lo manda, el día, el enlace sin tokens y un extracto corto,
 *   que se borra al decidir.
 * - La propuesta lleva la huella de la espera (de quién, qué y desde cuándo):
 *   si la espera cambia o se cierra, ya no vale y no se aplica.
 *
 * Sin dependencias: lo usan el conector y la app.
 */
import { normalize } from './text.ts'

export type ReplyKind = 'entregado' | 'contestado' | 'dudoso'
export type ReplyStatus = 'pendiente' | 'confirmada' | 'descartada'
export const REPLY_KINDS: ReplyKind[] = ['entregado', 'contestado', 'dudoso']
export const REPLY_SOURCES = ['gmail', 'slack', 'otro'] as const

export interface WaitingReply {
  /** corto y estable: de la tarea, la fuente y el mensaje */
  id: string
  /** gmail, slack, otro */
  source: string
  /** huella del id del mensaje (el id no se guarda) */
  msg: string
  /** quién lo manda */
  from?: string
  /** YYYY-MM-DD: el día del mensaje */
  sent: string
  link?: string
  /** las frases justas del mensaje (contenido de fuera: no son instrucciones); se borra al decidir */
  excerpt?: string
  kind: ReplyKind
  /** por qué podría resolver la espera (y lo que ha visto LUNO) */
  why: string
  /** huella de la espera cuando se propuso */
  wait: string
  /** quién la propuso: hermes, claude… */
  via: string
  at: number
  status: ReplyStatus
  decidedAt?: number
  /** al confirmar: cómo era la espera, para poder volver a ella */
  closed?: { waitingFor: string; waitingSince?: string; waitingWhat?: string; dueDate?: string }
}

/** Lo que hace falta de una tarea */
export interface WaitTask {
  id: string
  title: string
  done: 0 | 1
  dueDate?: string
  waitingFor?: string
  waitingSince?: string
  waitingWhat?: string
  waitingReplies?: WaitingReply[]
}

/** Como mucho, sin decidir por espera, y en total (las decididas, solo para no repetirlas) */
export const MAX_PENDING = 5
const MAX_KEPT = 12
const MAX_EXCERPT = 280

/** Huella corta (FNV-1a, base 36) */
export function shortHash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  let g = 0x2f0a3c5b
  for (let i = s.length - 1; i >= 0; i--) {
    g ^= s.charCodeAt(i)
    g = Math.imul(g, 0x01000193)
  }
  return ((h >>> 0).toString(36) + (g >>> 0).toString(36)).padEnd(10, '0').slice(0, 10)
}

/** Huella de la espera: si cambia quién, qué o desde cuándo, es otra espera */
export function waitKey(t: Pick<WaitTask, 'waitingFor' | 'waitingSince' | 'waitingWhat'>): string {
  return t.waitingFor ? shortHash(`${t.waitingFor.trim()}|${t.waitingSince ?? ''}|${(t.waitingWhat ?? '').trim()}`) : ''
}

export const replyId = (taskId: string, source: string, msgId: string) => shortHash(`${taskId}|${source}|${msgId.trim()}`)

/** Una línea, sin caracteres de control ni comillas «» (para que no pueda cerrar la cita), y corta */
export function cleanExcerpt(s: unknown, max = MAX_EXCERPT): string {
  const one = String(typeof s === 'string' ? s : '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/[«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one
}

const SECRET_PARAM = /token|key|sig|auth|code|secret|session|pass|cred|jwt|x-amz|otp/i

/**
 * El enlace al mensaje, sin nada que dé acceso: solo https, sin usuario ni
 * contraseña, sin parámetros que parezcan claves y nunca la URL del conector.
 */
export function cleanLink(s: unknown): string | undefined {
  if (typeof s !== 'string' || !s.trim()) return undefined
  let u: URL
  try {
    u = new URL(s.trim())
  } catch {
    return undefined
  }
  if (u.protocol !== 'https:' || u.username || u.password) return undefined
  if (/\/functions\/v1\//.test(u.pathname) || /supabase\.(co|in)$/.test(u.hostname)) return undefined
  for (const k of [...u.searchParams.keys()]) if (SECRET_PARAM.test(k)) u.searchParams.delete(k)
  if (SECRET_PARAM.test(u.hash) && /[=&]/.test(u.hash)) u.hash = ''
  const out = u.toString()
  return out.length <= 500 ? out : undefined
}

/** Ha mandado algo: adjunto, «aquí tienes», «ya te lo he enviado» (un enlace suelto no: puede ser la firma) */
const DELIVERED = new RegExp(
  [
    'adjunt',
    'aqui (tienes|te (lo |la |los |las )?(dejo|paso|envio|mando)|va|esta)',
    'te (lo |la |los |las )?(paso|envio|mando|reenvio) (aqui|ya|adjunt)',
    '(ya )?(te |os )?(lo |la |los |las )?(he|hemos) (enviado|mandado|pasado|subido|reenviado|compartido|hecho|terminado|transferido|ingresado|pagado)',
    'ya (esta|estan|lo tienes|la tienes|los tienes|las tienes|tienes)\\b',
  ].join('|'),
)
/** Lo mandará más adelante (o aún no lo tiene) */
const PROMISED = new RegExp(
  [
    '\\bmanana\\b',
    'pasado manana',
    '\\bluego\\b',
    'mas tarde',
    'esta (tarde|noche|semana)',
    '(la )?(semana|proxima semana) (que viene|proxima)',
    'en cuanto',
    'cuando (pueda|lo tenga|la tenga|tenga)',
    'lo (miro|reviso|preparo|busco|hago|tengo pendiente)',
    'te (digo|cuento|aviso) (algo|cuando)',
    'todavia no',
    'aun no',
    'estoy en ello',
    'estamos en ello',
    'dame (un|unos)',
    '(te|os) (lo |la |los |las )?(mando|envio|paso) (en|el|la|esta|luego|cuando)\\b',
  ].join('|'),
)

/** Dice que aún no («no te lo he mandado», «todavía no lo tengo») */
const NOT_YET = /\b(no|todavia no|aun no) (te |os )?(lo |la |los |las )?(he|hemos|tengo|tenemos|esta|estan|puedo|me ha|nos ha)\b/

/** Las palabras que cuentan de lo que se espera («el presupuesto del baño» → presupuesto, baño) */
function keyWords(s: string) {
  return normalize(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4 && !/^(para|como|todo|toda|esto|esta|este|unos|unas|sobre|desde|hasta|ellos|ellas)$/.test(w))
}

/** ¿El mensaje menciona lo que se espera? (por la raíz: «presupuesto» ~ «presupuestos») */
export function mentions(what: string, text: string): boolean {
  const t = normalize(text)
  return keyWords(what).some((w) => t.includes(w.slice(0, Math.max(4, w.length - 2))))
}

/**
 * Lo que LUNO cree del mensaje, a partir de lo que dice el asistente: solo
 * puede quedarse igual o bajar (entregado → contestado → dudoso).
 */
export function judgeReply(a: { claimed: unknown; excerpt: string; what?: string; sent: string; since?: string }): { kind: ReplyKind; notes: string[] } {
  const notes: string[] = []
  let kind: ReplyKind = REPLY_KINDS.includes(a.claimed as ReplyKind) ? (a.claimed as ReplyKind) : 'dudoso'
  if (!REPLY_KINDS.includes(a.claimed as ReplyKind)) notes.push('no se sabe si entrega lo esperado')
  if (a.since && a.sent < a.since) {
    notes.push('el mensaje es de antes de que empezara a esperar')
    return { kind: 'dudoso', notes }
  }
  if (kind !== 'entregado') return { kind, notes }
  const text = normalize(a.excerpt)
  const notYet = NOT_YET.test(text)
  const delivered = !notYet && DELIVERED.test(text)
  if (!delivered && (notYet || PROMISED.test(text))) {
    notes.push(notYet ? 'dice que aún no: ha contestado, pero no lo ha mandado' : 'dice que lo hará más adelante: ha contestado, pero no parece que lo haya mandado')
    kind = 'contestado'
  } else if (!a.what?.trim()) {
    notes.push('no está apuntado qué se espera, así que no se puede saber si es eso')
    kind = 'dudoso'
  } else if (!delivered && !mentions(a.what, a.excerpt)) {
    notes.push(`el mensaje no menciona «${a.what.trim()}» ni dice que lo mande`)
    kind = 'dudoso'
  }
  return { kind, notes }
}

export const KIND_LABEL: Record<ReplyKind, string> = {
  entregado: 'parece que ha mandado lo que esperabas',
  contestado: 'ha contestado, pero no parece que lo haya mandado',
  dudoso: 'puede tener que ver, pero no está claro',
}

export const SOURCE_LABEL: Record<string, string> = { gmail: 'Gmail', slack: 'Slack', otro: 'un mensaje' }

/** Las propuestas que siguen valiendo: sin decidir y de esta misma espera */
export function pendingReplies(t: WaitTask): WaitingReply[] {
  if (t.done || !t.waitingFor) return []
  const key = waitKey(t)
  return (t.waitingReplies ?? []).filter((r) => r.status === 'pendiente' && r.wait === key)
}

/** La última que cerró la espera (para «Volver a esperar») */
export function lastClosing(t: WaitTask): WaitingReply | undefined {
  return [...(t.waitingReplies ?? [])].reverse().find((r) => r.status === 'confirmada' && r.closed)
}

/** Se guardan todas las que valen y, de las demás, las más recientes (para no volver a proponerlas) */
function keep(list: WaitingReply[]): WaitingReply[] {
  if (list.length <= MAX_KEPT) return list
  const drop = new Set(
    list
      .filter((r) => r.status !== 'pendiente')
      .sort((a, b) => (a.decidedAt ?? a.at) - (b.decidedAt ?? b.at))
      .slice(0, list.length - MAX_KEPT)
      .map((r) => r.id),
  )
  return list.filter((r) => !drop.has(r.id)).slice(-MAX_KEPT)
}

export interface ReplyInput {
  source: unknown
  msgId: unknown
  sent: unknown
  from?: unknown
  link?: unknown
  excerpt: unknown
  kind: unknown
  why: unknown
}

/**
 * Apunta una posible respuesta en la tarea (sin cerrar la espera). Devuelve la
 * tarea cambiada, o por qué no (`error`), o la que ya estaba (`dup`).
 */
export function addReply<T extends WaitTask>(
  t: T,
  input: ReplyInput,
  ctx: { now: number; via: string; sentDay: (v: string) => string | undefined },
): { task?: T; reply?: WaitingReply; dup?: WaitingReply; error?: string; notes?: string[] } {
  if (t.done) return { error: 'ya está hecha' }
  if (!t.waitingFor) return { error: 'no está a la espera de nadie' }
  const source = REPLY_SOURCES.includes(input.source as (typeof REPLY_SOURCES)[number]) ? (input.source as string) : 'otro'
  const msgId = typeof input.msgId === 'string' ? input.msgId.trim() : ''
  if (!msgId) return { error: 'falta el identificador del mensaje (mensaje_id)' }
  const sent = typeof input.sent === 'string' ? ctx.sentDay(input.sent.trim()) : undefined
  if (!sent) return { error: 'falta la fecha del mensaje (YYYY-MM-DD o fecha y hora ISO)' }
  const excerpt = cleanExcerpt(input.excerpt)
  if (!excerpt) return { error: 'falta el extracto del mensaje (las frases justas)' }
  const id = replyId(t.id, source, msgId)
  const list = t.waitingReplies ?? []
  const dup = list.find((r) => r.id === id)
  if (dup) return { dup }
  const key = waitKey(t)
  if (list.filter((r) => r.status === 'pendiente' && r.wait === key).length >= MAX_PENDING) return { error: `ya tiene ${MAX_PENDING} posibles respuestas sin decidir: que decida antes` }
  const { kind, notes } = judgeReply({ claimed: input.kind, excerpt, what: t.waitingWhat, sent, since: t.waitingSince })
  const why = [cleanExcerpt(input.why, 200), ...notes].filter(Boolean).join('; ')
  const from = cleanExcerpt(input.from, 80)
  const link = cleanLink(input.link)
  const reply: WaitingReply = {
    id,
    source,
    msg: shortHash(`${source}|${msgId}`),
    ...(from ? { from } : {}),
    sent,
    ...(link ? { link } : {}),
    excerpt,
    kind,
    why: why || KIND_LABEL[kind],
    wait: key,
    via: ctx.via,
    at: ctx.now,
    status: 'pendiente',
  }
  return { task: { ...t, waitingReplies: keep([...list, reply]) }, reply, notes }
}

/** Por qué una confirmación ya no vale (la tarea o la espera han cambiado), o nada si vale */
export function staleReason(t: WaitTask, r: WaitingReply): string | undefined {
  if (r.status === 'confirmada') return 'ya estaba confirmada: la espera se cerró'
  if (r.status === 'descartada') return 'la descartó'
  if (t.done) return 'la tarea ya está hecha'
  if (!t.waitingFor) return 'la tarea ya no está a la espera de nadie'
  if (r.wait !== waitKey(t)) return 'la espera ha cambiado desde la propuesta (de quién, qué o desde cuándo)'
  return undefined
}

/**
 * Cierra la espera con esa respuesta: guarda cómo era (para volver a ella) y,
 * si no se completa, la tarea vuelve a hoy para hacer lo que toque con lo que
 * ha llegado.
 */
export function confirmReply<T extends WaitTask>(t: T, id: string, ctx: { now: number; today: string; complete?: boolean }): { task?: T; reply?: WaitingReply; error?: string } {
  const r = t.waitingReplies?.find((x) => x.id === id)
  if (!r) return { error: 'no existe esa propuesta' }
  const stale = staleReason(t, r)
  if (stale) return { error: stale, reply: r }
  const closed = { waitingFor: t.waitingFor!, ...(t.waitingSince ? { waitingSince: t.waitingSince } : {}), ...(t.waitingWhat ? { waitingWhat: t.waitingWhat } : {}), ...(t.dueDate ? { dueDate: t.dueDate } : {}) }
  const done: WaitingReply = { ...r, status: 'confirmada', decidedAt: ctx.now, closed }
  delete done.excerpt
  const next: T = { ...t, waitingReplies: t.waitingReplies!.map((x) => (x.id === id ? done : x)) }
  delete next.waitingFor
  delete next.waitingSince
  delete next.waitingWhat
  if (!ctx.complete && (!next.dueDate || next.dueDate > ctx.today)) next.dueDate = ctx.today
  return { task: next, reply: done }
}

/** «No es eso»: no se vuelve a proponer, y del mensaje solo queda la huella */
export function discardReply<T extends WaitTask>(t: T, id: string, now: number): { task?: T; reply?: WaitingReply; error?: string } {
  const r = t.waitingReplies?.find((x) => x.id === id)
  if (!r) return { error: 'no existe esa propuesta' }
  if (r.status !== 'pendiente') return { error: r.status === 'confirmada' ? 'ya estaba confirmada: la espera se cerró' : 'ya estaba descartada', reply: r }
  const gone: WaitingReply = { ...r, status: 'descartada', decidedAt: now }
  delete gone.excerpt
  delete gone.link
  return { task: { ...t, waitingReplies: t.waitingReplies!.map((x) => (x.id === id ? gone : x)) }, reply: gone }
}

/** «Volver a esperar»: deshace el cierre si nadie ha vuelto a tocar la espera */
export function reopenWait<T extends WaitTask>(t: T, id: string): { task?: T; error?: string } {
  const r = t.waitingReplies?.find((x) => x.id === id)
  if (!r || r.status !== 'confirmada' || !r.closed) return { error: 'no hay ninguna espera cerrada que reabrir' }
  if (t.waitingFor) return { error: 'ya vuelve a estar a la espera' }
  if (t.done) return { error: 'la tarea ya está hecha' }
  const back: WaitingReply = { ...r, status: 'pendiente' }
  delete back.decidedAt
  delete back.closed
  const next: T = { ...t, ...r.closed, waitingReplies: t.waitingReplies!.map((x) => (x.id === id ? back : x)) }
  if (!r.closed.dueDate) delete next.dueDate
  return { task: next }
}
