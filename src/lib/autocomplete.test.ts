import { describe, expect, it } from 'vitest'
import { applySuggestion, suggest } from './autocomplete'
import { parseQuickAdd } from './parse'

const src = {
  tags: ['salud', 'recados', 'llamadas', 'trabajo-casa'],
  projects: [{ name: 'Web nueva' }, { name: 'Mudanza' }, { name: 'Viaje (Lisboa)' }, { name: 'Viejo', status: 'done' }],
  areas: [{ name: 'Salud' }, { name: 'Trabajo' }],
  people: [{ name: 'Ana García' }, { name: 'Andrés' }],
}
const at = (value: string, caret = value.length) => suggest(value, caret, src)

describe('autocompletar en la captura rápida', () => {
  it('etiquetas con #', () => {
    expect(at('Llamar #sa')?.items.map((s) => s.insert)).toEqual(['#salud'])
    expect(at('Llamar #')?.items).toHaveLength(4)
    // por una palabra del medio
    expect(at('Algo #casa')?.items.map((s) => s.label)).toEqual(['trabajo-casa'])
    // ya escrita entera: nada
    expect(at('Llamar #salud')).toBeUndefined()
    // sin símbolo o en medio de una palabra: nada
    expect(at('Llamar sa')).toBeUndefined()
    expect(at('correo@ejemplo')).toBeUndefined()
  })

  it('proyectos y áreas con +, sin los terminados', () => {
    expect(at('Maquetas +we')?.items.map((s) => s.insert)).toEqual(['+Web nueva'])
    expect(at('X +via')?.items.map((s) => s.insert)).toEqual(['+Viaje'])
    expect(at('X +sal')?.items).toEqual([{ kind: 'area', label: 'Salud', insert: '+Salud' }])
    expect(at('X +')?.items.map((s) => s.label)).toEqual(['Web nueva', 'Mudanza', 'Viaje (Lisboa)', 'Salud', 'Trabajo'])
  })

  it('personas con @ (por el nombre)', () => {
    expect(at('Llamar a @an')?.items.map((s) => s.insert)).toEqual(['@Ana', '@Andrés'])
    expect(at('Llamar a @garc')?.items.map((s) => s.label)).toEqual(['Ana García'])
  })

  it('sustituye la palabra entera y deja el cursor detrás', () => {
    const v = 'Maquetas +we mañana'
    const r = suggest(v, 12, src)!
    const out = applySuggestion(v, r, r.items[0])
    expect(out.text).toBe('Maquetas +Web nueva mañana')
    expect(out.caret).toBe('Maquetas +Web nueva '.length)
    // En medio de la palabra: se cambia entera
    const w = 'Pedir #salu'
    const r2 = suggest(w, 9, src)!
    expect(applySuggestion(w, r2, r2.items[0]).text).toBe('Pedir #salud ')
  })

  it('lo completado lo entiende el analizador', () => {
    const r = suggest('Maquetas +we', 12, src)!
    const text = applySuggestion('Maquetas +we', r, r.items[0]).text + 'mañana'
    const parsed = parseQuickAdd(text, { now: new Date(2026, 8, 23, 9), areas: [], projects: [{ id: 'p', name: 'Web nueva' }] })
    expect(parsed).toMatchObject({ title: 'Maquetas', projectId: 'p', dueDate: '2026-09-24' })
  })
})
