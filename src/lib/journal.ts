import type { JournalEntry } from '@/db/types'
import { addDaysYmd } from './dates'

export const MOODS = [
  { value: 1, label: 'Muy mal' },
  { value: 2, label: 'Mal' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Bien' },
  { value: 5, label: 'Muy bien' },
] as const

export const moodLabel = (m?: number) => MOODS.find((x) => x.value === m)?.label

/** ¿Hay algo escrito ese día? (el ánimo o texto) */
export const hasContent = (e?: Pick<JournalEntry, 'mood' | 'text' | 'good'>) => !!e && (!!e.mood || !!e.text.trim() || e.good.some((g) => g.trim()))

/** Días seguidos escribiendo. Hoy sin escribir no rompe la racha. */
export function journalStreak(byDate: Map<string, JournalEntry>, today: string) {
  let d = hasContent(byDate.get(today)) ? today : addDaysYmd(today, -1)
  let n = 0
  while (hasContent(byDate.get(d)) && n < 3650) {
    n++
    d = addDaysYmd(d, -1)
  }
  return n
}

/** Ánimo medio de los últimos `days` días (solo los días con ánimo) */
export function averageMood(byDate: Map<string, JournalEntry>, today: string, days = 30) {
  const vals: number[] = []
  for (let i = 0; i < days; i++) {
    const m = byDate.get(addDaysYmd(today, -i))?.mood
    if (m) vals.push(m)
  }
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : undefined
}

/** Tendencia: la última semana frente a las tres anteriores */
export function moodTrend(byDate: Map<string, JournalEntry>, today: string): 'up' | 'down' | 'flat' | undefined {
  const recent = averageMood(byDate, today, 7)
  const before = averageMood(byDate, addDaysYmd(today, -7), 21)
  if (recent === undefined || before === undefined) return undefined
  return recent - before >= 0.5 ? 'up' : before - recent >= 0.5 ? 'down' : 'flat'
}
