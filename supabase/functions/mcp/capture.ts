/**
 * Siri y los atajos: lo que se dicta (o se comparte) se entiende como lo
 * diría una persona, y la respuesta es corta porque Siri la lee en voz alta.
 *
 * - Apuntar: tareas (como la captura rápida), compra, gastos, notas, hábitos,
 *   «última vez», medicación y dónde dejas las cosas.
 * - Hacer: completar («hecho: llamar al dentista», «he llamado al dentista»),
 *   posponer («pospón el dentista a mañana») y deshacer lo último.
 * - Preguntar: qué tengo hoy o mañana, qué hago ahora, dónde está algo, qué
 *   falta en la compra, cuánto llevo gastado y cuándo fue la última vez.
 *
 * Sin dependencias de Deno: se prueba con los tests de la app
 * (src/lib/capture.test.ts y src/lib/siri.test.ts).
 */
import { MONTHS, WEEKDAYS, addDays, diffDays, hhmmIn, weekday, ymdIn, zonedToUtc } from '../_shared/time.ts'
import { parseQuickAdd } from '../_shared/parse.ts'
import { findUrl, linkTask } from '../_shared/links.ts'
import { money, monthSummary, searchExpenses } from '../_shared/expenses.ts'
import { suggest, type Energy } from '../_shared/suggest.ts'
import { captureMed } from './meds.ts'
import { ASKING, classify, cleanDictation, closest, infinitive } from '../_shared/intent.ts'
import {
  Index,
  addExpenseTool,
  addShopping,
  appendNoteTool,
  budgetOf,
  catLabel,
  createNote,
  expenseRows,
  fold,
  logLastTime,
  markHabit,
  saveThing,
  shoppingLists,
  updateTasks,
  withReminder,
  type EventLike,
  type Env,
  type Row,
  type Task,
  type WriteResult,
} from './ntab.ts'

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** «a», «a y b», «a, b y c» */
const list = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)

export type CaptureResult = WriteResult & { deletes?: Row[] }

/** Los eventos de tus calendarios, para responder «¿qué tengo hoy?» */
export interface CaptureCalendar {
  events: EventLike[]
  names: Record<string, string>
}

// ── Lo que manda el atajo ─────────────────────────────────────

/** Lo que manda un atajo: el texto dictado, un gasto dictado o un pago de Apple Pay (importe y comercio) */
export interface CaptureInput {
  texto?: string
  /** lo dictado en el atajo de gastos: «quince euros en el súper» */
  gasto?: string
  /** de la automatización de Apple Pay: «15,30 €», «€15.30» o un número */
  importe?: string | number
  comercio?: string
  /** viene de la automatización de Apple Pay (trae los campos, aunque vengan vacíos) */
  pago?: boolean
  /** título de lo compartido (de la hoja de compartir, o leído de la página) */
  titulo?: string
}

/** Los campos de un JSON o formulario, con los nombres en español o en inglés */
export function captureFields(b: Record<string, unknown> | null | undefined): CaptureInput {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = b?.[k]
      if (typeof v === 'number') return v
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return undefined
  }
  const importe = pick('importe', 'amount', 'cantidad')
  const PAYMENT_KEYS = ['importe', 'amount', 'cantidad', 'comercio', 'merchant']
  return {
    pago: !!b && typeof b === 'object' && PAYMENT_KEYS.some((k) => k in b),
    texto: pick('texto', 'text', 'input') as string | undefined,
    gasto: pick('gasto', 'expense') as string | undefined,
    importe,
    comercio: pick('comercio', 'merchant', 'concepto', 'tienda') as string | undefined,
    titulo: pick('titulo', 'title', 'nombre') as string | undefined,
  }
}

/** «15,30 €», «€15.30», «1.234,56 EUR», «-4,99 €» → número (negativo si es una devolución) */
export function readAmount(v: string | number | undefined): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined
  if (!v) return undefined
  const neg = /[-−]\s*[\d€$£]|\(\s*[\d€$£]/.test(v)
  let n = v.replace(/[^\d.,]/g, '')
  if (!/\d/.test(n)) return undefined
  const lastComma = n.lastIndexOf(',')
  const lastDot = n.lastIndexOf('.')
  // El separador decimal es el último, si le siguen 1 o 2 cifras
  const dec = Math.max(lastComma, lastDot)
  if (dec >= 0 && n.length - dec - 1 <= 2) n = `${n.slice(0, dec).replace(/[.,]/g, '')}.${n.slice(dec + 1)}`
  else n = n.replace(/[.,]/g, '')
  const x = Math.round(Number(n) * 100) / 100
  return Number.isFinite(x) ? (neg ? -x : x) : undefined
}

/** «MERCADONA S.A.» → «Mercadona S.A.»; lo que ya viene bien escrito se queda igual */
const niceName = (s: string) => (/[a-zà-ÿ]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s\-/&.])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()))

/**
 * Un pago con Apple Pay, desde la automatización «Transacción» de Atajos
 * (iOS 17 o posterior): se apunta como gasto con el comercio como concepto y
 * la categoría que toque (también la aprendida). Las devoluciones no se apuntan.
 */
export function captureCardPayment(rows: Row[], input: CaptureInput, env: Env): WriteResult {
  const amount = readAmount(input.importe)
  if (amount === undefined || amount === 0) return { writes: [], report: ['No me ha llegado el importe del pago.'] }
  if (amount < 0) return { writes: [], report: ['Es una devolución: no la apunto como gasto.'] }
  const r = addExpenseTool(rows, { importe: amount, concepto: niceName(str(input.comercio).trim()) || 'Pago con tarjeta' }, env)
  return { ...r, report: r.writes.length ? [r.report[0].split('. Este mes')[0] + '.'] : r.report }
}

// ── El dictado ────────────────────────────────────────────────

// La limpieza del dictado, los parecidos y a dónde va cada cosa, en
// _shared/intent.ts (la captura de la app usa lo mismo)
export { cleanDictation, likeness } from '../_shared/intent.ts'

/** Para leer en voz alta: «hoy», «mañana», «el jueves 8», «el lunes 12 de octubre» */
export function spokenDay(date: string, today: string) {
  const n = diffDays(date, today)
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  if (n === 2) return 'pasado mañana'
  if (n === -1) return 'ayer'
  const [y, m, d] = date.split('-').map(Number)
  if (n > 2 && n < 7) return `el ${WEEKDAYS[weekday(date)]} ${d}`
  return `el ${WEEKDAYS[weekday(date)]} ${d} de ${MONTHS[m - 1]}${String(y) !== today.slice(0, 4) ? ` de ${y}` : ''}`
}

/** «a mañana», «al viernes 9» */
const toDay = (date: string, today: string) => {
  const d = spokenDay(date, today)
  return d.startsWith('el ') ? `al ${d.slice(3)}` : `a ${d}`
}

/** «hoy», «ayer», «hace 12 días, el miércoles 23 de septiembre» */
function spokenAgo(date: string, today: string) {
  const n = diffDays(today, date)
  return n <= 1 ? spokenDay(date, today) : `hace ${n} días, ${spokenDay(date, today)}`
}

/** Una tarea pendiente por cómo se dice: primero lo de hoy y lo atrasado */
function openTask(rows: Row[], said: string, today: string) {
  const open = new Index(rows).tasks.filter((t) => !t.done)
  return closest(open, said, (t) => t.title, (t) => (t.dueDate && t.dueDate <= today ? 2 : t.dueDate ? 1 : 0))
}

/** Para entender solo fechas y horas («a mañana a las 5»), sin listas ni personas */
const when = (env: Env) => ({ today: ymdIn(env.now, env.tz), time: hhmmIn(env.now, env.tz), projects: [], areas: [] })

const tie = (xs: { title?: string; name?: unknown }[]) => `¿Cuál? Tienes ${list(xs.slice(0, 3).map((x) => `«${x.title ?? str(x.name)}»`))}. Dímelo con más palabras.`

// ── Deshacer lo último ────────────────────────────────────────

const UNDO_KEY = 'siriUndo'
/** Lo último se puede deshacer durante este rato */
const UNDO_MINUTES = 30
const UNDO = /^(?:desh[aá]z(?:lo)?|deshacer|anula(?:r)?(?:\s+lo\s+[uú]ltimo)?|(?:borra|quita|elimina)(?:r)?\s+(?:lo\s+)?[uú]ltimo(?:\s+que\s+he\s+(?:dicho|apuntado))?|eso\s+no|me\s+he\s+equivocado)$/i

interface UndoState {
  at: number
  what: string
  items: { tbl: string; id: string; before: Data | null }[]
}

/** Guarda cómo estaba todo lo que cambia esta captura, para «deshaz» */
function remember(rows: Row[], r: CaptureResult, env: Env, what: string): CaptureResult {
  const changed = [...r.writes, ...(r.deletes ?? [])]
  if (!changed.length) return r
  const before = new Map(rows.map((x) => [`${x.tbl}/${x.id}`, x.data]))
  const seen = new Set<string>()
  const items: UndoState['items'] = []
  for (const x of changed) {
    const k = `${x.tbl}/${x.id}`
    if (seen.has(k)) continue
    seen.add(k)
    items.push({ tbl: x.tbl, id: x.id, before: before.get(k) ?? null })
  }
  const value: UndoState = { at: env.now, what, items }
  return { ...r, writes: [...r.writes, { tbl: 'settings', id: UNDO_KEY, data: { key: UNDO_KEY, value } }] }
}

/** Para lo que no se puede deshacer por voz (lo del piso): que «deshaz» no toque lo de antes */
export const forgetUndo = (): Row => ({ tbl: 'settings', id: UNDO_KEY, data: { key: UNDO_KEY, value: null } })

function undoLast(rows: Row[], env: Env): CaptureResult {
  const v = rows.find((r) => r.tbl === 'settings' && r.id === UNDO_KEY)?.data.value as UndoState | null | undefined
  if (!v?.items?.length || env.now - v.at > UNDO_MINUTES * 60_000) return { writes: [], report: ['No hay nada reciente que deshacer.'] }
  const writes: Row[] = []
  const deletes: Row[] = []
  for (const it of v.items) {
    if (it.before) writes.push({ tbl: it.tbl, id: it.id, data: it.before })
    else deletes.push({ tbl: it.tbl, id: it.id, data: {} })
  }
  writes.push(forgetUndo())
  return { writes, deletes, report: [`Deshecho: ${v.what}.`] }
}

// ── Hacer: completar, posponer y dónde dejas las cosas ─────────

function complete(rows: Row[], task: Task, env: Env): CaptureResult {
  const today = ymdIn(env.now, env.tz)
  const r = updateTasks(rows, [{ id: task.id, hecha: true }], env)
  const next = r.writes.find((w) => w.id !== task.id)
  return remember(rows, { writes: r.writes, report: [`Hecho: ${task.title}.${next ? ` La próxima vez, ${spokenDay(str(next.data.dueDate), today)}.` : ''}`] }, env, `«${task.title}» vuelve a estar pendiente`)
}

/**
 * «Hecho: …» o «he …»: una tarea pendiente se completa; un hábito se marca;
 * si no, a «Última vez» (con `log`, también algo nuevo).
 */
function didIt(rows: Row[], said: string, env: Env, log: boolean): CaptureResult | undefined {
  const today = ymdIn(env.now, env.tz)
  const task = openTask(rows, said, today)
  if (task.tie) return { writes: [], report: [tie(task.tie)] }
  if (task.hit) return complete(rows, task.hit, env)
  const habits = rows.filter((r) => r.tbl === 'habits' && !r.data.archived)
  const habit = closest(habits, said, (r) => str(r.data.name)).hit
  if (habit) {
    // Con cantidad («8 vasos de agua»), uno más
    const r = markHabit(rows, { habito: str(habit.data.name), ...(num(habit.data.target) > 1 ? { cantidad: 1 } : {}) }, env)
    return remember(rows, { ...r, report: r.report.map((x) => x.replaceAll(` el ${today}`, ' hoy')) }, env, `«${str(habit.data.name)}» de hoy`)
  }
  const trackers = rows.filter((r) => r.tbl === 'trackers' && !r.data.archived)
  const tracker = closest(trackers, said, (r) => str(r.data.name)).hit
  if (!tracker && !log) return undefined
  const name = tracker ? str(tracker.data.name) : infinitive(said)
  const r = logLastTime(rows, { cosa: name }, env)
  if (!r.writes.length) return r
  const every = num(r.writes[0].data.every)
  const again = every ? ` Toca otra vez ${spokenDay(addDays(today, every), today)}.` : ''
  return remember(rows, { writes: r.writes, report: [`Apuntado en «Última vez»: ${name}, hoy.${again}`] }, env, `«${name}» en «Última vez»`)
}

const POSTPONE = /^(?:posp[oó]n(?:e|er)?|aplaza(?:r)?|retrasa(?:r)?)\s+(.+)$/i
// «mueve…», «pasa…», «cambia…» solo si es una tarea que ya existe (si no, es una tarea nueva: «pasar la ITV el lunes»)
const MOVE = /^(?:mueve|mover|pasa|pasar|cambia|cambiar)\s+(.+)$/i

function postpone(rows: Row[], text: string, env: Env): CaptureResult | undefined {
  const m = POSTPONE.exec(text) ?? MOVE.exec(text)
  if (!m) return undefined
  const strong = POSTPONE.test(text)
  const today = ymdIn(env.now, env.tz)
  const p = parseQuickAdd(m[1].replace(/^(?:la\s+tarea\s+(?:de\s+)?|lo\s+del?\s+)/i, ''), when(env))
  const said = p.title.replace(/(?:\s+(?:a|al|para|hasta|hacia|el|la))+$/i, '')
  if (!p.dueDate && !strong) return undefined
  const found = openTask(rows, said, today)
  if (found.tie) return { writes: [], report: [tie(found.tie)] }
  if (!found.hit) return strong ? { writes: [], report: [`No encuentro «${said.charAt(0).toLowerCase()}${said.slice(1)}» entre lo pendiente.`] } : undefined
  const task = found.hit
  // Sin día, a mañana (o al día siguiente del que tenía)
  const day = p.dueDate ?? addDays(task.dueDate && task.dueDate > today ? task.dueDate : today, 1)
  const r = updateTasks(rows, [{ id: task.id, fecha: day, ...(p.dueTime ? { hora: p.dueTime } : {}) }], env)
  const t = r.writes[0].data as unknown as Task
  return remember(rows, { writes: r.writes, report: [`Pasada ${toDay(day, today)}${t.dueTime ? ` a las ${t.dueTime}` : ''}: ${task.title}.`] }, env, `«${task.title}» vuelve a ${task.dueDate ? spokenDay(task.dueDate, today) : 'no tener fecha'}`)
}

const ARTICLE = /^(?:el|la|los|las|mi|mis|un|una|unos|unas)\s+/i

/** «he dejado las llaves en el cajón», «le he prestado el taladro a Luis» */
function thing(rows: Row[], name: string, env: Env, where?: string, person?: string): CaptureResult {
  const r = saveThing(rows, person ? { nombre: name, tipo: 'prestado', persona: person } : { nombre: name, donde: where }, env)
  if (!r.writes.length) return r
  const said = person ? `lo tiene ${person}` : `${/^(?:debajo|encima|detr[aá]s|dentro|junto|al\s+lado)\b/i.test(where!) ? '' : 'en '}${where}`
  return remember(rows, { writes: r.writes, report: [`Apuntado: ${name}, ${said}.`] }, env, person ? `el préstamo de ${name}` : `dónde está ${name}`)
}

// ── Preguntar ─────────────────────────────────────────────────

const SHOP_Q = /^(?:qu[eé]\s+(?:me\s+)?(?:falta|hay|tengo|queda|necesito)\s+(?:que\s+comprar|en\s+la\s+(?:lista\s+de\s+la\s+)?compra|para\s+comprar|de\s+compra)|qu[eé]\s+(?:tengo|hay)\s+que\s+comprar|qu[eé]\s+compro|(?:qu[eé]\s+hay\s+en\s+)?(?:mi\s+)?lista\s+de\s+la\s+compra)$/i
const SPENT_Q = /^cu[aá]nto\s+(?:llevo\s+gastado|he\s+gastado|me\s+he\s+gastado|me\s+llevo\s+gastado|gasto|gast[eé]|llevo)(?=\s|$)\s*(.*)$/i
const WHERE_Q = /^(?:d[oó]nde\s+(?:est[aá]n?|dej[eé]|guard[eé]|puse|tengo|he\s+(?:dejado|puesto|guardado))|qui[eé]n\s+tiene|a\s+qui[eé]n\s+(?:le\s+)?(?:he\s+)?prest[eé]|cu[aá]ndo\s+caducan?)\s+(.+)$/i
const LAST_Q = /^cu[aá]ndo\s+(?:fue\s+la\s+[uú]ltima\s+vez\s+que\s+)?(.+)$/i
const NOW_Q = /^qu[eé]\s+(?:hago|puedo\s+hacer|deber[ií]a\s+hacer|me\s+pongo\s+a\s+hacer)(?=\s|$)/i
// «tengo 20 minutos», «tengo un rato, ¿qué hago?» (sin más: «tengo tiempo para leer el sábado» es otra cosa)
const NOW_FREE = /^tengo\s+(?:un\s+rato|tiempo|\S+\s+(?:minutos|horas?))(?:\s+libres?)?(?:[\s,]+¿?qu[eé]\s+(?:hago|puedo\s+hacer))?$/i
const AGENDA_Q = /^(?:qu[eé]\s+(?:tengo|hay|me\s+toca|me\s+queda)(?:\s+(?:que\s+hacer|pendiente|apuntado))?|c[oó]mo\s+(?:tengo|viene)\s+(?:el\s+d[ií]a|la\s+semana)|(?:mi\s+)?agenda(?:\s+de)?)(?=\s|$)\s*(.*)$/i

/** El día (o la semana) por el que se pregunta: «hoy», «mañana», «el jueves», «esta semana» */
function askedDay(rest: string, env: Env): { day: string; week?: boolean } | undefined {
  const today = ymdIn(env.now, env.tz)
  const r = rest.replace(/^(?:(?:que\s+hacer|pendiente|apuntado|para|en|de)\s+)+/i, '').trim()
  const f = fold(r)
  if (!f || /^(?:hoy|ahora|esta\s+(?:manana|tarde|noche)|el\s+dia|el\s+dia\s+de\s+hoy)$/.test(f)) return { day: today }
  if (/^(?:esta\s+semana|la\s+semana)$/.test(f)) return { day: today, week: true }
  const p = parseQuickAdd(`x ${r}`, when(env))
  return p.dueDate && fold(p.title) === 'x' ? { day: p.dueDate } : undefined
}

/** ¿Hace falta mirar los calendarios para responder? Las horas (en ms) que hay que leer */
export function calendarRange(input: CaptureInput, env: Env): { from: number; to: number } | undefined {
  const { text } = cleanDictation(input.texto ?? '')
  const m = AGENDA_Q.exec(text)
  const asked = m && !SHOP_Q.test(text) ? askedDay(m[1], env) : undefined
  if (!asked) return undefined
  return { from: zonedToUtc(asked.day, '00:00', env.tz), to: zonedToUtc(addDays(asked.day, asked.week ? 7 : 1), '00:00', env.tz) }
}

const eventDay = (e: EventLike, tz: string) => (e.allDay ? e.start.slice(0, 10) : ymdIn(Date.parse(e.start), tz))

function agenda(rows: Row[], asked: { day: string; week?: boolean }, env: Env, cal?: CaptureCalendar): string {
  const today = ymdIn(env.now, env.tz)
  const open = new Index(rows).tasks.filter((t) => !t.done && !t.someday && !t.waitingFor)
  const events = (cal?.events ?? []).filter((e) => e.allDay || Date.parse(e.end) > env.now)
  const late = asked.day === today ? open.filter((t) => t.dueDate && t.dueDate < today).length : 0
  const lateLine = late ? ` Además, ${late === 1 ? 'una atrasada' : `${late} atrasadas`}.` : ''

  if (asked.week) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
    const counts = days.map((d) => ({ d, n: open.filter((t) => t.dueDate === d).length + events.filter((e) => eventDay(e, env.tz) === d).length })).filter((x) => x.n)
    const total = counts.reduce((s, x) => s + x.n, 0)
    if (!total) return `Esta semana no tienes nada apuntado.${lateLine}`
    return `Esta semana tienes ${total === 1 ? 'una cosa' : `${total} cosas`}: ${list(counts.map((x) => `${x.n} ${spokenDay(x.d, today)}`))}.${lateLine}`
  }

  const day = asked.day
  const tasks = open.filter((t) => t.dueDate === day)
  const dayEvents = events.filter((e) => eventDay(e, env.tz) === day || (e.allDay && e.start.slice(0, 10) < day && e.end.slice(0, 10) > day))
  const timed = [
    ...tasks.filter((t) => t.dueTime).map((t) => ({ time: t.dueTime!, what: t.title })),
    ...dayEvents.filter((e) => !e.allDay).map((e) => ({ time: hhmmIn(Date.parse(e.start), env.tz), what: e.title })),
  ].sort((a, b) => a.time.localeCompare(b.time))
  const allDay = dayEvents.filter((e) => e.allDay).map((e) => e.title)
  const untimed = tasks
    .filter((t) => !t.dueTime)
    .sort((a, b) => Number(b.important === day) - Number(a.important === day) || b.priority - a.priority || a.order - b.order)
  const total = timed.length + allDay.length + untimed.length
  const label = spokenDay(day, today)
  if (!total) return `${cap(label)} no tienes nada apuntado.${lateLine}`

  const parts = [
    ...timed.slice(0, 4).map((x) => `a las ${x.time}, ${x.what}`),
    ...(allDay.length ? [`todo el día, ${list(allDay)}`] : []),
  ]
  const more = Math.max(0, timed.length - 4) + Math.max(0, untimed.length - 3)
  const names = untimed.slice(0, 3).map((t) => t.title)
  if (names.length) parts.push(`${timed.length || allDay.length ? 'y sin hora, ' : ''}${list(more ? [...names.slice(0, -1), `${names.at(-1)} y ${more} más`] : names).replace(/ y (\S+ y \d+ más)$/, ', $1')}`)
  else if (more) parts.push(`y ${more} más`)
  const important = [...tasks].filter((t) => t.important === day).map((t) => t.title)
  return `${cap(label)} tienes ${total === 1 ? 'una cosa' : `${total} cosas`}: ${parts.join('; ')}.${important.length ? ` Lo importante: ${list(important)}.` : ''}${lateLine}`
}

function whatNow(rows: Row[], rest: string, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const [h, m] = hhmmIn(env.now, env.tz).split(':').map(Number)
  const f = fold(rest)
  const n = /(\d+)\s*(?:min|minutos)/.exec(f)
  const hours = /(\d+)\s*horas?/.exec(f)
  const minutes = n ? Number(n[1]) : hours ? Number(hours[1]) * 60 : /media\s+hora/.test(f) ? 30 : /una\s+hora/.test(f) ? 60 : 30
  const energy: Energy = /cansad|sin\s+ganas|poca\s+energia|agotad/.test(f) ? 'low' : /con\s+ganas|mucha\s+energia|a\s+tope/.test(f) ? 'high' : 'normal'
  const open = new Index(rows).tasks.filter((t) => !t.done && !t.waitingFor)
  const picks = suggest(open, { minutes, energy, today, nowMin: h * 60 + m, now: env.now })
  if (!picks.length) return open.length ? `Nada de lo pendiente cabe en ${minutes} minutos.` : 'No tienes nada pendiente.'
  const why = picks[0].reasons[0] ? ` (${picks[0].reasons[0].toLowerCase()})` : ''
  return `Te propongo: ${picks[0].task.title}${why}.${picks[1] ? ` Si no, ${picks[1].task.title}.` : ''}`
}

function thingSpoken(d: Data, today: string) {
  const name = str(d.name)
  const person = str(d.personName) || 'alguien'
  if (d.kind === 'lent' && !d.returned) return `${name}: lo tiene ${person}${d.since ? ` desde ${spokenDay(str(d.since), today)}` : ''}${d.returnBy ? `; te lo devuelve ${spokenDay(str(d.returnBy), today)}` : ''}.`
  if (d.kind === 'borrowed' && !d.returned) return `${name} es de ${person}${d.returnBy ? `; hay que devolvérselo ${spokenDay(str(d.returnBy), today)}` : ''}.`
  const where = [str(d.location), str(d.room)].filter(Boolean).join(', ')
  const parts: string[] = []
  if (where) parts.push(`${/^(?:debajo|encima|detr[aá]s|dentro|junto|al\s+lado|en)\b/i.test(where) ? '' : 'en '}${where}`)
  if (d.kind === 'document' && d.expires) parts.push(`${str(d.expires) < today ? 'caducó' : 'caduca'} ${spokenDay(str(d.expires), today)}`)
  return parts.length ? `${name}: ${parts.join('; ')}.` : `${name}: no tengo apuntado dónde está.`
}

function whereIs(rows: Row[], what: string, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const q = what.replace(ARTICLE, '')
  const things = rows.filter((r) => r.tbl === 'things')
  const found = closest(things, q, (r) => str(r.data.name), (r) => (r.data.returned ? 0 : 1))
  const hits = found.tie ?? (found.hit ? [found.hit] : things.filter((r) => fold([r.data.name, r.data.location, r.data.notes].map(str).join(' ')).includes(fold(q))))
  const are = /s$/.test(fold(q)) ? 'están' : 'está'
  if (!hits.length) return `No tengo apuntado dónde ${are} ${what}. Cuando lo sepas, dímelo así: «he dejado ${what} en el cajón».`
  return hits
    .slice(0, 2)
    .map((r) => thingSpoken(r.data, today))
    .join(' ')
}

function shoppingNow(rows: Row[]): string {
  const items = rows.filter((r) => r.tbl === 'shopping' && !r.data.checked)
  if (!items.length) return 'La lista de la compra está vacía.'
  const lists = shoppingLists(rows)
  const main = items.filter((r) => !r.data.list || !lists.some((l) => l.id === r.data.list))
  const names = (xs: Row[]) => xs.map((r) => `${str(r.data.name)}${r.data.qty ? ` (${str(r.data.qty)})` : ''}`)
  const say = (xs: string[]) => (xs.length > 12 ? `${xs.slice(0, 12).join(', ')} y ${xs.length - 12} más` : list(xs))
  const out = main.length ? [`En la compra hay ${main.length === 1 ? 'una cosa' : `${main.length} cosas`}: ${say(names(main))}.`] : []
  for (const l of lists) {
    const xs = items.filter((r) => r.data.list === l.id)
    if (xs.length) out.push(`En ${l.name}: ${say(names(xs))}.`)
  }
  return out.join(' ')
}

function spent(rows: Row[], rest: string, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const f = fold(rest)
  const lastMonth = /mes\s+pasado/.test(f)
  const month = lastMonth ? addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7) : today.slice(0, 7)
  const when = lastMonth ? 'el mes pasado' : 'este mes'
  const all = expenseRows(rows)
  // «en comida», «en Mercadona», «en el viaje»
  const term = /\ben\s+(?!este\s|el\s+mes)(.+?)(?:\s+(?:este|el)\s+mes(?:\s+pasado)?)?$/i.exec(rest)?.[1]?.replace(ARTICLE, '')
  if (term) {
    const r = searchExpenses(all, term)
    const inMonth = r.items.filter((e) => e.date.startsWith(month))
    const total = Math.round(inMonth.reduce((s, e) => s + e.amount, 0) * 100) / 100
    return inMonth.length ? `En ${term} llevas ${money(total)} ${when}, en ${inMonth.length === 1 ? 'un gasto' : `${inMonth.length} gastos`}.` : `${cap(when)} no hay gastos en ${term}.`
  }
  const s = monthSummary(all, month, today)
  if (!s.count) return `${cap(when)} no hay gastos apuntados.`
  const budget = budgetOf(rows)
  const left = budget.monthly ? budget.monthly - s.total : 0
  const vsBudget = budget.monthly ? (left >= 0 ? ` de ${money(budget.monthly)}: te quedan ${money(Math.round(left * 100) / 100)}` : `: te has pasado ${money(Math.round(-left * 100) / 100)} del presupuesto`) : ''
  const top = s.byCategory[0]
  return `${cap(when)} llevas ${money(s.total)}${vsBudget}.${top && s.byCategory.length > 1 ? ` Lo que más, ${catLabel(top.id).toLowerCase()}: ${money(top.amount)}.` : ''}`
}

// «¿cuándo cambié las sábanas?»: un pasado («cambié», «he cambiado», «fui») o «la última vez que…»
const PAST = /^(?:\S+[éí]|he\s+\S+(?:ado|ido|cho|to)|fui|fue|hice|hizo|puse|vi|di|estuve|tuve)(?=\s|$)/i

function lastTime(rows: Row[], rest: string, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const trackers = rows.filter((r) => r.tbl === 'trackers' && !r.data.archived && Array.isArray(r.data.log) && (r.data.log as string[]).length)
  const tracker = closest(trackers, rest, (r) => str(r.data.name)).hit
  if (tracker) return `La última vez fue ${spokenAgo((tracker.data.log as string[])[0], today)}.`
  const done = new Index(rows).tasks.filter((t) => t.done && t.completedAt)
  const task = closest(done, rest, (t) => t.title, (t) => num(t.completedAt)).hit
  if (task) return `La última vez fue ${spokenAgo(ymdIn(task.completedAt!, env.tz), today)}.`
  return 'No lo tengo apuntado. La próxima vez, dime «hecho:» y lo que hayas hecho.'
}

const HELP = 'Puedo decirte qué tienes hoy o mañana, qué hacer ahora, dónde está algo, qué falta en la compra, cuánto llevas gastado o cuándo hiciste algo por última vez.'

/** La respuesta a una pregunta (o `undefined` si no es una de las que se saben) */
function answer(rows: Row[], text: string, env: Env, cal?: CaptureCalendar): string | undefined {
  if (SHOP_Q.test(text)) return shoppingNow(rows)
  const sp = SPENT_Q.exec(text)
  if (sp) return spent(rows, sp[1], env)
  const wh = WHERE_Q.exec(text)
  if (wh) return whereIs(rows, wh[1], env)
  if (NOW_Q.test(text) || NOW_FREE.test(text)) return whatNow(rows, text, env)
  const ag = AGENDA_Q.exec(text)
  const asked = ag ? askedDay(ag[1], env) : undefined
  if (asked) return agenda(rows, asked, env, cal)
  const last = LAST_Q.exec(text)
  if (last && (/[uú]ltima\s+vez/i.test(text) || PAST.test(last[1]))) return lastTime(rows, last[1], env)
  return undefined
}

// ── Apuntar ───────────────────────────────────────────────────

// «he llamado al dentista», «ya he regado las plantas»
const DID = /^(?:ya\s+)?(?:he|hemos)\s+\S+(?:ado|ido|cho|to|sto|lto)\b/i
// «Medité», «Llamé al dentista», «Cambié las sábanas» (solo si es algo que ya existe: «Café con Ana» es otra cosa)
const DID_I = /^(?:ya\s+)?\S+[éí](?:\s|$)/i
/** Una tarea, como en la captura rápida de la app (con `projectId`, en esa lista) */
function newTask(rows: Row[], text: string, fields: CaptureInput, env: Env, projectId?: string): CaptureResult {
  const ix = new Index(rows)
  const today = ymdIn(env.now, env.tz)
  const target = (d: Data) => ({ id: String(d.id), name: str(d.name), areaId: d.areaId ? String(d.areaId) : undefined })
  // Un enlace (compartido desde Safari, por ejemplo): a las notas, con el título de la página
  const link = findUrl(text)
  // Frases sueltas del dictado («Llamar al dentista. Mañana a las 10») en una
  const said = (link ? link.rest : text).replace(/([^\d\s])\.\s+(?=\S)/g, '$1 ')
  const parsed = parseQuickAdd(said, {
    today,
    time: hhmmIn(env.now, env.tz),
    projects: ix.projects.filter((p) => p.status !== 'done' && p.status !== 'archived').map(target),
    areas: ix.areas.map(target),
    people: ix.people.map(target),
  })
  if (!parsed.title && !link) return { writes: [], report: ['No he entendido qué apuntar.'] }
  let task: Task = {
    id: env.newId(),
    title: link ? linkTask(parsed.title, link.url, fields.titulo).title : parsed.title,
    notes: link ? link.url : '',
    done: 0,
    priority: parsed.priority,
    tags: parsed.tags,
    subtasks: [],
    order: env.now,
    createdAt: env.now,
  }
  if (parsed.dueDate) task.dueDate = parsed.dueDate
  if (parsed.dueTime) task.dueTime = parsed.dueTime
  if (parsed.projectId) task.projectId = parsed.projectId
  if (projectId) {
    task.projectId = projectId
    const area = ix.projects.find((p) => p.id === projectId)?.areaId
    if (area) task.areaId = String(area)
  }
  if (parsed.areaId && !task.areaId) task.areaId = parsed.areaId
  if (parsed.people?.length) task.people = parsed.people
  if (parsed.recurrence) task.recurrence = parsed.recurrence
  if (parsed.reminder) task.reminder = parsed.reminder
  if (parsed.estimate) task.estimate = parsed.estimate
  if (parsed.nag) task.nag = parsed.nag
  if (parsed.waitingFor) {
    task.waitingFor = parsed.waitingFor
    task.waitingSince = today
  }
  task = withReminder(task, env)

  const when = task.waitingFor
    ? `, esperando a ${task.waitingFor}; te lo recuerdo ${spokenDay(task.dueDate!, today)}`
    : task.dueDate
      ? `, ${spokenDay(task.dueDate, today)}${task.dueTime ? ` a las ${task.dueTime}` : ''}`
      : ''
  const where = task.projectId ? ix.projectName(task.projectId) : task.areaId ? ix.areaName(task.areaId) : task.dueDate ? '' : 'la bandeja'
  return remember(
    rows,
    {
      writes: [{ tbl: 'tasks', id: task.id, data: task as unknown as Data }],
      report: [`Apuntado: ${task.title}${when}${where ? ` (en ${where})` : ''}${task.remindAt ? '. Te avisaré' : ''}.`],
    },
    env,
    `«${task.title}»`,
  )
}

/** Lo que se añade a la compra, dicho para deshacerlo */
const shoppingWhat = (r: WriteResult) => `${list(r.writes.map((w) => str(w.data.name)).filter(Boolean)) || 'lo último'} de la compra`

/**
 * Lo que se dicta a Siri: una pregunta, algo que hacer o algo que apuntar.
 * El texto de `report` es corto: Siri lo lee en voz alta.
 */
export function capture(rows: Row[], input: string | CaptureInput, env: Env, cal?: CaptureCalendar): CaptureResult {
  const fields = typeof input === 'string' ? { texto: input } : input
  if (fields.importe !== undefined) return captureCardPayment(rows, fields, env)
  // La automatización lanzada a mano (o con el importe sin elegir): no hay pago que apuntar
  if (fields.pago && !fields.texto && !fields.gasto)
    return {
      writes: [],
      report: [
        fields.comercio
          ? `Ha llegado el comercio (${fields.comercio}) pero no el importe: en «Obtener contenido de URL», el campo importe tiene que ser la variable Importe de la transacción.`
          : 'La automatización llega bien a LUNO, pero sin ningún pago: se apunta sola cuando pagas con Apple Pay. Para probarla sin pagar, pon un importe fijo (como 1,50) y un comercio.',
      ],
    }
  // El atajo de gastos manda solo lo dictado: «quince euros en el súper»
  const said = fields.gasto ? `gasto ${fields.gasto}` : (fields.texto ?? '')
  const { text, question } = cleanDictation(said)
  if (!text) return { writes: [], report: ['No he oído nada que apuntar.'] }
  const today = ymdIn(env.now, env.tz)
  // Para Siri: «hoy» mejor que la fecha
  const spoken = (r: string) => r.replaceAll(` el ${today}`, ' hoy')

  if (UNDO.test(text)) return undoLast(rows, env)

  const names = {
    habits: rows.filter((r) => r.tbl === 'habits' && !r.data.archived).map((r) => str(r.data.name)),
    notes: rows.filter((r) => r.tbl === 'notes').map((r) => str(r.data.title)),
    lists: shoppingLists(rows).map((l) => l.name),
    projects: new Index(rows).projects.filter((p) => p.status !== 'done' && p.status !== 'archived').map((p) => str(p.name)),
  }
  const intent = classify(said, names, today)
  if (intent.kind === 'habit') {
    const r = markHabit(rows, { habito: intent.name, ...(intent.qty ? { cantidad: intent.qty } : {}) }, env)
    return remember(rows, { ...r, report: r.report.map(spoken) }, env, `«${cap(intent.name)}» de hoy`)
  }
  // «tomada: ibuprofeno», «¿me he tomado la pastilla?»
  const med = captureMed(rows, question ? `${text}?` : text, env)
  if (med) return remember(rows, med, env, 'la toma')

  if (question || ASKING.test(text) || NOW_FREE.test(text) || SHOP_Q.test(text) || /^(?:mi\s+)?agenda(?:\s|$)/i.test(text)) {
    const reply = answer(rows, text, env, cal)
    if (reply) return { writes: [], report: [reply] }
    // Una pregunta que no se sabe responder no se apunta como tarea («¿Qué tengo ?»)
    if (ASKING.test(text)) return { writes: [], report: [HELP] }
  }

  switch (intent.kind) {
    case 'noteAppend': {
      if (!intent.text) return { writes: [], report: ['¿Qué añado a la nota? Dímelo así: «a la nota maleta: crema solar».'] }
      return remember(rows, appendNoteTool(rows, { nota: intent.note, texto: intent.text }, env), env, 'lo añadido a la nota')
    }
    case 'note': {
      const r = createNote(rows, { titulo: intent.title, contenido: intent.body }, env)
      return remember(rows, { ...r, report: [r.report[0].replace('Nota creada', 'Nota guardada')] }, env, `la nota «${intent.title}»`)
    }
    case 'done':
      return didIt(rows, intent.what, env, true)!
    case 'lent':
      return thing(rows, intent.name, env, undefined, intent.person)
    case 'thing':
      return thing(rows, intent.name, env, intent.where)
    case 'shopping': {
      const r = addShopping(rows, { cosas: intent.items, ...(intent.list ? { lista: intent.list } : {}) }, env)
      return remember(rows, r, env, shoppingWhat(r))
    }
    case 'projectTask': {
      const project = new Index(rows).projects.find((p) => str(p.name) === intent.project)
      return newTask(rows, intent.text, fields, env, project ? String(project.id) : undefined)
    }
    case 'expense': {
      const r = addExpenseTool(rows, { texto: intent.text }, env)
      if (!r.writes.length) return { ...r, report: ['¿Cuánto has gastado? Dilo con el importe: «15 euros en el súper».'] }
      // Para Siri, sin el resumen del mes
      const amount = num(r.writes.find((w) => w.tbl === 'expenses')?.data.amount)
      return remember(rows, { ...r, report: [r.report[0].split('. Este mes')[0] + '.'] }, env, `el gasto de ${money(amount)}`)
    }
  }

  const moved = postpone(rows, text, env)
  if (moved) return moved

  // «He llamado al dentista» (sin un día por delante: «he quedado con Ana el viernes» es una tarea)
  if (DID.test(text) || /^he\s+pagado\s/i.test(text)) {
    const p = parseQuickAdd(text, when(env))
    if (!(p.dueDate && p.dueDate > today) && !p.dueTime) {
      const done = didIt(rows, text, env, true)
      if (done) return done
    }
  }

  if (DID_I.test(text) && !parseQuickAdd(text, when(env)).dueDate) {
    const done = didIt(rows, text, env, false)
    if (done) return done
  }

  return newTask(rows, text, fields, env)
}
