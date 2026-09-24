import { describe, expect, it } from 'vitest'
import type { Habit } from '@/db/types'
import { formatMinutes, weekStats } from './stats'

const at = (ymd: string, h = 12) => new Date(`${ymd}T${String(h).padStart(2, '0')}:00:00`).getTime()
const today = '2026-09-24' // jueves

describe('tu semana', () => {
  it('cuenta tareas, foco, hábitos y racha', () => {
    const tasks = [
      { done: 1 as const, completedAt: at('2026-09-24') },
      { done: 1 as const, completedAt: at('2026-09-24', 9) },
      { done: 1 as const, completedAt: at('2026-09-23') },
      { done: 1 as const, completedAt: at('2026-09-22') },
      { done: 1 as const, completedAt: at('2026-09-19') },
      { done: 1 as const, completedAt: at('2026-09-15') }, // semana anterior
      { done: 0 as const, completedAt: undefined },
    ]
    const habit: Habit = { id: 'h', name: 'Correr', icon: 'flame', color: '', days: [1, 3, 5], archived: 0, order: 0, createdAt: at('2026-09-01') }
    const s = weekStats({
      tasks,
      focus: [
        { date: '2026-09-24', minutes: 25 },
        { date: '2026-09-23', minutes: 50 },
        { date: '2026-09-10', minutes: 99 },
      ],
      habits: [habit],
      // L 21, X 23 programados (V 18 queda fuera de los 7 días: 18..24); hecho el lunes
      logs: [{ habitId: 'h', date: '2026-09-21' }],
      today,
    })
    expect(s.days.map((d) => d.date)).toEqual(['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'])
    expect(s.days.map((d) => d.done)).toEqual([0, 1, 0, 0, 1, 1, 2])
    expect(s.done).toBe(5)
    expect(s.donePrev).toBe(1)
    expect(s.focusMin).toBe(75)
    // Programado: V 18, L 21, X 23 → 1 de 3
    expect(s.habitRate).toBeCloseTo(1 / 3)
    expect(s.streak).toBe(3)
    expect(s.best?.date).toBe('2026-09-24')
  })

  it('sin actividad', () => {
    const s = weekStats({ tasks: [], focus: [], habits: [], logs: [], today })
    expect(s).toMatchObject({ done: 0, focusMin: 0, habitRate: null, streak: 0, best: undefined })
  })

  it('minutos legibles', () => {
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(120)).toBe('2 h')
    expect(formatMinutes(200)).toBe('3 h 20 min')
  })
})
