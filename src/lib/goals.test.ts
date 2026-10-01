import { describe, expect, it } from 'vitest'
import { goalChange, logGoal } from './goals'

describe('historial de objetivos', () => {
  it('una cifra por día, en orden y con tope', () => {
    let log = logGoal(undefined, '2026-09-20', 1)
    log = logGoal(log, '2026-09-22', 3)
    log = logGoal(log, '2026-09-22', 4)
    log = logGoal(log, '2026-09-21', 2)
    expect(log).toEqual([
      { date: '2026-09-20', value: 1 },
      { date: '2026-09-21', value: 2 },
      { date: '2026-09-22', value: 4 },
    ])
    expect(logGoal(log, '2026-09-23', 5, 2).map((p) => p.date)).toEqual(['2026-09-22', '2026-09-23'])
  })

  it('cuánto ha cambiado desde una fecha', () => {
    const log = [
      { date: '2026-09-01', value: 2 },
      { date: '2026-09-20', value: 5 },
      { date: '2026-09-30', value: 9 },
    ]
    expect(goalChange(log, '2026-09-24')).toBe(4)
    expect(goalChange(log, '2026-08-01')).toBe(7)
    expect(goalChange([], '2026-09-24')).toBeUndefined()
  })
})
