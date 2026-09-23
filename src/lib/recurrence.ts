import { addMonths, addYears } from 'date-fns'
import type { Recurrence } from '@/db/types'
import { WEEKDAYS_NAME, addDaysYmd, fromYmd, weekStart, ymd } from './dates'

/** Siguiente fecha estrictamente posterior a `from` según la regla. */
export function nextOccurrence(from: string, r: Recurrence): string {
  const interval = Math.max(1, r.interval || 1)
  switch (r.freq) {
    case 'day':
      return addDaysYmd(from, interval)
    case 'week': {
      if (!r.weekdays || r.weekdays.length === 0) return addDaysYmd(from, 7 * interval)
      const startWeek = weekStart(from)
      for (let i = 1; i <= 7; i++) {
        const cand = addDaysYmd(from, i)
        if (r.weekdays.includes(fromYmd(cand).getDay())) {
          if (interval > 1 && weekStart(cand) !== startWeek) {
            return addDaysYmd(cand, 7 * (interval - 1))
          }
          return cand
        }
      }
      return addDaysYmd(from, 7 * interval)
    }
    case 'month':
      return ymd(addMonths(fromYmd(from), interval))
    case 'year':
      return ymd(addYears(fromYmd(from), interval))
  }
}

/** Primera fecha (incluida `from`) que cumple la regla. */
export function firstOccurrence(from: string, r: Recurrence): string {
  if (r.freq === 'week' && r.weekdays?.length) {
    for (let i = 0; i < 7; i++) {
      const cand = addDaysYmd(from, i)
      if (r.weekdays.includes(fromYmd(cand).getDay())) return cand
    }
  }
  return from
}

function joinEs(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

export function recurrenceLabel(r: Recurrence): string {
  const n = Math.max(1, r.interval || 1)
  if (r.freq === 'week' && r.weekdays?.length) {
    const days = [...r.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    if (days.length === 7) return 'Cada día'
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Días laborables'
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Fines de semana'
    const names = joinEs(days.map((d) => WEEKDAYS_NAME[d]))
    return n > 1 ? `Cada ${n} semanas: ${names}` : `Cada ${names}`
  }
  const unit: Record<Recurrence['freq'], [string, string, string]> = {
    day: ['Cada día', 'días', 'Cada'],
    week: ['Cada semana', 'semanas', 'Cada'],
    month: ['Cada mes', 'meses', 'Cada'],
    year: ['Cada año', 'años', 'Cada'],
  }
  const [one, many] = unit[r.freq]
  return n === 1 ? one : `Cada ${n} ${many}`
}
