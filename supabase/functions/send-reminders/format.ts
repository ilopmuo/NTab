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
}

export interface PushPayload {
  title: string
  body: string
  url: string
  tag: string
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
  const when = r.due_date ? dayLabel(r.due_date, now, tz) : null
  if (r.tbl === 'subscriptions') {
    const amount = r.amount != null ? money(r.amount, r.currency) : ''
    return {
      title: r.title,
      body: [amount && `Cargo de ${amount}`, when].filter(Boolean).join(' ') || 'Próximo cargo',
      url: './#/finance',
      tag: `subscriptions-${r.item_id}`,
    }
  }
  const body = when ? `${cap(when)}${r.due_time ? ` a las ${r.due_time}` : ''}` : r.due_time ? `A las ${r.due_time}` : 'Recordatorio'
  return { title: r.title, body, url: `./#/task/${r.item_id}`, tag: `tasks-${r.item_id}` }
}
