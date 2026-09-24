import { describe, expect, it } from 'vitest'
import { monthSummary, parseExpense } from './expenses'

describe('gastos', () => {
  it('entiende el importe en cualquier sitio', () => {
    expect(parseExpense('12,50 café')).toEqual({ amount: 12.5, note: 'Café', category: 'comer', daysAgo: 0 })
    expect(parseExpense('súper 63')).toMatchObject({ amount: 63, note: 'Súper', category: 'super' })
    expect(parseExpense('63€ mercadona')).toMatchObject({ amount: 63, category: 'super' })
    expect(parseExpense('ayer 20 cena con Ana')).toMatchObject({ amount: 20, note: 'Cena con Ana', category: 'comer', daysAgo: 1 })
    expect(parseExpense('1.250 alquiler')).toMatchObject({ amount: 1250, category: 'casa' })
    expect(parseExpense('gasolina 45,3 euros')).toMatchObject({ amount: 45.3, category: 'transporte' })
    expect(parseExpense('regalo cumple de Pepe 30')).toMatchObject({ amount: 30, category: 'regalos' })
    expect(parseExpense('tornillos 3')).toMatchObject({ category: 'otros' })
    expect(parseExpense('sin importe')).toBeNull()
  })
  it('resumen del mes con proyección', () => {
    const s = monthSummary(
      [
        { amount: 100, category: 'super', date: '2026-09-02' },
        { amount: 50, category: 'comer', date: '2026-09-10' },
        { amount: 30, category: 'super', date: '2026-09-15' },
        { amount: 999, category: 'ocio', date: '2026-08-15' },
      ],
      '2026-09',
      '2026-09-15',
    )
    expect(s.total).toBe(180)
    expect(s.byCategory).toEqual([{ id: 'super', amount: 130 }, { id: 'comer', amount: 50 }])
    expect(s.projection).toBe(360)
  })
})
