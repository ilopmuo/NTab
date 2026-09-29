import { describe, expect, it } from 'vitest'
import { cleanTag, replaceTag, tagStats } from './tags'

describe('etiquetas', () => {
  it('cuenta pendientes y totales, las más usadas primero', () => {
    const s = tagStats([
      { tags: ['llamar', 'salud'], done: 0 },
      { tags: ['llamar'], done: 0 },
      { tags: ['llamar'], done: 1 },
      { tags: ['leer'], done: 1 },
      { tags: ['salud', 'salud'], done: 0 },
    ])
    expect(s).toEqual([
      { tag: 'llamar', open: 2, total: 3 },
      { tag: 'salud', open: 2, total: 2 },
      { tag: 'leer', open: 0, total: 1 },
    ])
  })
  it('renombrar junta con una que ya existía', () => {
    expect(replaceTag(['llamar', 'telefono'], 'telefono', 'llamar')).toEqual(['llamar'])
    expect(replaceTag(['a', 'b'], 'a', 'c')).toEqual(['c', 'b'])
  })
  it('limpia el nombre', () => {
    expect(cleanTag('  #Casa Nueva ')).toBe('casa-nueva')
    expect(cleanTag('¿Médico?')).toBe('médico')
    expect(cleanTag('#')).toBe('')
  })
})
