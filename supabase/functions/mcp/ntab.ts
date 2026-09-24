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

function taskLine(t: Task, ix: Index, today: string) {
  const where = t.projectId ? ix.projectName(t.projectId) : ix.areaName(t.areaId)
  return [
    `- [${t.id}] ${t.title}`,
    t.dueDate ? ` · ${relDay(t.dueDate, today)} (${t.dueDate})${t.dueTime ? ` a las ${t.dueTime}` : ''}` : ' · sin fecha',
    PRIO[t.priority] ?? '',
    where ? ` · ${where}` : '',
    t.tags?.length ? ` · ${t.tags.map((g) => `#${g}`).join(' ')}` : '',
    t.people?.length ? ` · con ${ix.personNames(t.people).join(', ')}` : '',
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
}

export interface WriteResult {
  /** registros a guardar */
  writes: Row[]
  /** texto para Claude */
  report: string[]
}

const clampPrio = (n: unknown) => (typeof n === 'number' ? Math.max(0, Math.min(3, Math.round(n))) : undefined)
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
