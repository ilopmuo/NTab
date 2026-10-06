import { describe, expect, it } from 'vitest'
import { deflateRawSync } from 'node:zlib'
import { categoryFor } from './expenses'
import { averageFlow, duplicateExpenses, incomeCategoryFor, incomeText, lastIncomeLike, monthFlow, parseIncome, pendingIncomes, rule503020, toCsv, unusualSpending, usualIncomes, yearGrid } from './money'
import { balanceAt, debtPlan, emergencyFund, financialIndependence, investable, netWorth, netWorthSeries, withBalance, type AccountLike } from './wealth'
import { cleanNote, parseBank, readAmount, readDate, withoutKnown } from './bankImport'
import { readXlsx } from './xlsx'

describe('categorías nuevas de gasto', () => {
  it('viajes, educación, cuidado personal, mascotas y seguros', () => {
    expect(categoryFor('Vuelo Ryanair')).toBe('viajes')
    expect(categoryFor('Hotel en Roma')).toBe('viajes')
    expect(categoryFor('Academia de inglés')).toBe('educacion')
    expect(categoryFor('Peluquería')).toBe('cuidado')
    expect(categoryFor('Pienso del perro')).toBe('mascotas')
    expect(categoryFor('IBI')).toBe('seguros')
    expect(categoryFor('Seguro médico')).toBe('salud')
    // Lo de siempre sigue igual
    expect(categoryFor('Mercadona')).toBe('super')
    expect(categoryFor('Unas cañas')).toBe('comer')
  })
})

describe('ingresos', () => {
  it('entiende el importe y pone la categoría', () => {
    expect(parseIncome('1.850 nómina')).toMatchObject({ amount: 1850, note: 'Nómina', category: 'nomina' })
    expect(parseIncome('la paga extra, 1850')).toMatchObject({ amount: 1850, note: 'Paga extra', category: 'extra' })
    expect(parseIncome('ayer 120 wallapop')).toMatchObject({ amount: 120, category: 'ventas', daysAgo: 1 })
    expect(parseIncome('300 de Hacienda')).toMatchObject({ amount: 300, note: 'Hacienda', category: 'devoluciones' })
    expect(parseIncome('nómina')).toBeNull()
    expect(incomeCategoryFor('Factura cliente Acme')).toBe('trabajos')
    expect(incomeCategoryFor('Intereses cuenta')).toBe('inversiones')
  })
  it('sabe cuándo lo dicho es un ingreso', () => {
    expect(incomeText('he cobrado 1850 de la nómina')).toBe('1850 de la nómina')
    expect(incomeText('ingreso 200 factura')).toBe('200 factura')
    expect(incomeText('me ha llegado la nómina')).toBe('la nómina')
    expect(incomeText('me han devuelto 30 de Hacienda')).toBe('30 de Hacienda')
    // Sin dinero no es un ingreso
    expect(incomeText('me han devuelto el taladro')).toBeUndefined()
    expect(incomeText('cobrar a Luis')).toBeUndefined()
  })
  const list = [
    { amount: 1800, note: 'Nómina', category: 'nomina', date: '2026-08-28' },
    { amount: 1850, note: 'Nómina', category: 'nomina', date: '2026-09-28' },
    { amount: 400, note: 'Alquiler piso', category: 'alquiler', date: '2026-09-02' },
    { amount: 400, note: 'Alquiler piso', category: 'alquiler', date: '2026-08-02' },
    { amount: 400, note: 'Alquiler piso', category: 'alquiler', date: '2026-10-02' },
    { amount: 60, note: 'Wallapop', category: 'ventas', date: '2026-09-10' },
  ]
  it('lo de siempre, lo último parecido y lo que aún no ha llegado', () => {
    expect(usualIncomes(list, '2026-10-06').map((x) => [x.note, x.amount])).toEqual([
      ['Alquiler piso', 400],
      ['Nómina', 1850],
      ['Wallapop', 60],
    ])
    expect(lastIncomeLike(list, 'la nomina')?.amount).toBe(1850)
    expect(lastIncomeLike(list, 'nómina')?.amount).toBe(1850)
    expect(pendingIncomes(list, '2026-10')).toEqual([{ note: 'Nómina', amount: 1850, day: 28 }])
  })
})

describe('flujo del mes', () => {
  const expenses = [
    { amount: 300, date: '2026-09-03', category: 'super' },
    { amount: 200, date: '2026-09-10', category: 'comer' },
    { amount: 100, date: '2026-08-10', category: 'comer' },
    { amount: 120, date: '2026-07-10', category: 'comer' },
    { amount: 60, date: '2026-10-02', category: 'super' },
  ]
  const incomes = [
    { amount: 2000, date: '2026-09-28' },
    { amount: 2000, date: '2026-08-28' },
  ]
  it('lo que entra, lo que sale y la tasa de ahorro', () => {
    const f = monthFlow(expenses, incomes, '2026-09', 500)
    expect(f).toMatchObject({ income: 2000, spent: 500, fixed: 500, out: 1000, saved: 1000 })
    expect(f.rate).toBe(0.5)
    expect(monthFlow(expenses, incomes, '2026-10', 500).rate).toBeUndefined()
  })
  it('la media de los meses anteriores con datos', () => {
    expect(averageFlow(expenses, incomes, '2026-10', 0)).toMatchObject({ months: 3, spent: 240, income: 1333.33 })
  })
  it('50/30/20', () => {
    const r = rule503020([{ id: 'super', amount: 300 }, { id: 'comer', amount: 200 }], 2000, 700, 50)
    expect(r).toMatchObject({ needs: 1000, wants: 250, savings: 750, pctNeeds: 0.5, pctWants: 0.125, pctSavings: 0.375 })
  })
  it('la tabla del año', () => {
    const g = yearGrid(expenses, incomes, '2026', 100, '2026-10-06')
    expect(g.income.values[8]).toBe(2000)
    expect(g.categories.map((c) => c.id)).toEqual(['super', 'comer'])
    expect(g.categories[1].total).toBe(420)
    // Fijos solo en los meses con algo apuntado
    expect(g.fixed.values.slice(5, 10)).toEqual([0, 100, 100, 100, 100])
    expect(g.saved.values[8]).toBe(1400)
    expect(g.spent.avg).toBe((220 + 200 + 600 + 160) / 4)
  })
  it('gasto que se sale de lo normal', () => {
    const list = [...expenses, { amount: 250, date: '2026-10-03', category: 'comer' }]
    expect(unusualSpending(list, '2026-10')).toEqual([{ id: 'comer', spent: 250, avg: 140 }])
    expect(unusualSpending(expenses, '2026-10')).toEqual([])
  })
  it('gastos duplicados', () => {
    const list = [
      { id: 'a', amount: 45, date: '2026-10-01', note: 'Gasolina', createdAt: 1 },
      { id: 'b', amount: 45, date: '2026-10-01', note: 'gasolina', createdAt: 2 },
      { id: 'c', amount: 2, date: '2026-10-01', note: 'Café', createdAt: 3 },
      { id: 'd', amount: 2, date: '2026-10-01', note: 'Café', createdAt: 4 },
    ]
    expect(duplicateExpenses(list, '2026-10').map(([a, b]) => [a.id, b.id])).toEqual([['a', 'b']])
  })
  it('CSV para Excel en español', () => {
    expect(toCsv([['Fecha', 'Concepto', 'Importe'], ['2026-10-01', 'Café; con leche', 2.5]])).toBe('﻿Fecha;Concepto;Importe\r\n2026-10-01;"Café; con leche";2,5\r\n')
  })
})

const acc = (id: string, kind: AccountLike['kind'], balance: number, extra: Partial<AccountLike> = {}): AccountLike => ({ id, name: id, kind, balance, ...extra })

describe('patrimonio', () => {
  const list = [acc('banco', 'bank', 3000), acc('fondo', 'investment', 10000), acc('piso', 'property', 150000), acc('hipoteca', 'mortgage', 90000), acc('coche', 'loan', 5000), acc('vieja', 'bank', 999, { archived: true })]
  it('lo que tienes menos lo que debes', () => {
    expect(netWorth(list)).toEqual({ assets: 163000, debts: 95000, net: 68000, byGroup: { liquid: 3000, invested: 10000, property: 150000, debt: 95000 } })
    expect(investable(list)).toBe(8000)
  })
  it('historial de saldos y evolución por meses', () => {
    let a = acc('banco', 'bank', 0)
    a = { ...a, ...withBalance(a, 1000, '2026-08-15') }
    a = { ...a, ...withBalance(a, 1500, '2026-09-20') }
    a = { ...a, ...withBalance(a, 1400, '2026-09-20') }
    expect(a.history).toEqual([
      { date: '2026-08-15', balance: 1000 },
      { date: '2026-09-20', balance: 1400 },
    ])
    expect(balanceAt(a, '2026-08-31')).toBe(1000)
    expect(balanceAt(a, '2026-07-31')).toBe(0)
    const d = { ...acc('tarjeta', 'card', 0), ...withBalance(acc('tarjeta', 'card', 0), 200, '2026-09-01') }
    expect(netWorthSeries([a, d], ['2026-07', '2026-08', '2026-09', '2026-10'], '2026-10-06')).toEqual([
      { month: '2026-08', net: 1000 },
      { month: '2026-09', net: 1200 },
      { month: '2026-10', net: 1200 },
    ])
  })
  it('fondo de emergencia', () => {
    expect(emergencyFund(list, 1500)).toMatchObject({ liquid: 3000, months: 2, target: 9000, missing: 6000 })
  })
})

describe('salir de deudas', () => {
  const debts = [acc('tarjeta', 'card', 1000, { rate: 20, payment: 50 }), acc('coche', 'loan', 6000, { rate: 5, payment: 200 }), acc('sin cuota', 'debt', 300)]
  it('bola de nieve: primero la más pequeña; avalancha: la más cara', () => {
    const snow = debtPlan(debts, 100, 'snowball')
    const aval = debtPlan(debts, 100, 'avalanche')
    expect(snow.payoffs.map((p) => p.id)).toEqual(['tarjeta', 'coche'])
    expect(snow.months).toBeGreaterThan(15)
    expect(snow.months).toBeLessThan(25)
    expect(aval.interest).toBeLessThanOrEqual(snow.interest)
    // Pagando solo la cuota se tarda más y se pagan más intereses
    const min = debtPlan(debts, 0, 'snowball', false)
    expect(min.months!).toBeGreaterThan(snow.months!)
    expect(min.interest).toBeGreaterThan(snow.interest)
  })
  it('con una cuota que no cubre los intereses no se acaba nunca', () => {
    expect(debtPlan([acc('x', 'card', 10000, { rate: 24, payment: 100 })]).months).toBeUndefined()
  })
})

describe('independencia financiera', () => {
  it('25 veces lo que gastas al año y cuánto falta', () => {
    const f = financialIndependence({ annualSpend: 20000, invested: 100000, monthlySaving: 1000 })
    expect(f.target).toBe(500000)
    expect(f.progress).toBe(0.2)
    expect(f.months! / 12).toBeGreaterThan(14)
    expect(f.months! / 12).toBeLessThan(18)
    expect(f.gainPer100).toBeGreaterThan(0)
    expect(financialIndependence({ annualSpend: 20000, invested: 0, monthlySaving: 0 }).months).toBeUndefined()
  })
})

describe('movimientos del banco', () => {
  it('fechas e importes como los escriben los bancos', () => {
    expect(readDate('03/10/2026')).toBe('2026-10-03')
    expect(readDate('3-10-26')).toBe('2026-10-03')
    expect(readDate('2026-10-03 12:00')).toBe('2026-10-03')
    expect(readDate('46298')).toBe('2026-10-03')
    expect(readDate('Mercadona')).toBeUndefined()
    expect(readAmount('-12,50')).toBe(-12.5)
    expect(readAmount('−1.234,56 €')).toBe(-1234.56)
    expect(readAmount('1,234.56')).toBe(1234.56)
    expect(readAmount('(12.50)')).toBe(-12.5)
    expect(readAmount('1.250')).toBe(1250)
    expect(readAmount('12.5')).toBe(12.5)
    expect(readAmount('abc')).toBeUndefined()
  })
  it('conceptos limpios', () => {
    expect(cleanNote('COMPRA TARJ. 5540XXXXXXXX1234 MERCADONA VALENCIA')).toBe('Mercadona Valencia')
    expect(cleanNote('PAGO MOVIL EN GLOVO, MADRID, TARJ. :*123456')).toBe('Glovo Madrid')
    expect(cleanNote('Bizum de ANA GARCIA')).toBe('Bizum ANA GARCIA')
    expect(cleanNote('RECIBO NETFLIX.COM')).toBe('Netflix.com')
  })
  it('un extracto con cabecera y líneas de antes (Santander, BBVA…)', () => {
    const csv = [
      'Movimientos de la cuenta ES12 3456;;;',
      'Fecha Operación;Fecha Valor;Concepto;Importe;Saldo',
      '03/10/2026;03/10/2026;COMPRA TARJ. 5540XXXXXXXX1234 MERCADONA VALENCIA;-45,30;1.200,00',
      '28/09/2026;28/09/2026;TRANSFERENCIA DE ACME SL NOMINA;1.850,00;1.245,30',
      '27/09/2026;27/09/2026;TRASPASO A CUENTA DE AHORRO;-200,00;-604,70',
      'Saldo final;;;;',
    ].join('\n')
    expect(parseBank(csv)).toEqual([
      { date: '2026-10-03', note: 'Mercadona Valencia', amount: 45.3, kind: 'expense' },
      { date: '2026-09-28', note: 'Acme Sl Nomina', amount: 1850, kind: 'income' },
      { date: '2026-09-27', note: 'Traspaso a Cuenta de Ahorro', amount: 200, kind: 'transfer' },
    ])
  })
  it('cargo y abono en columnas aparte, y filas pegadas de Excel sin cabecera', () => {
    const two = 'Fecha,Descripción,Cargo,Abono\n2026-10-01,Gasolina Repsol,"45,00",\n2026-10-02,Devolución Amazon,,"19,99"'
    expect(parseBank(two).map((r) => [r.note, r.amount, r.kind])).toEqual([
      ['Gasolina Repsol', 45, 'expense'],
      ['Devolución Amazon', 19.99, 'income'],
    ])
    const pasted = '01/10/2026\tCafé Bar Pepe\t-2,50\t980,00\n02/10/2026\tLidl\t-30,10\t949,90'
    expect(parseBank(pasted).map((r) => [r.date, r.note, r.amount])).toEqual([
      ['2026-10-01', 'Café Bar Pepe', 2.5],
      ['2026-10-02', 'Lidl', 30.1],
    ])
  })
  it('lo que ya estaba apuntado no se repite', () => {
    const rows = parseBank('Fecha;Concepto;Importe\n01/10/2026;Café;-2,50\n01/10/2026;Café;-2,50\n02/10/2026;Lidl;-30')
    const { fresh, repeated } = withoutKnown(rows, [{ date: '2026-10-01', amount: 2.5 }])
    expect(fresh.map((r) => r.note)).toEqual(['Café', 'Lidl'])
    expect(repeated).toHaveLength(1)
  })
  it('un .xlsx del banco', async () => {
    const xml = (s: string) => Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>${s}`)
    const files: [string, Buffer][] = [
      ['xl/workbook.xml', xml('<workbook xmlns:r="r"><sheets><sheet name="Movs" sheetId="1" r:id="rId1"/></sheets></workbook>')],
      ['xl/_rels/workbook.xml.rels', xml('<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>')],
      ['xl/sharedStrings.xml', xml('<sst><si><t>Fecha</t></si><si><t>Concepto</t></si><si><t>Importe</t></si><si><r><t>Mercadona </t></r><r><t>&amp; más</t></r></si></sst>')],
      ['xl/worksheets/sheet1.xml', xml('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" s="1"><v>46298</v></c><c r="B2" t="s"><v>3</v></c><c r="D2"><v>-45.3</v></c></row></sheetData></worksheet>')],
    ]
    const table = await readXlsx(zip(files))
    expect(table).toEqual([
      ['Fecha', 'Concepto', 'Importe'],
      ['46298', 'Mercadona & más', '', '-45.3'],
    ])
  })
})

/** Un zip mínimo (deflate) para probar el lector de .xlsx */
function zip(files: [string, Buffer][]): ArrayBuffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, data] of files) {
    const comp = deflateRawSync(data)
    const n = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(comp.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(8, 10)
    c.writeUInt32LE(comp.length, 20)
    c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(n.length, 28)
    c.writeUInt32LE(offset, 42)
    locals.push(local, n, comp)
    central.push(c, n)
    offset += 30 + n.length + comp.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  const all = Buffer.concat([...locals, cd, end])
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length)
}
