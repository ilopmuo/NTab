import { describe, expect, it } from 'vitest'
import { dayAt, dropStart, minuteAt, type GridBox } from './weekGrid'

const g: GridBox = { left: 100, top: 200, width: 748, gutter: 48, days: 7, startHour: 7, hourPx: 48 }

describe('semana por horas', () => {
  it('de la x al día', () => {
    expect(dayAt(150, g)).toBe(0)
    expect(dayAt(100 + 48 + 100 * 3 + 50, g)).toBe(3)
    expect(dayAt(2000, g)).toBe(6)
    expect(dayAt(0, g)).toBe(0)
  })
  it('de la y a la hora', () => {
    expect(minuteAt(200, g)).toBe(7 * 60)
    expect(minuteAt(200 + 48 * 2.5, g)).toBe(9 * 60 + 30)
    expect(minuteAt(200 + 48 * 2.5 + 10, g, 30)).toBe(9 * 60 + 30)
    expect(minuteAt(-500, g)).toBe(0)
  })
  it('al soltar un bloque, sin salirse del día', () => {
    // Cogido 15 min por debajo de su inicio, soltado a las 10:20 → empieza a las 10:00 (en cuartos)
    expect(dropStart(200 + 48 * (3 + 20 / 60), g, 15, 60)).toBe(10 * 60)
    expect(dropStart(200 + 48 * 20, g, 0, 90)).toBe(24 * 60 - 90)
  })
})
