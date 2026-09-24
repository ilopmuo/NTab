import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/db/types'
import { averageMood, journalStreak, moodTrend } from './journal'

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
