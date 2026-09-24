import { describe, expect, it } from 'vitest'
import { dayLoad, durationLabel, parseDuration } from './duration'

describe('duración', () => {
  it('etiquetas', () => {
    expect(durationLabel(15)).toBe('15 min')
    expect(durationLabel(60)).toBe('1 h')
    expect(durationLabel(95)).toBe('1 h 35')
  })
  it('lee lo escrito a mano', () => {
    expect(parseDuration('1:30')).toBe(90)
    expect(parseDuration('2 horas')).toBe(120)
    expect(parseDuration('20')).toBe(20)
    expect(parseDuration('mucho')).toBeUndefined()
    expect(parseDuration('0')).toBeUndefined()
  })
  it('carga del día', () => {
    expect(dayLoad([], []).level).toBe('free')
    const l = dayLoad([{ estimate: 60 }, {}, { estimate: 30 }], [60, 30])
    expect(l).toMatchObject({ tasks: 90, events: 90, unestimated: 1, total: 180, level: 'ok' })
    expect(dayLoad([{ estimate: 240 }], [60]).level).toBe('busy')
    expect(dayLoad([{ estimate: 300 }], [120]).level).toBe('over')
  })
})

import { NAG_MAX, nagSlot } from './reminders'

describe('avisos insistentes', () => {
  const at = Date.UTC(2026, 8, 24, 8, 0)
  const min = 60_000
  it('cuenta las repeticiones', () => {
    expect(nagSlot(at, 10, at - min)).toBeNull()
    expect(nagSlot(at, 10, at + 9 * min)).toBeNull()
    expect(nagSlot(at, 10, at + 10 * min)).toEqual({ n: 1, at: at + 10 * min })
    expect(nagSlot(at, 10, at + 35 * min)).toEqual({ n: 3, at: at + 30 * min })
  })
  it('se cansa tras NAG_MAX', () => {
    expect(nagSlot(at, 5, at + NAG_MAX * 5 * min)?.n).toBe(NAG_MAX)
    expect(nagSlot(at, 5, at + (NAG_MAX + 1) * 5 * min)).toBeNull()
  })
})
