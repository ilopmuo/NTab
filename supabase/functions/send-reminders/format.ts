/**
 * Texto de las notificaciones. Sin dependencias de Deno para poder probarlo
 * con los tests de la app (src/reminders/format.test.ts).
 */

export interface DueReminder {
  user_id: string
  tbl: 'tasks' | 'subscriptions' | string
  item_id: string
  title: string
  remind_at: string
  due_date: string | null
  due_time: string | null
  amount: number | string | null
  currency: string | null
  /** repetición de un aviso insistente (1, 2…) */
  repeat?: number | null
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
  /** aviso concreto (elemento + momento): si la app abierta ya lo dio, no vuelve a sonar */
  key?: string
  /** para los botones de la notificación (Hecho / Posponer) */
  taskId?: string
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** 'YYYY-MM-DD' de un instante en una zona horaria */
function ymdIn(date: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** "hoy", "mañana", "el viernes 26"… respecto a `now` en la zona horaria del usuario */
export function dayLabel(dueDate: string, now: Date, tz: string) {
  const today = ymdIn(now, tz)
  if (dueDate === today) return 'hoy'
  if (dueDate === addDays(today, 1)) return 'mañana'
  if (dueDate === addDays(today, -1)) return 'ayer'
  const [y, m, d] = dueDate.split('-').map(Number)
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `el ${wd} ${d}`
}

function money(amount: number | string, currency: string | null) {
  const n = typeof amount === 'string' ? Number(amount) : amount
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(n)
  } catch {
    return `${n} ${currency ?? '€'}`
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function buildPayload(r: DueReminder, tz = 'Europe/Madrid', now = new Date()): PushPayload {
  const key = `${r.tbl}-${r.item_id}-${Date.parse(r.remind_at)}`
  const when = r.due_date ? dayLabel(r.due_date, now, tz) : null
  if (r.tbl === 'trackers') {
    // due_date: última vez; currency: cada cuántos días
    const last = r.due_date
    const days = last ? Math.round((Date.parse(ymdIn(now, tz)) - Date.parse(last)) / 864e5) : null
    const every = Number(r.currency) || null
    const body = days === null ? 'Toca hacerlo.' : `La última vez fue hace ${days} ${days === 1 ? 'día' : 'días'}${every ? ` (sueles cada ${every})` : ''}. ¿Toca ya?`
    return { title: r.title, body, url: './#/trackers', tag: `trackers-${r.item_id}`, key }
  }
  if (r.tbl === 'things') {
    // due_date: fecha (caducidad o devolución); due_time: tipo; currency: persona
    const who = r.currency || 'alguien'
    const date = r.due_date ? dayLabel(r.due_date, now, tz) : null
    const body =
      r.due_time === 'lent'
        ? `Se lo prestaste a ${who}. ¿Te lo ha devuelto?`
        : r.due_time === 'borrowed'
          ? `Tienes que devolvérselo a ${who}${date ? ` (${date})` : ''}.`
          : date
            ? `Caduca ${date}. Toca renovarlo.`
            : 'Revisa la fecha de caducidad.'
    return { title: r.title, body, url: './#/things', tag: `things-${r.item_id}`, key }
  }
  if (r.tbl === 'subscriptions') {
    const amount = r.amount != null ? money(r.amount, r.currency) : ''
    return {
      title: r.title,
      body: [amount && `Cargo de ${amount}`, when].filter(Boolean).join(' ') || 'Próximo cargo',
      url: './#/finance',
      tag: `subscriptions-${r.item_id}`,
      key,
    }
  }
  let body = when ? `${cap(when)}${r.due_time ? ` a las ${r.due_time}` : ''}` : r.due_time ? `A las ${r.due_time}` : 'Recordatorio'
  if (r.repeat) body = `Sigue pendiente · ${body.charAt(0).toLowerCase()}${body.slice(1)}`
  return { title: r.title, body, url: `./#/task/${r.item_id}`, tag: `tasks-${r.item_id}`, key, taskId: r.item_id }
}

export interface DueDigest {
  user_id: string
  local_date: string
  tz: string
  today_count: number
  overdue_count: number
  titles: string[] | null
  payments: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Resumen de la mañana: "3 tareas para hoy · 1 atrasada" + las primeras */
export function buildDigest(d: DueDigest, now = new Date()): PushPayload {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: d.tz, hour: '2-digit', hour12: false }).format(now))
  const hello = hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const parts = [
    d.today_count ? plural(d.today_count, 'tarea para hoy', 'tareas para hoy') : '',
    d.overdue_count ? plural(d.overdue_count, 'atrasada', 'atrasadas') : '',
    d.payments ? plural(d.payments, 'pago', 'pagos') : '',
  ].filter(Boolean)
  const titles = (d.titles ?? []).filter(Boolean)
  const total = d.today_count + d.overdue_count
  const list = titles.length ? `\n${titles.join(' · ')}${total > titles.length ? ' …' : ''}` : ''
  return {
    title: `${hello} ☀️`,
    body: parts.length ? `${parts.join(' · ')}${list}` : 'Hoy no tienes nada planificado. Buen día para adelantar algo.',
    // Con cosas atrasadas, directo a planificar el día
    url: d.overdue_count ? './#/plan' : './#/today',
    tag: `digest-${d.local_date}`,
  }
}

export interface DueHabit {
  user_id: string
  habit_id: string
  name: string
  local_date: string
  remind_time: string
}

/** Recordatorio de un hábito que aún no está hecho hoy */
export function buildHabitPayload(h: DueHabit): PushPayload & { habitId: string } {
  return {
    title: h.name,
    body: 'Aún no lo has marcado hoy. ¿Lo haces ahora?',
    url: './#/habits',
    tag: `habits-${h.habit_id}`,
    key: `habits-${h.habit_id}-${h.local_date}`,
    habitId: h.habit_id,
  }
}

export interface DueRoutine {
  user_id: string
  routine_id: string
  name: string
  steps: number
  local_date: string
  remind_time: string
}

export function buildRoutinePayload(x: DueRoutine): PushPayload {
  return {
    title: x.name,
    body: `Es la hora: ${x.steps} ${x.steps === 1 ? 'paso' : 'pasos'}. Toca para hacerla paso a paso.`,
    url: `./#/routine/${x.routine_id}`,
    tag: `routines-${x.routine_id}`,
    key: `routines-${x.routine_id}-${x.local_date}`,
  }
}

export interface DueJournal {
  user_id: string
  local_date: string
  done_today: number
}

export function buildJournalPayload(j: DueJournal): PushPayload {
  return {
    title: '¿Qué tal el día?',
    body: j.done_today ? `Has completado ${j.done_today} ${j.done_today === 1 ? 'tarea' : 'tareas'}. Apunta cómo te ha ido en un minuto.` : 'Apunta cómo te ha ido en un minuto.',
    url: './#/journal',
    tag: 'journal',
    key: `journal-${j.local_date}`,
  }
}
