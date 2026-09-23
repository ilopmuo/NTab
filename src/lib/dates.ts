import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parse,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'

/** Fecha local → 'YYYY-MM-DD' */
export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 'YYYY-MM-DD' → Date local a medianoche */
export function fromYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isYmd(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parse(s, 'yyyy-MM-dd', new Date()))
}

export function today(): string {
  return ymd(new Date())
}

export function addDaysYmd(s: string, n: number): string {
  return ymd(addDays(fromYmd(s), n))
}

export function diffDays(a: string, b: string): number {
  return differenceInCalendarDays(fromYmd(a), fromYmd(b))
}

export function weekStart(s: string): string {
  return ymd(startOfWeek(fromYmd(s), { weekStartsOn: 1 }))
}

export function fmt(s: string, pattern: string): string {
  return format(fromYmd(s), pattern, { locale: es })
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Etiqueta corta y humana para una fecha: Hoy, Mañana, Ayer, Lunes, 12 oct… */
export function dateLabel(s: string, ref: string = today()): string {
  const d = diffDays(s, ref)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d === -1) return 'Ayer'
  if (d > 1 && d < 7) return capitalize(fmt(s, 'EEEE'))
  const sameYear = s.slice(0, 4) === ref.slice(0, 4)
  return fmt(s, sameYear ? 'd MMM' : 'd MMM yyyy')
}

/** Etiqueta larga: "Lunes, 23 de septiembre" */
export function longDateLabel(s: string): string {
  return capitalize(fmt(s, "EEEE, d 'de' MMMM"))
}

export function relativeDays(s: string, ref: string = today()): string {
  const d = diffDays(s, ref)
  if (d === 0) return 'hoy'
  if (d === 1) return 'mañana'
  if (d === -1) return 'ayer'
  if (d > 0) return `en ${d} días`
  return `hace ${-d} días`
}

export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 6) return 'Buenas noches'
  if (h < 14) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

export const WEEKDAYS_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
export const WEEKDAYS_NAME = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
/** Orden de visualización empezando en lunes */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
