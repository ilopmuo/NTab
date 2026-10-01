import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/db/types'
import { averageMood, journalStreak, moodBoosters, moodTrend, onThisDay } from './journal'
import { addDaysYmd } from './dates'

const e = (id: string, mood?: number, text = ''): [string, JournalEntry] => [id, { id, mood, text, good: [], updatedAt: 0 }]

describe('diario', () => {
  it('racha: hoy sin escribir no la rompe', () => {
    const m = new Map([e('2026-09-21', 3), e('2026-09-22', undefined, 'algo'), e('2026-09-23', 4)])
    expect(journalStreak(m, '2026-09-24')).toBe(3)
    expect(journalStreak(new Map([...m, e('2026-09-24', 5)]), '2026-09-24')).toBe(4)
    expect(journalStreak(new Map([e('2026-09-20', 3)]), '2026-09-24')).toBe(0)
  })
  it('media y tendencia', () => {
    const m = new Map([e('2026-09-24', 5), e('2026-09-23', 4), e('2026-09-10', 2), e('2026-09-05', 2)])
    expect(averageMood(m, '2026-09-24', 7)).toBe(4.5)
    expect(averageMood(m, '2026-09-24', 30)).toBe(3.3)
    expect(moodTrend(m, '2026-09-24')).toBe('up')
  })
})

describe('tal día como hoy y lo que te sienta bien', () => {
  const entry = (id: string, mood?: number, text = '') => ({ id, mood, text, good: [], updatedAt: 0 })
  it('hace un mes y otros años, solo si hay algo escrito', () => {
    const byDate = new Map([entry('2026-09-01', 4), entry('2025-10-01', undefined, 'Primer día en el trabajo nuevo'), entry('2024-10-01'), entry('2023-10-01', 2)].map((e) => [e.id, e]))
    expect(onThisDay(byDate, '2026-10-01').map((x) => [x.label, x.date])).toEqual([
      ['Hace un mes', '2026-09-01'],
      ['Hace un año', '2025-10-01'],
      ['Hace 3 años', '2023-10-01'],
    ])
    // 31 de marzo → 28 o 29 de febrero
    const leap = new Map([entry('2026-02-28', 3)].map((e) => [e.id, e]))
    expect(onThisDay(leap, '2026-03-31')[0].date).toBe('2026-02-28')
  })
  it('compara el ánimo de los días con y sin cada hábito', () => {
    const T = '2026-10-01'
    const days = Array.from({ length: 10 }, (_, i) => addDaysYmd(T, -(i + 1)))
    // Los días pares (5) haces deporte y estás bien (4); los impares, regular (2)
    const byDate = new Map(days.map((d, i) => entry(d, i % 2 ? 2 : 4)).map((e) => [e.id, e]))
    const sport = { id: 'sport', done: new Set(days.filter((_, i) => i % 2 === 0)), scheduled: () => true }
    const water = { id: 'water', done: new Set(days), scheduled: () => true }
    const r = moodBoosters(byDate, [sport, water], T)
    expect(r).toEqual([{ id: 'sport', withIt: 4, without: 2, days: 5 }])
  })
})
