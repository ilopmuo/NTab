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
 * - Solo «entregado» pausa el seguimiento (toca decidir, no insistir a la otra
 *   persona). «Contestado» y «dudoso» no cambian la fecha de volver a preguntar.
 * - Volver a esperar y deshacer solo tocan lo que cambió la decisión y sigue
 *   igual: lo que el usuario cambió después se queda.
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
  /**
   * Si solo ha contestado y dice cuándo lo mandará: cuándo propone el asistente
   * volver a preguntar (YYYY-MM-DD). No se aplica solo: hace falta su sí.
   */
  nextAsk?: string
  /**
   * Al confirmar: cómo era la espera (para poder volver a ella) y en qué fecha
   * quedó la tarea al cerrarla (si la cambia después, se respeta la suya)
   */
  closed?: { waitingFor: string; waitingSince?: string; waitingWhat?: string; dueDate?: string; dueAfter?: string }
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

/*
 * Clasificar un mensaje: LUNO no entiende el lenguaje, solo busca pruebas.
 * Para dejar «entregado» hace falta una frase propia (no citada) que entregue
 * (adjunto, aquí tienes, te he enviado, attached, here is…), sin negar, sin
 * preguntar, sin ofrecer («si quieres te lo paso») ni prometer («te lo mando
 * mañana»), y que hable de lo esperado: su palabra principal («presupuesto» en
 * «el presupuesto del baño») o «lo que me pediste». Si entrega otra cosa
 * («te adjunto las fotos»), se dice; si solo habla de ello, es «contestado».
 *
 * Límites, a propósito: frases cortas en español o en inglés; no entiende
 * sinónimos («la cotización» no es «el presupuesto»), ni otro idioma para lo
 * esperado, ni ironía, ni lo que va en un archivo sin nombrarlo. Ante la duda
 * baja, nunca sube, y siempre hace falta el sí del usuario para cerrar.
 */

/** Hasta aquí es suyo: lo de después es texto citado (la respuesta anterior, un reenvío) */
const QUOTE_START =
  /(^|\n)\s*>|(^|\s)(el|on) [^\n]{0,120}?(escribio|wrote):|-{2,}\s*(mensaje original|original message|mensaje reenviado|forwarded message)|(^|\n)\s*(de|from): [^\n]{0,200}\n\s*(enviado|sent|fecha|date):/

/** El texto propio del mensaje, sin lo que cita */
export function ownText(raw: string): string {
  const s = raw.slice(0, 4000)
  const m = QUOTE_START.exec(normalize(s))
  return (m ? s.slice(0, m.index) : s).trim()
}

/** Entrega ahora: adjunto, aquí tienes, te paso, ya te he enviado (es / en) */
const DELIVERS =
  /\badjunt\w*|\baqui (tienes|te (lo |la |los |las )?(dejo|paso|envio|mando)|va|esta|estan)\b|\b(te|os) (lo |la |los |las )?(paso|envio|mando|reenvio|comparto)\b|\b(he|hemos) (enviado|mandado|pasado|subido|reenviado|compartido|transferido|ingresado|pagado)\b|\bya (esta|estan|lo tienes|la tienes|los tienes|las tienes|tienes)\b|\battach|\benclosed\b|\bplease find\b|\bhere (is|are|it is)\b|\bhere's\b|\b(i|we)('ve| have)? (just )?(sent|shared|uploaded|forwarded)\b|\bsent you\b/
/** Lo hará más adelante */
const LATER =
  /\b(manana|pasado manana|luego|mas tarde|esta (tarde|noche|semana)|semana que viene|proxima semana|en cuanto|cuando (pueda|lo tenga|la tenga|tenga)|estoy en ello|estamos en ello|dame (un|unos)|tomorrow|later|next week|soon|asap|working on it|by (monday|tuesday|wednesday|thursday|friday|eod|end of)|(i|we)('ll| will) (send|share|get))\b/
/** Va a mirarlo: ha contestado, sin mandar nada todavía */
const WILL_LOOK = /\b(lo|la|los|las) (miro|reviso|preparo|busco|hago)\b|\bte (digo|cuento|aviso) (algo|cuando)\b|\b(i'll|i will|let me) (check|look|get back)\b|\bget back to you\b/
/** No lo ha hecho, o no puede */
const NEGATED = /\b(no|ni|nunca|todavia no|aun no|not|never|haven't|hasn't|didn't|don't|can't|cannot|couldn't|won't|unable|not yet)\b/
/** Lo ofrece, no lo manda */
const OFFER = /\b(si (quieres|te parece|necesitas|lo necesitas)|quieres que|puedo|podria|te parece si|if you (want|like|need)|(i|we) (can|could)|shall i|should i|do you want|would you like)\b/
/** Lo que se pidió, sin nombrarlo */
const GENERIC = /\b(lo que (me )?(pediste|pedias|pidio|necesitabas|esperabas|hablamos|comentamos)|lo (pedido|prometido|acordado)|what you (asked|needed|requested)|as (requested|promised|discussed))\b/
/** Lo que puede ir entre el verbo y lo que manda */
const FILLER = /^(el|la|los|las|un|una|unos|unas|lo|le|les|te|os|me|mi|mis|tu|tus|su|sus|ya|aqui|adjunto|adjunta|adjuntos|adjuntas|por|fin|tambien|the|a|an|my|our|your|you|is|are|it|please|find|herewith|de|del|al|y|and|with|con)$/

/** Las palabras que cuentan de lo que se espera («el presupuesto del baño» → presupuesto, baño) */
function keyWords(s: string) {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !/^(para|como|todo|toda|esto|esta|este|unos|unas|sobre|desde|hasta|ellos|ellas|that|this|with|from)$/.test(w))
}

/** Raíz de una palabra («presupuestos» ~ «presupuesto») */
const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2))
const hasWord = (text: string, w: string) => text.split(/[^a-z0-9]+/).some((x) => x.startsWith(stem(w)))

/**
 * ¿Habla de lo que se espera? La palabra principal (la primera: «presupuesto»)
 * o, si no, al menos dos de las demás; una secundaria sola («baño») no basta.
 */
export function mentions(what: string, text: string): boolean {
  const [main, ...rest] = keyWords(what)
  if (!main) return false
  const t = normalize(text)
  return hasWord(t, main) || rest.filter((w) => hasWord(t, w)).length >= 2
}

interface Clause {
  text: string
  question: boolean
}

/** Frases y, dentro, sus partes (por comas, «pero», «but»), sabiendo cuáles son preguntas */
function clauses(text: string): Clause[] {
  const out: Clause[] = []
  for (const m of normalize(text).matchAll(/[^.!?;\n]+[.!?;]*/g)) {
    const sentence = m[0]
    const question = sentence.includes('?') || sentence.trimStart().startsWith('¿')
    for (const part of sentence.split(/,|\bpero\b|\bbut\b/)) if (part.trim()) out.push({ text: part.trim(), question })
  }
  return out
}

/** Lo que manda, si lo dice: la primera palabra con contenido después del verbo de entrega */
function objectAfter(text: string): string | undefined {
  const m = DELIVERS.exec(text)
  if (!m) return undefined
  const words = text.slice(m.index + m[0].length).split(/[^a-z0-9']+/).filter(Boolean).slice(0, 5)
  return words.find((w) => !FILLER.test(w) && w.length >= 3)
}

/**
 * Lo que LUNO cree del mensaje, a partir de lo que dice el asistente: solo
 * puede quedarse igual o bajar (entregado → contestado → dudoso).
 */
export function judgeReply(a: { claimed: unknown; excerpt: string; what?: string; sent: string; since?: string }): { kind: ReplyKind; notes: string[] } {
  const notes: string[] = []
  const known = REPLY_KINDS.includes(a.claimed as ReplyKind)
  if (!known) notes.push('no se sabe si entrega lo esperado')
  if (a.since && a.sent < a.since) {
    notes.push('el mensaje es de antes de que empezara a esperar')
    return { kind: 'dudoso', notes }
  }
  if (!known || a.claimed !== 'entregado') return { kind: known ? (a.claimed as ReplyKind) : 'dudoso', notes }
  const own = ownText(a.excerpt)
  if (!own) {
    notes.push('solo trae texto citado, no lo que ha contestado')
    return { kind: 'dudoso', notes }
  }
  const what = a.what?.trim() ?? ''
  const parts = clauses(own)
  // Lo que podría ser una entrega, y por qué no lo es
  const delivering = parts.filter((c) => DELIVERS.test(c.text))
  const real = delivering.filter((c) => !c.question && !NEGATED.test(c.text) && !OFFER.test(c.text) && !LATER.test(c.text))
  const notYet = parts.some((c) => (DELIVERS.test(c.text) || /\b(tengo|tenemos|lo he|have it)\b/.test(c.text)) && NEGATED.test(c.text)) || parts.some((c) => /\b(todavia no|aun no|not yet)\b/.test(c.text))
  const later = parts.some((c) => WILL_LOOK.test(c.text) || (LATER.test(c.text) && (DELIVERS.test(c.text) || /\b(mando|envio|paso|mandare|enviare|pasare|send|share)\b/.test(c.text))))
  const talksAbout = what ? mentions(what, own) : false

  if (!what) {
    notes.push('no está apuntado qué se espera, así que no se puede saber si es eso')
    return { kind: 'dudoso', notes }
  }
  const ofWhat = real.filter((c) => mentions(what, c.text) || GENERIC.test(c.text))
  if (ofWhat.length && !notYet) return { kind: 'entregado', notes }
  if (ofWhat.length && notYet) {
    notes.push('dice que lo manda y también que aún no: no está claro')
    return { kind: 'dudoso', notes }
  }
  if (notYet || later) {
    notes.push(notYet ? 'dice que aún no: ha contestado, pero no lo ha mandado' : 'dice que lo hará más adelante: ha contestado, pero no lo ha mandado')
    return { kind: 'contestado', notes }
  }
  if (delivering.some((c) => c.question || OFFER.test(c.text))) {
    notes.push('pregunta u ofrece mandarlo, pero no lo manda')
    return { kind: 'contestado', notes }
  }
  const other = real.map((c) => objectAfter(c.text)).find(Boolean)
  if (real.length && other) {
    notes.push(`manda otra cosa («${other}»), no ${what}`)
    return { kind: 'dudoso', notes }
  }
  if (real.length) {
    notes.push(`manda algo, pero no dice que sea ${what}`)
    return { kind: 'dudoso', notes }
  }
  if (talksAbout) {
    notes.push(`habla de ${what}, pero no dice que lo mande`)
    return { kind: 'contestado', notes }
  }
  notes.push(`el mensaje no menciona ${what} ni dice que lo mande`)
  return { kind: 'dudoso', notes }
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

/** Cómo se nombra cada tipo de propuesta pendiente, en la app y para los asistentes */
export const KIND_BADGE: Record<ReplyKind, string> = {
  entregado: 'Posible respuesta recibida',
  contestado: 'Ha contestado · aún sin entregar',
  dudoso: 'Posible coincidencia',
}

export type FollowUpState = 'decidir' | 'preguntar' | 'contestado-hoy' | 'esperar'

/**
 * Qué toca con una espera:
 * - `decidir`: hay una posible entrega sin decidir. No se insiste a la otra
 *   persona: se pregunta al usuario si cierra la espera.
 * - `preguntar`: ha llegado su fecha y no hay entrega propuesta. Una respuesta
 *   «contestado» o «dudoso» no lo cambia: la fecha sigue siendo la que era.
 * - `contestado-hoy`: tocaba preguntar, pero ha contestado hoy (sin entregar):
 *   hoy no se insiste; mañana, si sigue sin llegar, vuelve a `preguntar`.
 * - `esperar`: aún no toca.
 * `reply` es la propuesta que lo explica (la entrega, o la última contestación).
 */
export function followUp(t: WaitTask, today: string): { state: FollowUpState; reply?: WaitingReply } {
  const pending = pendingReplies(t)
  const delivered = pending.filter((r) => r.kind === 'entregado').at(-1)
  if (delivered) return { state: 'decidir', reply: delivered }
  const answered = pending.filter((r) => r.kind === 'contestado').at(-1)
  if (t.dueDate && t.dueDate <= today) return answered && answered.sent >= today ? { state: 'contestado-hoy', reply: answered } : { state: 'preguntar', reply: answered }
  return { state: 'esperar', reply: answered }
}

/** ¿Se le puede recordar a la otra persona? (no si hay una entrega por decidir o acaba de contestar) */
export const canNudge = (t: WaitTask, today: string) => !['decidir', 'contestado-hoy'].includes(followUp(t, today).state)

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
  /** fecha que propone el asistente para volver a preguntar (YYYY-MM-DD), solo si el mensaje la dice */
  nextAsk?: unknown
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
  // Se juzga lo que ha escrito (sin lo que cita) y solo eso se guarda
  const raw = typeof input.excerpt === 'string' ? input.excerpt.slice(0, 4000) : ''
  const excerpt = cleanExcerpt(ownText(raw)) || cleanExcerpt(raw)
  if (!excerpt) return { error: 'falta el extracto del mensaje (las frases justas)' }
  const id = replyId(t.id, source, msgId)
  const list = t.waitingReplies ?? []
  const dup = list.find((r) => r.id === id)
  if (dup) return { dup }
  const key = waitKey(t)
  if (list.filter((r) => r.status === 'pendiente' && r.wait === key).length >= MAX_PENDING) return { error: `ya tiene ${MAX_PENDING} posibles respuestas sin decidir: que decida antes` }
  const { kind, notes } = judgeReply({ claimed: input.kind, excerpt: raw, what: t.waitingWhat, sent, since: t.waitingSince })
  // Una fecha para volver a preguntar solo tiene sentido si aún no lo ha mandado
  const nextAsk = kind === 'contestado' && typeof input.nextAsk === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.nextAsk) && input.nextAsk > sent ? input.nextAsk : undefined
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
    ...(nextAsk ? { nextAsk } : {}),
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
  const next: T = { ...t }
  delete next.waitingFor
  delete next.waitingSince
  delete next.waitingWhat
  if (!ctx.complete && (!next.dueDate || next.dueDate > ctx.today)) next.dueDate = ctx.today
  const closed = {
    waitingFor: t.waitingFor!,
    ...(t.waitingSince ? { waitingSince: t.waitingSince } : {}),
    ...(t.waitingWhat ? { waitingWhat: t.waitingWhat } : {}),
    ...(t.dueDate ? { dueDate: t.dueDate } : {}),
    dueAfter: next.dueDate ?? '',
  }
  const done: WaitingReply = { ...r, status: 'confirmada', decidedAt: ctx.now, closed }
  delete done.excerpt
  next.waitingReplies = t.waitingReplies!.map((x) => (x.id === id ? done : x))
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

/**
 * «Volver a esperar»: deshace el cierre si nadie ha vuelto a tocar la espera.
 * La fecha vuelve a la de antes solo si sigue la que dejó el cierre; si el
 * usuario la cambió después, se queda la suya (`kept`). Lo demás no se toca.
 */
export function reopenWait<T extends WaitTask>(t: T, id: string): { task?: T; error?: string; kept?: string } {
  const r = t.waitingReplies?.find((x) => x.id === id)
  if (!r || r.status !== 'confirmada' || !r.closed) return { error: 'no hay ninguna espera cerrada que reabrir' }
  if (t.waitingFor) return { error: 'ya vuelve a estar a la espera' }
  if (t.done) return { error: 'la tarea ya está hecha' }
  const { waitingFor, waitingSince, waitingWhat, dueDate, dueAfter } = r.closed
  const back: WaitingReply = { ...r, status: 'pendiente' }
  delete back.decidedAt
  delete back.closed
  const next: T = { ...t, waitingFor, waitingReplies: t.waitingReplies!.map((x) => (x.id === id ? back : x)) }
  if (waitingSince) next.waitingSince = waitingSince
  if (waitingWhat) next.waitingWhat = waitingWhat
  // Sin saber cómo quedó (cierres antiguos), mejor no tocarla
  const untouched = dueAfter !== undefined && (t.dueDate ?? '') === dueAfter
  if (!untouched) return { task: next, kept: t.dueDate }
  if (dueDate) next.dueDate = dueDate
  else delete next.dueDate
  return { task: next }
}

/** Igual por contenido (sin importar el orden de las claves) */
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
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)

const FIELD_LABEL: Record<string, string> = { waitingFor: 'de quién espera', waitingSince: 'desde cuándo', waitingWhat: 'qué espera', done: 'si está hecha', dueDate: 'la fecha' }

/**
 * Deshacer una decisión de la app (cerrar, descartar, reabrir, cambiar la
 * fecha) sin pisar lo que cambió después: solo vuelven los campos que cambió
 * esa decisión y que siguen como ella los dejó, y su propuesta. Si la espera o
 * la propuesta han cambiado desde entonces, no se deshace y se dice por qué; si
 * solo cambió la fecha, se deshace lo demás y se queda la suya (`kept`). El
 * título, las notas y todo lo demás no se tocan nunca.
 */
export function undoDecision<T extends WaitTask>(current: T | undefined, before: T, after: T, replyId: string): { task?: T; error?: string; kept?: string } {
  if (!current) return { error: 'la tarea ya no existe' }
  const entry = (t: WaitTask) => t.waitingReplies?.find((x) => x.id === replyId)
  if (!same(entry(current), entry(after))) return { error: 'la propuesta ha cambiado después' }
  const b = before as unknown as Record<string, unknown>
  const a = after as unknown as Record<string, unknown>
  const c = current as unknown as Record<string, unknown>
  const next = { ...current } as unknown as Record<string, unknown>
  let kept: string | undefined
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (k === 'waitingReplies' || same(b[k], a[k])) continue
    if (same(c[k], a[k])) {
      if (b[k] === undefined) delete next[k]
      else next[k] = b[k]
    } else if (k === 'dueDate') kept = c[k] as string | undefined
    else return { error: `ha cambiado después (${FIELD_LABEL[k] ?? k})` }
  }
  const was = entry(before)
  const list = (current.waitingReplies ?? []).flatMap((x) => (x.id !== replyId ? [x] : was ? [was] : []))
  next.waitingReplies = list
  return { task: next as unknown as T, kept }
}
