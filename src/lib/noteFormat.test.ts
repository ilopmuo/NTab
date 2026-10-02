import { describe, expect, it } from 'vitest'
import { appendToNote, checklistStats, inlineTokens, noteBlocks, noteMarkdown, setAllChecks, sortChecked, toggleCheck } from './noteFormat'

const maleta = 'Maleta\n- [x] Cargador\n- [ ] DNI\n- [x] Cepillo\n- [ ] Auriculares\n\nNotas al final'

describe('listas en notas (como Notas de Apple)', () => {
  it('cuenta, marca y desmarca', () => {
    expect(checklistStats(maleta)).toEqual({ done: 2, total: 4 })
    expect(toggleCheck(maleta, 2)).toContain('- [x] DNI')
    expect(toggleCheck(maleta, 1)).toContain('- [ ] Cargador')
    expect(toggleCheck(maleta, 0)).toBe(maleta)
    expect(checklistStats(setAllChecks(maleta, false))).toEqual({ done: 0, total: 4 })
    expect(checklistStats(setAllChecks(maleta, true))).toEqual({ done: 4, total: 4 })
    expect(toggleCheck('* [X] Hecho', 0)).toBe('* [ ] Hecho')
  })
  it('las marcadas, al final de su lista', () => {
    expect(sortChecked(maleta)).toBe('Maleta\n- [ ] DNI\n- [ ] Auriculares\n- [x] Cargador\n- [x] Cepillo\n\nNotas al final')
    // Cada lista por su lado
    expect(sortChecked('- [x] a\n- [ ] b\ntexto\n- [x] c\n- [ ] d')).toBe('- [ ] b\n- [x] a\ntexto\n- [ ] d\n- [x] c')
  })
  it('añadir al final, como texto o como casillas', () => {
    expect(appendToNote('Ideas\n', 'Una bici')).toBe('Ideas\nUna bici')
    expect(appendToNote('', 'leche, pan; huevos', true)).toBe('- [ ] leche\n- [ ] pan\n- [ ] huevos')
    expect(appendToNote('x', '  ')).toBe('x')
    expect(noteMarkdown('Maleta', '- [ ] DNI\n')).toBe('# Maleta\n\n- [ ] DNI\n')
  })
})

describe('formato de las notas (como Bear)', () => {
  it('bloques', () => {
    const b = noteBlocks('# Viaje\n## Día 1\n- [ ] Billetes\n  - [x] Hotel\n- Mapa\n1. Primero\n> Cita\n---\n```\ncódigo\n```\n\nTexto')
    expect(b.map((x) => x.type)).toEqual(['h', 'h', 'check', 'check', 'li', 'li', 'quote', 'hr', 'code', 'blank', 'p'])
    expect(b[0]).toMatchObject({ level: 1, text: 'Viaje' })
    expect(b[3]).toMatchObject({ done: true, text: 'Hotel', indent: 1, line: 3 })
    expect(b[5]).toMatchObject({ n: 1, text: 'Primero' })
    expect(b[8]).toMatchObject({ text: 'código', line: 8 })
    expect(b[10]).toMatchObject({ line: 12 })
  })
  it('dentro de la línea', () => {
    expect(inlineTokens('Hola **mundo** y *tú*, ~~no~~ `x` [[Otra nota]] #ideas/2026 https://luno.app.')).toEqual([
      { t: 'text', v: 'Hola ' },
      { t: 'bold', v: 'mundo' },
      { t: 'text', v: ' y ' },
      { t: 'italic', v: 'tú' },
      { t: 'text', v: ', ' },
      { t: 'strike', v: 'no' },
      { t: 'text', v: ' ' },
      { t: 'code', v: 'x' },
      { t: 'text', v: ' ' },
      { t: 'wiki', v: 'Otra nota' },
      { t: 'text', v: ' ' },
      { t: 'tag', v: 'ideas/2026' },
      { t: 'text', v: ' ' },
      { t: 'link', v: 'https://luno.app', href: 'https://luno.app' },
      { t: 'text', v: '.' },
    ])
    expect(inlineTokens('[la web](https://luno.app) y 3*4*5 y #1')).toEqual([
      { t: 'link', v: 'la web', href: 'https://luno.app' },
      { t: 'text', v: ' y 3*4*5 y #1' },
    ])
  })
})
