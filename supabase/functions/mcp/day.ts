/**
 * Contar el día desde Claude: lo que ha hecho (tareas, hábitos, rutinas,
 * «Última vez»), el foco, lo comprado y, con `contar_dia`, todo de una vez
 * (además: tareas para mañana, con quién ha hablado, qué ha comido, gastos y
 * diario). Usa las mismas funciones que las herramientas sueltas, así que
 * cada cosa queda igual que si se apuntara en la app.
 */
import { addDays, ymdIn, zonedToUtc } from '../_shared/time.ts'
import { closest } from '../_shared/likeness.ts'
import { parseItems } from '../_shared/shopping.ts'
import { Index, addExpenseTool, createTasks, fold, isYmd, logLastTime, markHabit, minutesLabel, pickByName, planMenu, updateTasks, writeJournal, type Env, type NewTask, type Row, type Task, type WriteResult } from './ntab.ts'
import { shoppingHits } from './capture.ts'
import { logContactTool } from './organize.ts'
import { parseTime } from './days.ts'

type Data = Record<string, unknown>
type Result = WriteResult & { deletes?: Row[] }
type Step = { id: string; title: string }
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)
const join = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)

/** Una lista de textos: lista, la lista como texto («["a","b"]») o separada por comas o líneas */
export function textItems(v: unknown, split = /\n+|,\s*/): string[] {
  if (typeof v === 'string') {
    const s = v.trim()
    if (/^\[[\s\S]*\]$/.test(s)) {
      try {
        const parsed: unknown = JSON.parse(s)
        if (Array.isArray(parsed)) return textItems(parsed, split)
      } catch {
        // no era JSON: se lee como texto
      }
    }
    return s.split(split).map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
  }
  return Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean) : []
}

/** El día del que habla: `fecha` (no futura) o hoy */
const dayOf = (fecha: unknown, env: Env) => {
  const today = ymdIn(env.now, env.tz)
  return isYmd(fecha) && fecha <= today ? fecha : today
}

// ── Rutinas ───────────────────────────────────────────────────

const ROUTINE = { none: 'ninguna rutina', many: 'varias rutinas', plural: 'Rutinas', empty: 'ninguna' }

/** Marca una rutina (o algunos de sus pasos) como hecha un día, como el modo paso a paso */
export function markRoutine(rows: Row[], args: { rutina?: string; fecha?: unknown; pasos?: unknown; hecha?: unknown }, env: Env): Result {
  const routines = rows.filter((r) => r.tbl === 'routines' && !r.data.archived)
  if (!str(args.rutina).trim()) return { writes: [], report: ['Falta qué rutina (rutina).'] }
  const found = pickByName(routines, str(args.rutina), ROUTINE)
  if (!found.row) return { writes: [], report: [found.error!] }
  const r = found.row
  const name = str(r.data.name)
  const date = dayOf(args.fecha, env)
  const steps = (Array.isArray(r.data.steps) ? r.data.steps : []) as Step[]
  const run = rows.find((x) => x.tbl === 'routineRuns' && x.data.routineId === r.id && x.data.date === date)
  const before = new Set((run?.data.done as string[] | undefined) ?? [])
  // Los pasos que dice (por su nombre); sin ellos, todos
  const said = textItems(args.pasos)
  const picked: Step[] = []
  const unknown: string[] = []
  for (const p of said) {
    const hit = closest(steps, p, (s) => s.title).hit ?? steps.find((s) => fold(s.title).includes(fold(p)))
    if (hit) picked.push(hit)
    else unknown.push(p)
  }
  if (unknown.length) return { writes: [], report: [`«${name}» no tiene ${unknown.length === 1 ? 'el paso' : 'los pasos'} ${join(unknown.map((u) => `«${u}»`))}. Sus pasos: ${steps.map((s) => s.title).join(', ')}.`] }
  const target = said.length ? picked : steps
  const undo = args.hecha === false
  const done = new Set(before)
  for (const s of target) undo ? done.delete(s.id) : done.add(s.id)
  const list = steps.map((s) => s.id).filter((id) => done.has(id))
  const complete = steps.length > 0 && list.length === steps.length
  const id = run?.id ?? env.newId()
  const data: Data = { ...(run?.data ?? {}), id, routineId: r.id, date, done: list }
  if (complete) data.completedAt = num(run?.data.completedAt) || env.now
  else delete data.completedAt
  const left = steps.filter((s) => !done.has(s.id)).map((s) => s.title)
  const when = date === ymdIn(env.now, env.tz) ? 'hoy' : `el ${date}`
  return {
    writes: [{ tbl: 'routineRuns', id, data }],
    report: [complete ? `Rutina «${name}» hecha ${when}.` : `«${name}» ${when}: ${list.length} de ${steps.length} pasos; faltan ${join(left)}.`],
  }
}

// ── Lo hecho ──────────────────────────────────────────────────

/**
 * «He llamado al banco»: completa la tarea pendiente que encaje (antes lo de
 * hoy y lo atrasado); si no, marca el hábito, la rutina o «Última vez»; si no
 * hay nada que encaje, lo dice.
 */
function doneOne(rows: Row[], said: string, env: Env, date: string): Result {
  const today = ymdIn(env.now, env.tz)
  const open = new Index(rows).tasks.filter((t) => !t.done)
  const task = closest(open, said, (t) => t.title, (t) => (t.dueDate && t.dueDate <= today ? 2 : t.dueDate ? 1 : 0))
  if (task.tie) return { writes: [], report: [`«${said}»: hay varias tareas que encajan (${join(task.tie.slice(0, 3).map((t: Task) => `«${t.title}»`))}); dime cuál.`] }
  if (task.hit) {
    const r = updateTasks(rows, [{ id: task.hit.id, hecha: true }], env)
    return { writes: r.writes, report: [`Tarea hecha: ${task.hit.title}.`, ...r.report.filter((x) => !x.startsWith('Actualizada:'))] }
  }
  const habits = rows.filter((r) => r.tbl === 'habits' && !r.data.archived)
  const habit = closest(habits, said, (r) => str(r.data.name)).hit
  if (habit) {
    // Con cantidad («8 vasos de agua»), uno más, como Siri; para más, marcar_habito con la cantidad
    return markHabit(rows, { habito: str(habit.data.name), fecha: date, ...(num(habit.data.target) > 1 ? { cantidad: 1 } : {}) }, env)
  }
  const routines = rows.filter((r) => r.tbl === 'routines' && !r.data.archived)
  const routine = closest(routines, said, (r) => str(r.data.name)).hit
  if (routine) return markRoutine(rows, { rutina: str(routine.data.name), fecha: date }, env)
  const trackers = rows.filter((r) => r.tbl === 'trackers' && !r.data.archived)
  const tracker = closest(trackers, said, (r) => str(r.data.name)).hit
  if (tracker) return logLastTime(rows, { cosa: str(tracker.data.name), fecha: date }, env)
  return { writes: [], report: [`«${said}»: no hay tarea pendiente, hábito, rutina ni «Última vez» que encaje (si lo hace a menudo, puede ir a «Última vez» con lo_he_hecho o ser un hábito nuevo).`] }
}

export function markDone(rows: Row[], args: { cosas?: unknown; fecha?: unknown }, env: Env): Result {
  const items = textItems(args.cosas, /\n+/)
  if (!items.length) return { writes: [], report: ['Falta qué ha hecho (cosas).'] }
  const b = new Batch(rows)
  const date = dayOf(args.fecha, env)
  for (const said of items) b.apply(doneOne(b.rows, said, env, date))
  return b.result()
}

// ── Foco ──────────────────────────────────────────────────────

/** «He estado 2 horas con el informe»: una sesión de foco, como al terminar el temporizador */
export function logFocus(rows: Row[], args: { que?: string; minutos?: unknown; fecha?: unknown; hora_fin?: unknown }, env: Env): Result {
  const what = str(args.que).trim()
  const minutes = Number(args.minutos)
  if (!what) return { writes: [], report: ['Falta en qué ha estado (que).'] }
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) return { writes: [], report: [`Los minutos tienen que ser un número entero de 1 a 720 (${String(args.minutos)} no vale).`] }
  const date = dayOf(args.fecha, env)
  const today = ymdIn(env.now, env.tz)
  const end = args.hora_fin === undefined || args.hora_fin === null || args.hora_fin === '' ? {} : parseTime(args.hora_fin)
  if (end.error) return { writes: [], report: [end.error] }
  // La tarea con la que estuvo, si encaja (antes las pendientes)
  const tasks = new Index(rows).tasks
  const task = closest(tasks, what, (t) => t.title, (t) => (t.done ? 0 : 1)).hit
  const endedAt = end.time ? zonedToUtc(date, end.time, env.tz) : date === today ? env.now : zonedToUtc(date, '20:00', env.tz)
  const id = env.newId()
  const title = task?.title ?? what
  const log: Data = { id, title, date, minutes, endedAt, ...(task ? { taskId: task.id } : {}) }
  const total = rows.filter((r) => r.tbl === 'focusLogs' && r.data.date === date).reduce((n, r) => n + num(r.data.minutes), 0) + minutes
  const when = date === today ? 'hoy' : `el ${date}`
  return { writes: [{ tbl: 'focusLogs', id, data: log }], report: [`Foco apuntado: ${minutesLabel(minutes)} en «${title}» ${when}${end.time ? ` (hasta las ${end.time})` : ''}. Lleva ${minutesLabel(total)} de foco ${when}.`] }
}

// ── Compra ────────────────────────────────────────────────────

/** «He comprado leche y pan»: los tacha de la compra (como Siri) */
export function tickShopping(rows: Row[], args: { cosas?: unknown }, _env: Env): Result {
  const said = typeof args.cosas === 'string' && !/^\s*\[/.test(args.cosas) ? parseItems(args.cosas).map((i) => i.name) : textItems(args.cosas)
  if (!said.length) return { writes: [], report: ['Falta qué ha comprado (cosas).'] }
  const { hits, missing } = shoppingHits(rows, said)
  const report: string[] = []
  if (hits.length) report.push(`Tachado de la compra: ${join(hits.map((r) => str(r.data.name)))}.`)
  if (missing.length) report.push(`No estaba${missing.length > 1 ? 'n' : ''} en la compra: ${join(missing)}.`)
  return { writes: hits.map((r) => ({ tbl: 'shopping', id: r.id, data: { ...r.data, checked: 1 } })), report }
}

// ── Todo de una vez ───────────────────────────────────────────

/**
 * Junta lo de varias herramientas: cada paso ve lo que cambiaron los
 * anteriores (p. ej. la persona recién creada) y al final se guarda todo junto.
 */
class Batch {
  rows: Row[]
  private writes = new Map<string, Row>()
  private deletes = new Map<string, Row>()
  private report: string[] = []
  constructor(rows: Row[]) {
    this.rows = [...rows]
  }
  apply(r: Result, title?: string) {
    const key = (x: Row) => `${x.tbl}:${x.id}`
    for (const w of r.writes) {
      this.writes.set(key(w), w)
      this.deletes.delete(key(w))
      const i = this.rows.findIndex((x) => key(x) === key(w))
      if (i >= 0) this.rows[i] = w
      else this.rows.push(w)
    }
    for (const d of r.deletes ?? []) {
      this.writes.delete(key(d))
      this.deletes.set(key(d), d)
      this.rows = this.rows.filter((x) => key(x) !== key(d))
    }
    if (r.report.length) this.report.push(...(title ? [title, ...r.report.map((x) => `- ${x}`)] : r.report))
  }
  note(line: string) {
    this.report.push(line)
  }
  result(): Result {
    return { writes: [...this.writes.values()], deletes: [...this.deletes.values()], report: this.report }
  }
}

export interface DayArgs {
  fecha?: unknown
  hecho?: unknown
  tareas?: unknown
  personas?: unknown
  comida?: unknown
  cena?: unknown
  gastos?: unknown
  habitos?: unknown
  rutinas?: unknown
  foco?: unknown
  comprado?: unknown
  diario?: { texto?: string; animo?: number; cosas_buenas?: unknown } | null
}

const objects = (v: unknown): Data[] => {
  if (typeof v === 'string' && /^\s*\[/.test(v)) {
    try {
      const parsed: unknown = JSON.parse(v)
      return objects(parsed)
    } catch {
      return []
    }
  }
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Data[]) : []
}

export function tellDay(rows: Row[], args: DayArgs, env: Env): Result {
  const b = new Batch(rows)
  const date = dayOf(args.fecha, env)
  const today = ymdIn(env.now, env.tz)
  const when = date === today ? 'hoy' : `el ${date}`
  b.note(`Apuntado lo de ${when}:`)

  const done = textItems(args.hecho, /\n+/)
  if (done.length) {
    const part = new Batch(b.rows)
    for (const said of done) part.apply(doneOne(part.rows, said, env, date))
    b.apply(part.result(), '\nLO HECHO')
  }

  // Lo de cada hábito con su cantidad («2 vasos»)
  const habits = objects(args.habitos)
  if (habits.length) {
    const part = new Batch(b.rows)
    for (const h of habits) part.apply(markHabit(part.rows, { habito: str(h.habito), cantidad: typeof h.cantidad === 'number' ? h.cantidad : undefined, hecho: h.hecho === false ? false : undefined, fecha: date }, env))
    b.apply(part.result(), '\nHÁBITOS')
  }

  const routines = textItems(args.rutinas, /\n+/)
  if (routines.length) {
    const part = new Batch(b.rows)
    for (const r of routines) part.apply(markRoutine(part.rows, { rutina: r, fecha: date }, env))
    b.apply(part.result(), '\nRUTINAS')
  }

  const focus = objects(args.foco)
  if (focus.length) {
    const part = new Batch(b.rows)
    for (const f of focus) part.apply(logFocus(part.rows, { que: str(f.que), minutos: f.minutos, fecha: date, hora_fin: f.hora_fin }, env))
    b.apply(part.result(), '\nFOCO')
  }

  const people = objects(args.personas)
  if (people.length) {
    const part = new Batch(b.rows)
    for (const p of people) part.apply(logContactTool(part.rows, { persona: str(p.nombre), tipo: str(p.tipo) || undefined, resumen: str(p.resumen), fecha: date }, env))
    b.apply(part.result(), '\nCON QUIÉN HA HABLADO')
  }

  const meals = { comida: str(args.comida).trim(), cena: str(args.cena).trim() }
  if (meals.comida || meals.cena) {
    const r = planMenu(b.rows, { comidas: [{ fecha: date, ...meals }] }, env)
    // Sin la nota del menú de la semana, que aquí no viene a cuento
    b.apply({ ...r, report: r.report.filter((x) => x.startsWith(date)).map((x) => x.replace(`${date} `, '')) }, '\nQUÉ HA COMIDO')
  }

  const expenses = objects(args.gastos)
  if (expenses.length) {
    const part = new Batch(b.rows)
    for (const g of expenses) part.apply(addExpenseTool(part.rows, { texto: str(g.texto) || undefined, importe: typeof g.importe === 'number' ? g.importe : undefined, concepto: str(g.concepto) || undefined, categoria: str(g.categoria) || undefined, etiquetas: g.etiquetas as string[] | undefined, fecha: date }, env))
    b.apply(part.result(), '\nGASTOS')
  }

  const bought = textItems(args.comprado)
  if (bought.length) b.apply(tickShopping(b.rows, { cosas: bought }, env), '\nCOMPRA')

  // Lo que tiene que hacer: sin fecha, para el día siguiente
  const tasks = objects(args.tareas) as unknown as NewTask[]
  if (tasks.length) {
    const next = addDays(date, 1)
    const r = createTasks(b.rows, tasks.map((t) => (t.fecha || t.algun_dia || t.esperando ? t : { ...t, fecha: next })), env)
    b.apply(r, '\nPARA HACER')
  }

  const j = args.diario
  if (j && (str(j.texto).trim() || typeof j.animo === 'number' || Array.isArray(j.cosas_buenas))) {
    b.apply(writeJournal(b.rows, { ...j, fecha: date }, env), '\nDIARIO')
  }

  const out = b.result()
  if (!out.writes.length && !out.deletes?.length) return { ...out, report: [...out.report, '\nNo se ha guardado nada: revisa lo de arriba.'] }
  return out
}
