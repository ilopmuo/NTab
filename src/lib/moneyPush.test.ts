import { describe, expect, it } from 'vitest'
import { dueExpenseQuestions, dueMoneyWeek } from '../../supabase/functions/send-reminders/expenses'

type Row = Record<string, unknown>

/** Lo justo de Supabase en memoria: select con eq/in/gte, también sobre data->>campo */
function fakeAdmin(tables: Record<string, Row[]>) {
  const get = (r: Row, col: string) => {
    const [base, key] = col.split('->>')
    if (!key) return r[col]
    const v = (r[base] as Row | null)?.[key]
    return v === undefined || v === null ? null : String(v)
  }
  const from = (name: string) => {
    let rows = tables[name] ?? []
    const q = {
      select: () => q,
      in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(get(r, col)))), q),
      eq: (col: string, val: unknown) => ((rows = rows.filter((r) => get(r, col) === val)), q),
      gte: (col: string, val: string) => ((rows = rows.filter((r) => String(get(r, col) ?? '') >= val)), q),
      then: (ok: (v: { data: Row[]; error: null }) => void) => ok({ data: rows, error: null }),
    }
    return q
  }
  return { from } as never
}

// Jueves 8 de octubre de 2026, 12:00 en Madrid
const AT = Date.parse('2026-10-08T10:00:00Z')
const spent = (id: string, data: Row) => ({ user_id: 'u1', tbl: 'expenses', id, deleted: false, data: { id, date: '2026-10-08', category: 'otros', createdAt: AT - 3600_000, ...data } })
const tables = (records: Row[]) => ({
  push_subscriptions: [{ user_id: 'u1', tz: 'Europe/Madrid', last_used_at: '2026-10-01T10:00:00Z', created_at: '2026-09-01T10:00:00Z' }],
  records: [
    spent('m1', { amount: 40, note: 'Amazon pedido libros', category: 'ocio' }),
    spent('m2', { amount: 25, note: 'Amazon cables', category: 'casa' }),
    spent('m3', { amount: 22, note: 'Amazon libro', category: 'ocio' }),
    ...records,
  ] as Row[],
  push_log: [] as Row[],
})

describe('«¿de qué es este gasto?» (send-reminders)', () => {
  it('un gasto sin clasificar: con las dos categorías más probables como botones', async () => {
    const jobs = await dueExpenseQuestions(fakeAdmin(tables([spent('x', { amount: 23.4, note: 'Amazon Mktp', unclassified: true })])), AT)
    expect(jobs.map((j) => j.log)).toEqual([{ user_id: 'u1', tbl: 'expense-ask', item_id: 'x', remind_at: new Date(AT).toISOString() }])
    expect(jobs[0].payload()).toMatchObject({
      title: '¿De qué es este gasto?',
      expenseId: 'x',
      expenseGuesses: [
        { id: 'ocio', label: 'Ocio' },
        { id: 'casa', label: 'Casa' },
      ],
    })
  })

  it('varios: un solo aviso que los cuenta; nada si ya se preguntó, de noche o recién apuntado', async () => {
    const two = [spent('a', { amount: 12, note: 'Bizum Laura', unclassified: true }), spent('b', { amount: 60, note: 'TPV 3321', unclassified: true })]
    const jobs = await dueExpenseQuestions(fakeAdmin(tables(two)), AT)
    expect(jobs).toHaveLength(1)
    expect([jobs[0].log.item_id, ...(jobs[0].more ?? []).map((l) => l.item_id)].sort()).toEqual(['a', 'b'])
    expect((jobs[0].payload() as { title: string; body: string }).title).toBe('2 gastos sin clasificar')

    const t = tables(two)
    t.push_log.push({ user_id: 'u1', tbl: 'expense-ask', item_id: 'a' }, { user_id: 'u1', tbl: 'expense-ask', item_id: 'b' })
    expect(await dueExpenseQuestions(fakeAdmin(t), AT)).toEqual([])
    // A las 23:30 en Madrid, no
    expect(await dueExpenseQuestions(fakeAdmin(tables(two)), Date.parse('2026-10-08T21:30:00Z'))).toEqual([])
    // Apuntado hace un minuto: se espera por si lo clasifica él
    expect(await dueExpenseQuestions(fakeAdmin(tables([spent('n', { amount: 5, note: 'Algo', unclassified: true, createdAt: AT - 60_000 })])), AT)).toEqual([])
  })
})

describe('«tu semana en gastos» (los domingos)', () => {
  // Domingo 11 de octubre, 19:30 en Madrid
  const SUNDAY = Date.parse('2026-10-11T17:30:00Z')
  const week = [
    spent('w1', { amount: 30, note: 'Glovo', category: 'comer', date: '2026-10-06' }),
    spent('w2', { amount: 25, note: 'Glovo', category: 'comer', date: '2026-10-08' }),
    spent('w3', { amount: 60, note: 'Cena', category: 'comer', date: '2026-10-10' }),
    spent('w4', { amount: 20, note: 'Cine', category: 'ocio', date: '2026-09-20' }),
  ]
  it('el domingo por la tarde, una vez: la semana, lo que más y a dónde ir', async () => {
    const t = tables(week)
    const jobs = await dueMoneyWeek(fakeAdmin(t), SUNDAY)
    expect(jobs.map((j) => j.log.item_id)).toEqual(['2026-10-11'])
    expect(jobs[0].payload()).toMatchObject({ title: 'Tu semana en gastos', tag: 'money-week' })
    expect((jobs[0].payload() as { body: string }).body).toMatch(/^202 € esta semana\. Lo que más: comer fuera \(115 €\)\./)
    t.push_log.push({ user_id: 'u1', tbl: 'money-week', item_id: '2026-10-11' })
    expect(await dueMoneyWeek(fakeAdmin(t), SUNDAY)).toEqual([])
  })
  it('otro día u otra hora, nada', async () => {
    expect(await dueMoneyWeek(fakeAdmin(tables(week)), SUNDAY - 864e5)).toEqual([])
    expect(await dueMoneyWeek(fakeAdmin(tables(week)), Date.parse('2026-10-11T10:00:00Z'))).toEqual([])
  })
})
