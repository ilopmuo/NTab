import { describe, expect, it } from 'vitest'
import type { Routine } from '@/db/types'
import { clock, finishAt, minutesLabel, minutesLeft, stepsMinutes } from './routines'

const routine = {
  id: 'r',
  name: 'Mañana',
  icon: 'sun',
  days: [1, 2, 3, 4, 5],
  archived: 0,
  order: 0,
  createdAt: 0,
  steps: [
    { id: 'a', title: 'Ducha', minutes: 10 },
    { id: 'b', title: 'Vestirse', minutes: 5 },
    { id: 'c', title: 'Llaves' },
  ],
} as Routine

describe('rutinas con tiempo por paso (como Routinery)', () => {
  it('suma los minutos y lo que queda', () => {
    expect(stepsMinutes(routine.steps)).toBe(15)
    expect(minutesLeft(routine)).toBe(15)
    expect(minutesLeft(routine, { id: 'x', routineId: 'r', date: '2026-10-01', done: ['a'] })).toBe(5)
  })
  it('a qué hora acabas y etiquetas', () => {
    expect(finishAt(15, new Date(2026, 9, 1, 7, 50))).toBe('8:05')
    expect(minutesLabel(15)).toBe('15 min')
    expect(minutesLabel(70)).toBe('1 h 10 min')
    expect(minutesLabel(120)).toBe('2 h')
    expect(clock(299)).toBe('04:59')
    expect(clock(-3)).toBe('00:00')
  })
})
