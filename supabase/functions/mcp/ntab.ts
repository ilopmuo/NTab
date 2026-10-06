/**
 * Lógica del conector de LUNO para Claude, sin dependencias de Deno (se prueba
 * con los tests de la app: src/lib/mcp.test.ts).
 *
 * Trabaja sobre los registros tal y como los guarda la sincronización
 * (tabla `records`: un JSON por registro) y crea o cambia tareas igual que la
 * app: mismo formato, avisos automáticos y tareas que se repiten.
 */
import { WEEKDAYS, addDays, addMonths, diffDays, hhmmIn, longDate, weekStart, weekday, ymdIn, zonedToUtc } from '../_shared/time.ts'
import { expandTemplate, planSections, type TemplateItemLike } from '../_shared/templates.ts'
import { AISLES, aisleFor, itemKey, parseItems } from '../_shared/shopping.ts'
import { suggest, type Energy } from '../_shared/suggest.ts'
import { CATEGORIES, budgetAlert, categoryBudgets, categoryFor, money, monthSummary, monthlyTotals, normTag, parseExpense, searchExpenses, tagTotals, type Budget, type ExpenseRules } from '../_shared/expenses.ts'
import { doneDays, groupLogs, isCounted, isDue, progressLabel, targetOf, type HabitLike } from '../_shared/habits.ts'
import { logGoal, taskGoalCount, type GoalPoint } from '../_shared/goals.ts'
import { healthLabel, healthRank, projectHealth, type Health } from '../_shared/projectHealth.ts'
import { appendToNote, checklistStats } from '../_shared/notes.ts'
import { ceilTo, freeSlots, slotsLabel, toMin, type Block } from '../_shared/schedule.ts'
import { houseSummary, type HouseCtx } from './casa.ts'
import { bestWindow, focusStreak, lastDays, minutesByDay, minutesByHour, windowLabel, type FocusGoal, type FocusLogLike } from '../_shared/focus.ts'
import { MAX_IMPORTANT, STUCK, countByDay, goalStreak, isPostpone, postponedLabel, type DailyGoal } from '../_shared/day.ts'
import { WAIT_DAYS } from '../_shared/parse.ts'
import { medLines } from './meds.ts'
import { checkNoteLine, contactKind, trackerFor } from '../_shared/ripples.ts'

// ── Tipos (lo mínimo de src/db/types.ts) ─────────────────────

export type Reminder = { before: number } | { at: number }
export interface Recurrence {
  freq: 'day' | 'week' | 'month' | 'year'
  interval: number
  weekdays?: number[]
  afterDone?: boolean
}
export interface Task {
  id: string
  title: string
  notes: string
  done: 0 | 1
  priority: number
  dueDate?: string
  dueTime?: string
  /** fecha límite (para cuándo tiene que estar) */
  deadline?: string
  /** «algún día»: sin fecha, fuera de la Bandeja */
  someday?: boolean
  projectId?: string
  sectionId?: string
  areaId?: string
  tags: string[]
  people?: string[]
  subtasks: { id: string; title: string; done: boolean }[]
  recurrence?: Recurrence
  /** duración estimada en minutos */
  estimate?: number
  /** repetir el aviso cada N minutos hasta que se haga */
  nag?: number
  reminder?: Reminder | null
  remindAt?: number
  /** YYYY-MM-DD: de lo importante de ese día */
  important?: string
  /** veces que se ha pasado a otro día cuando ya tocaba */
  postponed?: number
  /** a la espera de alguien: su fecha es cuándo volver a preguntar */
  waitingFor?: string
  waitingSince?: string
  order: number
  createdAt: number
  completedAt?: number
}

/** Un registro de la tabla `records` */
export interface Row {
  tbl: string
  id: string
  data: Record<string, unknown>
}

export interface Env {
  tz: string
  now: number
  /** preferencia "Avisar a la hora de las tareas" */
  autoRemind: boolean
  newId: () => string
}

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' ? v : 0)

export function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/** Busca por nombre sin importar mayúsculas ni acentos (exacto primero, luego parcial) */
export function findByName<T extends Data>(items: T[], name: string, key = 'name'): T | undefined {
  const n = fold(name)
  if (!n) return undefined
  return items.find((x) => fold(str(x[key])) === n) ?? items.find((x) => fold(str(x[key])).includes(n) || n.includes(fold(str(x[key]))))
}

/**
 * Un registro por nombre para cambiarlo o borrarlo: el exacto o, si no, el
 * único que lo contenga; si encajan varios o ninguno, el error para Claude.
 */
export function pickByName(items: Row[], name: string, noun: { none: string; many: string; plural: string; empty: string }): { row?: Row; error?: string } {
  const n = fold(name)
  if (!n) return { error: `Falta el nombre.` }
  const exact = items.find((r) => fold(str(r.data.name)) === n)
  if (exact) return { row: exact }
  const near = items.filter((r) => fold(str(r.data.name)).includes(n) || n.includes(fold(str(r.data.name))))
  if (near.length === 1) return { row: near[0] }
  if (near.length > 1) return { error: `Hay ${noun.many} que encajan con «${name}»: ${near.map((r) => str(r.data.name)).join(', ')}. ¿Cuál?` }
  return { error: `No hay ${noun.none} que se llame «${name}». ${noun.plural}: ${items.map((r) => str(r.data.name)).join(', ') || noun.empty}.` }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/
export const isYmd = (s: unknown): s is string => typeof s === 'string' && YMD.test(s)
export const isHhmm = (s: unknown): s is string => typeof s === 'string' && HHMM.test(s)
const normTime = (s: string) => s.padStart(5, '0')

// ── Avisos y repeticiones (igual que en la app) ──────────────

export function computeRemindAt(t: Pick<Task, 'reminder' | 'dueDate' | 'dueTime'>, tz: string): number | undefined {
  const r = t.reminder
  if (!r) return undefined
  if ('at' in r) return r.at
  if (!t.dueDate) return undefined
  return zonedToUtc(t.dueDate, t.dueTime ?? '09:00', tz) - r.before * 60_000
}

/** Aplica el aviso automático y recalcula el momento del aviso */
export function withReminder(t: Task, env: Env): Task {
  const out = { ...t }
  if (env.autoRemind && out.dueTime && out.reminder === undefined) out.reminder = { before: 0 }
  const at = computeRemindAt(out, env.tz)
  if (at === undefined) delete out.remindAt
  else out.remindAt = at
  return out
}

export function nextOccurrence(from: string, r: Recurrence): string {
  const interval = Math.max(1, r.interval || 1)
  switch (r.freq) {
    case 'day':
      return addDays(from, interval)
    case 'week': {
      if (!r.weekdays?.length) return addDays(from, 7 * interval)
      const startWeek = weekStart(from)
      for (let i = 1; i <= 7; i++) {
        const cand = addDays(from, i)
        if (r.weekdays.includes(weekday(cand))) {
          if (interval > 1 && weekStart(cand) !== startWeek) return addDays(cand, 7 * (interval - 1))
          return cand
        }
      }
      return addDays(from, 7 * interval)
    }
    case 'month':
      return addMonths(from, interval)
    case 'year':
      return addMonths(from, 12 * interval)
  }
}

// ── Lectura ──────────────────────────────────────────────────

const PRIO = ['', ' · !baja', ' · !media', ' · !alta']

export function relDay(date: string, today: string) {
  const n = diffDays(date, today)
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  if (n === -1) return 'ayer'
  const [, m, d] = date.split('-').map(Number)
  if (n > 1 && n < 7) return `el ${WEEKDAYS[weekday(date)]} ${d}`
  return `${WEEKDAYS[weekday(date)]} ${d}/${m}${n < 0 ? ` (hace ${-n} días)` : ''}`
}

export class Index {
  tasks: Task[]
  projects: Data[]
  areas: Data[]
  people: Data[]
  constructor(rows: Row[]) {
    this.people = rows.filter((r) => r.tbl === 'people').map((r) => ({ ...r.data, id: r.id }))
    this.tasks = rows.filter((r) => r.tbl === 'tasks').map((r) => ({ tags: [], subtasks: [], notes: '', ...r.data, id: r.id }) as unknown as Task)
    this.projects = rows.filter((r) => r.tbl === 'projects').map((r) => ({ ...r.data, id: r.id }))
    this.areas = rows.filter((r) => r.tbl === 'areas').map((r) => ({ ...r.data, id: r.id }))
  }
  projectName(id?: string) {
    return id ? str(this.projects.find((p) => p.id === id)?.name) : ''
  }
  areaName(id?: string) {
    return id ? str(this.areas.find((a) => a.id === id)?.name) : ''
  }
  personNames(ids?: string[]) {
    return (ids ?? []).map((id) => str(this.people.find((p) => p.id === id)?.name)).filter(Boolean)
  }
  /** nombres → ids de personas (los que no existen se devuelven aparte) */
  resolvePeople(names: unknown): { ids: string[]; missing: string[] } {
    const ids: string[] = []
    const missing: string[] = []
    for (const n of Array.isArray(names) ? names : []) {
      const p = findByName(this.people, String(n).replace(/^@/, ''))
      if (p) ids.push(String(p.id))
      else missing.push(String(n))
    }
    return { ids: [...new Set(ids)], missing }
  }
}

/** 30 → "30 min", 90 → "1 h 30" */
export function minutesLabel(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

function taskLine(t: Task, ix: Index, today: string) {
  const where = t.projectId ? ix.projectName(t.projectId) : ix.areaName(t.areaId)
  return [
    `- [${t.id}] ${t.title}`,
    t.important === today && !t.done ? ' · ★ LO IMPORTANTE DE HOY' : '',
    t.dueDate ? ` · ${relDay(t.dueDate, today)} (${t.dueDate})${t.dueTime ? ` a las ${t.dueTime}` : ''}` : t.someday ? ' · algún día' : ' · sin fecha',
    t.deadline ? ` · FECHA LÍMITE ${relDay(t.deadline, today)} (${t.deadline})` : '',
    PRIO[t.priority] ?? '',
    where ? ` · ${where}` : '',
    t.tags?.length ? ` · ${t.tags.map((g) => `#${g}`).join(' ')}` : '',
    t.people?.length ? ` · con ${ix.personNames(t.people).join(', ')}` : '',
    t.waitingFor && !t.done ? ` · A LA ESPERA de ${t.waitingFor}${t.waitingSince ? ` desde ${relDay(t.waitingSince, today)}` : ''}` : '',
    t.estimate ? ` · ~${minutesLabel(t.estimate)}` : '',
    t.nag ? ` · insiste cada ${t.nag} min` : '',
    t.recurrence ? ' · se repite' : '',
    t.subtasks?.length ? ` · subtareas ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : '',
    !t.done && num(t.postponed) >= STUCK ? ` · ${postponedLabel(num(t.postponed)).toLowerCase()} (propón algún día o partirla)` : '',
    t.done ? ' · HECHA' : '',
  ].join('')
}

const byDate = (a: Task, b: Task) =>
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') || b.priority - a.priority

/** Evento de un calendario externo (ver supabase/functions/events/expand.ts) */
export interface EventLike {
  title: string
  allDay: boolean
  start: string
  end: string
  location?: string
  sourceId: string
}

/** "hoy 10:00–10:30 Reunión de equipo (Trabajo) · Sala 2" */
export function eventLines(events: EventLike[], names: Record<string, string>, env: Env): string[] {
  const today = ymdIn(env.now, env.tz)
  return events.map((e) => {
    const day = e.allDay ? e.start : ymdIn(Date.parse(e.start), env.tz)
    const when = e.allDay ? 'todo el día' : `${hhmmIn(Date.parse(e.start), env.tz)}–${hhmmIn(Date.parse(e.end), env.tz)}`
    const src = names[e.sourceId] ? ` (${names[e.sourceId]})` : ''
    return `- ${relDay(day, today)} (${day}) ${when}: ${e.title}${src}${e.location ? ` · ${e.location}` : ''}`
  })
}

/** "Carga de hoy: …" con las duraciones estimadas y las reuniones (jornada de referencia: 6 h) */
function loadLine(todays: Task[], meetings: EventLike[]) {
  const tasks = todays.reduce((s, t) => s + num(t.estimate), 0)
  const events = meetings.reduce((s, e) => s + Math.max(0, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000)), 0)
  const unest = todays.filter((t) => !t.estimate).length
  const total = tasks + events
  const parts = [`${minutesLabel(tasks)} de tareas estimadas`, `${minutesLabel(events)} de reuniones`]
  if (unest) parts.push(`${unest} ${unest === 1 ? 'tarea' : 'tareas'} de hoy sin duración`)
  return `Carga de hoy: ${total ? minutesLabel(total) : 'nada estimado'} (${parts.join(', ')}). Jornada de referencia: 6 h${total > 360 ? ' — HOY ESTÁ SOBRECARGADO, propón mover algo' : ''}.`
}

/**
 * Huecos libres de un día entre las 9 y las 20 h (como el «tiempo libre» de
 * Reclaim o Motion): sin reuniones ni tareas con hora. Para que Claude sepa
 * dónde cabe algo antes de proponer una hora.
 */
function freeLine(label: string, day: string, open: Task[], events: EventLike[], env: Env, from: number) {
  const busy: Block[] = [
    ...events
      .filter((e) => !e.allDay && ymdIn(Date.parse(e.start), env.tz) === day)
      .map((e) => {
        const start = toMin(hhmmIn(Date.parse(e.start), env.tz))
        return { start, end: start + Math.max(15, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000)) }
      }),
    ...open.filter((t) => t.dueDate === day && t.dueTime).map((t) => ({ start: toMin(t.dueTime!), end: toMin(t.dueTime!) + (t.estimate ?? 30) })),
  ]
  const start = Math.max(9 * 60, ceilTo(from, 15))
  if (start >= 20 * 60) return []
  return [`HUECOS LIBRES ${label} (9–20 h, sin reuniones ni tareas con hora): ${slotsLabel(freeSlots(busy, start, 20 * 60)) || 'ninguno de media hora o más'}.`]
}

/** Lo importante de hoy (hasta tres), lo primero que mirar */
/** Lo que depende de otra persona (GTD: «A la espera») */
function waitingLines(open: Task[], today: string) {
  const list = open.filter((t) => t.waitingFor).sort(byDate)
  if (!list.length) return []
  return [
    `\nA LA ESPERA DE OTRAS PERSONAS (${list.length}) — dependen de otro: el día de su fecha toca preguntarle (no proponerlas como trabajo suyo):`,
    ...list.map((t) => `- [${t.id}] ${t.title}: de ${t.waitingFor}${t.waitingSince ? `, desde ${relDay(t.waitingSince, today)}` : ''}${t.dueDate ? `; volver a preguntar ${relDay(t.dueDate, today)} (${t.dueDate})` : ''}`),
  ]
}

function importantLines(open: Task[], today: string) {
  const list = open.filter((t) => t.important === today)
  if (list.length) return [`LO IMPORTANTE DE HOY (lo que eligió; ayúdale a hacerlo antes que lo demás): ${list.map((t) => `${t.title} [${t.id}]`).join('; ')}`]
  // Sin elegir: solo merece la pena decirlo si hay varias cosas para hoy
  const forToday = open.filter((t) => t.dueDate && t.dueDate <= today).length
  return forToday >= 3 ? ['LO IMPORTANTE DE HOY: sin elegir (si planificáis el día, propón hasta 3 y márcalas con actualizar_tareas importante=true).'] : []
}

/** Objetivo diario de tareas y su racha (como en Todoist) */
function goalLines(rows: Row[], tasks: Task[], env: Env, today: string) {
  const goal = rows.find((r) => r.tbl === 'settings' && r.id === 'dailyGoal')?.data.value as DailyGoal | null | undefined
  if (!goal?.tasks) return []
  const days = tasks.filter((t) => t.done && num(t.completedAt) > env.now - 400 * 864e5).map((t) => ymdIn(num(t.completedAt), env.tz))
  const st = goalStreak(countByDay(days), goal, today)
  return [`OBJETIVO DIARIO: ${goal.tasks} tareas; hoy lleva ${st.today}${st.dayOff ? ' (hoy es día libre)' : ''}. Racha: ${st.current} ${st.current === 1 ? 'día' : 'días'} (mejor ${st.best}).`]
}

/** Foco: hoy frente al objetivo, la semana, la racha y sus mejores horas (como Rize) */
function focusLines(rows: Row[], env: Env, today: string) {
  const logs = rows.filter((r) => r.tbl === 'focusLogs' && isYmd(r.data.date)).map((r) => r.data as unknown as FocusLogLike)
  const goal = num((rows.find((r) => r.tbl === 'settings' && r.id === 'focusGoal')?.data.value as FocusGoal | null | undefined)?.minutes)
  const recent = logs.filter((l) => l.date >= addDays(today, -59))
  if (!recent.length && !goal) return []
  const byDay = minutesByDay(logs)
  const week = lastDays(byDay, today, 7).reduce((s, d) => s + d.minutes, 0)
  const pomodoros = logs.filter((l) => l.date === today && l.pomodoro).length
  const streak = focusStreak(byDay, goal, today).current
  const best = bestWindow(minutesByHour(recent, (ms) => toMin(hhmmIn(ms, env.tz))))
  const parts = [
    `hoy ${minutesLabel(byDay.get(today) ?? 0)}${goal ? ` de ${minutesLabel(goal)} de objetivo` : ''}${pomodoros ? ` (${pomodoros} ${pomodoros === 1 ? 'pomodoro' : 'pomodoros'})` : ''}`,
    `últimos 7 días ${minutesLabel(week)}`,
  ]
  if (streak) parts.push(`racha de ${streak} ${streak === 1 ? 'día' : 'días'}`)
  if (best) parts.push(`se concentra mejor ${windowLabel(best)}: reserva esas horas para lo que exige pensar`)
  return [`FOCO: ${parts.join('; ')}.`]
}

/** Resumen de todo LUNO para que Claude responda y planifique */
export function buildSummary(rows: Row[], env: Env, calendar?: { events: EventLike[]; names: Record<string, string> }, house?: HouseCtx): string {
  const today = ymdIn(env.now, env.tz)
  const ix = new Index(rows)
  const open = ix.tasks.filter((t) => !t.done)
  // Manda la fecha que llegue antes: la de hacerla o la límite
  const due = (t: Task) => (t.deadline && (!t.dueDate || t.deadline < t.dueDate) ? t.deadline : t.dueDate)
  const overdue = open.filter((t) => (due(t) ?? '9') < today).sort(byDate)
  const dated = open.filter((t) => (due(t) ?? '') >= today).sort(byDate)
  const undated = open.filter((t) => !due(t) && !t.someday).sort((a, b) => b.priority - a.priority || a.order - b.order)
  const someday = open.filter((t) => !due(t) && t.someday)
  const doneWeek = ix.tasks.filter((t) => t.done && num(t.completedAt) >= env.now - 7 * 864e5)
  const limit = (list: Task[], n: number) => [...list.slice(0, n).map((t) => taskLine(t, ix, today)), ...(list.length > n ? [`(y ${list.length - n} más: usa buscar_tareas)`] : [])]

  const s: string[] = [
    `HOY: ${longDate(today)} (${today}), son las ${hhmmIn(env.now, env.tz)} (${env.tz}). Semana: del ${weekStart(today)} al ${addDays(weekStart(today), 6)}.`,
    loadLine(open.filter((t) => t.dueDate === today), (calendar?.events ?? []).filter((e) => !e.allDay && ymdIn(Date.parse(e.start), env.tz) === today)),
    ...freeLine('HOY', today, open, calendar?.events ?? [], env, toMin(hhmmIn(env.now, env.tz))),
    ...freeLine('MAÑANA', addDays(today, 1), open, calendar?.events ?? [], env, 0),
    ...importantLines(open, today),
    ...medLines(rows, env, today),
    ...waitingLines(open, today),
    ...goalLines(rows, ix.tasks, env, today),
    ...focusLines(rows, env, today),
    ...(house ? houseSummary(house, today) : []),
    ...(calendar ? [`\nEVENTOS DE SUS CALENDARIOS, PRÓXIMOS 7 DÍAS (${calendar.events.length}) — solo lectura:`, ...eventLines(calendar.events, calendar.names, env)] : []),
    `\nATRASADAS (${overdue.length}):`,
    ...limit(overdue, 60),
    `\nCON FECHA (${dated.length}):`,
    ...limit(dated, 120),
    `\nSIN FECHA (${undated.length}):`,
    ...limit(undated, 60),
    ...(someday.length ? [`\nALGÚN DÍA (${someday.length}) — sin prisa, no proponerlas para hoy salvo que lo pida:`, ...limit(someday, 30)] : []),
    `\nCompletadas en los últimos 7 días: ${doneWeek.length}`,
  ]

  const active = ix.projects.filter((p) => p.status === 'active')
  if (active.length) {
    s.push(`\nPROYECTOS ACTIVOS:`)
    let warn = false
    for (const p of active) {
      const pt = ix.tasks.filter((t) => t.projectId === p.id)
      const label = healthLabel(healthOf(p, ix.tasks, today, env))
      if (label) warn = true
      s.push(`- ${str(p.name)}: ${pt.filter((t) => !t.done).length} pendientes de ${pt.length}${isYmd(p.deadline) ? ` · límite ${p.deadline}` : ''}${label ? ` · OJO: ${label}` : ''}`)
    }
    if (warn) s.push('(Los que llevan OJO piden atención: si está parado o sin siguiente paso, propón uno concreto; si va justo de fecha, ayuda a repartir lo que queda; si está todo hecho, pregunta si se da por terminado.)')
  }

  const goals = rows.filter((r) => r.tbl === 'goals' && r.data.status === 'active')
  if (goals.length) {
    s.push(`\nOBJETIVOS:`)
    for (const g of goals) {
      const d = g.data
      let progress: string
      if (d.kind === 'number') progress = `${num(d.current)} de ${num(d.target)}${d.unit ? ` ${str(d.unit)}` : ''}`
      else if (d.kind === 'tasks')
        progress = `${taskGoalCount({ tag: str(d.tag), createdAt: num(d.createdAt) }, ix.tasks)} de ${num(d.target)} ${str(d.unit) || 'tareas'} (cuenta solo las tareas con #${str(d.tag)} que hace: para avanzar, crea tareas con esa etiqueta)`
      else {
        const linked = ix.projects.filter((p) => p.goalId === g.id)
        const done = linked.filter((p) => p.status === 'done').length
        progress = linked.length ? `${done} de ${linked.length} proyectos terminados` : 'sin proyectos vinculados'
      }
      s.push(`- ${str(d.title)}: ${progress}${isYmd(d.deadline) ? ` · para ${d.deadline}` : ''}`)
    }
  }

  const { habits, counts, done } = habitState(rows)
  const todays = habits.filter((h) => isDue(h.rule, done.get(h.id)!, today))
  if (todays.length) {
    const state = (h: (typeof habits)[number]) => {
      const d = done.get(h.id)!
      const extra = progressLabel(h.rule, counts.get(h.id), d, today)
      return `${d.has(today) ? 'hecho' : 'pendiente'}${extra ? `, ${extra}` : ''}`
    }
    s.push(`\nHÁBITOS DE HOY: ${todays.map((h) => `${h.name} (${state(h)})`).join('; ')}`)
  }

  const routines = rows.filter((r) => r.tbl === 'routines' && !r.data.archived && Array.isArray(r.data.days) && (r.data.days as number[]).includes(weekday(today)))
  if (routines.length) {
    s.push(`\nRUTINAS DE HOY (listas de pasos que hace siempre igual):`)
    for (const r of routines) {
      const steps = (Array.isArray(r.data.steps) ? r.data.steps : []) as { id: string; title: string }[]
      const run = rows.find((x) => x.tbl === 'routineRuns' && x.data.routineId === r.id && x.data.date === today)
      const done = new Set((run?.data.done as string[] | undefined) ?? [])
      const left = steps.filter((st) => !done.has(st.id)).map((st) => st.title)
      s.push(`- ${str(r.data.name)}${isHhmm(r.data.time) ? ` (${r.data.time})` : ''}: ${left.length ? `${steps.length - left.length} de ${steps.length} pasos; faltan: ${left.join(', ')}` : 'hecha'}`)
    }
  }

  const payments = rows
    .filter((r) => r.tbl === 'subscriptions' && r.data.active !== false && isYmd(r.data.nextDate) && (r.data.nextDate as string) <= addDays(today, 30))
    .sort((a, b) => str(a.data.nextDate).localeCompare(str(b.data.nextDate)))
  if (payments.length) {
    s.push(`\nPAGOS PRÓXIMOS 30 DÍAS:`)
    for (const p of payments)
      s.push(
        `- ${relDay(str(p.data.nextDate), today)}: ${str(p.data.name)} ${num(p.data.amount)} ${str(p.data.currency) || 'EUR'}${p.data.kind === 'bill' ? ' (recibo, hay que pagarlo)' : ''}${p.data.trialEnds && p.data.trialEnds === p.data.nextDate ? ' (ACABA LA PRUEBA GRATIS: si no la quiere, que la cancele antes)' : ''}`,
      )
  }

  const people: string[] = []
  for (const r of rows.filter((x) => x.tbl === 'people')) {
    const b = str(r.data.birthday)
    const md = b.slice(-5)
    let soon = false
    if (/^\d{2}-\d{2}$/.test(md)) {
      let next = `${today.slice(0, 4)}-${md}`
      if (next < today) next = `${Number(today.slice(0, 4)) + 1}-${md}`
      if (diffDays(next, today) <= 14) {
        soon = true
        people.push(`- Cumpleaños de ${str(r.data.name)}: ${relDay(next, today)}`)
      }
    }
    // Otras fechas que vuelven cada año (aniversarios, santos…)
    for (const d of Array.isArray(r.data.dates) ? (r.data.dates as { label?: string; date?: string }[]) : []) {
      const dm = str(d.date).slice(-5)
      if (!/^\d{2}-\d{2}$/.test(dm)) continue
      let next = `${today.slice(0, 4)}-${dm}`
      if (next < today) next = `${Number(today.slice(0, 4)) + 1}-${dm}`
      if (diffDays(next, today) <= 14) {
        soon = true
        people.push(`- ${str(d.label)} (${str(r.data.name)}): ${relDay(next, today)}`)
      }
    }
    const gifts = Array.isArray(r.data.gifts) ? (r.data.gifts as { text?: string; given?: string }[]).filter((g) => !g.given).map((g) => str(g.text)) : []
    // Las ideas de regalo, cuando se acerca su cumpleaños o una de sus fechas
    if (soon && gifts.length) people.push(`- Ideas de regalo para ${str(r.data.name)}: ${gifts.join(', ')}`)
    const every = num(r.data.contactEvery)
    if (every > 0) {
      const days = isYmd(r.data.lastContact) ? diffDays(today, r.data.lastContact as string) : Infinity
      if (days >= every) people.push(`- Toca hablar con ${str(r.data.name)}${days === Infinity ? '' : ` (hace ${days} días)`}`)
    }
  }
  if (people.length) s.push(`\nPERSONAS:`, ...people)

  const moods = rows
    .filter((r) => r.tbl === 'journal' && typeof r.data.mood === 'number' && r.id >= addDays(today, -6))
    .sort((a, b) => a.id.localeCompare(b.id))
  if (moods.length) s.push(`\nÁNIMO ÚLTIMOS DÍAS (diario, 1 muy mal – 5 muy bien): ${moods.map((r) => `${relDay(r.id, today)} ${num(r.data.mood)}`).join('; ')}. Tenlo en cuenta al proponer planes.`)

  const month = monthSummary(expenseRows(rows), today.slice(0, 7), today)
  const budget = num((rows.find((r) => r.tbl === 'settings' && r.id === 'budget')?.data.value as Data | undefined)?.monthly)
  if (month.count || budget) s.push(`\nGASTOS DE ESTE MES: ${money(month.total)}${budget ? ` de un presupuesto de ${money(budget)}` : ''}${month.projection > month.total ? ` (a este ritmo, ${money(month.projection)} a fin de mes)` : ''}.`)

  const countdowns = rows.filter((r) => r.tbl === 'countdowns' && isYmd(r.data.date) && (r.data.date as string) >= today).sort((a, b) => str(a.data.date).localeCompare(str(b.data.date)))
  if (countdowns.length) s.push(`\nCUENTAS ATRÁS: ${countdowns.slice(0, 6).map((r) => `${str(r.data.name)} (${r.data.date}, faltan ${diffDays(r.data.date as string, today)} días)`).join('; ')}`)

  const meals = rows.filter((r) => r.tbl === 'menu' && r.data.date === today)
  if (meals.length) s.push(`\nMENÚ DE HOY: ${meals.map((r) => `${str(r.data.meal)}: ${menuName(rows, r.data)}`).join('; ')}`)

  const shopping = rows.filter((r) => r.tbl === 'shopping' && !r.data.checked)
  if (shopping.length) s.push(`\nLISTA DE LA COMPRA (${shopping.length}): ${shopping.map((r) => `${str(r.data.name)}${r.data.qty ? ` (${str(r.data.qty)})` : ''}`).join(', ')}`)

  const trackers = rows.filter((r) => r.tbl === 'trackers' && !r.data.archived)
  const dueTrackers = trackers.filter((r) => {
    const last = (r.data.log as string[] | undefined)?.[0]
    return !r.data.avoid && num(r.data.every) > 0 && (!last || diffDays(today, last) >= num(r.data.every))
  })
  if (dueTrackers.length) {
    s.push(`\nTOCA HACER (según «Última vez»):`)
    for (const r of dueTrackers) s.push(`- ${trackerLine(r.data, today)}`)
  }

  const things = rows.filter((r) => r.tbl === 'things' && !r.data.returned)
  const lent = things.filter((t) => t.data.kind === 'lent')
  const borrowed = things.filter((t) => t.data.kind === 'borrowed')
  const expiring = things.filter((t) => t.data.kind === 'document' && isYmd(t.data.expires) && diffDays(t.data.expires as string, today) <= Math.max(num(t.data.notifyDays), 30))
  if (lent.length || borrowed.length || expiring.length) {
    s.push(`\nCOSAS (usa donde_esta para buscar dónde guardó algo):`)
    for (const t of lent) s.push(`- Prestado: ${thingLine(t.data, today)}`)
    for (const t of borrowed) s.push(`- Me prestaron: ${thingLine(t.data, today)}`)
    for (const t of expiring) s.push(`- Caduca: ${thingLine(t.data, today)}`)
  }
  if (ix.projects.length) s.push(`\nPROYECTOS (para asignar tareas): ${ix.projects.map((p) => str(p.name)).join('; ')}`)
  return s.join('\n')
}

export interface SearchArgs {
  texto?: string
  estado?: 'pendientes' | 'hechas' | 'todas'
  desde?: string
  hasta?: string
  proyecto?: string
  etiqueta?: string
  persona?: string
  limite?: number
}

export function searchTasks(rows: Row[], args: SearchArgs, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const ix = new Index(rows)
  const estado = args.estado ?? 'pendientes'
  const q = fold(args.texto ?? '')
  const project = args.proyecto ? findByName(ix.projects, args.proyecto) : undefined
  if (args.proyecto && !project) return `No hay ningún proyecto que se llame «${args.proyecto}».`
  const tag = fold(args.etiqueta ?? '').replace(/^#/, '')
  const person = args.persona ? findByName(ix.people, args.persona.replace(/^@/, '')) : undefined
  if (args.persona && !person) return `No hay ninguna persona que se llame «${args.persona}».`
  const list = ix.tasks
    .filter((t) => (estado === 'todas' ? true : estado === 'hechas' ? t.done : !t.done))
    .filter((t) => !q || fold(`${t.title} ${t.notes} ${t.tags.join(' ')}`).includes(q))
    .filter((t) => !isYmd(args.desde) || (t.dueDate ?? '') >= args.desde!)
    .filter((t) => !isYmd(args.hasta) || (!!t.dueDate && t.dueDate <= args.hasta!))
    .filter((t) => !project || t.projectId === project.id)
    .filter((t) => !tag || t.tags.some((g) => fold(g) === tag))
    .filter((t) => !person || (t.people ?? []).includes(String(person.id)))
    .sort(byDate)
  const max = Math.max(1, Math.min(200, args.limite ?? 50))
  if (!list.length) return 'No hay tareas que coincidan.'
  return [`${list.length} ${list.length === 1 ? 'tarea' : 'tareas'}:`, ...list.slice(0, max).map((t) => taskLine(t, ix, today)), ...(list.length > max ? [`(y ${list.length - max} más)`] : [])].join('\n')
}

// ── Escritura ────────────────────────────────────────────────

export interface NewTask {
  titulo: string
  fecha?: string
  hora?: string
  fecha_limite?: string
  algun_dia?: boolean
  prioridad?: number
  notas?: string
  proyecto?: string
  seccion?: string
  etiquetas?: string[]
  subtareas?: string[]
  personas?: string[]
  duracion?: number
  insistir?: number
  /** de lo importante del día (de hoy si no tiene fecha) */
  importante?: boolean
  /** a la espera de esta persona */
  esperando?: string
}

export interface Change {
  id: string
  titulo?: string
  fecha?: string | null
  hora?: string | null
  fecha_limite?: string | null
  algun_dia?: boolean
  prioridad?: number
  notas?: string
  proyecto?: string | null
  hecha?: boolean
  duracion?: number | null
  insistir?: number | null
  /** de lo importante de hoy (o del día que tenga, si es más tarde); false para quitarlo */
  importante?: boolean
  /** a la espera de esta persona; null para dejar de esperar */
  esperando?: string | null
}

export interface WriteResult {
  /** registros a guardar */
  writes: Row[]
  /** texto para Claude */
  report: string[]
}

const clampPrio = (n: unknown) => (typeof n === 'number' ? Math.max(0, Math.min(3, Math.round(n))) : undefined)
const cleanMinutes = (n: unknown) => (typeof n === 'number' && n > 0 ? Math.min(24 * 60, Math.round(n)) : undefined)
const cleanTags = (tags: unknown) =>
  Array.isArray(tags) ? [...new Set(tags.map((g) => String(g).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))] : []

export function createTasks(rows: Row[], input: NewTask[], env: Env): WriteResult {
  const ix = new Index(rows)
  const today = ymdIn(env.now, env.tz)
  const out: WriteResult = { writes: [], report: [] }
  // Proyectos a los que se les añade alguna sección nueva (se guardan al final)
  const touched = new Map<string, Data>()
  input.forEach((n, i) => {
    const title = str(n?.titulo).trim()
    if (!title) return
    const project = n.proyecto ? findByName(ix.projects, n.proyecto) : undefined
    const dueDate = isYmd(n.fecha) ? n.fecha : undefined
    let task: Task = {
      id: env.newId(),
      title,
      notes: str(n.notas),
      done: 0,
      priority: clampPrio(n.prioridad) ?? 0,
      tags: cleanTags(n.etiquetas),
      subtasks: Array.isArray(n.subtareas) ? n.subtareas.map((x) => String(x).trim()).filter(Boolean).map((x) => ({ id: env.newId(), title: x, done: false })) : [],
      order: env.now + i,
      createdAt: env.now,
    }
    if (dueDate) task.dueDate = dueDate
    if (dueDate && isHhmm(n.hora)) task.dueTime = normTime(n.hora)
    if (isYmd(n.fecha_limite)) task.deadline = n.fecha_limite
    if (n.algun_dia === true && !dueDate) task.someday = true
    if (str(n.esperando).trim()) {
      task.waitingFor = str(n.esperando).trim()
      task.waitingSince = today
      delete task.someday
      // Se vuelve a mirar en unos días si no dice cuándo
      if (!task.dueDate) task.dueDate = addDays(today, WAIT_DAYS)
    }
    if (project) {
      task.projectId = String(project.id)
      if (project.areaId) task.areaId = String(project.areaId)
      if (str(n.seccion).trim()) {
        const current = touched.get(String(project.id)) ?? project
        const plan = planSections((current.sections as { id: string; name: string }[] | undefined) ?? [], [str(n.seccion)], env.newId)
        if (plan.changed) touched.set(String(project.id), { ...current, sections: plan.sections })
        task.sectionId = plan.idFor(str(n.seccion))
      }
    }
    const who = ix.resolvePeople(n.personas)
    if (who.ids.length) task.people = who.ids
    const est = cleanMinutes(n.duracion)
    if (est) task.estimate = est
    const nag = cleanMinutes(n.insistir)
    if (nag) {
      task.nag = Math.max(5, nag)
      // Insistir necesita un aviso: a la hora de la tarea
      if (task.dueTime && task.reminder === undefined) task.reminder = { before: 0 }
    }
    if (n.importante === true) {
      const day = task.dueDate && task.dueDate > today ? task.dueDate : today
      if (countImportant(ix.tasks, out.writes, day) >= MAX_IMPORTANT) out.report.push(`(Ya hay ${MAX_IMPORTANT} cosas importantes para ese día: «${title}» no se marca)`)
      else {
        task.important = day
        if (!task.dueDate) task.dueDate = day
      }
    }
    task = withReminder(task, env)
    out.writes.push({ tbl: 'tasks', id: task.id, data: task as unknown as Data })
    out.report.push(
      `Creada: ${taskLine(task, ix, today).slice(2)}${n.proyecto && !project ? ` (no encontré el proyecto «${n.proyecto}», queda sin proyecto)` : ''}${who.missing.length ? ` (no encontré a: ${who.missing.join(', ')})` : ''}`,
    )
  })
  for (const p of touched.values()) {
    const { id, ...data } = p
    out.writes.push({ tbl: 'projects', id: String(id), data: { ...data, id } })
  }
  if (!out.report.length) out.report.push('No se creó ninguna tarea (faltaban los títulos).')
  return out
}

/** Cuántas tareas pendientes son ya de lo importante de `day` (contando las de esta misma llamada) */
function countImportant(tasks: Task[], writes: Row[], day: string, except?: string) {
  const ids = new Set<string>()
  for (const t of tasks) if (!t.done && t.important === day && t.id !== except) ids.add(t.id)
  for (const w of writes) {
    const d = w.data as unknown as Task
    if (w.tbl !== 'tasks' || d.id === except) continue
    if (!d.done && d.important === day) ids.add(d.id)
    else ids.delete(d.id)
  }
  return ids.size
}

export function updateTasks(rows: Row[], changes: Change[], env: Env): WriteResult {
  const ix = new Index(rows)
  const today = ymdIn(env.now, env.tz)
  const out: WriteResult = { writes: [], report: [] }
  for (const c of changes) {
    const current = ix.tasks.find((t) => t.id === c?.id)
    if (!current) {
      out.report.push(`No existe la tarea ${c?.id}.`)
      continue
    }
    let t: Task = { ...current }
    if (typeof c.titulo === 'string' && c.titulo.trim()) t.title = c.titulo.trim()
    if (typeof c.notas === 'string') t.notes = c.notas
    const prio = clampPrio(c.prioridad)
    if (prio !== undefined) t.priority = prio
    if (c.duracion === null) delete t.estimate
    else if (cleanMinutes(c.duracion)) t.estimate = cleanMinutes(c.duracion)
    if (c.insistir === null) delete t.nag
    else if (cleanMinutes(c.insistir)) {
      t.nag = Math.max(5, cleanMinutes(c.insistir)!)
      if (t.dueTime && !t.reminder) {
        t.reminder = { before: 0 }
        t = withReminder(t, env)
      }
    }
    if (c.fecha === null) {
      delete t.dueDate
      delete t.dueTime
    } else if (isYmd(c.fecha)) t.dueDate = c.fecha
    if (c.fecha_limite === null) delete t.deadline
    else if (isYmd(c.fecha_limite)) t.deadline = c.fecha_limite
    if (c.algun_dia === true) {
      t.someday = true
      delete t.dueDate
      delete t.dueTime
    } else if (c.algun_dia === false) delete t.someday
    else if (t.dueDate) delete t.someday
    if (c.hora === null) delete t.dueTime
    else if (isHhmm(c.hora) && t.dueDate) t.dueTime = normTime(c.hora)
    if (c.esperando === null) {
      delete t.waitingFor
      delete t.waitingSince
    } else if (str(c.esperando).trim()) {
      t.waitingFor = str(c.esperando).trim()
      t.waitingSince = current.waitingFor ? (current.waitingSince ?? today) : today
      if (!isYmd(c.fecha) && (!t.dueDate || t.dueDate <= today)) t.dueDate = addDays(today, WAIT_DAYS)
    }
    if (c.proyecto === null) {
      delete t.projectId
    } else if (typeof c.proyecto === 'string') {
      const p = findByName(ix.projects, c.proyecto)
      if (p) {
        t.projectId = String(p.id)
        if (p.areaId) t.areaId = String(p.areaId)
      } else out.report.push(`No encontré el proyecto «${c.proyecto}».`)
    }
    if ('fecha' in c || 'hora' in c) t = withReminder(t, env)
    // Pasarla a otro día cuando ya tocaba: se cuenta, como en la app
    if (isPostpone(current, t.dueDate, today)) {
      t.postponed = num(current.postponed) + 1
      if (t.important && t.important < t.dueDate!) delete t.important
    }
    if (c.importante === false) delete t.important
    else if (c.importante === true && !t.done) {
      const day = t.dueDate && t.dueDate > today ? t.dueDate : today
      if (t.important !== day && countImportant(ix.tasks, out.writes, day, t.id) >= MAX_IMPORTANT) out.report.push(`Ya hay ${MAX_IMPORTANT} cosas importantes para ${relDay(day, today)}: quita una antes de marcar «${t.title}».`)
      else {
        t.important = day
        if (!t.dueDate || t.dueDate > day) t.dueDate = day
      }
    }

    if (c.hecha === true && !t.done) {
      t.done = 1
      t.completedAt = env.now
      if (t.recurrence) {
        let next = nextOccurrence(t.recurrence.afterDone ? today : (t.dueDate ?? today), t.recurrence)
        while (next < today) next = nextOccurrence(next, t.recurrence)
        let copy: Task = {
          ...t,
          id: env.newId(),
          done: 0,
          dueDate: next,
          subtasks: t.subtasks.map((s) => ({ ...s, id: env.newId(), done: false })),
          createdAt: env.now,
        }
        delete copy.completedAt
        copy = withReminder(copy, env)
        delete t.recurrence
        out.writes.push({ tbl: 'tasks', id: copy.id, data: copy as unknown as Data })
        out.report.push(`Siguiente repetición: ${taskLine(copy, ix, today).slice(2)}`)
      }
    } else if (c.hecha === false && t.done) {
      t.done = 0
      delete t.completedAt
    }
    out.writes.push({ tbl: 'tasks', id: t.id, data: t as unknown as Data })
    out.report.push(`Actualizada: ${taskLine(t, ix, today).slice(2)}`)
    // Hecha: lo que cambia en el resto (como en la app, ver _shared/ripples.ts)
    if (c.hecha === true && !current.done) out.writes.push(...ripples(rows, { ...t, recurrence: current.recurrence }, env, today, out))
  }
  return out
}

/**
 * Al hacer una tarea: el contacto con sus personas, su «Última vez» y la
 * casilla de la nota de la que salió; y si era la última de su proyecto, se dice.
 */
/** Cómo va un proyecto activo (ver _shared/projectHealth.ts) */
export function healthOf(p: Data, tasks: Task[], today: string, env: Env): Health {
  return projectHealth({ status: str(p.status), deadline: isYmd(p.deadline) ? p.deadline : undefined, createdAt: num(p.createdAt) }, tasks.filter((t) => t.projectId === p.id), today, (ms) => ymdIn(ms, env.tz))
}

/** Los proyectos que piden atención, lo más urgente antes */
export function projectsNeedingCare(ix: Index, today: string, env: Env): { name: string; health: Health }[] {
  return ix.projects
    .filter((p) => p.status === 'active')
    .map((p) => ({ name: str(p.name), health: healthOf(p, ix.tasks, today, env) }))
    .filter((x) => x.health.kind !== 'ok')
    .sort((a, b) => healthRank[b.health.kind] - healthRank[a.health.kind])
}

function ripples(rows: Row[], t: Task, env: Env, today: string, out: WriteResult): Row[] {
  const writes: Row[] = []
  for (const personId of t.people ?? []) {
    const id = env.newId()
    writes.push({ tbl: 'interactions', id, data: { id, personId, date: today, kind: contactKind(t.title), summary: t.title, taskId: t.id, createdAt: env.now } })
    const person = rows.find((r) => r.tbl === 'people' && r.id === personId)
    if (person && (!isYmd(person.data.lastContact) || (person.data.lastContact as string) < today)) writes.push({ tbl: 'people', id: person.id, data: { ...person.data, lastContact: today } })
  }
  const trackers = rows.filter((r) => r.tbl === 'trackers').map((r) => ({ ...r.data, id: r.id, name: str(r.data.name), log: Array.isArray(r.data.log) ? (r.data.log as string[]) : [] }))
  const tracker = trackerFor(t.title, trackers)
  if (tracker && tracker.log[0] !== today) writes.push(...logLastTime(rows, { cosa: tracker.name }, env).writes)
  const source = (t as Task & { source?: { noteId: string; line: string } }).source
  // Si se repite, la casilla sigue abierta para la próxima vez
  const note = source && !t.recurrence && rows.find((r) => r.tbl === 'notes' && r.id === source.noteId)
  const content = note && checkNoteLine(str(note.data.content), source!.line, true)
  if (note && content !== undefined) writes.push({ tbl: 'notes', id: note.id, data: { ...note.data, content, updatedAt: env.now } })
  if (t.projectId) {
    const project = rows.find((r) => r.tbl === 'projects' && r.id === t.projectId)
    const left = rows.filter((r) => r.tbl === 'tasks' && r.data.projectId === t.projectId && !r.data.done && r.id !== t.id && !out.writes.some((w) => w.id === r.id && w.data.done))
    if (project && project.data.status === 'active' && !left.length) out.report.push(`Era la última tarea de «${str(project.data.name)}»: si ya está, el proyecto se puede dar por terminado.`)
  }
  return writes
}

export function createNote(rows: Row[], args: { titulo?: string; contenido?: string; proyecto?: string }, env: Env): WriteResult {
  const ix = new Index(rows)
  const project = args.proyecto ? findByName(ix.projects, args.proyecto) : undefined
  const note: Data = {
    id: env.newId(),
    title: str(args.titulo).trim(),
    content: str(args.contenido),
    pinned: 0,
    createdAt: env.now,
    updatedAt: env.now,
  }
  if (project) {
    note.projectId = project.id
    if (project.areaId) note.areaId = project.areaId
  }
  return { writes: [{ tbl: 'notes', id: String(note.id), data: note }], report: [`Nota creada: «${note.title || 'Sin título'}»${project ? ` en ${str(project.name)}` : ''}.`] }
}

// ── Notas ─────────────────────────────────────────────────────

const noteRows = (rows: Row[]): Data[] => rows.filter((r) => r.tbl === 'notes').map((r) => ({ ...r.data, id: r.id }))

/** Una nota entera, para leerla */
function noteFull(n: Data, env: Env) {
  const content = str(n.content).trim()
  const st = checklistStats(content)
  const photos = Array.isArray(n.images) ? n.images.length : 0
  return [
    `«${str(n.title) || 'Sin título'}» (editada el ${ymdIn(num(n.updatedAt) || env.now, env.tz)}${st.total ? `; lista: ${st.done} de ${st.total} marcadas` : ''}${photos ? `; ${photos} ${photos === 1 ? 'foto' : 'fotos'}` : ''}):`,
    content || '(vacía)',
  ].join('\n')
}

/**
 * Buscar en sus notas (título, texto o #etiqueta) o leer una por su título.
 * Si solo hay una que encaje, se lee entera.
 */
export function searchNotes(rows: Row[], args: { buscar?: string; nota?: string }, env: Env): string {
  const notes = noteRows(rows).sort((a, b) => num(b.updatedAt) - num(a.updatedAt))
  if (str(args.nota).trim()) {
    const n = findByName(notes, str(args.nota), 'title')
    return n ? noteFull(n, env) : `No hay ninguna nota que se llame «${str(args.nota)}».`
  }
  const q = fold(str(args.buscar))
  const hits = q ? notes.filter((n) => fold(`${str(n.title)} ${str(n.content)}`).includes(q)) : notes
  if (!hits.length) return q ? `No hay notas con «${str(args.buscar)}».` : 'No hay notas.'
  if (hits.length === 1) return noteFull(hits[0], env)
  return [
    `${hits.length} notas${q ? ` con «${str(args.buscar)}»` : ''} (de la más reciente; pide una por su título para leerla entera):`,
    ...hits.slice(0, 15).map((n) => {
      const st = checklistStats(str(n.content))
      const first = str(n.content).split('\n').map((l) => l.replace(/^\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?#*\s*/, '').trim()).find(Boolean) ?? ''
      return `- «${str(n.title) || 'Sin título'}» (${ymdIn(num(n.updatedAt) || env.now, env.tz)})${st.total ? ` · lista ${st.done}/${st.total}` : ''}${first ? `: ${first.slice(0, 90)}` : ''}`
    }),
    ...(hits.length > 15 ? [`… y ${hits.length - 15} más.`] : []),
  ].join('\n')
}

/**
 * Añadir a una nota que ya existe (por su título): texto o, con `como_lista`,
 * cada cosa como casilla. Si no existe, se crea.
 */
export function appendNoteTool(rows: Row[], args: { nota?: string; texto?: string; como_lista?: boolean }, env: Env): WriteResult {
  const title = str(args.nota).trim()
  const text = str(args.texto).trim()
  if (!title) return { writes: [], report: ['¿A qué nota lo añado?'] }
  if (!text) return { writes: [], report: ['¿Qué añado a la nota?'] }
  const n = findByName(noteRows(rows), title, 'title')
  // Si la nota ya es una lista de casillas, lo nuevo también
  const asList = typeof args.como_lista === 'boolean' ? args.como_lista : !!n && checklistStats(str(n.content)).total > 0
  const items = asList ? text.split(/\n|,|;/).map((x) => x.trim()).filter(Boolean).length : 0
  if (n) {
    const data: Data = { ...n, content: appendToNote(str(n.content), text, asList), updatedAt: env.now }
    return { writes: [{ tbl: 'notes', id: String(n.id), data }], report: [`Añadido a «${str(n.title)}»${asList ? `: ${items} ${items === 1 ? 'cosa' : 'cosas'} en la lista` : ''}.`] }
  }
  const id = env.newId()
  const nice = title.charAt(0).toUpperCase() + title.slice(1)
  const data: Data = { id, title: nice, content: appendToNote('', text, asList), pinned: 0, createdAt: env.now, updatedAt: env.now }
  return { writes: [{ tbl: 'notes', id, data }], report: [`No había una nota «${title}»: la he creado con eso.`] }
}

/** Hábitos activos con sus registros: cantidad por día y días cumplidos */
function habitState(rows: Row[]) {
  const habits = rows
    .filter((r) => r.tbl === 'habits' && !r.data.archived)
    .map((r) => {
      const d = r.data
      const rule: HabitLike = { days: Array.isArray(d.days) ? (d.days as number[]) : [], target: num(d.target) || undefined, unit: str(d.unit) || undefined, perWeek: num(d.perWeek) || undefined, breaks: Array.isArray(d.breaks) ? (d.breaks as HabitLike['breaks']) : undefined }
      return { id: r.id, name: str(d.name), rule }
    })
  const counts = groupLogs(rows.filter((r) => r.tbl === 'habitLogs').map((r) => ({ habitId: str(r.data.habitId), date: str(r.data.date), count: num(r.data.count) || undefined })))
  const done = new Map(habits.map((h) => [h.id, doneDays(h.rule, counts.get(h.id))]))
  return { habits, counts, done }
}

/** Los hábitos que tocan hoy y cuáles quedan (con lo que llevas, si son de cantidad) */
export function habitsToday(rows: Row[], today: string): { name: string; done: boolean; progress?: string }[] {
  const { habits, counts, done } = habitState(rows)
  return habits
    .filter((h) => isDue(h.rule, done.get(h.id) ?? new Set(), today))
    .map((h) => {
      const has = counts.get(h.id)?.get(today) ?? 0
      const target = targetOf(h.rule)
      return { name: h.name, done: !!done.get(h.id)?.has(today), ...(isCounted(h.rule) ? { progress: `${has} de ${target}${h.rule.unit ? ` ${h.rule.unit}` : ''}` } : {}) }
    })
}

export function markHabit(rows: Row[], args: { habito?: string; fecha?: string; hecho?: boolean; cantidad?: number }, env: Env): WriteResult & { deletes: Row[] } {
  const habits: Data[] = rows.filter((r) => r.tbl === 'habits' && !r.data.archived).map((r) => ({ ...r.data, id: r.id }))
  const habit = findByName(habits, str(args.habito))
  const date = isYmd(args.fecha) ? args.fecha : ymdIn(env.now, env.tz)
  if (!habit) return { writes: [], deletes: [], report: [`No hay ningún hábito que se llame «${str(args.habito)}». Hábitos: ${habits.map((h) => str(h.name)).join(', ') || 'ninguno'}.`] }
  const logs = rows.filter((r) => r.tbl === 'habitLogs' && r.data.habitId === habit.id && r.data.date === date)
  const want = args.hecho !== false
  const rule = { target: num(habit.target) || undefined }
  // Hábito con cantidad («8 vasos»): se suma lo que diga o, si solo dice «hecho», se completa
  if (isCounted(rule) && want) {
    const target = targetOf(rule)
    const had = logs.reduce((n, l) => n + (num(l.data.count) || 1), 0)
    const add = typeof args.cantidad === 'number' && args.cantidad > 0 ? Math.round(args.cantidad) : Math.max(0, target - had)
    const total = had + add
    const unit = str(habit.unit)
    const status = `${total}/${target}${unit ? ` ${unit}` : ''}${total >= target ? ' (objetivo cumplido)' : ''}`
    if (!add) return { writes: [], deletes: [], report: [`«${str(habit.name)}» ya estaba cumplido el ${date}: ${status}.`] }
    const id = str(logs[0]?.id) || env.newId()
    return {
      writes: [{ tbl: 'habitLogs', id, data: { id, habitId: habit.id, date, count: total } }],
      deletes: logs.slice(1),
      report: [`«${str(habit.name)}» el ${date}: ${status}.`],
    }
  }
  if (want && logs.length) return { writes: [], deletes: [], report: [`«${str(habit.name)}» ya estaba hecho el ${date}.`] }
  if (!want) return { writes: [], deletes: logs, report: [logs.length ? `«${str(habit.name)}» desmarcado el ${date}.` : `«${str(habit.name)}» no estaba marcado el ${date}.`] }
  const id = env.newId()
  return { writes: [{ tbl: 'habitLogs', id, data: { id, habitId: habit.id, date } }], deletes: [], report: [`«${str(habit.name)}» marcado como hecho el ${date}.`] }
}

// ── Proyectos, objetivos, personas y pagos ────────────────────

export function createProject(rows: Row[], args: { nombre?: string; area?: string; descripcion?: string; limite?: string }, env: Env): WriteResult {
  const name = str(args.nombre).trim()
  if (!name) return { writes: [], report: ['Falta el nombre del proyecto.'] }
  const ix = new Index(rows)
  const existing = findByName(ix.projects, name)
  if (existing && fold(str(existing.name)) === fold(name)) return { writes: [], report: [`Ya existe el proyecto «${str(existing.name)}».`] }
  const area = args.area ? findByName(ix.areas, args.area) : undefined
  const project: Data = { id: env.newId(), name, description: str(args.descripcion), status: 'active', color: '#0A84FF', order: env.now, createdAt: env.now }
  if (area) project.areaId = area.id
  if (isYmd(args.limite)) project.deadline = args.limite
  return {
    writes: [{ tbl: 'projects', id: String(project.id), data: project }],
    report: [`Proyecto creado: «${name}»${area ? ` en ${str(area.name)}` : ''}${project.deadline ? `, límite ${project.deadline}` : ''}.${args.area && !area ? ` (No encontré el área «${args.area}».)` : ''}`],
  }
}

export function updateGoal(rows: Row[], args: { objetivo?: string; cifra?: number; sumar?: number; conseguido?: boolean }, env: Env): WriteResult {
  const goals: Data[] = rows.filter((r) => r.tbl === 'goals' && r.data.status !== 'dropped').map((r) => ({ ...r.data, id: r.id }))
  const g = findByName(goals, str(args.objetivo), 'title')
  if (!g) return { writes: [], report: [`No hay ningún objetivo que se llame «${str(args.objetivo)}». Objetivos: ${goals.map((x) => str(x.title)).join(', ') || 'ninguno'}.`] }
  const next: Data = { ...g }
  const out: string[] = []
  if (typeof args.cifra === 'number' || typeof args.sumar === 'number') {
    if (g.kind !== 'number') return { writes: [], report: [`«${str(g.title)}» se mide ${g.kind === 'tasks' ? `con las tareas #${str(g.tag)} que hace` : 'con sus proyectos'}, no con una cifra.`] }
    next.current = Math.max(0, typeof args.cifra === 'number' ? args.cifra : num(g.current) + (args.sumar ?? 0))
    next.log = logGoal(g.log as GoalPoint[] | undefined, ymdIn(env.now, env.tz), next.current as number)
    out.push(`«${str(g.title)}»: ${num(next.current)} de ${num(g.target)}${g.unit ? ` ${str(g.unit)}` : ''}.`)
  }
  if (args.conseguido === true) {
    next.status = 'done'
    next.completedAt = env.now
    out.push(`«${str(g.title)}» marcado como conseguido. 🎉`)
  } else if (args.conseguido === false && g.status === 'done') {
    next.status = 'active'
    delete next.completedAt
    out.push(`«${str(g.title)}» vuelve a estar en marcha.`)
  }
  if (!out.length) return { writes: [], report: ['No había nada que cambiar (usa cifra, sumar o conseguido).'] }
  return { writes: [{ tbl: 'goals', id: String(g.id), data: next }], report: out }
}

const KINDS: Record<string, 'call' | 'message' | 'meeting' | 'email' | 'other'> = {
  llamada: 'call',
  mensaje: 'message',
  reunion: 'meeting',
  email: 'email',
  otro: 'other',
}

export function logContact(rows: Row[], args: { persona?: string; tipo?: string; resumen?: string; fecha?: string }, env: Env): WriteResult {
  const people: Data[] = rows.filter((r) => r.tbl === 'people').map((r) => ({ ...r.data, id: r.id }))
  const person = findByName(people, str(args.persona))
  if (!person) return { writes: [], report: [`No encuentro a «${str(args.persona)}» en tus personas.`] }
  const date = isYmd(args.fecha) ? args.fecha : ymdIn(env.now, env.tz)
  const id = env.newId()
  const interaction: Data = { id, personId: person.id, date, kind: KINDS[fold(str(args.tipo))] ?? 'other', summary: str(args.resumen), createdAt: env.now }
  const writes: Row[] = [{ tbl: 'interactions', id, data: interaction }]
  if (!isYmd(person.lastContact) || (person.lastContact as string) < date) writes.push({ tbl: 'people', id: String(person.id), data: { ...person, lastContact: date } })
  return { writes, report: [`Apuntado: ${fold(str(args.tipo)) || 'contacto'} con ${str(person.name)} el ${date}.`] }
}

/** Siguiente cargo, respetando el día del mes original (31 → 28 → 31) */
export function advanceCharge(from: string, cycle: string, anchorDay?: number): string {
  if (cycle === 'week') return addDays(from, 7)
  const months = cycle === 'year' ? 12 : cycle === 'quarter' ? 3 : 1
  const next = addMonths(`${from.slice(0, 8)}01`, months)
  const [y, m] = next.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const day = Math.min(anchorDay || Number(from.slice(8, 10)), last)
  return `${next.slice(0, 8)}${String(day).padStart(2, '0')}`
}

export function markPaid(rows: Row[], args: { pago?: string }, env: Env): WriteResult {
  const subs: Data[] = rows.filter((r) => r.tbl === 'subscriptions' && r.data.active !== false).map((r) => ({ ...r.data, id: r.id }))
  const s = findByName(subs, str(args.pago))
  if (!s) return { writes: [], report: [`No hay ningún pago activo que se llame «${str(args.pago)}».`] }
  if (!isYmd(s.nextDate)) return { writes: [], report: ['Ese pago no tiene fecha.'] }
  const nextDate = advanceCharge(s.nextDate as string, str(s.cycle) || 'month', num(s.anchorDay) || undefined)
  const paidLog = [{ date: ymdIn(env.now, env.tz), amount: num(s.amount) }, ...(Array.isArray(s.paidLog) ? (s.paidLog as Data[]) : [])].slice(0, 24)
  const next: Data = { ...s, nextDate, paidLog }
  const days = typeof s.notifyDays === 'number' ? s.notifyDays : null
  if (days === null) delete next.remindAt
  else next.remindAt = zonedToUtc(addDays(nextDate, -days), '09:00', env.tz)
  return { writes: [{ tbl: 'subscriptions', id: String(s.id), data: next }], report: [`«${str(s.name)}» pagado. Próximo cargo: ${nextDate}.`] }
}

const CYCLE_WORDS: Record<string, string> = { semana: 'week', semanal: 'week', week: 'week', mes: 'month', mensual: 'month', month: 'month', trimestre: 'quarter', trimestral: 'quarter', quarter: 'quarter', ano: 'year', anual: 'year', year: 'year' }
const PER: Record<string, string> = { week: 'semana', month: 'mes', quarter: 'trimestre', year: 'año' }

/**
 * Apunta o cambia (por nombre) un pago que se repite: una suscripción, un
 * recibo o una prueba gratis (el primer cargo es cuando acaba). Si cambia el
 * precio, el anterior queda en su historial, como en la app.
 */
export function savePayment(
  rows: Row[],
  args: { nombre?: string; importe?: number; cada?: string; proximo?: string; tipo?: string; prueba_hasta?: string; categoria?: string; aviso_dias?: number; baja?: string; activo?: boolean; notas?: string },
  env: Env,
): WriteResult {
  const today = ymdIn(env.now, env.tz)
  const name = str(args.nombre).trim()
  if (!name) return { writes: [], report: ['Falta el nombre del pago.'] }
  const subs: Data[] = rows.filter((r) => r.tbl === 'subscriptions').map((r) => ({ ...r.data, id: r.id }))
  const old = findByName(subs, name)
  const amount = typeof args.importe === 'number' && args.importe > 0 ? Math.round(args.importe * 100) / 100 : num(old?.amount)
  if (!amount) return { writes: [], report: [`¿Cuánto cuesta «${name}»?`] }
  const cycle = CYCLE_WORDS[fold(str(args.cada))] ?? (str(old?.cycle) || 'month')
  const kind = args.tipo === 'recibo' ? 'bill' : args.tipo === 'suscripcion' || isYmd(args.prueba_hasta) ? 'sub' : str(old?.kind) || 'sub'
  const trial = isYmd(args.prueba_hasta) ? args.prueba_hasta : undefined
  const newDate = trial ?? (isYmd(args.proximo) ? args.proximo : undefined)
  let nextDate = newDate ?? (isYmd(old?.nextDate) ? (old.nextDate as string) : undefined)
  if (!nextDate) return { writes: [], report: [`¿Cuándo es el próximo cargo de «${name}»? (YYYY-MM-DD)`] }
  const anchorDay = newDate ? Number(newDate.slice(8, 10)) : num(old?.anchorDay) || Number(nextDate.slice(8, 10))
  // Una suscripción con fecha pasada ya se cobró: el siguiente cargo
  for (let i = 0; kind === 'sub' && nextDate < today && i < 1000; i++) nextDate = advanceCharge(nextDate, cycle, anchorDay)
  const notifyDays = typeof args.aviso_dias === 'number' ? Math.max(0, Math.round(args.aviso_dias)) : typeof old?.notifyDays === 'number' ? old.notifyDays : trial ? 2 : 1
  const before = num(old?.amount)
  const priceHistory = old && before && before !== amount ? [...(Array.isArray(old.priceHistory) ? (old.priceHistory as Data[]) : []), { date: today, amount: before }].slice(-12) : old?.priceHistory
  const active = typeof args.activo === 'boolean' ? args.activo : old?.active !== false
  const id = old ? String(old.id) : env.newId()
  const data: Data = {
    ...(old ?? { createdAt: env.now, notes: '', category: '', currency: 'EUR' }),
    id,
    name: old ? str(old.name) : name.charAt(0).toUpperCase() + name.slice(1),
    kind,
    amount,
    cycle,
    nextDate,
    anchorDay,
    active,
    notifyDays,
    ...(args.categoria ? { category: args.categoria } : {}),
    ...(args.notas ? { notes: args.notas } : {}),
    ...(trial ? { trialEnds: trial } : {}),
    ...(args.baja ? { cancelUrl: args.baja } : {}),
    ...(priceHistory ? { priceHistory } : {}),
  }
  if (active) data.remindAt = zonedToUtc(addDays(nextDate, -notifyDays), '09:00', env.tz)
  else delete data.remindAt
  const currency = str(data.currency) || 'EUR'
  const report = [`«${str(data.name)}» ${old ? 'actualizado' : 'guardado'}: ${money(amount, currency)} cada ${PER[cycle] ?? 'mes'}, próximo cargo ${relDay(nextDate, today)} (${nextDate})${active ? '' : ' — en pausa'}.`]
  if (trial) report.push(`Es una prueba gratis hasta ${trial}: avisaré ${notifyDays === 0 ? 'ese mismo día' : `${notifyDays} ${notifyDays === 1 ? 'día' : 'días'} antes`} para que decida si la cancela.`)
  if (old && before && before !== amount) report.push(`${amount > before ? 'Sube' : 'Baja'} de ${money(before, currency)} a ${money(amount, currency)} (${amount > before ? '+' : '−'}${Math.abs(Math.round(((amount - before) / before) * 100))} %).`)
  return { writes: [{ tbl: 'subscriptions', id, data }], report }
}

// ── Plantillas ────────────────────────────────────────────────

export function listTemplates(rows: Row[]): string {
  const tpls = rows.filter((r) => r.tbl === 'templates')
  if (!tpls.length) return 'No hay plantillas. Se crean en LUNO → Plantillas (o guardando un proyecto como plantilla).'
  return tpls
    .map((t) => {
      const items = (Array.isArray(t.data.items) ? t.data.items : []) as TemplateItemLike[]
      const lines = items.map((it) => `  - ${it.title}${typeof it.offset === 'number' ? ` (día ${it.offset})` : ''}`)
      return [`${str(t.data.name)} (${items.length} tareas):`, ...lines].join('\n')
    })
    .join('\n\n')
}

export function useTemplate(rows: Row[], args: { plantilla?: string; fecha_inicio?: string; como?: string; proyecto?: string }, env: Env): WriteResult {
  const tpls: Data[] = rows.filter((r) => r.tbl === 'templates').map((r) => ({ ...r.data, id: r.id }))
  const tpl = findByName(tpls, str(args.plantilla))
  if (!tpl) return { writes: [], report: [`No hay ninguna plantilla que se llame «${str(args.plantilla)}». Plantillas: ${tpls.map((t) => str(t.name)).join(', ') || 'ninguna'}.`] }
  const ix = new Index(rows)
  const today = ymdIn(env.now, env.tz)
  const start = isYmd(args.fecha_inicio) ? args.fecha_inicio : today
  const writes: Row[] = []
  let projectId: string | undefined
  let areaId: string | undefined
  let where = ''
  let project: Data | undefined
  if (args.como === 'proyecto') {
    const name = str(args.proyecto).trim() || str(tpl.name)
    project = { id: env.newId(), name, description: '', status: 'active', color: '#0A84FF', order: env.now, createdAt: env.now }
    projectId = String(project.id)
    where = ` en el proyecto nuevo «${name}»`
  } else if (args.proyecto) {
    const p = findByName(ix.projects, args.proyecto)
    if (!p) return { writes: [], report: [`No encontré el proyecto «${args.proyecto}».`] }
    project = { ...(rows.find((r) => r.tbl === 'projects' && r.id === p.id)?.data ?? p) }
    projectId = String(p.id)
    areaId = p.areaId ? String(p.areaId) : undefined
    where = ` en «${str(p.name)}»`
  }
  const items = (Array.isArray(tpl.items) ? tpl.items : []) as TemplateItemLike[]
  const expanded = expandTemplate(items, start)
  // Secciones de la plantilla: se crean en el proyecto (o se reutilizan las que se llamen igual)
  const plan = planSections((project?.sections as { id: string; name: string }[] | undefined) ?? [], project ? expanded.map((x) => x.section) : [], env.newId)
  if (project && (plan.changed || args.como === 'proyecto')) {
    if (plan.sections.length) project.sections = plan.sections
    writes.push({ tbl: 'projects', id: String(project.id), data: project })
  }
  const created: Task[] = []
  expanded.forEach((x, i) => {
    let task: Task = {
      id: env.newId(),
      title: x.title,
      notes: '',
      done: 0,
      priority: x.priority,
      tags: [],
      subtasks: x.subtasks.map((s) => ({ id: env.newId(), title: s, done: false })),
      order: env.now + i,
      createdAt: env.now,
    }
    if (x.dueDate) task.dueDate = x.dueDate
    if (x.dueTime) task.dueTime = x.dueTime
    if (projectId) task.projectId = projectId
    if (areaId) task.areaId = areaId
    const sectionId = plan.idFor(x.section)
    if (sectionId) task.sectionId = sectionId
    task = withReminder(task, env)
    created.push(task)
    writes.push({ tbl: 'tasks', id: task.id, data: task as unknown as Data })
  })
  return {
    writes,
    report: [`Plantilla «${str(tpl.name)}» usada${where}, empezando ${relDay(start, today)} (${start}):`, ...created.map((t) => taskLine(t, ix, today))],
  }
}

// ── Cosas ─────────────────────────────────────────────────────

const THING_KINDS: Record<string, 'stored' | 'lent' | 'borrowed' | 'document'> = {
  guardado: 'stored',
  prestado: 'lent',
  'me lo prestaron': 'borrowed',
  caduca: 'document',
}

function thingLine(d: Data, today: string) {
  const parts = [str(d.name)]
  if (d.kind === 'lent') parts.push(`lo tiene ${str(d.personName) || 'alguien'}${isYmd(d.since) ? ` desde ${d.since}` : ''}${isYmd(d.returnBy) ? `, reclamar ${relDay(d.returnBy as string, today)} (${d.returnBy})` : ''}`)
  if (d.kind === 'borrowed') parts.push(`de ${str(d.personName) || 'alguien'}${isYmd(d.returnBy) ? `, devolver ${relDay(d.returnBy as string, today)} (${d.returnBy})` : ''}`)
  if (d.kind === 'document' && isYmd(d.expires)) {
    const n = diffDays(d.expires as string, today)
    parts.push(n < 0 ? `CADUCÓ el ${d.expires}` : `caduca ${relDay(d.expires as string, today)} (${d.expires})`)
  }
  if (d.location || d.room) parts.push(`está en: ${[str(d.location), str(d.room)].filter(Boolean).join(', ')}`)
  if (isYmd(d.warranty)) {
    const n = diffDays(d.warranty as string, today)
    parts.push(n < 0 ? `garantía acabada el ${d.warranty}` : `garantía hasta ${d.warranty}`)
  }
  if (num(d.price)) parts.push(`costó ${num(d.price)} €${isYmd(d.bought) ? ` el ${d.bought}` : ''}`)
  if (d.notes) parts.push(`nota: ${str(d.notes)}`)
  if (d.returned) parts.push('ya devuelto')
  return parts.join(' · ')
}

/** Igual que computeThingRemindAt de la app, en la zona horaria del usuario */
function thingRemindAt(d: Data, env: Env): number | undefined {
  let when: number | undefined
  if (d.kind === 'document' && isYmd(d.expires)) {
    when = zonedToUtc(addDays(d.expires as string, -(num(d.notifyDays) || 30)), '09:00', env.tz)
    // Ya dentro del margen: a las 9:00 siguientes, si aún no ha caducado
    if (when <= env.now) {
      const today = ymdIn(env.now, env.tz)
      const nine = zonedToUtc(today, '09:00', env.tz)
      const next = nine > env.now ? nine : zonedToUtc(addDays(today, 1), '09:00', env.tz)
      when = next <= zonedToUtc(d.expires as string, '09:00', env.tz) ? next : undefined
    }
  }
  else if (d.kind === 'lent' && isYmd(d.returnBy) && !d.returned) when = zonedToUtc(d.returnBy as string, '10:00', env.tz)
  else if (d.kind === 'borrowed' && isYmd(d.returnBy) && !d.returned) when = zonedToUtc(addDays(d.returnBy as string, -1), '09:00', env.tz)
  // Sin otro aviso: un mes antes de que acabe la garantía
  if ((when === undefined || when <= env.now) && isYmd(d.warranty) && !d.returned) {
    when = zonedToUtc(addDays(d.warranty as string, -30), '09:00', env.tz)
    if (when <= env.now) {
      const today = ymdIn(env.now, env.tz)
      const nine = zonedToUtc(today, '09:00', env.tz)
      const next = nine > env.now ? nine : zonedToUtc(addDays(today, 1), '09:00', env.tz)
      when = next <= zonedToUtc(d.warranty as string, '09:00', env.tz) ? next : undefined
    }
  }
  return when !== undefined && when > env.now ? when : undefined
}

const foldAll = (s: string) => fold(s)

export function whereIs(rows: Row[], args: { busqueda?: string }, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const all = rows.filter((r) => r.tbl === 'things')
  const words = foldAll(str(args.busqueda)).split(/\s+/).filter(Boolean)
  const hits = all.filter((r) => {
    const hay = foldAll([r.data.name, r.data.location, r.data.personName, r.data.notes].map(str).join(' '))
    return words.every((w) => hay.includes(w))
  })
  if (!all.length) return 'Aún no ha apuntado ninguna cosa en LUNO (Cosas).'
  if (!hits.length) return `No hay nada apuntado que coincida con «${str(args.busqueda)}». Cosas apuntadas: ${all.map((r) => str(r.data.name)).slice(0, 40).join(', ')}.`
  return hits.slice(0, 30).map((r) => `- [${r.id}] ${thingLine(r.data, today)}`).join('\n')
}

export function saveThing(
  rows: Row[],
  args: { nombre?: string; tipo?: string; donde?: string; estancia?: string; persona?: string; desde?: string; devolver?: string; caduca?: string; avisar_dias?: number; garantia?: string; comprado?: string; precio?: number; notas?: string },
  env: Env,
): WriteResult {
  const name = str(args.nombre).trim()
  if (!name) return { writes: [], report: ['Falta el nombre de la cosa.'] }
  const today = ymdIn(env.now, env.tz)
  const ix = new Index(rows)
  const things = rows.filter((r) => r.tbl === 'things')
  const existing = things.find((r) => fold(str(r.data.name)) === fold(name) && !r.data.returned)
  const kind = THING_KINDS[fold(str(args.tipo))] ?? (existing?.data.kind as string | undefined) ?? (args.persona ? 'lent' : args.caduca ? 'document' : 'stored')
  const d: Data = existing ? { ...existing.data } : { id: env.newId(), name, kind, createdAt: env.now }
  d.kind = kind
  if (args.donde !== undefined) d.location = str(args.donde).trim() || undefined
  if (args.notas !== undefined) d.notes = str(args.notas).trim() || undefined
  if (args.estancia !== undefined) d.room = str(args.estancia).trim() || undefined
  if (isYmd(args.garantia)) d.warranty = args.garantia
  if (isYmd(args.comprado)) d.bought = args.comprado
  if (typeof args.precio === 'number' && args.precio > 0) d.price = Math.round(args.precio * 100) / 100
  if (args.persona) {
    const p = findByName(ix.people, str(args.persona).replace(/^@/, ''))
    d.personName = p ? str(p.name) : str(args.persona)
    if (p) d.personId = p.id
    else delete d.personId
  }
  if (kind === 'lent' || kind === 'borrowed') d.since = isYmd(args.desde) ? args.desde : (d.since ?? today)
  if (isYmd(args.devolver)) d.returnBy = args.devolver
  if (isYmd(args.caduca)) d.expires = args.caduca
  if (typeof args.avisar_dias === 'number' && args.avisar_dias > 0) d.notifyDays = Math.round(args.avisar_dias)
  if (kind === 'document' && !d.notifyDays) d.notifyDays = 30
  if ((kind === 'lent' || kind === 'borrowed') && !d.personName) return { writes: [], report: ['Para un préstamo hace falta la persona.'] }
  if (kind === 'document' && !isYmd(d.expires)) return { writes: [], report: ['Para algo que caduca hace falta la fecha (caduca: YYYY-MM-DD).'] }
  d.updatedAt = env.now
  const at = thingRemindAt(d, env)
  if (at === undefined) delete d.remindAt
  else d.remindAt = at
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k]
  return {
    writes: [{ tbl: 'things', id: String(existing?.id ?? d.id), data: d }],
    report: [`${existing ? 'Actualizado' : 'Apuntado'}: ${thingLine(d, today)}${at ? ` · te avisaré el ${ymdIn(at, env.tz)}` : ''}.`],
  }
}

export function markReturned(rows: Row[], args: { cosa?: string }, env: Env): WriteResult {
  const q = fold(str(args.cosa))
  const loans = rows.filter((r) => r.tbl === 'things' && (r.data.kind === 'lent' || r.data.kind === 'borrowed') && !r.data.returned)
  const hit = loans.find((r) => fold(str(r.data.name)) === q) ?? loans.find((r) => fold(str(r.data.name)).includes(q) || fold(str(r.data.personName)).includes(q))
  if (!hit) return { writes: [], report: [`No hay ningún préstamo abierto de «${str(args.cosa)}». Préstamos: ${loans.map((r) => str(r.data.name)).join(', ') || 'ninguno'}.`] }
  const d: Data = { ...hit.data, returned: 1, updatedAt: env.now }
  delete d.remindAt
  return { writes: [{ tbl: 'things', id: hit.id, data: d }], report: [`«${str(d.name)}» marcado como devuelto.`] }
}

// ── Última vez ────────────────────────────────────────────────

function trackerLine(d: Data, today: string) {
  const log = (d.log as string[] | undefined) ?? []
  const last = log[0]
  const every = num(d.every)
  const parts = [str(d.name)]
  if (d.avoid) {
    // «Días sin…»: el historial son las recaídas
    const start = last ?? ymdIn(num(d.createdAt), 'UTC')
    parts.push(`lo quiere dejar: ${diffDays(today, start)} días sin hacerlo${last ? ` (última recaída ${last})` : ''}`)
    if (num(d.costPerDay)) parts.push(`ahorra ${num(d.costPerDay)} al día`)
    return parts.join(' · ')
  }
  parts.push(last ? `última vez ${relDay(last, today)} (${last}, hace ${diffDays(today, last)} días)` : 'nunca apuntado')
  if (every) parts.push(`cada ${every} días`)
  if (log.length > 1) parts.push(`${log.length} veces apuntado`)
  return parts.join(' · ')
}

/** Igual que computeTrackerRemindAt de la app, en la zona horaria del usuario */
function trackerRemindAt(d: Data, env: Env): number | undefined {
  const last = (d.log as string[] | undefined)?.[0]
  const every = num(d.every)
  if (d.avoid || !every || !last || d.archived) return undefined
  const at = zonedToUtc(addDays(last, every), '10:00', env.tz)
  if (at > env.now) return at
  const today = ymdIn(env.now, env.tz)
  const ten = zonedToUtc(today, '10:00', env.tz)
  return ten > env.now ? ten : zonedToUtc(addDays(today, 1), '10:00', env.tz)
}

export function lastTime(rows: Row[], args: { cosa?: string }, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const all = rows.filter((r) => r.tbl === 'trackers' && !r.data.archived)
  if (!all.length) return 'Aún no apunta nada en «Última vez». Puedes empezar con lo_he_hecho.'
  const q = fold(str(args.cosa))
  const hits = q ? all.filter((r) => fold(str(r.data.name)).includes(q) || q.split(/\s+/).every((w) => fold(str(r.data.name)).includes(w))) : all
  if (!hits.length) return `No hay nada que se parezca a «${str(args.cosa)}». Tiene: ${all.map((r) => str(r.data.name)).join(', ')}.`
  return hits.map((r) => `- ${trackerLine(r.data, today)}`).join('\n')
}

export function logLastTime(rows: Row[], args: { cosa?: string; fecha?: string; cada_dias?: number }, env: Env): WriteResult {
  const name = str(args.cosa).trim()
  if (!name) return { writes: [], report: ['Falta qué ha hecho.'] }
  const today = ymdIn(env.now, env.tz)
  const date = isYmd(args.fecha) && args.fecha <= today ? args.fecha : today
  const existing = rows.find((r) => r.tbl === 'trackers' && !r.data.archived && fold(str(r.data.name)) === fold(name)) ??
    rows.find((r) => r.tbl === 'trackers' && !r.data.archived && fold(str(r.data.name)).includes(fold(name)))
  const d: Data = existing ? { ...existing.data } : { id: env.newId(), name: name.charAt(0).toUpperCase() + name.slice(1), icon: 'circle', log: [], archived: 0, order: env.now, createdAt: env.now }
  const log = [...new Set([date, ...((d.log as string[]) ?? [])])].sort((a, b) => b.localeCompare(a)).slice(0, 200)
  d.log = log
  if (typeof args.cada_dias === 'number' && args.cada_dias > 0) d.every = Math.round(args.cada_dias)
  const at = trackerRemindAt(d, env)
  if (at === undefined) delete d.remindAt
  else d.remindAt = at
  return {
    writes: [{ tbl: 'trackers', id: String(existing?.id ?? d.id), data: d }],
    report: [`${existing ? 'Apuntado' : 'Creado y apuntado'}: ${trackerLine(d, today)}${at ? `. Le avisaré el ${ymdIn(at, env.tz)}` : ''}.`],
  }
}

// ── Compra ────────────────────────────────────────────────────

/** Otras listas de la compra además de la principal (ajuste `shoppingLists`) */
export function shoppingLists(rows: Row[]): { id: string; name: string }[] {
  const v = rows.find((r) => r.tbl === 'settings' && r.id === 'shoppingLists')?.data.value
  return Array.isArray(v) ? (v as { id: string; name: string }[]).filter((l) => l && l.id && l.name) : []
}

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

export function listShopping(rows: Row[]): string {
  const items = rows.filter((r) => r.tbl === 'shopping' && !r.data.checked)
  if (!items.length) return 'La lista de la compra está vacía.'
  const lists = shoppingLists(rows)
  const groups = [{ id: '', name: 'Súper' }, ...lists].map((l) => ({ ...l, items: items.filter((r) => (str(r.data.list) || '') === l.id || (!l.id && !lists.some((x) => x.id === r.data.list))) }))
  const out: string[] = []
  for (const g of groups.filter((x) => x.items.length)) {
    if (lists.length) out.push(`${out.length ? '\n' : ''}LISTA ${g.name.toUpperCase()}:`)
    for (const a of AISLES) {
      const list = g.items.filter((r) => (r.data.aisle ?? 'otros') === a.id)
      if (list.length) out.push(`${a.label}: ${list.map((r) => `${str(r.data.name)}${r.data.qty ? ` (${str(r.data.qty)})` : ''}${num(r.data.price) ? ` ${euros(num(r.data.price))}` : ''}`).join(', ')}`)
    }
    const total = g.items.reduce((n, r) => n + num(r.data.price), 0)
    if (total) out.push(`Total estimado: ${euros(total)}${g.items.some((r) => !num(r.data.price)) ? ' (sin contar lo que no tiene precio)' : ''}`)
  }
  return out.join('\n')
}

export function addShopping(rows: Row[], args: { cosas?: unknown; lista?: string }, env: Env): WriteResult {
  const text = Array.isArray(args.cosas) ? args.cosas.map(String).join('\n') : str(args.cosas)
  const parsed = parseItems(text)
  if (!parsed.length) return { writes: [], report: ['No he entendido qué añadir.'] }
  const lists = shoppingLists(rows)
  const wanted = str(args.lista).trim()
  const list = wanted ? lists.find((l) => fold(l.name) === fold(wanted)) ?? lists.find((l) => fold(l.name).includes(fold(wanted))) : undefined
  const pantry = rows.filter((r) => r.tbl === 'pantry')
  const known = Object.fromEntries(pantry.map((r) => [r.id, str(r.data.aisle)]))
  const prices = new Map(pantry.filter((r) => num(r.data.price)).map((r) => [r.id, num(r.data.price)]))
  const pending = rows.filter((r) => r.tbl === 'shopping' && !r.data.checked && (str(r.data.list) || undefined) === list?.id).map((r) => ({ r, key: itemKey(str(r.data.name)) }))
  const writes: Row[] = []
  const added: string[] = []
  const already: string[] = []
  parsed.forEach((it, i) => {
    const key = itemKey(it.name)
    const same = pending.find((p) => p.key === key)
    if (same) {
      already.push(it.name)
      const data = { ...same.r.data }
      if (it.qty) data.qty = it.qty
      if (it.price) data.price = it.price
      if ((it.qty && it.qty !== same.r.data.qty) || (it.price && it.price !== same.r.data.price)) writes.push({ tbl: 'shopping', id: same.r.id, data })
      return
    }
    const id = env.newId()
    const data: Data = { id, name: it.name, aisle: aisleFor(it.name, known), checked: 0, order: env.now + i, createdAt: env.now }
    if (it.qty) data.qty = it.qty
    const price = it.price ?? prices.get(key)
    if (price) data.price = price
    if (list) data.list = list.id
    writes.push({ tbl: 'shopping', id, data })
    pending.push({ r: { tbl: 'shopping', id, data }, key })
    added.push(`${it.name}${it.qty ? ` (${it.qty})` : ''}`)
  })
  const where = list ? ` (${list.name})` : ''
  const report = [added.length ? `Añadido a la compra${where}: ${added.join(', ')}.` : 'No había nada nuevo que añadir.']
  if (already.length) report.push(`Ya estaba: ${already.join(', ')}.`)
  if (wanted && !list) report.push(`No tiene ninguna lista «${wanted}»: lo he puesto en la principal${lists.length ? ` (sus listas: Súper, ${lists.map((l) => l.name).join(', ')})` : ''}.`)
  return { writes, report }
}

// ── Diario ────────────────────────────────────────────────────

const MOOD_WORDS = ['', 'muy mal', 'mal', 'normal', 'bien', 'muy bien']

export function readJournal(rows: Row[], args: { desde?: string; hasta?: string }, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const from = isYmd(args.desde) ? args.desde : addDays(today, -6)
  const to = isYmd(args.hasta) ? args.hasta : today
  const list = rows.filter((r) => r.tbl === 'journal' && r.id >= from && r.id <= to).sort((a, b) => a.id.localeCompare(b.id))
  if (!list.length) return `No hay nada en el diario entre ${from} y ${to}.`
  return list
    .map((r) => {
      const d = r.data
      const good = Array.isArray(d.good) && d.good.length ? ` · cosas buenas: ${(d.good as string[]).join('; ')}` : ''
      return `- ${relDay(r.id, today)} (${r.id})${typeof d.mood === 'number' ? `, ánimo ${MOOD_WORDS[d.mood as number] ?? d.mood}` : ''}: ${str(d.text).trim() || '(sin texto)'}${good}`
    })
    .join('\n')
}

export function writeJournal(rows: Row[], args: { texto?: string; animo?: number; cosas_buenas?: unknown; fecha?: string }, env: Env): WriteResult {
  const today = ymdIn(env.now, env.tz)
  const date = isYmd(args.fecha) && args.fecha <= today ? args.fecha : today
  const cur = rows.find((r) => r.tbl === 'journal' && r.id === date)?.data ?? { id: date, text: '', good: [] }
  const d: Data = { ...cur, id: date, updatedAt: env.now }
  const text = str(args.texto).trim()
  // Se añade a lo que ya hubiera escrito ese día
  if (text) d.text = [str(cur.text).trim(), text].filter(Boolean).join('\n\n')
  if (typeof args.animo === 'number' && args.animo >= 1 && args.animo <= 5) d.mood = Math.round(args.animo)
  if (Array.isArray(args.cosas_buenas)) d.good = [...((cur.good as string[]) ?? []), ...args.cosas_buenas.map(String).filter(Boolean)].slice(0, 3)
  if (!Array.isArray(d.good)) d.good = []
  if (typeof d.text !== 'string') d.text = ''
  if (!text && d.mood === cur.mood && !Array.isArray(args.cosas_buenas)) return { writes: [], report: ['No había nada que apuntar.'] }
  return {
    writes: [{ tbl: 'journal', id: date, data: d }],
    report: [`Apuntado en el diario de ${relDay(date, today)}${typeof d.mood === 'number' ? ` (ánimo: ${MOOD_WORDS[d.mood as number]})` : ''}.`],
  }
}

// ── ¿Qué hago ahora? ──────────────────────────────────────────

export function whatNow(rows: Row[], args: { minutos?: number; energia?: string }, env: Env): string {
  const ix = new Index(rows)
  const today = ymdIn(env.now, env.tz)
  const [h, m] = hhmmIn(env.now, env.tz).split(':').map(Number)
  const minutes = typeof args.minutos === 'number' && args.minutos > 0 ? Math.round(args.minutos) : 30
  const energy: Energy = args.energia === 'poca' ? 'low' : args.energia === 'mucha' ? 'high' : 'normal'
  const open = ix.tasks.filter((t) => !t.done)
  const list = suggest(open, { minutes, energy, today, nowMin: h * 60 + m, now: env.now })
  if (!list.length) return open.length ? `Nada pendiente cabe en ${minutes} minutos.` : 'No tiene nada pendiente.'
  return [
    `Para ${minutes} minutos con energía ${args.energia ?? 'normal'}, en este orden:`,
    ...list.slice(0, 5).map((s, i) => `${i + 1}. [${s.task.id}] ${s.task.title} — ${s.reasons.join(', ')}`),
  ].join('\n')
}

// ── Gastos ────────────────────────────────────────────────────

export function expenseRows(rows: Row[]) {
  return rows
    .filter((r) => r.tbl === 'expenses' && typeof r.data.amount === 'number' && isYmd(r.data.date))
    .map((r) => ({ amount: r.data.amount as number, category: str(r.data.category) || 'otros', date: r.data.date as string, note: str(r.data.note), tags: Array.isArray(r.data.tags) ? (r.data.tags as unknown[]).map(str).filter(Boolean) : undefined }))
}
export const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Otros'
const setting = (rows: Row[], id: string) => rows.find((r) => r.tbl === 'settings' && r.id === id)?.data.value as Data | undefined
export function budgetOf(rows: Row[]): Budget {
  const b = setting(rows, 'budget')
  const cats = b?.categories && typeof b.categories === 'object' ? (b.categories as Record<string, unknown>) : {}
  return { monthly: num(b?.monthly), categories: Object.fromEntries(Object.entries(cats).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<string, number> }
}
const rulesOf = (rows: Row[]) => (setting(rows, 'expenseRules') ?? {}) as ExpenseRules

export function addExpenseTool(rows: Row[], args: { texto?: string; importe?: number; concepto?: string; categoria?: string; fecha?: string; etiquetas?: string[] | string }, env: Env): WriteResult {
  const today = ymdIn(env.now, env.tz)
  const rules = rulesOf(rows)
  let amount: number | undefined
  let note = str(args.concepto).trim()
  let date = isYmd(args.fecha) && args.fecha <= today ? args.fecha : today
  const tags = new Set((Array.isArray(args.etiquetas) ? args.etiquetas : str(args.etiquetas).split(/[,\s]+/)).map((t) => normTag(str(t))).filter(Boolean))
  if (args.texto) {
    const p = parseExpense(str(args.texto), rules)
    if (p) {
      amount = p.amount
      note = note || p.note
      p.tags?.forEach((t) => tags.add(t))
      if (!isYmd(args.fecha)) date = addDays(today, -p.daysAgo)
    }
  }
  if (typeof args.importe === 'number' && args.importe > 0) amount = Math.round(args.importe * 100) / 100
  if (!amount) return { writes: [], report: ['Falta el importe del gasto.'] }
  note = note || 'Gasto'
  // La que diga el usuario; si no, la que aprendió la app al recategorizar; si no, la de las palabras
  const category = CATEGORIES.some((c) => c.id === args.categoria) ? args.categoria! : categoryFor(note, rules)
  const id = env.newId()
  const before = monthSummary(expenseRows(rows), date.slice(0, 7), today)
  const budget = budgetOf(rows)
  const total = before.total + amount
  const limit = budget.categories?.[category]
  const catTotal = (before.byCategory.find((c) => c.id === category)?.amount ?? 0) + amount
  const current = date.slice(0, 7) === today.slice(0, 7)
  const alerts = [
    current && budget.monthly && total > budget.monthly && 'SE HA PASADO DEL PRESUPUESTO DEL MES',
    current && limit && budgetAlert(catTotal - amount, amount, limit) === 'over' && `se ha pasado del límite de ${catLabel(category).toLowerCase()} (${money(catTotal)} de ${money(limit)})`,
    current && limit && budgetAlert(catTotal - amount, amount, limit) === 'near' && `lleva el ${Math.round((catTotal / limit) * 100)} % del límite de ${catLabel(category).toLowerCase()}`,
  ].filter(Boolean)
  const t = [...tags]
  return {
    writes: [{ tbl: 'expenses', id, data: { id, amount, note: note.charAt(0).toUpperCase() + note.slice(1), category, date, ...(t.length ? { tags: t } : {}), createdAt: env.now } }],
    report: [
      `Apuntado: ${money(amount)} · ${note} (${catLabel(category)}${t.length ? `, ${t.map((x) => `#${x}`).join(' ')}` : ''}, ${relDay(date, today)}). Este mes: ${money(total)}${budget.monthly ? ` de ${money(budget.monthly)}` : ''}${alerts.length ? ` — ${alerts.join('; ')}` : ''}.`,
    ],
  }
}

export function listExpenses(rows: Row[], args: { mes?: string; buscar?: string }, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const all = expenseRows(rows)
  // Buscar en todos los meses: «mercadona», «comer», «#roma»
  if (str(args.buscar).trim()) {
    const q = str(args.buscar).trim()
    const r = searchExpenses(all, q)
    if (!r.items.length) return `No hay gastos con «${q}».`
    const sorted = [...r.items].sort((a, b) => b.date.localeCompare(a.date))
    return [
      `«${q}»: ${r.items.length} gastos, ${money(r.total)} en total (del ${sorted.at(-1)!.date} al ${sorted[0].date}).`,
      ...sorted.slice(0, 15).map((e) => `- ${e.date} ${money(e.amount)} ${e.note} (${catLabel(e.category)})`),
      ...(sorted.length > 15 ? [`… y ${sorted.length - 15} más.`] : []),
    ].join('\n')
  }
  const month = /^\d{4}-\d{2}$/.test(str(args.mes)) ? str(args.mes) : today.slice(0, 7)
  const s = monthSummary(all, month, today)
  const budget = budgetOf(rows)
  const limits = categoryBudgets(s.byCategory, budget)
  if (!s.count && !limits.length) return `No hay gastos apuntados en ${month}.`
  const inMonth = all.filter((e) => e.date.startsWith(month))
  const tags = tagTotals(all).filter((g) => inMonth.some((e) => e.tags?.includes(g.tag)))
  const trend = monthlyTotals(all, month, 6)
  const lines = [
    `Gastos de ${month}: ${money(s.total)} en ${s.count} gastos${budget.monthly ? `, presupuesto ${money(budget.monthly)}` : ''}${s.projection > s.total ? `; a este ritmo, ${money(s.projection)} a fin de mes` : ''}.`,
    'Por categoría:',
    ...s.byCategory.map((c) => {
      const l = limits.find((x) => x.id === c.id)
      return `- ${catLabel(c.id)}: ${money(c.amount)} (${Math.round((c.amount / s.total) * 100)} %)${l ? ` de un límite de ${money(l.limit)}${l.left < 0 ? ` — SE HA PASADO ${money(-l.left)}` : `, quedan ${money(l.left)}`}` : ''}`
    }),
    ...limits.filter((l) => !l.spent).map((l) => `- ${catLabel(l.id)}: nada aún, límite ${money(l.limit)}`),
    ...(tags.length ? ['Etiquetas (total de todos los meses):', ...tags.map((g) => `- #${g.tag}: ${money(g.total)} (${g.from} a ${g.to})`)] : []),
    `Últimos 6 meses: ${trend.map((m) => `${m.month} ${money(m.total)}`).join(' · ')}.`,
    'Últimos:',
    ...inMonth
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((e) => `- ${e.date} ${money(e.amount)} ${e.note}${e.tags?.length ? ` ${e.tags.map((t) => `#${t}`).join(' ')}` : ''}`),
  ]
  return lines.join('\n')
}

// ── Menú ──────────────────────────────────────────────────────

export function menuName(rows: Row[], d: Data) {
  if (d.recipeId) return str(rows.find((r) => r.tbl === 'recipes' && r.id === d.recipeId)?.data.name) || str(d.text) || '?'
  return str(d.text)
}

export function readMenu(rows: Row[], args: { desde?: string }, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const from = isYmd(args.desde) ? args.desde : weekStart(today)
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const lines = days.map((d) => {
    const get = (m: string) => {
      const r = rows.find((x) => x.tbl === 'menu' && x.id === `${d}:${m}`)
      return r ? menuName(rows, r.data) : '—'
    }
    return `- ${relDay(d, today)} (${d}): comida ${get('comida')} · cena ${get('cena')}`
  })
  const recipes = rows.filter((r) => r.tbl === 'recipes').map((r) => str(r.data.name))
  return [...lines, `Recetas guardadas: ${recipes.join(', ') || 'ninguna'}.`].join('\n')
}

export function planMenu(rows: Row[], args: { comidas?: unknown }, _env: Env): WriteResult {
  const list = Array.isArray(args.comidas) ? (args.comidas as { fecha?: string; comida?: string; cena?: string }[]) : []
  const recipes: Data[] = rows.filter((r) => r.tbl === 'recipes').map((r) => ({ ...r.data, id: r.id }))
  const writes: Row[] = []
  const report: string[] = []
  for (const day of list) {
    if (!isYmd(day?.fecha)) continue
    for (const meal of ['comida', 'cena'] as const) {
      const v = str(day[meal]).trim()
      if (!v) continue
      const r = findByName(recipes, v)
      const exact = r && fold(str(r.name)) === fold(v)
      const id = `${day.fecha}:${meal}`
      writes.push({ tbl: 'menu', id, data: exact ? { id, date: day.fecha, meal, recipeId: String(r!.id) } : { id, date: day.fecha, meal, text: v } })
      report.push(`${day.fecha} ${meal}: ${exact ? str(r!.name) + ' (receta)' : v}`)
    }
  }
  if (!writes.length) return { writes: [], report: ['No había comidas que poner (cada día: fecha y comida y/o cena).'] }
  return { writes, report: ['Menú actualizado:', ...report, 'Con recetas guardadas, en LUNO → Menú puede añadir sus ingredientes a la compra en un toque.'] }
}

export function createRecipe(rows: Row[], args: { nombre?: string; ingredientes?: unknown; pasos?: unknown; raciones?: number; minutos?: number; notas?: string }, env: Env): WriteResult {
  const name = str(args.nombre).trim()
  const ingredients = Array.isArray(args.ingredientes) ? args.ingredientes.map((x) => String(x).trim()).filter(Boolean) : []
  if (!name) return { writes: [], report: ['Falta el nombre de la receta.'] }
  const existing = rows.find((r) => r.tbl === 'recipes' && fold(str(r.data.name)) === fold(name))
  const id = existing?.id ?? env.newId()
  const data: Data = { ...(existing?.data ?? { createdAt: env.now }), id, name, ingredients }
  if (args.notas) data.notes = str(args.notas)
  const steps = Array.isArray(args.pasos) ? args.pasos.map((x) => String(x).trim()).filter(Boolean) : []
  if (steps.length) data.steps = steps
  if (typeof args.raciones === 'number' && args.raciones > 0) data.servings = Math.round(args.raciones)
  if (typeof args.minutos === 'number' && args.minutos > 0) data.minutes = Math.round(args.minutos)
  const extra = [steps.length && `${steps.length} pasos`, data.servings && `para ${data.servings}`].filter(Boolean).join(', ')
  return { writes: [{ tbl: 'recipes', id, data }], report: [`Receta ${existing ? 'actualizada' : 'guardada'}: ${name} (${ingredients.length} ingredientes${extra ? `, ${extra}` : ''}).`] }
}

// ── Cuentas atrás ─────────────────────────────────────────────

export function addCountdown(rows: Row[], args: { nombre?: string; fecha?: string }, env: Env): WriteResult {
  const name = str(args.nombre).trim()
  const today = ymdIn(env.now, env.tz)
  if (!name || !isYmd(args.fecha)) return { writes: [], report: ['Falta el nombre o la fecha (YYYY-MM-DD).'] }
  if (args.fecha < today) return { writes: [], report: ['Esa fecha ya ha pasado.'] }
  const existing = rows.find((r) => r.tbl === 'countdowns' && fold(str(r.data.name)) === fold(name))
  const id = existing?.id ?? env.newId()
  return {
    writes: [{ tbl: 'countdowns', id, data: { id, name, date: args.fecha, icon: str(existing?.data.icon) || 'sparkles', createdAt: num(existing?.data.createdAt) || env.now } }],
    report: [`Cuenta atrás ${existing ? 'cambiada' : 'creada'}: ${name}, ${relDay(args.fecha, today)} (faltan ${diffDays(args.fecha, today)} días). La verá en Hoy.`],
  }
}
