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
import { captureMed, medsLeft } from './meds.ts'
import { houseVoice, type HouseCtx } from './casa.ts'
import { itemKey, parseItems } from '../_shared/shopping.ts'
import { ASKING, classify, cleanDictation, closest, infinitive, tidyTitle } from '../_shared/intent.ts'
import type { Health } from '../_shared/projectHealth.ts'
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
  habitsToday,
  logLastTime,
  markHabit,
  projectsNeedingCare,
  menuName,
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

/** Lo que no está en tus registros y a veces hace falta para responder */
export interface CaptureContext {
  /** los eventos de tus calendarios («¿qué tengo hoy?») */
  events?: EventLike[]
  names?: Record<string, string>
  /** la casa compartida («¿qué me toca en casa?»); null si no tienes */
  house?: HouseCtx | null
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
  /** lo que contestó Siri */
  said?: string
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
  const value: UndoState = { at: env.now, what, said: r.report[0], items }
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
  const next = r.writes.find((w) => w.tbl === 'tasks' && w.id !== task.id)
  // Si era la última de su proyecto, también se dice
  const last = r.report.find((x) => x.startsWith('Era la última'))
  return remember(rows, { writes: r.writes, report: [`Hecho: ${task.title}.${next ? ` La próxima vez, ${spokenDay(str(next.data.dueDate), today)}.` : ''}${last ? ` ${last}` : ''}`] }, env, `«${task.title}» vuelve a estar pendiente`)
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
  // Con solo una hora («a las 5»), ese mismo día; sin nada, a mañana (o al día siguiente del que tenía)
  const day = p.dueDate ?? (p.dueTime ? (task.dueDate && task.dueDate > today ? task.dueDate : today) : addDays(task.dueDate && task.dueDate > today ? task.dueDate : today, 1))
  const r = updateTasks(rows, [{ id: task.id, fecha: day, ...(p.dueTime ? { hora: p.dueTime } : {}) }], env)
  const t = r.writes[0].data as unknown as Task
  return remember(rows, { writes: r.writes, report: [`Pasada ${toDay(day, today)}${t.dueTime ? ` a las ${t.dueTime}` : ''}: ${task.title}.`] }, env, `«${task.title}» vuelve a ${task.dueDate ? spokenDay(task.dueDate, today) : 'no tener fecha'}`)
}

const ARTICLE = /^(?:el|la|los|las|mi|mis|un|una|unos|unas)\s+/i

// «he comprado leche y pan», «ya tengo pan» (si está en la compra: si no, es otra cosa)
const BOUGHT_SAID = /^(?:ya\s+(?:he\s+comprado|tengo|compr[eé])|he\s+comprado|compr[eé])\s+(.+)$/i

/** Tacha de la compra lo que ya tienes («quita la leche de la compra», «he comprado pan») */
function tick(rows: Row[], items: string, env: Env, strict: boolean): CaptureResult | undefined {
  const wanted = parseItems(items.replace(ARTICLE, '')).map((i) => i.name)
  const open = rows.filter((r) => r.tbl === 'shopping' && !r.data.checked)
  const hits: Row[] = []
  for (const w of wanted) {
    const k = itemKey(w)
    const hit = open.find((r) => itemKey(str(r.data.name)) === k) ?? open.find((r) => fold(str(r.data.name)).includes(fold(w)) || fold(w).includes(fold(str(r.data.name))))
    if (hit && !hits.includes(hit)) hits.push(hit)
  }
  if (!hits.length) return strict ? { writes: [], report: [`No veo ${list(wanted.map((w) => w.toLowerCase()))} en la compra.`] } : undefined
  const names = hits.map((r) => str(r.data.name))
  return remember(rows, { writes: hits.map((r) => ({ tbl: 'shopping', id: r.id, data: { ...r.data, checked: 1 } })), report: [`Tachado de la compra: ${list(names)}.`] }, env, `${list(names)}, otra vez en la compra`)
}

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

type Part = 'mañana' | 'tarde' | 'noche'
/** De qué hora a qué hora es cada parte del día */
const PART_HOURS: Record<Part, [string, string]> = { mañana: ['00:00', '14:00'], tarde: ['14:00', '21:00'], noche: ['20:00', '24:00'] }
const partOf = (s: string): Part => (fold(s) === 'manana' ? 'mañana' : (fold(s) as Part))
type Asked = { day: string; week?: boolean; part?: Part }

/** El día (o la semana) por el que se pregunta: «hoy», «mañana», «el jueves», «esta tarde», «mañana por la noche», «esta semana» */
function askedDay(rest: string, env: Env): Asked | undefined {
  const today = ymdIn(env.now, env.tz)
  let r = rest.replace(/^(?:(?:que\s+hacer|pendiente|apuntado|para|en|de)\s+)+/i, '').trim()
  let part: Part | undefined
  const tail = /\s*por\s+la\s+(mañana|manana|tarde|noche)$/i.exec(r)
  if (tail) {
    part = partOf(tail[1])
    r = r.slice(0, tail.index).trim()
  }
  const f = fold(r)
  const own = /^esta\s+(manana|tarde|noche)$/.exec(f)
  if (own) return { day: today, part: partOf(own[1]) }
  if (!f || /^(?:hoy|ahora|el\s+dia|el\s+dia\s+de\s+hoy)$/.test(f)) return { day: today, part }
  if (/^(?:esta\s+semana|la\s+semana)$/.test(f)) return { day: today, week: true }
  const p = parseQuickAdd(`x ${r}`, when(env))
  return p.dueDate && fold(p.title) === 'x' ? { day: p.dueDate, part } : undefined
}

/** ¿Hace falta mirar los calendarios para responder? Las horas (en ms) que hay que leer */
export function calendarRange(input: CaptureInput, env: Env): { from: number; to: number } | undefined {
  const { text } = cleanDictation(input.texto ?? '')
  const today = ymdIn(env.now, env.tz)
  const span = (day: string, days = 1) => ({ from: zonedToUtc(day, '00:00', env.tz), to: zonedToUtc(addDays(day, days), '00:00', env.tz) })
  if (BRIEF.test(text)) return span(today)
  if (NIGHT.test(text)) return span(addDays(today, 1))
  const m = AGENDA_Q.exec(text)
  const asked = m && !SHOP_Q.test(text) ? askedDay(m[1], env) : undefined
  if (!asked) return undefined
  return span(asked.day, asked.week ? 7 : 1)
}

/** ¿Hace falta la casa compartida para responder? («¿qué me toca en casa?», «buenos días») */
export function needsHouse(input: CaptureInput) {
  const { text } = cleanDictation(input.texto ?? '')
  return HOUSE_Q.test(text) || BRIEF.test(text)
}

const eventDay = (e: EventLike, tz: string) => (e.allDay ? e.start.slice(0, 10) : ymdIn(Date.parse(e.start), tz))

function agenda(rows: Row[], asked: Asked, env: Env, cal?: CaptureContext): string {
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
  const part = asked.part
  const inPart = (time: string) => !part || (time >= PART_HOURS[part][0] && time < PART_HOURS[part][1])
  const tasks = open.filter((t) => t.dueDate === day)
  const dayEvents = events.filter((e) => eventDay(e, env.tz) === day || (e.allDay && e.start.slice(0, 10) < day && e.end.slice(0, 10) > day))
  const timed = [
    ...tasks.filter((t) => t.dueTime).map((t) => ({ time: t.dueTime!, what: t.title })),
    ...dayEvents.filter((e) => !e.allDay).map((e) => ({ time: hhmmIn(Date.parse(e.start), env.tz), what: e.title })),
  ]
    .filter((x) => inPart(x.time))
    .sort((a, b) => a.time.localeCompare(b.time))
  const allDay = dayEvents.filter((e) => e.allDay).map((e) => e.title)
  const untimed = tasks
    .filter((t) => !t.dueTime)
    .sort((a, b) => Number(b.important === day) - Number(a.important === day) || b.priority - a.priority || a.order - b.order)
  const label = part ? (day === today ? `esta ${part}` : `${spokenDay(day, today)} por la ${part}`) : spokenDay(day, today)
  if (part) {
    // Una parte del día: lo que tiene hora entonces, y cuánto hay sin hora
    const rest = untimed.length ? ` Sin hora tienes ${untimed.length === 1 ? 'una cosa' : `${untimed.length} cosas`} más.` : ''
    if (!timed.length) return `${cap(label)} no tienes nada con hora.${rest}`
    return `${cap(label)} tienes ${timed.length === 1 ? 'una cosa' : `${timed.length} cosas`}: ${timed.slice(0, 5).map((x) => `a las ${x.time}, ${x.what}`).join('; ')}${timed.length > 5 ? ` y ${timed.length - 5} más` : ''}.${rest}`
  }
  const total = timed.length + allDay.length + untimed.length
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

// «buenos días», «¿qué tal mi día?»: el día de un vistazo; «buenas noches»: cómo ha ido y lo de mañana
const BRIEF = /^(?:buen(?:os|as)?\s+(?:d[ií]as?|tardes)|qu[eé]\s+tal\s+(?:mi|el)\s+d[ií]a|c[oó]mo\s+(?:viene|pinta|es|se\s+presenta)\s+(?:el|mi)\s+d[ií]a|resumen(?:\s+del?\s+d[ií]a)?|mi\s+d[ií]a|empieza\s+el\s+d[ií]a|cu[eé]ntame\s+(?:mi|el)\s+d[ií]a)$/i
const NIGHT = /^(?:buenas\s+noches|c[oó]mo\s+(?:ha\s+ido|me\s+ha\s+ido|fue)\s+(?:el|mi)\s+d[ií]a|cierra\s+el\s+d[ií]a|cerrar\s+el\s+d[ií]a|qu[eé]\s+he\s+hecho\s+hoy)$/i
// «¿qué he apuntado?», «repite»
const LAST_SAID = /^(?:qu[eé]\s+(?:he\s+apuntado|has\s+apuntado|acabo\s+de\s+(?:apuntar|decir)|te\s+he\s+dicho)|repite(?:lo)?|lo\s+[uú]ltimo(?:\s+que\s+he\s+(?:dicho|apuntado))?)$/i
// «¿qué hay de cenar?», «¿qué como mañana?»
const MENU_Q = /^qu[eé]\s+(?:hay\s+(?:de|para)\s+|tengo\s+(?:de|para)\s+|toca\s+(?:de\s+)?|vamos\s+a\s+)?(comer|cenar|como|ceno|comemos|cenamos)(?=\s|$)\s*(.*)$/i
// «¿qué me toca en casa?», «¿a quién le toca sacar la basura?»
const HOUSE_Q = /^(?:qu[eé]\s+(?:me\s+toca|toca|hay\s+que\s+hacer|tengo\s+que\s+hacer)(?:\s+hoy)?\s+en\s+(?:casa|el\s+piso)(?:\s+hoy)?|a\s+qui[eé]n\s+le\s+toca\s+(.+))$/i
// «¿cuándo es el cumpleaños de Ana?»; «¿qué cumpleaños hay esta semana?»
const BDAY_Q = /^cu[aá]ndo\s+es\s+el\s+(cumplea[nñ]os|santo|aniversario)\s+de\s+(.+)$/i
const BDAYS_Q = /^qu[eé]\s+cumplea[nñ]os\s+hay\s*(.*)$/i
// «¿qué estoy esperando?», «¿qué espero de Luis?»
const PROJECTS_Q = /^(?:c[oó]mo|qu[eé]\s+tal)\s+(?:van|llevo|voy\s+con)\s+(?:mis\s+|los\s+)?proyectos$/i
const WAIT_Q = /^qu[eé]\s+(?:estoy\s+esperando|tengo\s+a\s+la\s+espera|espero)(?:\s+de\s+(.+))?$/i
// «¿qué hábitos me quedan?», «¿cómo voy con los hábitos?»
const HABITS_Q = /^(?:(?:qu[eé]|cu[aá]ntos)\s+(?:h[aá]bitos\s+(?:me\s+)?(?:quedan|faltan|tengo|tocan)|me\s+(?:quedan?|faltan?)\s+de\s+h[aá]bitos)|c[oó]mo\s+voy\s+(?:con\s+)?(?:los\s+)?h[aá]bitos)(?:\s+hoy)?$/i
// «¿qué pastillas me tocan hoy?», «¿qué me toca tomar?»
const MEDS_Q = /^qu[eé]\s+(?:medicaci[oó]n|medicinas?|pastillas?|me\s+toca\s+tomar|tengo\s+que\s+tomar)(?:\s+(?:me\s+)?(?:toca|tocan|tengo|queda|quedan|falta|faltan))?(?:\s+(?:tomar|hoy))*$/i

/** «hace un momento», «hace 5 minutos», «hace 2 horas» */
function agoMin(ms: number, now: number) {
  const min = Math.round((now - ms) / 60_000)
  if (min < 2) return 'hace un momento'
  if (min < 60) return `hace ${min} minutos`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h === 1 ? 'una hora' : `${h} horas`}` : `hace ${Math.round(h / 24)} días`
}

function lastSaid(rows: Row[], env: Env): string {
  const v = rows.find((r) => r.tbl === 'settings' && r.id === UNDO_KEY)?.data.value as UndoState | null | undefined
  if (!v?.said) return 'No has apuntado nada por voz últimamente.'
  return `${cap(agoMin(v.at, env.now))}: ${v.said}`
}

/** La próxima vez que cae una fecha que vuelve cada año («1990-03-12» o «03-12») */
function nextYearly(date: string, today: string): { date: string; years?: number } | undefined {
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(date)
  if (!m) return undefined
  let next = `${today.slice(0, 4)}-${m[2]}-${m[3]}`
  if (next < today) next = `${Number(today.slice(0, 4)) + 1}-${m[2]}-${m[3]}`
  return { date: next, ...(m[1] ? { years: Number(next.slice(0, 4)) - Number(m[1]) } : {}) }
}

/** Los cumpleaños de tus personas en los próximos días */
function birthdaysWithin(rows: Row[], today: string, days: number) {
  return rows
    .filter((r) => r.tbl === 'people' && r.data.birthday)
    .flatMap((r) => {
      const n = nextYearly(str(r.data.birthday), today)
      return n && diffDays(n.date, today) <= days ? [{ name: str(r.data.name).split(' ')[0], ...n }] : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

function birthday(rows: Row[], what: string, who: string, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const people = rows.filter((r) => r.tbl === 'people')
  const p = closest(people, who.replace(ARTICLE, ''), (r) => str(r.data.name)).hit
  if (!p) return `No tengo a ${who} entre tus personas.`
  const name = str(p.data.name).split(' ')[0]
  const kind = fold(what).startsWith('cumple') ? 'cumpleaños' : what.toLowerCase()
  const dates = Array.isArray(p.data.dates) ? (p.data.dates as { label?: string; date?: string }[]) : []
  const date = kind === 'cumpleaños' ? str(p.data.birthday) : str(dates.find((d) => fold(str(d.label)).includes(fold(what)))?.date)
  const next = date ? nextYearly(date, today) : undefined
  if (!next) return `No tengo apuntado el ${kind} de ${name}.`
  const n = diffDays(next.date, today)
  return `El ${kind} de ${name} es ${spokenDay(next.date, today)}${n > 2 ? `, dentro de ${n} días` : ''}${next.years && kind === 'cumpleaños' ? ` (cumple ${next.years})` : ''}.`
}

function birthdaysSoon(rows: Row[], rest: string, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const month = /mes/i.test(rest)
  const soon = birthdaysWithin(rows, today, month ? 31 : 7)
  const when = month ? 'Este mes' : 'Esta semana'
  if (!soon.length) return `${when} no hay ningún cumpleaños.`
  return `${when}: ${list(soon.map((b) => `${b.name} ${spokenDay(b.date, today)}`))}.`
}

function waiting(rows: Row[], who: string | undefined, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const all = new Index(rows).tasks.filter((t) => !t.done && t.waitingFor && (!who || fold(t.waitingFor).includes(fold(who.replace(ARTICLE, '')))))
  if (!all.length) return who ? `No esperas nada de ${who}.` : 'No estás esperando nada de nadie.'
  const since = (t: Task) => (t.waitingSince ? (t.waitingSince === today ? ', desde hoy' : `, desde hace ${diffDays(today, t.waitingSince)} días`) : '')
  return `Esperas ${all.length === 1 ? 'una cosa' : `${all.length} cosas`}: ${list(all.slice(0, 4).map((t) => `${t.title}, de ${t.waitingFor}${since(t)}`))}${all.length > 4 ? ` y ${all.length - 4} más` : ''}.`
}

function habitsLeft(rows: Row[], env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const due = habitsToday(rows, today)
  if (!due.length) return 'Hoy no te toca ningún hábito.'
  const left = due.filter((h) => !h.done)
  if (!left.length) return `Ya has hecho ${due.length === 1 ? 'el hábito' : `los ${due.length} hábitos`} de hoy.`
  return `${left.length === 1 ? 'Te queda' : `Te quedan ${left.length}`}: ${list(left.map((h) => (h.progress ? `${h.name} (llevas ${h.progress})` : h.name)))}.`
}

function menuFor(rows: Row[], verb: string, rest: string, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const day = askedDay(rest, env)?.day ?? today
  const meal = /cen/i.test(verb) ? 'cena' : 'comida'
  const what = meal === 'cena' ? 'cenar' : 'comer'
  const r = rows.find((x) => x.tbl === 'menu' && x.id === `${day}:${meal}`)
  return r ? `${cap(spokenDay(day, today))} para ${what}: ${menuName(rows, r.data)}.` : `${cap(spokenDay(day, today))} no hay nada apuntado para ${what}.`
}

/** «Buenos días»: el día de un vistazo */
function brief(rows: Row[], env: Env, cx?: CaptureContext): string {
  const today = ymdIn(env.now, env.tz)
  const hour = Number(hhmmIn(env.now, env.tz).slice(0, 2))
  const out = [`${hour < 14 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'}.`, agenda(rows, { day: today }, env, cx)]
  const meds = medsLeft(rows, env)
  if (meds) out.push(meds)
  const habits = habitsToday(rows, today).filter((h) => !h.done)
  if (habits.length) out.push(`${habits.length === 1 ? 'Te queda un hábito' : `Te quedan ${habits.length} hábitos`}: ${list(habits.slice(0, 4).map((h) => h.name))}${habits.length > 4 ? ' y más' : ''}.`)
  for (const b of birthdaysWithin(rows, today, 1)) out.push(`${cap(spokenDay(b.date, today))} es el cumpleaños de ${b.name}.`)
  const ask = new Index(rows).tasks.filter((t) => !t.done && t.waitingFor && t.dueDate && t.dueDate <= today)
  if (ask.length) out.push(`Hoy toca preguntar: ${list(ask.slice(0, 3).map((t) => `a ${t.waitingFor} por ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}`))}.`)
  if (cx?.house) {
    const home = houseVoice(cx.house, today)
    if (!home.startsWith('Hoy no te toca')) out.push(home)
  }
  // El proyecto que más atención pide (con fecha encima o parado), para que no se olvide
  const care = projectsNeedingCare(new Index(rows), today, env).find((x) => x.health.kind === 'late' || x.health.kind === 'atRisk' || x.health.kind === 'stalled')
  if (care) out.push(projectVoice(care.name, care.health))
  return out.join(' ')
}

/** Cómo va un proyecto, dicho en voz alta */
function projectVoice(name: string, h: Health): string {
  const things = (n: number) => (n === 1 ? 'una cosa' : `${n} cosas`)
  switch (h.kind) {
    case 'late':
      return `«${name}» se ha pasado de fecha y le quedan ${things(h.open)}.`
    case 'atRisk':
      return `A «${name}» le quedan ${things(h.open)} y ${h.daysLeft === 0 ? 'acaba hoy' : h.daysLeft === 1 ? 'acaba mañana' : `faltan ${h.daysLeft} días`}.`
    case 'stalled':
      return `«${name}» lleva ${h.days} días parado: ¿cuál es el siguiente paso?`
    case 'noNext':
      return `«${name}» no tiene siguiente paso.`
    case 'finished':
      return `«${name}» tiene todo hecho: ¿lo das por terminado?`
    default:
      return `«${name}» va bien.`
  }
}

/** «¿Cómo van mis proyectos?»: los que piden atención; si ninguno, que van bien */
function projectsNow(rows: Row[], env: Env): string {
  const ix = new Index(rows)
  const active = ix.projects.filter((p) => p.status === 'active').length
  if (!active) return 'No tienes proyectos en marcha.'
  const care = projectsNeedingCare(ix, ymdIn(env.now, env.tz), env)
  if (!care.length) return active === 1 ? 'Tu proyecto va bien.' : `Tus ${active} proyectos van bien.`
  return [...care.slice(0, 3).map((x) => projectVoice(x.name, x.health)), ...(care.length > 3 ? [`Y ${care.length - 3} más en la app.`] : []), ...(active > care.length ? [`El resto va bien.`] : [])].join(' ')
}

/** «Buenas noches»: lo hecho, lo que queda y lo de mañana */
function night(rows: Row[], env: Env, cx?: CaptureContext): string {
  const today = ymdIn(env.now, env.tz)
  const tasks = new Index(rows).tasks
  const done = tasks.filter((t) => t.done && t.completedAt && ymdIn(t.completedAt, env.tz) === today)
  const left = tasks.filter((t) => !t.done && !t.someday && !t.waitingFor && t.dueDate && t.dueDate <= today)
  const some = (xs: Task[]) => list([...xs.slice(0, 3).map((t) => t.title), ...(xs.length > 3 ? [`${xs.length - 3} más`] : [])])
  const out = ['Buenas noches.']
  out.push(done.length ? `Hoy has hecho ${done.length === 1 ? 'una cosa' : `${done.length} cosas`}: ${some(done)}.` : 'Hoy no has marcado nada como hecho.')
  if (left.length) out.push(`${left.length === 1 ? 'Te queda una' : `Te quedan ${left.length}`} sin hacer: ${some(left)}. Si quieres, dime «pospón» y lo que sea.`)
  const habits = habitsToday(rows, today).filter((h) => !h.done)
  if (habits.length) out.push(`${habits.length === 1 ? 'Te queda un hábito' : `Te quedan ${habits.length} hábitos`}: ${list(habits.slice(0, 3).map((h) => h.name))}.`)
  out.push(agenda(rows, { day: addDays(today, 1) }, env, cx))
  return out.join(' ')
}

const HELP = 'Puedo decirte qué tienes hoy, mañana o esta tarde, qué hacer ahora, dónde está algo, qué falta en la compra, qué hay de cenar, cuánto llevas gastado, qué estás esperando, cómo van tus proyectos o cuándo hiciste algo por última vez. Y dime «buenos días» para el resumen del día.'
/** Lo que se responde aunque el dictado no ponga «?» ni empiece por «qué», «cuándo»… */
const SPOKEN = [/^tengo\s+(?:un\s+rato|tiempo|\S+\s+(?:minutos|horas?))/i, /^(?:mi\s+)?agenda(?:\s|$)/i, /lista\s+de\s+la\s+compra$/i, /^a\s+qui[eé]n\s+le\s+toca\s/i]

/** La respuesta a una pregunta (o `undefined` si no es una de las que se saben) */
function answer(rows: Row[], text: string, env: Env, cal?: CaptureContext): string | undefined {
  if (BRIEF.test(text)) return brief(rows, env, cal)
  if (NIGHT.test(text)) return night(rows, env, cal)
  if (LAST_SAID.test(text)) return lastSaid(rows, env)
  if (SHOP_Q.test(text)) return shoppingNow(rows)
  const sp = SPENT_Q.exec(text)
  if (sp) return spent(rows, sp[1], env)
  const wh = WHERE_Q.exec(text)
  if (wh) return whereIs(rows, wh[1], env)
  if (MEDS_Q.test(text)) return medsLeft(rows, env) ?? (rows.some((r) => r.tbl === 'meds' && !r.data.archived) ? 'Hoy ya no te queda nada por tomar.' : 'No tienes medicación apuntada.')
  if (HABITS_Q.test(text)) return habitsLeft(rows, env)
  const menu = MENU_Q.exec(text)
  if (menu) return menuFor(rows, menu[1], menu[2], env)
  const house = HOUSE_Q.exec(text)
  if (house) return cal?.house ? houseVoice(cal.house, ymdIn(env.now, env.tz), house[1]) : 'No tienes casa compartida en LUNO: se crea en Casa → Tareas.'
  const bday = BDAY_Q.exec(text)
  if (bday) return birthday(rows, bday[1], bday[2], env)
  const bdays = BDAYS_Q.exec(text)
  if (bdays) return birthdaysSoon(rows, bdays[1], env)
  const wait = WAIT_Q.exec(text)
  if (wait) return waiting(rows, wait[1], env)
  if (PROJECTS_Q.test(text)) return projectsNow(rows, env)
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
  // Sin lo que se dice para pedirla: «recuérdame que tengo que…», «oye, apunta que…»
  const title = tidyTitle(parsed.title)
  if (!title && !link) return { writes: [], report: ['No he entendido qué apuntar.'] }
  let task: Task = {
    id: env.newId(),
    title: link ? linkTask(title, link.url, fields.titulo).title : title,
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
  if (parsed.deadline) task.deadline = parsed.deadline
  if (parsed.someday) task.someday = true
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
      : task.deadline
        ? `, para antes ${toDay(task.deadline, today).replace(/^a /, 'de ').replace(/^al /, 'del ')}`
        : ''
  const where = task.projectId ? ix.projectName(task.projectId) : task.areaId ? ix.areaName(task.areaId) : task.dueDate || task.deadline ? '' : task.someday ? 'Algún día' : 'la bandeja'
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
export function capture(rows: Row[], input: string | CaptureInput, env: Env, cal?: CaptureContext): CaptureResult {
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

  if (question || ASKING.test(text) || BRIEF.test(text) || NIGHT.test(text) || LAST_SAID.test(text) || SPOKEN.some((r) => r.test(text))) {
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
    case 'bought':
      return tick(rows, intent.items, env, true)!
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

  const got = BOUGHT_SAID.exec(text)
  if (got) {
    const r = tick(rows, got[1], env, false)
    if (r) return r
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
