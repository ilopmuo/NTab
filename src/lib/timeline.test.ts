import { describe, expect, it } from 'vitest'
import { firstOverlap, snapMove, snapResize } from './schedule'

describe('mover bloques en «Hora a hora»', () => {
  it('se engancha a cuartos de hora', () => {
    expect(snapMove(600, 30, 7)).toBe(600) // 10:00 + 7 min → 10:00
    expect(snapMove(600, 30, 8)).toBe(615) // → 10:15
    expect(snapMove(605, 30, 0)).toBe(600) // 10:05 → 10:00
    expect(snapMove(600, 30, -95)).toBe(510) // → 08:30
  })
  it('no se sale del día', () => {
    expect(snapMove(30, 60, -120)).toBe(0)
    expect(snapMove(1380, 60, 120)).toBe(1380) // 23:00 con 1 h no pasa de medianoche
  })
})

describe('estirar bloques', () => {
  it('cambia la duración en pasos de 15 min', () => {
    expect(snapResize(600, 30, 16)).toBe(45)
    expect(snapResize(600, 30, 50)).toBe(75)
    expect(snapResize(600, 60, -20)).toBe(45)
  })
  it('como mínimo 15 min y hasta medianoche', () => {
    expect(snapResize(600, 30, -200)).toBe(15)
    expect(snapResize(1380, 30, 300)).toBe(60)
  })
  it('respeta el inicio aunque no sea redondo', () => {
    expect(snapResize(605, 30, 0)).toBe(25) // termina a las 10:30
  })
})

describe('solapes', () => {
  const meetings = [{ start: 600, end: 660, title: 'Reunión' }, { start: 720, end: 750, title: 'Comida' }]
  it('encuentra la reunión con la que choca', () => {
    expect(firstOverlap({ start: 630, end: 690 }, meetings)?.title).toBe('Reunión')
    expect(firstOverlap({ start: 700, end: 730 }, meetings)?.title).toBe('Comida')
  })
  it('tocar no es solapar', () => {
    expect(firstOverlap({ start: 660, end: 720 }, meetings)).toBeUndefined()
  })
})
