/**
 * Calendario de NTab en formato iCalendar (RFC 5545), para suscribirse desde
 * Calendario de Apple, Google Calendar u Outlook. Sin dependencias de Deno para
 * poder probarlo con los tests de la app (src/lib/ics.test.ts).
 */
import { addDays, ymdIn, zonedToUtc } from '../_shared/time.ts'

export { zonedToUtc }

export interface IcsTask {
  id: string
  title: string
  notes?: string
  dueDate?: string
  dueTime?: string
  priority?: number
  projectName?: string
}

export interface IcsPayment {
  id: string
  name: string
  amount: number
  currency?: string
  nextDate: string
}

export interface IcsBirthday {
  id: string
  name: string
  /** MM-DD o YYYY-MM-DD */
  birthday: string
}

export interface IcsInput {
  tz: string
  appUrl?: string | null
  tasks: IcsTask[]
  payments: IcsPayment[]
  birthdays: IcsBirthday[]
  now?: Date
}

const TASK_MINUTES = 30

export function escapeText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Líneas de más de 75 octetos se parten con CRLF + espacio */
export function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      size = 0
    }
    cur += ch
    size += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')

function utcStamp(ms: number) {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

const dateValue = (ymd: string) => ymd.replace(/-/g, '')

function nextDay(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

function event(lines: (string | false | null | undefined)[]) {
  return ['BEGIN:VEVENT', ...lines.filter((l): l is string => !!l), 'END:VEVENT']
}

function money(amount: number, currency = 'EUR') {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export function buildCalendar(input: IcsInput): string {
  const stamp = utcStamp((input.now ?? new Date()).getTime())
  const base = input.appUrl ? input.appUrl.replace(/#.*$/, '').replace(/\/?$/, '/') : null
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NTab//Calendario//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:NTab',
    `X-WR-TIMEZONE:${input.tz}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ]

  for (const t of input.tasks) {
    if (!t.dueDate) continue
    const desc = [t.projectName && `Proyecto: ${t.projectName}`, t.notes?.trim()].filter(Boolean).join('\n')
    let when: string[]
    if (t.dueTime) {
      const start = zonedToUtc(t.dueDate, t.dueTime, input.tz)
      when = [`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(start + TASK_MINUTES * 60_000)}`]
    } else {
      when = [`DTSTART;VALUE=DATE:${dateValue(t.dueDate)}`, `DTEND;VALUE=DATE:${dateValue(nextDay(t.dueDate))}`]
    }
    lines.push(
      ...event([
        `UID:task-${t.id}@ntab`,
        `DTSTAMP:${stamp}`,
        ...when,
        `SUMMARY:${escapeText(t.title)}`,
        desc && `DESCRIPTION:${escapeText(desc)}`,
        t.priority === 3 && 'PRIORITY:1',
        base && `URL:${base}#/task/${encodeURIComponent(t.id)}`,
        'TRANSP:TRANSPARENT',
      ]),
    )
  }

  for (const p of input.payments) {
    lines.push(
      ...event([
        `UID:payment-${p.id}-${p.nextDate}@ntab`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateValue(p.nextDate)}`,
        `DTEND;VALUE=DATE:${dateValue(nextDay(p.nextDate))}`,
        `SUMMARY:${escapeText(`💳 ${p.name} · ${money(p.amount, p.currency)}`)}`,
        base && `URL:${base}#/finance`,
        'TRANSP:TRANSPARENT',
      ]),
    )
  }

  for (const b of input.birthdays) {
    const md = b.birthday.slice(-5)
    if (!/^\d{2}-\d{2}$/.test(md)) continue
    const year = /^\d{4}-/.test(b.birthday) ? b.birthday.slice(0, 4) : '2000'
    const start = `${year}-${md}`
    lines.push(
      ...event([
        `UID:birthday-${b.id}@ntab`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateValue(start)}`,
        `DTEND;VALUE=DATE:${dateValue(nextDay(start))}`,
        'RRULE:FREQ=YEARLY',
        `SUMMARY:${escapeText(`🎂 Cumpleaños de ${b.name}`)}`,
        base && `URL:${base}#/people/${encodeURIComponent(b.id)}`,
        'TRANSP:TRANSPARENT',
      ]),
    )
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

// ── Versión JSON (para el script de Google Calendar) ──────────

/** Evento listo para copiar a otro calendario */
export interface FeedEvent {
  uid: string
  title: string
  allDay: boolean
  /** YYYY-MM-DD (todo el día) o ISO en UTC */
  start: string
  end: string
  description: string
  /** huella del contenido: si no cambia, no hace falta tocar el evento */
  hash: string
}

function hash(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function feedEvent(e: Omit<FeedEvent, 'hash'>): FeedEvent {
  return { ...e, hash: hash([e.title, e.allDay, e.start, e.end, e.description].join('|')) }
}

/**
 * Los mismos eventos que el .ics, como lista. Los cumpleaños van como días
 * sueltos (este año y el siguiente) en vez de una regla de repetición.
 */
export function buildEvents(input: IcsInput): FeedEvent[] {
  const now = (input.now ?? new Date()).getTime()
  const today = ymdIn(now, input.tz)
  const base = input.appUrl ? input.appUrl.replace(/#.*$/, '').replace(/\/?$/, '/') : null
  const link = (path: string) => (base ? `Abrir en NTab: ${base}#${path}` : '')
  const out: FeedEvent[] = []

  for (const t of input.tasks) {
    if (!t.dueDate) continue
    const description = [t.projectName && `Proyecto: ${t.projectName}`, t.notes?.trim(), link(`/task/${encodeURIComponent(t.id)}`)].filter(Boolean).join('\n\n')
    if (t.dueTime) {
      const start = zonedToUtc(t.dueDate, t.dueTime, input.tz)
      out.push(feedEvent({ uid: `task-${t.id}`, title: t.title, allDay: false, start: new Date(start).toISOString(), end: new Date(start + TASK_MINUTES * 60_000).toISOString(), description }))
    } else {
      out.push(feedEvent({ uid: `task-${t.id}`, title: t.title, allDay: true, start: t.dueDate, end: nextDay(t.dueDate), description }))
    }
  }

  for (const p of input.payments) {
    out.push(
      feedEvent({
        uid: `payment-${p.id}-${p.nextDate}`,
        title: `💳 ${p.name} · ${money(p.amount, p.currency)}`,
        allDay: true,
        start: p.nextDate,
        end: nextDay(p.nextDate),
        description: link('/finance'),
      }),
    )
  }

  const year = Number(today.slice(0, 4))
  for (const b of input.birthdays) {
    const md = b.birthday.slice(-5)
    if (!/^\d{2}-\d{2}$/.test(md)) continue
    for (const y of [year, year + 1]) {
      const date = `${y}-${md}`
      // 29 de febrero en años no bisiestos: el 28
      const valid = new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date ? date : `${y}-02-28`
      if (valid < addDays(today, -7)) continue
      out.push(
        feedEvent({
          uid: `birthday-${b.id}-${y}`,
          title: `🎂 Cumpleaños de ${b.name}`,
          allDay: true,
          start: valid,
          end: nextDay(valid),
          description: link(`/people/${encodeURIComponent(b.id)}`),
        }),
      )
    }
  }
  return out
}
