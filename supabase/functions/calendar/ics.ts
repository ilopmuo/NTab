/**
 * Calendario de NTab en formato iCalendar (RFC 5545), para suscribirse desde
 * Calendario de Apple, Google Calendar u Outlook. Sin dependencias de Deno para
 * poder probarlo con los tests de la app (src/lib/ics.test.ts).
 */
import { zonedToUtc } from '../_shared/time.ts'

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
