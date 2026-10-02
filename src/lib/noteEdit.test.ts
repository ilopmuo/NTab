import { describe, expect, it } from 'vitest'
import { continueList, toggleLinePrefix, wrapSelection } from './noteEdit'

describe('escribir notas', () => {
  it('Intro sigue la lista y en una línea vacía la acaba', () => {
    expect(continueList('- [x] Pan', 9)).toEqual({ value: '- [x] Pan\n- [ ] ', start: 16, end: 16 })
    expect(continueList('  - Uno', 7)).toEqual({ value: '  - Uno\n  - ', start: 12, end: 12 })
    expect(continueList('1. Uno', 6)).toEqual({ value: '1. Uno\n2. ', start: 10, end: 10 })
    expect(continueList('- [ ] Pan\n- [ ] ', 16)).toEqual({ value: '- [ ] Pan\n', start: 10, end: 10 })
    expect(continueList('Texto normal', 12)).toBeUndefined()
    // Con el cursor dentro de la marca, Intro normal
    expect(continueList('- [ ] Pan', 2)).toBeUndefined()
  })
  it('casilla, lista y título: se ponen, se cambian y se quitan', () => {
    expect(toggleLinePrefix('Leche\nPan', 7, '- [ ] ')).toEqual({ value: 'Leche\n- [ ] Pan', start: 15, end: 15 })
    expect(toggleLinePrefix('- [x] Pan', 3, '- [ ] ')).toEqual({ value: 'Pan', start: 3, end: 3 })
    expect(toggleLinePrefix('- Pan', 3, '- [ ] ').value).toBe('- [ ] Pan')
    expect(toggleLinePrefix('Viaje', 0, '## ').value).toBe('## Viaje')
    expect(toggleLinePrefix('# Viaje', 0, '## ').value).toBe('Viaje')
    expect(toggleLinePrefix('  Pan', 0, '- ').value).toBe('  - Pan')
  })
  it('negrita alrededor de lo seleccionado, o para escribirla', () => {
    expect(wrapSelection('hola mundo', 5, 10)).toEqual({ value: 'hola **mundo**', start: 7, end: 12 })
    expect(wrapSelection('hola ', 5, 5)).toEqual({ value: 'hola ****', start: 7, end: 7 })
    expect(wrapSelection('hola **mundo**', 7, 12)).toEqual({ value: 'hola mundo', start: 5, end: 10 })
  })
})
