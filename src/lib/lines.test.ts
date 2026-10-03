import { describe, expect, it } from 'vitest'
import { listLines } from './lines'

describe('listas pegadas', () => {
  it('quita viñetas, números y casillas; guarda la sangría y lo hecho', () => {
    expect(listLines('- Comprar pan\n* Llamar a Ana mañana\n\n1. Uno\n2) Dos\n• Tres\n- [ ] Pendiente\n- [x] Hecha\n  - Subtarea\n\tOtra sub\n☐ Caja\n✓ Ya')).toEqual([
      { text: 'Comprar pan', done: false, depth: 0 },
      { text: 'Llamar a Ana mañana', done: false, depth: 0 },
      { text: 'Uno', done: false, depth: 0 },
      { text: 'Dos', done: false, depth: 0 },
      { text: 'Tres', done: false, depth: 0 },
      { text: 'Pendiente', done: false, depth: 0 },
      { text: 'Hecha', done: true, depth: 0 },
      { text: 'Subtarea', done: false, depth: 1 },
      { text: 'Otra sub', done: false, depth: 1 },
      { text: 'Caja', done: false, depth: 0 },
      { text: 'Ya', done: true, depth: 0 },
    ])
  })
  it('lo que no es viñeta se queda como está', () => {
    expect(listLines('-5 € de multa\n2026 es el año')).toEqual([
      { text: '-5 € de multa', done: false, depth: 0 },
      { text: '2026 es el año', done: false, depth: 0 },
    ])
  })
})
