import { describe, expect, it } from 'vitest'
import { milestoneKey, reachedMilestone } from './milestones'

describe('hitos de racha', () => {
  it('se celebra al llegar justo al hito', () => {
    expect(reachedMilestone(6, 7, false)).toMatchObject({ n: 7, title: 'Una semana entera' })
    expect(reachedMilestone(29, 30, false)).toMatchObject({ n: 30 })
    expect(reachedMilestone(364, 365, false)).toMatchObject({ n: 365 })
  })

  it('no se celebra fuera de los hitos ni al bajar', () => {
    expect(reachedMilestone(7, 8, false)).toBeNull()
    expect(reachedMilestone(7, 6, false)).toBeNull()
    expect(reachedMilestone(7, 7, false)).toBeNull()
  })

  it('si la racha salta de golpe más allá del hito (datos que llegan de otro dispositivo), no se celebra', () => {
    expect(reachedMilestone(5, 9, false)).toBeNull()
  })

  it('los hábitos de X veces por semana cuentan semanas', () => {
    expect(reachedMilestone(3, 4, true)).toMatchObject({ n: 4, weekly: true, title: 'Un mes cumpliendo' })
    expect(reachedMilestone(6, 7, true)).toBeNull()
  })

  it('clave por hábito, hito y día', () => {
    expect(milestoneKey('h1', 7, '2026-10-02')).toBe('h1:7:2026-10-02')
  })
})
