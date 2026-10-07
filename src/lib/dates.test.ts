import { describe, expect, it } from 'vitest'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatEs } from './dates'

// Todos los patrones que la app pasa a fmt()
const PATTERNS = ['d', 'dd', 'd MMM', 'd MMM yyyy', 'MMM', 'MMMM', 'MMMM yyyy', 'MMM yyyy', 'yyyy', 'EEE', 'EEEE', 'EEEEE', 'EEEEEE', 'EEE d MMM', 'EEEE d', "d 'de' MMMM", "d 'de' MMMM yyyy", "d 'de' MMM yyyy", "MMMM 'de' yyyy", "EEEE d 'de' MMMM", "EEEE, d 'de' MMMM", "EEEE d 'de' MMMM yyyy", 'M/yy', 'dd/MM/yyyy']

describe('formatEs', () => {
  it('da lo mismo que date-fns en español, día a día durante dos años', () => {
    for (let i = 0; i < 731; i++) {
      const d = new Date(2026, 0, 1 + i)
      for (const p of PATTERNS) expect(formatEs(d, p), `${p} ${d.toDateString()}`).toBe(format(d, p, { locale: es }))
    }
  })
})
