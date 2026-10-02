import { describe, expect, it } from 'vitest'
import { budgetAlert, categoryBudgets, categoryFor, frequentExpenses, monthSummary, monthlyTotals, parseExpense, ruleKey, searchExpenses, tagTotals } from './expenses'

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

describe('gastos como los mejores', () => {
  it('#etiquetas fuera del concepto', () => {
    expect(parseExpense('30 cena #Roma #viaje')).toMatchObject({ amount: 30, note: 'Cena', category: 'comer', tags: ['roma', 'viaje'] })
    expect(parseExpense('12 café')?.tags).toBeUndefined()
  })
  it('aprende la categoría al cambiarla (como Copilot)', () => {
    const rules = { [ruleKey('Bizum Ana')]: 'regalos', mercadona: 'casa' }
    expect(parseExpense('20 bizum ana', rules)?.category).toBe('regalos')
    expect(parseExpense('63 Mercadona grande', rules)?.category).toBe('casa')
    expect(parseExpense('63 mercadona', { mercadona: 'inventada' })?.category).toBe('super')
    expect(categoryFor('Cena', { ce: 'ocio' })).toBe('comer')
  })
  it('presupuesto por categoría y avisos al 80 % y al pasarse', () => {
    const b = categoryBudgets([{ id: 'comer', amount: 120 }, { id: 'super', amount: 50 }], { monthly: 800, categories: { comer: 150, super: 300, ocio: 0, nada: 10 } })
    expect(b).toEqual([
      { id: 'comer', limit: 150, spent: 120, left: 30, pct: 0.8 },
      { id: 'super', limit: 300, spent: 50, left: 250, pct: 50 / 300 },
    ])
    expect(budgetAlert(100, 25, 150)).toBe('near')
    expect(budgetAlert(130, 25, 150)).toBe('over')
    expect(budgetAlert(160, 25, 150)).toBeUndefined()
    expect(budgetAlert(10, 5, undefined)).toBeUndefined()
  })
  const list = [
    { amount: 1.5, note: 'Café', category: 'comer', date: '2026-09-28' },
    { amount: 1.5, note: 'café', category: 'comer', date: '2026-09-30', tags: ['curro'] },
    { amount: 1.5, note: 'Café', category: 'comer', date: '2026-09-02' },
    { amount: 63, note: 'Mercadona', category: 'super', date: '2026-09-20' },
    { amount: 60, note: 'Mercadona', category: 'super', date: '2026-09-27' },
    { amount: 9, note: 'Bus', category: 'transporte', date: '2026-05-01' },
    { amount: 9, note: 'Bus', category: 'transporte', date: '2026-05-03' },
    { amount: 30, note: 'Cena', category: 'comer', date: '2026-05-04', tags: ['roma'] },
    { amount: 45, note: 'Museo', category: 'ocio', date: '2026-05-06', tags: ['roma'] },
  ]
  it('frecuentes: mismo concepto e importe, 2 veces en 90 días', () => {
    expect(frequentExpenses(list, '2026-10-01')).toEqual([{ note: 'café', amount: 1.5, category: 'comer', tags: ['curro'], count: 3, last: '2026-09-30' }])
  })
  it('buscar por texto, categoría y #etiqueta, con total', () => {
    expect(searchExpenses(list, 'merca').total).toBe(123)
    expect(searchExpenses(list, 'comer').items).toHaveLength(4)
    expect(searchExpenses(list, '#roma')).toMatchObject({ total: 75 })
    expect(searchExpenses(list, '#roma museo').items.map((e) => e.note)).toEqual(['Museo'])
    expect(searchExpenses(list, '  ').items).toEqual([])
  })
  it('totales por etiqueta y de los últimos meses', () => {
    expect(tagTotals(list)).toEqual([
      { tag: 'curro', total: 1.5, count: 1, from: '2026-09-30', to: '2026-09-30' },
      { tag: 'roma', total: 75, count: 2, from: '2026-05-04', to: '2026-05-06' },
    ])
    expect(monthlyTotals(list, '2026-10', 3)).toEqual([
      { month: '2026-08', total: 0 },
      { month: '2026-09', total: 127.5 },
      { month: '2026-10', total: 0 },
    ])
    expect(monthlyTotals(list, '2026-02', 2).map((m) => m.month)).toEqual(['2026-01', '2026-02'])
  })
})
