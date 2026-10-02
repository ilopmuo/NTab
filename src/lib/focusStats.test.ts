import { describe, expect, it } from 'vitest'
import { bestWindow, breakAfter, focusStreak, groupMinutes, lastDays, minutesByDay, minutesByHour, taskFocus, windowLabel } from './focusStats'

const at = (h: number, m = 0) => Date.UTC(2026, 9, 2, h, m)
const clockOf = (ms: number) => new Date(ms).getUTCHours() * 60 + new Date(ms).getUTCMinutes()

describe('foco', () => {
  it('descanso corto tras cada pomodoro y largo cada cuatro', () => {
    expect(breakAfter(1)).toEqual({ phase: 'short', minutes: 5 })
    expect(breakAfter(3)).toEqual({ phase: 'short', minutes: 5 })
    expect(breakAfter(4)).toEqual({ phase: 'long', minutes: 15 })
    expect(breakAfter(8)).toEqual({ phase: 'long', minutes: 15 })
  })

  it('minutos por día y los últimos días', () => {
    const by = minutesByDay([
      { date: '2026-10-01', minutes: 25, endedAt: 0 },
      { date: '2026-10-02', minutes: 25, endedAt: 0 },
      { date: '2026-10-02', minutes: 10, endedAt: 0 },
    ])
    expect(lastDays(by, '2026-10-02', 3)).toEqual([
      { date: '2026-09-30', minutes: 0 },
      { date: '2026-10-01', minutes: 25 },
      { date: '2026-10-02', minutes: 35 },
    ])
  })

  it('racha: hoy cuenta al cumplirlo y, mientras no, sigue la de ayer', () => {
    const by = new Map([
      ['2026-09-25', 120],
      ['2026-09-26', 130],
      ['2026-09-27', 125],
      ['2026-09-30', 120],
      ['2026-10-01', 150],
      ['2026-10-02', 30],
    ])
    expect(focusStreak(by, 120, '2026-10-02')).toEqual({ current: 2, best: 3 })
    by.set('2026-10-02', 121)
    expect(focusStreak(by, 120, '2026-10-02')).toEqual({ current: 3, best: 3 })
    // Sin objetivo: cualquier foco cuenta
    expect(focusStreak(by, 0, '2026-10-02').current).toBe(3)
    expect(focusStreak(new Map(), 60, '2026-10-02')).toEqual({ current: 0, best: 0 })
  })

  it('minutos por hora, repartidos entre las horas que toca cada sesión', () => {
    const hours = minutesByHour([{ date: 'x', minutes: 50, endedAt: at(10, 30) }, { date: 'x', minutes: 25, endedAt: at(23, 50) }], clockOf)
    expect(hours[9]).toBe(20)
    expect(hours[10]).toBe(30)
    expect(hours[23]).toBe(25)
    expect(hours.reduce((a, b) => a + b, 0)).toBe(75)
    // Pasada la medianoche vuelve a la hora 0
    expect(minutesByHour([{ date: 'x', minutes: 30, endedAt: at(0, 10) }], clockOf)[0]).toBe(10)
  })

  it('mejores horas: las dos seguidas con más foco, con historia suficiente', () => {
    const hours = Array(24).fill(0)
    hours[9] = 30
    hours[10] = 90
    hours[11] = 60
    hours[17] = 100
    const w = bestWindow(hours)!
    expect(w).toEqual({ from: 10, to: 12 })
    expect(windowLabel(w)).toBe('de 10 a 12 h')
    expect(bestWindow(Array(24).fill(0).map((_, i) => (i === 10 ? 50 : 0)))).toBeNull()
  })

  it('en qué se va el foco y lo enfocado en una tarea', () => {
    const logs = [
      { date: 'x', minutes: 25, endedAt: 1, taskId: 'a', pomodoro: true },
      { date: 'x', minutes: 10, endedAt: 2, taskId: 'a' },
      { date: 'x', minutes: 50, endedAt: 3, taskId: 'b', pomodoro: true },
    ]
    expect(groupMinutes(logs, (l) => (l.taskId === 'b' ? 'Web' : 'Casa'))).toEqual([
      { key: 'Web', minutes: 50 },
      { key: 'Casa', minutes: 35 },
    ])
    expect(taskFocus(logs, 'a')).toEqual({ minutes: 35, pomodoros: 1 })
  })
})
