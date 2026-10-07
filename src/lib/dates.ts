import { addDays, differenceInCalendarDays, isValid, parse, startOfWeek } from 'date-fns'

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

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DAYS3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Lo que la app usa de `format` de date-fns con el español (d, dd, M…MMMM,
 * yy, yyyy, E…EEEEEE y 'texto'), igual que date-fns pero sin traer su
 * formateador al arranque (unos 12 KB). Lo comprueba dates.test.ts.
 */
export function formatEs(date: Date, pattern: string): string {
  return pattern.replace(/'([^']*)'|d{1,2}|M{1,4}|y+|E{1,6}/g, (t: string, lit: string | undefined) => {
    if (lit !== undefined) return lit || "'"
    const day = date.getDay()
    const month = date.getMonth()
    switch (t[0]) {
      case 'd':
        return t.length === 2 ? pad2(date.getDate()) : String(date.getDate())
      case 'M':
        return t.length === 1 ? String(month + 1) : t.length === 2 ? pad2(month + 1) : t.length === 3 ? MONTHS[month].slice(0, 3) : MONTHS[month]
      case 'y':
        return t.length === 2 ? String(date.getFullYear()).slice(-2) : String(date.getFullYear())
      default:
        return t.length <= 3 ? DAYS3[day] : t.length === 4 ? DAYS[day] : t.length === 5 ? DAYS[day][0] : DAYS3[day].slice(0, 2)
    }
  })
}

export function fmt(s: string, pattern: string): string {
  return formatEs(fromYmd(s), pattern)
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
