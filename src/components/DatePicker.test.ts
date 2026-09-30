import { describe, expect, it } from 'vitest'
import { keyTarget, monthGrid } from './DatePicker'

describe('selector de fecha', () => {
  it('la cuadrícula va de lunes a domingo y cubre el mes', () => {
    const g = monthGrid('2026-09-01')
    expect(g[0]).toBe('2026-08-31') // lunes
    expect(g).toHaveLength(35)
    expect(g.at(-1)).toBe('2026-10-04') // domingo
    expect(g).toContain('2026-09-30')
    // febrero de 2027 empieza en lunes y cabe en cuatro semanas
    expect(monthGrid('2027-02-01')).toHaveLength(28)
  })

  it('teclado: días, semanas, principio y fin de semana y meses', () => {
    expect(keyTarget('2026-09-30', 'ArrowRight')).toBe('2026-10-01')
    expect(keyTarget('2026-09-30', 'ArrowUp')).toBe('2026-09-23')
    expect(keyTarget('2026-09-30', 'Home')).toBe('2026-09-28')
    expect(keyTarget('2026-09-30', 'End')).toBe('2026-10-04')
    expect(keyTarget('2026-01-31', 'PageDown')).toBe('2026-02-28')
    expect(keyTarget('2026-09-30', 'Enter')).toBeUndefined()
  })
})
