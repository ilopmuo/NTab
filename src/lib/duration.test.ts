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
