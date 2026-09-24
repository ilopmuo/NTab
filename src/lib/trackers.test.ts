import { describe, expect, it } from 'vitest'
import { averageEvery, computeTrackerRemindAt, everyLabel, sinceLabel, trackerState, withDate } from './trackers'

describe('última vez', () => {
  it('historial sin repetir y ordenado', () => {
    expect(withDate(['2026-09-10', '2026-08-01'], '2026-09-20')).toEqual(['2026-09-20', '2026-09-10', '2026-08-01'])
    expect(withDate(['2026-09-10'], '2026-09-10')).toEqual(['2026-09-10'])
    expect(withDate(['2026-09-20'], '2026-09-01')).toEqual(['2026-09-20', '2026-09-01'])
  })
  it('estado: nunca, al día y toca', () => {
    expect(trackerState({ log: [] }, '2026-09-24')).toEqual({ kind: 'never' })
    expect(trackerState({ log: ['2026-09-20'] }, '2026-09-24')).toEqual({ kind: 'ok', since: 4 })
    expect(trackerState({ log: ['2026-09-20'], every: 14 }, '2026-09-24')).toEqual({ kind: 'ok', since: 4, nextIn: 10 })
    expect(trackerState({ log: ['2026-09-01'], every: 14 }, '2026-09-24')).toEqual({ kind: 'due', since: 23, late: 9 })
  })
  it('media y textos', () => {
    expect(averageEvery({ log: ['2026-09-21', '2026-09-07', '2026-08-24'] })).toBe(14)
    expect(averageEvery({ log: ['2026-09-21'] })).toBeUndefined()
    expect(sinceLabel(0)).toBe('Hoy')
    expect(sinceLabel(20)).toBe('Hace 3 semanas')
    expect(sinceLabel(400)).toBe('Hace 1 año')
    expect(everyLabel(14)).toBe('cada 2 semanas')
    expect(everyLabel(90)).toBe('cada 3 meses')
  })
  it('aviso el día que toca a las 10:00', () => {
    const now = new Date(2026, 8, 24, 12).getTime()
    expect(computeTrackerRemindAt({ log: ['2026-09-20'], every: 14, archived: 0 }, now)).toBe(new Date(2026, 9, 4, 10).getTime())
    // Ya toca: mañana a las 10:00
    expect(computeTrackerRemindAt({ log: ['2026-09-01'], every: 14, archived: 0 }, now)).toBe(new Date(2026, 8, 25, 10).getTime())
    expect(computeTrackerRemindAt({ log: ['2026-09-01'], archived: 0 }, now)).toBeUndefined()
  })
})
