import { describe, expect, it } from 'vitest'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'
import { capture } from '../../supabase/functions/mcp/capture'
import { addIncomeTool, updateAccount, viewFinance } from '../../supabase/functions/mcp/money'
import { classify } from './intent'

// Martes 6 de octubre de 2026, 12:00 en Madrid
const NOW = Date.parse('2026-10-06T10:00:00Z')
let n = 0
/** Intl separa el € con un espacio duro */
const nb = (s: string) => s.replace(/\u00a0/g, ' ')
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `new-${++n}` })
const rows: Row[] = [
  { tbl: 'incomes', id: 'i1', data: { id: 'i1', amount: 1800, note: 'Nómina', category: 'nomina', date: '2026-08-28' } },
  { tbl: 'incomes', id: 'i2', data: { id: 'i2', amount: 1850, note: 'Nómina', category: 'nomina', date: '2026-09-28' } },
  { tbl: 'expenses', id: 'e1', data: { id: 'e1', amount: 300, note: 'Mercadona', category: 'super', date: '2026-09-03' } },
  { tbl: 'expenses', id: 'e2', data: { id: 'e2', amount: 120, note: 'Cena', category: 'comer', date: '2026-10-02' } },
  { tbl: 'subscriptions', id: 's1', data: { id: 's1', name: 'Alquiler', kind: 'bill', amount: 700, currency: 'EUR', cycle: 'month', nextDate: '2026-11-01', active: true } },
  { tbl: 'accounts', id: 'a1', data: { id: 'a1', name: 'BBVA', kind: 'bank', balance: 4000, history: [{ date: '2026-09-01', balance: 4000 }], order: 1 } },
  { tbl: 'accounts', id: 'a2', data: { id: 'a2', name: 'Coche', kind: 'loan', balance: 3000, rate: 6, payment: 200, order: 2 } },
]

describe('dinero desde Claude y Siri', () => {
  it('apuntar un ingreso: con importe o lo de la última vez', () => {
    const r = addIncomeTool(rows, { texto: '1850 nómina' }, env())
    expect(r.writes[0]).toMatchObject({ tbl: 'incomes', data: { amount: 1850, note: 'Nómina', category: 'nomina', date: '2026-10-06' } })
    expect(nb(r.report[0])).toContain('Este mes entran 1850 € y salen 820 €: quedan 1030 €.')
    const same = addIncomeTool(rows, { texto: 'la nómina' }, env())
    expect(same.writes[0].data).toMatchObject({ amount: 1850, note: 'Nómina' })
    expect(same.report[0]).toContain('lo mismo que la última vez')
    expect(addIncomeTool(rows, { texto: 'algo' }, env()).writes).toEqual([])
  })

  it('el resumen del dinero y el patrimonio', () => {
    const text = nb(viewFinance(rows, {}, env()))
    expect(text).toContain('DINERO DE 2026-10: entran 0 €, salen 820 €')
    expect(text).toContain('Aún no ha llegado (suele llegar): Nómina 1850 € hacia el día 28.')
    expect(text).toContain('PATRIMONIO NETO: 1000 € (tiene 4000 €, debe 3000 €).')
    expect(text).toContain('- Coche (Préstamo): −3000 €, 6 %, cuota 200 €/mes')
    expect(text).toMatch(/Deudas: .*sin deudas en 2028-0\d/)
  })

  it('saldo nuevo de una cuenta (y una nueva con su tipo por el nombre)', () => {
    const r = updateAccount(rows, { nombre: 'bbva', saldo: 4500 }, env())
    expect(r.writes[0].data).toMatchObject({ id: 'a1', balance: 4500, history: [{ date: '2026-09-01', balance: 4000 }, { date: '2026-10-06', balance: 4500 }] })
    expect(nb(r.report[0])).toBe('Actualizada «BBVA» (Cuenta corriente): 4500 € (antes 4000 €). Patrimonio neto: 1500 €.')
    const h = updateAccount(rows, { nombre: 'Hipoteca', saldo: 90000, interes: 2.5, cuota: 600 }, env())
    expect(h.writes[0].data).toMatchObject({ kind: 'mortgage', balance: 90000, rate: 2.5, payment: 600 })
    expect(nb(updateAccount(rows, { nombre: 'Indexa' }, env()).report[0])).toBe('¿Cuánto hay en «Indexa»?')
  })

  it('Siri: «he cobrado…», «¿cuánto me queda?» y «¿cuánto tengo?»', () => {
    expect(classify('he cobrado 200 de una factura', {}, '2026-10-06')).toEqual({ kind: 'income', text: '200 de una factura' })
    expect(classify('me han devuelto el taladro', {}, '2026-10-06').kind).not.toBe('income')
    const r = capture(rows, 'me ha llegado la nómina', env())
    expect(r.writes.find((w) => w.tbl === 'incomes')?.data).toMatchObject({ amount: 1850, note: 'Nómina' })
    expect(nb(r.report[0])).toBe('Apuntado: +1850 € · Nómina (Nómina, hoy, lo mismo que la última vez).')
    expect(nb(capture(rows, '¿cuánto me queda este mes?', env()).report[0])).toBe('Este mes han entrado 0 € y han salido 820 €, contando los pagos fijos: faltan 820 €. Aún no ha llegado nómina.')
    expect(nb(capture(rows, '¿cuánto tengo?', env()).report[0])).toBe('Tu patrimonio neto es de 1000 €: tienes 4000 € y debes 3000 €. Disponible en cuentas, 4000 €.')
    expect(nb(capture(rows, '¿cuánto debo?', env()).report[0])).toBe('Debes 3000 € en total.')
  })
})
