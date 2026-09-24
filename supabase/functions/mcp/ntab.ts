/**
 * Lógica del conector de NTab para Claude, sin dependencias de Deno (se prueba
 * con los tests de la app: src/lib/mcp.test.ts).
 *
 * Trabaja sobre los registros tal y como los guarda la sincronización
 * (tabla `records`: un JSON por registro) y crea o cambia tareas igual que la
 * app: mismo formato, avisos automáticos y tareas que se repiten.
 */
import { WEEKDAYS, addDays, addMonths, diffDays, hhmmIn, longDate, weekStart, weekday, ymdIn, zonedToUtc } from '../_shared/time.ts'
import { expandTemplate, type TemplateItemLike } from '../_shared/templates.ts'
import { AISLES, aisleFor, itemKey, parseItems } from '../_shared/shopping.ts'
import { suggest, type Energy } from '../_shared/suggest.ts'
import { CATEGORIES, categoryFor, money, monthSummary, parseExpense } from '../_shared/expenses.ts'

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
  projectId?: string
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

class Index {
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
    t.dueDate ? ` · ${relDay(t.dueDate, today)} (${t.dueDate})${t.dueTime ? ` a las ${t.dueTime}` : ''}` : ' · sin fecha',
    PRIO[t.priority] ?? '',
    where ? ` · ${where}` : '',
    t.tags?.length ? ` · ${t.tags.map((g) => `#${g}`).join(' ')}` : '',
    t.people?.length ? ` · con ${ix.personNames(t.people).join(', ')}` : '',
    t.estimate ? ` · ~${minutesLabel(t.estimate)}` : '',
    t.nag ? ` · insiste cada ${t.nag} min` : '',
    t.recurrence ? ' · se repite' : '',
    t.subtasks?.length ? ` · subtareas ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : '',
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

/** Resumen de todo NTab para que Claude responda y planifique */
export function buildSummary(rows: Row[], env: Env, calendar?: { events: EventLike[]; names: Record<string, string> }): string {
  const today = ymdIn(env.now, env.tz)
  const ix = new Index(rows)
  const open = ix.tasks.filter((t) => !t.done)
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).sort(byDate)
  const dated = open.filter((t) => t.dueDate && t.dueDate >= today).sort(byDate)
  const undated = open.filter((t) => !t.dueDate).sort((a, b) => b.priority - a.priority || a.order - b.order)
  const doneWeek = ix.tasks.filter((t) => t.done && num(t.completedAt) >= env.now - 7 * 864e5)
  const limit = (list: Task[], n: number) => [...list.slice(0, n).map((t) => taskLine(t, ix, today)), ...(list.length > n ? [`(y ${list.length - n} más: usa buscar_tareas)`] : [])]

  const s: string[] = [
    `HOY: ${longDate(today)} (${today}), son las ${hhmmIn(env.now, env.tz)} (${env.tz}). Semana: del ${weekStart(today)} al ${addDays(weekStart(today), 6)}.`,
    loadLine(open.filter((t) => t.dueDate === today), (calendar?.events ?? []).filter((e) => !e.allDay && ymdIn(Date.parse(e.start), env.tz) === today)),
    ...(calendar ? [`\nEVENTOS DE SUS CALENDARIOS, PRÓXIMOS 7 DÍAS (${calendar.events.length}) — solo lectura:`, ...eventLines(calendar.events, calendar.names, env)] : []),
    `\nATRASADAS (${overdue.length}):`,
    ...limit(overdue, 60),
    `\nCON FECHA (${dated.length}):`,
    ...limit(dated, 120),
    `\nSIN FECHA (${undated.length}):`,
    ...limit(undated, 60),
    `\nCompletadas en los últimos 7 días: ${doneWeek.length}`,
  ]

  const active = ix.projects.filter((p) => p.status === 'active')
  if (active.length) {
    s.push(`\nPROYECTOS ACTIVOS:`)
    for (const p of active) {
      const pt = ix.tasks.filter((t) => t.projectId === p.id)
      s.push(`- ${str(p.name)}: ${pt.filter((t) => !t.done).length} pendientes de ${pt.length}${isYmd(p.deadline) ? ` · límite ${p.deadline}` : ''}`)
    }
  }

  const goals = rows.filter((r) => r.tbl === 'goals' && r.data.status === 'active')
  if (goals.length) {
    s.push(`\nOBJETIVOS:`)
    for (const g of goals) {
      const d = g.data
      let progress: string
      if (d.kind === 'number') progress = `${num(d.current)} de ${num(d.target)}${d.unit ? ` ${str(d.unit)}` : ''}`
      else {
        const linked = ix.projects.filter((p) => p.goalId === g.id)
        const done = linked.filter((p) => p.status === 'done').length
        progress = linked.length ? `${done} de ${linked.length} proyectos terminados` : 'sin proyectos vinculados'
      }
      s.push(`- ${str(d.title)}: ${progress}${isYmd(d.deadline) ? ` · para ${d.deadline}` : ''}`)
    }
  }

  const habits = rows.filter((r) => r.tbl === 'habits' && !r.data.archived && Array.isArray(r.data.days) && (r.data.days as number[]).includes(weekday(today)))
  if (habits.length) {
    const doneIds = new Set(rows.filter((r) => r.tbl === 'habitLogs' && r.data.date === today).map((r) => str(r.data.habitId)))
    s.push(`\nHÁBITOS DE HOY: ${habits.map((h) => `${str(h.data.name)} (${doneIds.has(h.id) ? 'hecho' : 'pendiente'})`).join('; ')}`)
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
    for (const p of payments) s.push(`- ${relDay(str(p.data.nextDate), today)}: ${str(p.data.name)} ${num(p.data.amount)} ${str(p.data.currency) || 'EUR'}${p.data.kind === 'bill' ? ' (recibo, hay que pagarlo)' : ''}`)
  }

  const people: string[] = []
  for (const r of rows.filter((x) => x.tbl === 'people')) {
    const b = str(r.data.birthday)
    const md = b.slice(-5)
    if (/^\d{2}-\d{2}$/.test(md)) {
      let next = `${today.slice(0, 4)}-${md}`
      if (next < today) next = `${Number(today.slice(0, 4)) + 1}-${md}`
      if (diffDays(next, today) <= 14) people.push(`- Cumpleaños de ${str(r.data.name)}: ${relDay(next, today)}`)
    }
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
    return num(r.data.every) > 0 && (!last || diffDays(today, last) >= num(r.data.every))
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
  prioridad?: number
  notas?: string
  proyecto?: string
  etiquetas?: string[]
  subtareas?: string[]
  personas?: string[]
  duracion?: number
  insistir?: number
}

export interface Change {
  id: string
  titulo?: string
  fecha?: string | null
  hora?: string | null
  prioridad?: number
  notas?: string
  proyecto?: string | null
  hecha?: boolean
  duracion?: number | null
  insistir?: number | null
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
    if (project) {
      task.projectId = String(project.id)
      if (project.areaId) task.areaId = String(project.areaId)
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
    task = withReminder(task, env)
    out.writes.push({ tbl: 'tasks', id: task.id, data: task as unknown as Data })
    out.report.push(
      `Creada: ${taskLine(task, ix, today).slice(2)}${n.proyecto && !project ? ` (no encontré el proyecto «${n.proyecto}», queda sin proyecto)` : ''}${who.missing.length ? ` (no encontré a: ${who.missing.join(', ')})` : ''}`,
    )
  })
  if (!out.report.length) out.report.push('No se creó ninguna tarea (faltaban los títulos).')
  return out
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
    if (c.hora === null) delete t.dueTime
    else if (isHhmm(c.hora) && t.dueDate) t.dueTime = normTime(c.hora)
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
  }
  return out
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

export function markHabit(rows: Row[], args: { habito?: string; fecha?: string; hecho?: boolean }, env: Env): WriteResult & { deletes: Row[] } {
  const habits: Data[] = rows.filter((r) => r.tbl === 'habits' && !r.data.archived).map((r) => ({ ...r.data, id: r.id }))
  const habit = findByName(habits, str(args.habito))
  const date = isYmd(args.fecha) ? args.fecha : ymdIn(env.now, env.tz)
  if (!habit) return { writes: [], deletes: [], report: [`No hay ningún hábito que se llame «${str(args.habito)}». Hábitos: ${habits.map((h) => str(h.name)).join(', ') || 'ninguno'}.`] }
  const logs = rows.filter((r) => r.tbl === 'habitLogs' && r.data.habitId === habit.id && r.data.date === date)
  const want = args.hecho !== false
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
    if (g.kind !== 'number') return { writes: [], report: [`«${str(g.title)}» se mide con sus proyectos, no con una cifra.`] }
    next.current = Math.max(0, typeof args.cifra === 'number' ? args.cifra : num(g.current) + (args.sumar ?? 0))
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
  const next: Data = { ...s, nextDate }
  const days = typeof s.notifyDays === 'number' ? s.notifyDays : null
  if (days === null) delete next.remindAt
  else next.remindAt = zonedToUtc(addDays(nextDate, -days), '09:00', env.tz)
  return { writes: [{ tbl: 'subscriptions', id: String(s.id), data: next }], report: [`«${str(s.name)}» pagado. Próximo cargo: ${nextDate}.`] }
}

// ── Plantillas ────────────────────────────────────────────────

export function listTemplates(rows: Row[]): string {
  const tpls = rows.filter((r) => r.tbl === 'templates')
  if (!tpls.length) return 'No hay plantillas. Se crean en NTab → Plantillas (o guardando un proyecto como plantilla).'
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
  if (args.como === 'proyecto') {
    const name = str(args.proyecto).trim() || str(tpl.name)
    const project: Data = { id: env.newId(), name, description: '', status: 'active', color: '#0A84FF', order: env.now, createdAt: env.now }
    writes.push({ tbl: 'projects', id: String(project.id), data: project })
    projectId = String(project.id)
    where = ` en el proyecto nuevo «${name}»`
  } else if (args.proyecto) {
    const p = findByName(ix.projects, args.proyecto)
    if (!p) return { writes: [], report: [`No encontré el proyecto «${args.proyecto}».`] }
    projectId = String(p.id)
    areaId = p.areaId ? String(p.areaId) : undefined
    where = ` en «${str(p.name)}»`
  }
  const items = (Array.isArray(tpl.items) ? tpl.items : []) as TemplateItemLike[]
  const created: Task[] = []
  expandTemplate(items, start).forEach((x, i) => {
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
    task = withReminder(task, env)
    created.push(task)
    writes.push({ tbl: 'tasks', id: task.id, data: task as unknown as Data })
  })
  return {
    writes,
    report: [`Plantilla «${str(tpl.name)}» usada${where}, empezando ${relDay(start, today)} (${start}):`, ...created.map((t) => taskLine(t, ix, today))],
  }
}

// ── Rutinas ───────────────────────────────────────────────────

const DAY_WORDS: Record<string, number[]> = {
  todos: [0, 1, 2, 3, 4, 5, 6],
  laborables: [1, 2, 3, 4, 5],
  'fines de semana': [0, 6],
}

export function createRoutine(rows: Row[], args: { nombre?: string; pasos?: unknown; dias?: unknown; hora?: string }, env: Env): WriteResult {
  const name = str(args.nombre).trim()
  const steps = Array.isArray(args.pasos) ? args.pasos.map((x) => String(x).trim()).filter(Boolean) : []
  if (!name || !steps.length) return { writes: [], report: ['Falta el nombre o los pasos de la rutina.'] }
  const exists = rows.find((r) => r.tbl === 'routines' && !r.data.archived && fold(str(r.data.name)) === fold(name))
  if (exists) return { writes: [], report: [`Ya existe la rutina «${str(exists.data.name)}».`] }
  let days = [0, 1, 2, 3, 4, 5, 6]
  if (Array.isArray(args.dias)) {
    const d = args.dias.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    if (d.length) days = [...new Set(d)]
  } else if (typeof args.dias === 'string' && DAY_WORDS[fold(args.dias)]) days = DAY_WORDS[fold(args.dias)]
  const routine: Data = {
    id: env.newId(),
    name,
    icon: 'list',
    steps: steps.map((title) => ({ id: env.newId(), title })),
    days,
    archived: 0,
    order: env.now,
    createdAt: env.now,
  }
  if (isHhmm(args.hora)) routine.time = normTime(args.hora!)
  return {
    writes: [{ tbl: 'routines', id: String(routine.id), data: routine }],
    report: [`Rutina creada: «${name}» con ${steps.length} pasos${routine.time ? `, aviso a las ${routine.time}` : ''}. La tiene en NTab → Rutinas y en Hoy.`],
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
  if (d.location) parts.push(`está en: ${str(d.location)}`)
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
  if (!all.length) return 'Aún no ha apuntado ninguna cosa en NTab (Cosas).'
  if (!hits.length) return `No hay nada apuntado que coincida con «${str(args.busqueda)}». Cosas apuntadas: ${all.map((r) => str(r.data.name)).slice(0, 40).join(', ')}.`
  return hits.slice(0, 30).map((r) => `- [${r.id}] ${thingLine(r.data, today)}`).join('\n')
}

export function saveThing(
  rows: Row[],
  args: { nombre?: string; tipo?: string; donde?: string; persona?: string; desde?: string; devolver?: string; caduca?: string; avisar_dias?: number; notas?: string },
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
  parts.push(last ? `última vez ${relDay(last, today)} (${last}, hace ${diffDays(today, last)} días)` : 'nunca apuntado')
  if (every) parts.push(`cada ${every} días`)
  if (log.length > 1) parts.push(`${log.length} veces apuntado`)
  return parts.join(' · ')
}

/** Igual que computeTrackerRemindAt de la app, en la zona horaria del usuario */
function trackerRemindAt(d: Data, env: Env): number | undefined {
  const last = (d.log as string[] | undefined)?.[0]
  const every = num(d.every)
  if (!every || !last || d.archived) return undefined
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

export function listShopping(rows: Row[]): string {
  const items = rows.filter((r) => r.tbl === 'shopping' && !r.data.checked)
  if (!items.length) return 'La lista de la compra está vacía.'
  const out: string[] = []
  for (const a of AISLES) {
    const list = items.filter((r) => (r.data.aisle ?? 'otros') === a.id)
    if (list.length) out.push(`${a.label}: ${list.map((r) => `${str(r.data.name)}${r.data.qty ? ` (${str(r.data.qty)})` : ''}`).join(', ')}`)
  }
  return out.join('\n')
}

export function addShopping(rows: Row[], args: { cosas?: unknown }, env: Env): WriteResult {
  const text = Array.isArray(args.cosas) ? args.cosas.map(String).join('\n') : str(args.cosas)
  const parsed = parseItems(text)
  if (!parsed.length) return { writes: [], report: ['No he entendido qué añadir.'] }
  const known = Object.fromEntries(rows.filter((r) => r.tbl === 'pantry').map((r) => [r.id, str(r.data.aisle)]))
  const pending = rows.filter((r) => r.tbl === 'shopping' && !r.data.checked).map((r) => ({ r, key: itemKey(str(r.data.name)) }))
  const writes: Row[] = []
  const added: string[] = []
  const already: string[] = []
  parsed.forEach((it, i) => {
    const key = itemKey(it.name)
    const same = pending.find((p) => p.key === key)
    if (same) {
      already.push(it.name)
      if (it.qty && it.qty !== same.r.data.qty) writes.push({ tbl: 'shopping', id: same.r.id, data: { ...same.r.data, qty: it.qty } })
      return
    }
    const id = env.newId()
    const data: Data = { id, name: it.name, aisle: aisleFor(it.name, known), checked: 0, order: env.now + i, createdAt: env.now }
    if (it.qty) data.qty = it.qty
    writes.push({ tbl: 'shopping', id, data })
    pending.push({ r: { tbl: 'shopping', id, data }, key })
    added.push(`${it.name}${it.qty ? ` (${it.qty})` : ''}`)
  })
  const report = [added.length ? `Añadido a la compra: ${added.join(', ')}.` : 'No había nada nuevo que añadir.']
  if (already.length) report.push(`Ya estaba: ${already.join(', ')}.`)
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

function expenseRows(rows: Row[]) {
  return rows.filter((r) => r.tbl === 'expenses' && typeof r.data.amount === 'number' && isYmd(r.data.date)).map((r) => ({ amount: r.data.amount as number, category: str(r.data.category) || 'otros', date: r.data.date as string, note: str(r.data.note) }))
}
const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Otros'

export function addExpenseTool(rows: Row[], args: { texto?: string; importe?: number; concepto?: string; categoria?: string; fecha?: string }, env: Env): WriteResult {
  const today = ymdIn(env.now, env.tz)
  let amount: number | undefined
  let note = str(args.concepto).trim()
  let date = isYmd(args.fecha) && args.fecha <= today ? args.fecha : today
  if (args.texto) {
    const p = parseExpense(str(args.texto))
    if (p) {
      amount = p.amount
      note = note || p.note
      if (!isYmd(args.fecha)) date = addDays(today, -p.daysAgo)
    }
  }
  if (typeof args.importe === 'number' && args.importe > 0) amount = Math.round(args.importe * 100) / 100
  if (!amount) return { writes: [], report: ['Falta el importe del gasto.'] }
  note = note || 'Gasto'
  const category = CATEGORIES.some((c) => c.id === args.categoria) ? args.categoria! : categoryFor(note)
  const id = env.newId()
  const monthBefore = monthSummary(expenseRows(rows), date.slice(0, 7), today).total
  const budget = num((rows.find((r) => r.tbl === 'settings' && r.id === 'budget')?.data.value as Data | undefined)?.monthly)
  const total = monthBefore + amount
  return {
    writes: [{ tbl: 'expenses', id, data: { id, amount, note: note.charAt(0).toUpperCase() + note.slice(1), category, date, createdAt: env.now } }],
    report: [`Apuntado: ${money(amount)} · ${note} (${catLabel(category)}, ${relDay(date, today)}). Este mes: ${money(total)}${budget ? ` de ${money(budget)}${total > budget ? ' — SE HA PASADO DEL PRESUPUESTO' : ''}` : ''}.`],
  }
}

export function listExpenses(rows: Row[], args: { mes?: string }, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const month = /^\d{4}-\d{2}$/.test(str(args.mes)) ? str(args.mes) : today.slice(0, 7)
  const all = expenseRows(rows)
  const s = monthSummary(all, month, today)
  if (!s.count) return `No hay gastos apuntados en ${month}.`
  const budget = num((rows.find((r) => r.tbl === 'settings' && r.id === 'budget')?.data.value as Data | undefined)?.monthly)
  const lines = [
    `Gastos de ${month}: ${money(s.total)} en ${s.count} gastos${budget ? `, presupuesto ${money(budget)}` : ''}${s.projection > s.total ? `; a este ritmo, ${money(s.projection)} a fin de mes` : ''}.`,
    'Por categoría:',
    ...s.byCategory.map((c) => `- ${catLabel(c.id)}: ${money(c.amount)} (${Math.round((c.amount / s.total) * 100)} %)`),
    'Últimos:',
    ...all
      .filter((e) => e.date.startsWith(month))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((e) => `- ${e.date} ${money(e.amount)} ${e.note}`),
  ]
  return lines.join('\n')
}

// ── Menú ──────────────────────────────────────────────────────

function menuName(rows: Row[], d: Data) {
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
  return { writes, report: ['Menú actualizado:', ...report, 'Con recetas guardadas, en NTab → Menú puede añadir sus ingredientes a la compra en un toque.'] }
}

export function createRecipe(rows: Row[], args: { nombre?: string; ingredientes?: unknown; notas?: string }, env: Env): WriteResult {
  const name = str(args.nombre).trim()
  const ingredients = Array.isArray(args.ingredientes) ? args.ingredientes.map((x) => String(x).trim()).filter(Boolean) : []
  if (!name) return { writes: [], report: ['Falta el nombre de la receta.'] }
  const existing = rows.find((r) => r.tbl === 'recipes' && fold(str(r.data.name)) === fold(name))
  const id = existing?.id ?? env.newId()
  const data: Data = { ...(existing?.data ?? { createdAt: env.now }), id, name, ingredients }
  if (args.notas) data.notes = str(args.notas)
  return { writes: [{ tbl: 'recipes', id, data }], report: [`Receta ${existing ? 'actualizada' : 'guardada'}: ${name} (${ingredients.length} ingredientes).`] }
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
