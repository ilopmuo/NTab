/**
 * Fechas en la zona horaria del usuario, sin dependencias (sirve en Deno y en
 * los tests de la app). Las fechas van como 'YYYY-MM-DD' y las horas como 'HH:MM'.
 */

const pad = (n: number) => String(n).padStart(2, '0')

function parts(ms: number, tz: string) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') }
}

/** Desfase (ms) de una zona horaria en un instante */
function tzOffset(ms: number, tz: string) {
  const x = parts(ms, tz)
  return Date.UTC(x.y, x.m - 1, x.d, x.h, x.min, x.s) - Math.floor(ms / 1000) * 1000
}

/** Fecha y hora locales de una zona horaria → instante UTC (ms) */
export function zonedToUtc(ymd: string, hhmm: string, tz: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  const [h, min] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, min)
  const first = guess - tzOffset(guess, tz)
  // Segunda pasada por si el cambio de hora cae justo en medio
  return guess - tzOffset(first, tz)
}

/** 'YYYY-MM-DD' de un instante en una zona horaria */
export function ymdIn(ms: number, tz: string) {
  const x = parts(ms, tz)
  return `${x.y}-${pad(x.m)}-${pad(x.d)}`
}

/** 'HH:MM' de un instante en una zona horaria */
export function hhmmIn(ms: number, tz: string) {
  const x = parts(ms, tz)
  return `${pad(x.h)}:${pad(x.min)}`
}

// Se llaman miles de veces seguidas (rachas, fuerza de los hábitos, calendarios):
// aritmética de días sobre milisegundos UTC, sin trocear ni formatear con Date
const DAY = 864e5
const toMs = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))
const fromMs = (ms: number) => {
  const d = new Date(ms)
  const m = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  return `${d.getUTCFullYear()}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`
}
const fromDate = (d: Date) => fromMs(d.getTime())

export function addDays(ymd: string, n: number) {
  return fromMs(toMs(ymd) + n * DAY)
}

/** Suma meses sin pasarse de fin de mes (31 ene + 1 mes = 28/29 feb) */
export function addMonths(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, last))
  return fromDate(first)
}

/** 0 = domingo … 6 = sábado */
export const weekday = (ymd: string) => (Math.floor(toMs(ymd) / DAY) + 4) % 7

/** Lunes de la semana */
export const weekStart = (ymd: string) => addDays(ymd, -((weekday(ymd) + 6) % 7))

export function diffDays(a: string, b: string) {
  return Math.round((toMs(a) - toMs(b)) / DAY)
}

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "jueves 24 de septiembre de 2026" */
export function longDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${WEEKDAYS[weekday(ymd)]} ${d} de ${MONTHS[m - 1]} de ${y}`
}
