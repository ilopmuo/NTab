import type { Habit } from '@/db/types'
import { addDaysYmd, fromYmd, ymd } from './dates'

export function isScheduled(h: Habit, date: string) {
  return h.days.includes(fromYmd(date).getDay())
}

/** Días seguidos cumplidos (solo cuentan los días programados). Hoy sin hacer no rompe la racha. */
export function streak(h: Habit, done: Set<string>, ref: string): number {
  let n = 0
  let d = ref
  if (!done.has(d)) d = addDaysYmd(d, -1)
  for (let i = 0; i < 730; i++) {
    if (isScheduled(h, d)) {
      if (done.has(d)) n++
      else break
    }
    d = addDaysYmd(d, -1)
  }
  return n
}

/** % de días programados cumplidos en los últimos `days` días */
export function completionRate(h: Habit, done: Set<string>, ref: string, days = 30): number {
  // No contar los días anteriores a empezar con el hábito
  let since = ymd(new Date(h.createdAt))
  for (const d of done) if (d < since) since = d
  let scheduled = 0
  let hit = 0
  for (let i = 0; i < days; i++) {
    const d = addDaysYmd(ref, -i)
    if (d < since) break
    if (!isScheduled(h, d)) continue
    scheduled++
    if (done.has(d)) hit++
  }
  return scheduled ? hit / scheduled : 0
}
