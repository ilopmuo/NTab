/**
 * Cuándo: la hora de aviso (HH:MM) y los días de la semana (0 domingo … 6 sábado) tal como los manda Claude, para
 * todas las herramientas con `dias` (hábitos y rutinas): una lista, esa misma
 * lista como texto («[1, 2, 3, 5]», que es como llega a veces), «1,3,5»,
 * «todos», «laborables», «fines de semana», «lunes y jueves» o «L, X, V».
 */
import { WEEKDAYS } from '../_shared/time.ts'
import { perWeekOf } from '../_shared/habits.ts'
import { fold, isHhmm } from './ntab.ts'

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const WORKDAYS = [1, 2, 3, 4, 5]
const WEEKEND = [0, 6]
const DAY_WORDS: Record<string, number[]> = {
  todos: ALL_DAYS,
  'todos los dias': ALL_DAYS,
  'cada dia': ALL_DAYS,
  diario: ALL_DAYS,
  laborables: WORKDAYS,
  'entre semana': WORKDAYS,
  'de lunes a viernes': WORKDAYS,
  'lunes a viernes': WORKDAYS,
  'fines de semana': WEEKEND,
  'fin de semana': WEEKEND,
}
const DAY_NAMES = WEEKDAYS.map(fold)
/** Las letras de la app: L M X J V S D */
const DAY_LETTERS: Record<string, number> = { l: 1, m: 2, x: 3, j: 4, v: 5, s: 6, d: 0 }
/** Lunes primero, como en la app */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const DAYS_HELP = 'usa una lista de 0 (domingo) a 6 (sábado), "todos", "laborables" o "fines de semana"'

/** Un día suelto: 0–6 (número o texto), su nombre («lunes», «los sábados») o su letra */
function oneDay(x: unknown): number | undefined {
  if (typeof x === 'number') return Number.isInteger(x) && x >= 0 && x <= 6 ? x : undefined
  if (typeof x !== 'string') return undefined
  const w = fold(x).replace(/^(?:los|el)\s+/, '')
  if (/^[0-6]$/.test(w)) return Number(w)
  if (w in DAY_LETTERS) return DAY_LETTERS[w]
  const i = DAY_NAMES.indexOf(w)
  return i >= 0 ? i : DAY_NAMES.indexOf(w.replace(/s$/, '')) >= 0 ? DAY_NAMES.indexOf(w.replace(/s$/, '')) : undefined
}

const sorted = (days: number[]) => [...new Set(days)].sort((a, b) => a - b)

/** Días en que toca. Sin `dias` (undefined o null), `{}`: cada herramienta pone su valor por defecto. */
export function parseDays(v: unknown): { days?: number[]; error?: string } {
  if (v === undefined || v === null) return {}
  if (typeof v === 'string') {
    const s = v.trim()
    // La lista convertida en texto: «[1, 2, 3, 5]»
    if (/^\[[\s\S]*\]$/.test(s)) {
      try {
        const list: unknown = JSON.parse(s)
        if (Array.isArray(list)) return parseDays(list)
      } catch {
        // «[lunes, martes]» no es JSON: se lee como texto, sin los corchetes
        return parseDays(s.slice(1, -1))
      }
    }
    const words = fold(s)
    if (DAY_WORDS[words]) return { days: DAY_WORDS[words] }
    // «1,3,5», «lunes, miércoles y viernes», «L X V»
    const parts = words.split(/\s*(?:,|;|\by\b|\be\b)\s*|\s+(?=\d|[lmxjvsd]\b)/).filter(Boolean)
    if (!parts.length) return { error: `Indica al menos un día: ${DAYS_HELP}.` }
    const r = parseDays(parts)
    return r.error ? { error: `No entiendo los días «${v}»: ${DAYS_HELP}.` } : r
  }
  if (Array.isArray(v)) {
    if (!v.length) return { error: `Indica al menos un día: ${DAYS_HELP}.` }
    const days = v.map(oneDay)
    const bad = v.filter((_, i) => days[i] === undefined)
    if (bad.length) return { error: `Los días van del 0 (domingo) al 6 (sábado); no vale ${bad.map((x) => `«${String(x)}»`).join(', ')}. Para varios: [1, 3, 5], "1,3,5", "laborables"…` }
    return { days: sorted(days as number[]) }
  }
  if (typeof v === 'number') return parseDays([v])
  return { error: `No entiendo los días «${String(v)}»: ${DAYS_HELP}.` }
}

/** «todos los días», «laborables», «lunes, miércoles y viernes» o «3 veces por semana» */
export function daysLabel(h: { days: number[]; perWeek?: number }) {
  const n = perWeekOf(h)
  if (n) return `${n} ${n === 1 ? 'vez' : 'veces'} por semana`
  const key = sorted(h.days).join()
  if (key === ALL_DAYS.join()) return 'todos los días'
  if (key === WORKDAYS.join()) return 'laborables'
  if (key === WEEKEND.join()) return 'fines de semana'
  const names = WEEK_ORDER.filter((d) => h.days.includes(d)).map((d) => WEEKDAYS[d])
  return names.length < 2 ? (names[0] ?? 'ningún día') : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`
}

/** El esquema de `dias` para las herramientas */
export const DAYS_SCHEMA = (description: string) => ({
  description: `${description}: lista de números (0 domingo … 6 sábado), p. ej. [1, 3, 5], o "todos", "laborables", "fines de semana".`,
  anyOf: [{ type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } }, { type: 'string' }],
})

/** Hora de aviso HH:MM en 24 h («8:05» → «08:05») */
export function parseTime(v: unknown): { time?: string; error?: string } {
  if (isHhmm(v)) return { time: v.padStart(5, '0') }
  return { error: `La hora «${String(v)}» no vale: usa HH:MM en 24 h (p. ej. 08:30 o 21:00).` }
}
