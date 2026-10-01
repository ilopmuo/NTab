import { describe, expect, it } from 'vitest'
import { allNoteTags, backlinks, findNote, groupNotes, noteGroup, noteLinks, noteTags, renameLinks, suggestLink } from './notes'

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

describe('notas enlazadas', () => {
  const notes = [
    { id: '1', title: 'Recetas', content: 'Ver [[Lista de la compra]] y [[lista de la COMPRA]]. #cocina' },
    { id: '2', title: 'Lista de la compra', content: '- Pan\n- Leche #casa #cocina' },
    { id: '3', title: 'Menú', content: 'Lunes: lentejas\nIdeas en [[Recetas]] y [[Recétas]]' },
  ]
  it('lee los [[enlaces]] y las #etiquetas', () => {
    expect(noteLinks(notes[0].content)).toEqual(['Lista de la compra'])
    expect(noteLinks('nada [[ ]] ni [[a\nb]]')).toEqual([])
    expect(noteTags('# Título\n#Casa y #casa, (#viaje/2026) #1 email@x.com #fin-')).toEqual(['casa', 'viaje/2026', 'fin'])
    expect(allNoteTags(notes)).toEqual(['cocina', 'casa'])
  })
  it('encuentra la nota enlazada y quién la menciona', () => {
    expect(findNote(notes, 'lista de la compra')?.id).toBe('2')
    expect(findNote(notes, 'recetas ')?.id).toBe('1')
    expect(findNote(notes, 'No existe')).toBeUndefined()
    expect(backlinks(notes, notes[0]).map((b) => [b.note.id, b.line])).toEqual([['3', 'Ideas en [[Recetas]] y [[Recétas]]']])
    expect(backlinks(notes, notes[2])).toEqual([])
  })
  it('sugiere títulos al escribir [[', () => {
    const titles = notes.map((n) => n.title)
    const v = 'Mira [[lis'
    expect(suggestLink(v, v.length, titles)).toEqual({ start: 5, end: v.length, items: ['Lista de la compra'] })
    const w = 'Mira [[re]] luego'
    expect(suggestLink(w, 9, titles)).toEqual({ start: 5, end: 11, items: ['Recetas'] })
    expect(suggestLink('Mira [[Recetas]] ', 17, titles)).toBeUndefined()
  })

  it('al renombrar una nota, sus enlaces cambian con ella', () => {
    const text = 'Ver [[Recetas]], [[recétas]] y [[Recetas de casa]]'
    expect(renameLinks(text, 'Recetas', 'Cocina')).toBe('Ver [[Cocina]], [[Cocina]] y [[Recetas de casa]]')
    expect(renameLinks(text, 'Recetas', '  ')).toBe(text)
    expect(renameLinks(text, 'Recetas', 'RECETAS')).toBe(text)
    expect(renameLinks(text, '', 'Cocina')).toBe(text)
  })
})
