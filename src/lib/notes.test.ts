import { describe, expect, it } from 'vitest'
import { groupNotes, noteGroup } from './notes'

const at = (s: string) => new Date(`${s}T12:00:00`).getTime()

describe('grupos de notas', () => {
  const ref = '2026-10-01'
  it('hoy, ayer, 7 y 30 días y por mes', () => {
    expect(noteGroup(at('2026-10-01'), ref)).toBe('Hoy')
    expect(noteGroup(at('2026-09-30'), ref)).toBe('Ayer')
    expect(noteGroup(at('2026-09-25'), ref)).toBe('Últimos 7 días')
    expect(noteGroup(at('2026-09-10'), ref)).toBe('Últimos 30 días')
    expect(noteGroup(at('2026-07-04'), ref)).toBe('Julio')
    expect(noteGroup(at('2025-12-24'), ref)).toBe('Diciembre 2025')
  })
  it('las fijadas van aparte y primero', () => {
    const notes = [
      { id: 'a', pinned: 1, updatedAt: at('2026-05-01') },
      { id: 'b', pinned: 0, updatedAt: at('2026-10-01') },
      { id: 'c', pinned: 0, updatedAt: at('2026-10-01') },
      { id: 'd', pinned: 0, updatedAt: at('2026-06-01') },
    ]
    expect(groupNotes(notes, ref).map((g) => [g.title, g.items.map((n) => n.id).join('')])).toEqual([
      ['Fijadas', 'a'],
      ['Hoy', 'bc'],
      ['Junio', 'd'],
    ])
  })
})
