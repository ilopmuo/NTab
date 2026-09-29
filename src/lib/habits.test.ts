import { describe, expect, it } from 'vitest'
import { completionRate, doneDays, groupLogs, isDue, isScheduled, progressLabel, streak, weekDone } from './habits'

// Miércoles, 30 de septiembre de 2026 (la semana empieza el lunes 28)
const T = '2026-09-30'
const created = new Date(2026, 5, 1).getTime()
const daily = { days: [0, 1, 2, 3, 4, 5, 6], createdAt: created, target: 1 }
const water = { ...daily, target: 8, unit: 'vasos' }
const gym = { days: [], perWeek: 3, createdAt: created }

describe('hábitos con cantidad', () => {
  const counts = groupLogs([
    { habitId: 'w', date: '2026-09-29', count: 8 },
    { habitId: 'w', date: '2026-09-30', count: 3 },
    { habitId: 'w', date: '2026-09-28', count: 5 },
    { habitId: 'w', date: '2026-09-28', count: 4 }, // dos registros el mismo día se suman
    { habitId: 'x', date: '2026-09-30' },
  ])
  it('solo cuenta como hecho al llegar al objetivo', () => {
    expect([...doneDays(water, counts.get('w'))].sort()).toEqual(['2026-09-28', '2026-09-29'])
    expect([...doneDays(daily, counts.get('x'))]).toEqual(['2026-09-30'])
  })
  it('progreso', () => {
    const w = counts.get('w')!
    expect(progressLabel(water, w, doneDays(water, w), T)).toBe('3/8 vasos')
    expect(progressLabel(daily, undefined, new Set(), T)).toBe('')
  })
  it('la racha no se rompe por el día en curso', () => {
    expect(streak(water, doneDays(water, counts.get('w')), T)).toBe(2)
  })
})

describe('hábitos por semana', () => {
  it('vale cualquier día', () => {
    expect(isScheduled(gym, '2026-10-04')).toBe(true)
  })
  it('toca mientras no se llegue esta semana', () => {
    const done = new Set(['2026-09-28', '2026-09-29'])
    expect(weekDone(done, T)).toBe(2)
    expect(isDue(gym, done, T)).toBe(true)
    const three = new Set([...done, '2026-09-30'])
    expect(isDue(gym, three, T)).toBe(true) // hecho hoy: se sigue viendo
    expect(isDue(gym, three, '2026-10-01')).toBe(false) // ya cumplida
    expect(isDue(gym, three, '2026-10-05')).toBe(true) // semana nueva
  })
  it('racha en semanas: la actual solo suma si ya se cumplió', () => {
    const done = new Set([
      // semana del 14: 3
      '2026-09-14', '2026-09-16', '2026-09-18',
      // semana del 21: 4
      '2026-09-21', '2026-09-22', '2026-09-24', '2026-09-26',
      // esta semana: 1
      '2026-09-28',
    ])
    expect(streak(gym, done, T)).toBe(2)
    expect(streak(gym, new Set([...done, '2026-09-29', '2026-09-30']), T)).toBe(3)
    // semana del 7 sin cumplir: corta
    expect(streak(gym, new Set([...done, '2026-09-07']), T)).toBe(2)
  })
  it('cumplimiento por semanas, sin castigar la semana en curso', () => {
    const done = new Set(['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-28'])
    // semanas completas: 7 (0), 14 (3), 21 (1) → 4 de 9; la del 28 aún no cuenta
    expect(completionRate(gym, done, T, 28)).toBeCloseTo(4 / 9)
  })
})

describe('hábitos de días fijos (como siempre)', () => {
  it('días programados', () => {
    const mwf = { days: [1, 3, 5], createdAt: created }
    expect(isScheduled(mwf, T)).toBe(true)
    expect(isScheduled(mwf, '2026-09-29')).toBe(false)
    expect(isDue(mwf, new Set(), '2026-09-29')).toBe(false)
    expect(streak(mwf, new Set(['2026-09-25', '2026-09-28']), T)).toBe(2)
  })
})
