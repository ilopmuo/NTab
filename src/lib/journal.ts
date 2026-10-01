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

/**
 * «Tal día como hoy» (como en Day One): lo que escribiste hace un mes y el
 * mismo día de otros años (el 29 de febrero, el 28 en los años que no lo tienen).
 */
export function onThisDay(byDate: Map<string, JournalEntry>, date: string): { label: string; date: string; entry: JournalEntry }[] {
  const [y, m, d] = date.split('-').map(Number)
  const day = (yy: number, mm: number) => {
    const last = new Date(yy, mm, 0).getDate()
    return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
  }
  const prevMonth = m === 1 ? day(y - 1, 12) : day(y, m - 1)
  const out: { label: string; date: string; entry: JournalEntry }[] = []
  const add = (label: string, when: string) => {
    const e = byDate.get(when)
    if (e && hasContent(e)) out.push({ label, date: when, entry: e })
  }
  add('Hace un mes', prevMonth)
  for (let n = 1; n <= 10; n++) add(n === 1 ? 'Hace un año' : `Hace ${n} años`, day(y - n, m))
  return out
}

export interface MoodBooster {
  id: string
  /** ánimo medio los días que se hizo y los que tocaba y no */
  withIt: number
  without: number
  days: number
}

/**
 * «Lo que te sienta bien» (como las estadísticas de Daylio): para cada hábito,
 * el ánimo medio de los días que lo hiciste frente a los días que tocaba y no.
 * Hacen falta al menos `min` días de cada; sale lo que sube el ánimo medio
 * punto o más, de más a menos.
 */
export function moodBoosters(
  byDate: Map<string, JournalEntry>,
  habits: { id: string; done: Set<string>; scheduled: (date: string) => boolean }[],
  today: string,
  days = 90,
  min = 3,
): MoodBooster[] {
  const out: MoodBooster[] = []
  for (const h of habits) {
    const yes: number[] = []
    const no: number[] = []
    for (let i = 1; i <= days; i++) {
      const d = addDaysYmd(today, -i)
      const mood = byDate.get(d)?.mood
      if (!mood) continue
      if (h.done.has(d)) yes.push(mood)
      else if (h.scheduled(d)) no.push(mood)
    }
    if (yes.length < min || no.length < min) continue
    const avg = (l: number[]) => Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 10) / 10
    const withIt = avg(yes)
    const without = avg(no)
    if (withIt - without >= 0.5) out.push({ id: h.id, withIt, without, days: yes.length })
  }
  return out.sort((a, b) => b.withIt - b.without - (a.withIt - a.without))
}
