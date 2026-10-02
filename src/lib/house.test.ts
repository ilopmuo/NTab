import { describe, expect, it } from 'vitest'
import { applyOps, balances, choreStatus, completeChore, fairness, myChores, sanitize, settleUp, stale, whoseTurn, type Chore, type HouseItem } from './house'

const member = (id: string, name: string, order: number): HouseItem => ({ id, kind: 'member', data: { name, order } })
const chore = (id: string, data: Partial<Chore>): HouseItem => ({ id, kind: 'chore', data: { title: id, rotation: [], turn: 0, at: 0, ...data } })
const base = () => [member('yo', 'Yo', 0), member('ana', 'Ana', 1), member('luis', 'Luis', 2)]

describe('casa compartida', () => {
  it('turnos: pasa al siguiente del que la hace y vuelve a los N días', () => {
    const c: Chore = { title: 'Basura', every: 2, rotation: ['yo', 'ana', 'luis'], turn: 0, due: '2026-10-02', at: 0 }
    const a = completeChore(c, 'yo', '2026-10-02', 1)
    expect(a).toMatchObject({ turn: 1, due: '2026-10-04' })
    expect(a.log).toEqual([{ by: 'yo', at: 1 }])
    // Le tocaba a Ana pero la hace Luis: el siguiente es el de después de Luis
    const b = completeChore(a, 'luis', '2026-10-03', 2)
    expect(b).toMatchObject({ turn: 0, due: '2026-10-05' })
    // Las de una vez quedan hechas
    expect(completeChore({ title: 'Llamar al casero', rotation: [], turn: 0, at: 0 }, 'ana', '2026-10-02', 3)).toMatchObject({ done: true })
  })

  it('a quién le toca, aunque se haya ido del piso', () => {
    const c: Chore = { title: 'Baño', rotation: ['ana', 'luis', 'yo'], turn: 1, at: 0 }
    expect(whoseTurn(c, ['yo', 'ana', 'luis'])).toBe('luis')
    expect(whoseTurn(c, ['yo', 'ana'])).toBe('yo')
    expect(whoseTurn({ ...c, rotation: [] }, ['yo'])).toBeUndefined()
  })

  it('estado por fecha y lo que me toca', () => {
    const today = '2026-10-02'
    expect(choreStatus({ title: 'x', rotation: [], turn: 0, at: 0, due: '2026-10-01' }, today)).toBe('overdue')
    expect(choreStatus({ title: 'x', rotation: [], turn: 0, at: 0, due: today }, today)).toBe('today')
    expect(choreStatus({ title: 'x', rotation: [], turn: 0, at: 0, due: '2026-10-05' }, today)).toBe('soon')
    expect(choreStatus({ title: 'x', rotation: [], turn: 0, at: 0, due: '2026-10-09' }, today)).toBe('later')
    expect(choreStatus({ title: 'x', rotation: [], turn: 0, at: 0 }, today)).toBe('anytime')
    const items = [...base(), chore('basura', { rotation: ['yo', 'ana'], due: today }), chore('baño', { rotation: ['ana', 'yo'], due: today }), chore('nevera', { rotation: ['yo'], due: '2026-10-20' })]
    expect(myChores(items, 'yo', today).map((c) => c.id)).toEqual(['basura'])
  })

  it('operaciones: crear, hacer, borrar, renombrar; lo no válido se ignora', () => {
    let items = base()
    const r1 = applyOps(items, [
      { op: 'put', kind: 'chore', id: 'basura', data: { title: '  Sacar la basura ', every: 2, rotation: ['yo', 'ana', 'ana', 'x y'], at: 5, hack: 'no' } },
      { op: 'put', kind: 'shop', id: 's1', data: { name: 'Leche', qty: '2', by: 'ana', at: 6 } },
      { op: 'put', kind: 'shop', id: 's2', data: { name: '' } },
      { op: 'put', kind: 'nope' as never, id: 'z', data: {} },
      { op: 'name', name: 'Piso de la calle Mayor' },
    ])
    expect(r1.items.find((i) => i.id === 'basura')?.data).toEqual({ title: 'Sacar la basura', every: 2, rotation: ['yo', 'ana'], turn: 0, at: 5 })
    expect([...r1.changed]).toEqual(['basura', 's1'])
    expect(r1.name).toBe('Piso de la calle Mayor')
    items = r1.items
    const r2 = applyOps(items, [{ op: 'done', id: 'basura', by: 'ana', day: '2026-10-02', at: 9 }, { op: 'del', id: 's1' }])
    expect(r2.items.find((i) => i.id === 'basura')?.data).toMatchObject({ turn: 0, due: '2026-10-04', log: [{ by: 'ana', at: 9 }] })
    expect([...r2.deleted]).toEqual(['s1'])
  })

  it('reparto: cuántas ha hecho cada uno este mes', () => {
    const now = Date.parse('2026-10-02T12:00:00Z')
    const items = [...base(), chore('basura', { log: [{ by: 'ana', at: now - 864e5 }, { by: 'ana', at: now - 2 * 864e5 }, { by: 'yo', at: now - 40 * 864e5 }] })]
    expect(Object.fromEntries(fairness(items, now))).toEqual({ yo: 0, ana: 2, luis: 0 })
  })

  it('cuentas: a partes iguales en céntimos y cómo saldarlas', () => {
    const items: HouseItem[] = [
      ...base(),
      { id: 'e1', kind: 'expense', data: { what: 'Papel higiénico', amount: 10, paidBy: 'yo', split: [], day: '2026-10-01', at: 1 } },
      { id: 'e2', kind: 'expense', data: { what: 'Internet', amount: 30, paidBy: 'ana', split: ['ana', 'luis'], day: '2026-10-01', at: 2 } },
    ]
    const bal = balances(items)
    // yo: +10 − 3,34 = 6,66 · ana: +30 − 3,33 − 15 = 11,67 · luis: −3,33 − 15 = −18,33
    expect(Object.fromEntries(bal)).toEqual({ yo: 6.66, ana: 11.67, luis: -18.33 })
    const pay = settleUp(bal)
    expect(pay).toEqual([
      { from: 'luis', to: 'ana', amount: 11.67 },
      { from: 'luis', to: 'yo', amount: 6.66 },
    ])
    // Tras pagar, todo a cero
    const after = [...items, ...pay.map((p, i): HouseItem => ({ id: `p${i}`, kind: 'expense', data: { what: 'Pago', amount: p.amount, paidBy: p.from, split: [p.to], day: '2026-10-02', settle: true, at: 3 } }))]
    expect([...balances(after).values()].every((v) => v === 0)).toBe(true)
  })

  it('limpia lo viejo: lo comprado hace semanas y las tareas sueltas hechas hace un mes', () => {
    const now = Date.parse('2026-10-02T12:00:00Z')
    const items: HouseItem[] = [
      { id: 'leche', kind: 'shop', data: { name: 'Leche', done: true, doneAt: now - 20 * 864e5, at: 0 } },
      { id: 'pan', kind: 'shop', data: { name: 'Pan', done: true, doneAt: now - 864e5, at: 0 } },
      { id: 'huevos', kind: 'shop', data: { name: 'Huevos', at: 0 } },
      chore('casero', { done: true, log: [{ by: 'yo', at: now - 40 * 864e5 }] }),
      chore('basura', { every: 2, log: [{ by: 'yo', at: now - 40 * 864e5 }] }),
    ]
    expect(stale(items, now)).toEqual(['leche', 'casero'])
  })

  it('valida lo que llega de fuera', () => {
    expect(sanitize('member', { name: 'x'.repeat(100), order: 2 })).toEqual({ name: 'x'.repeat(40), order: 2 })
    expect(sanitize('expense', { what: 'Luz', amount: -5, paidBy: 'yo' })).toBeNull()
    expect(sanitize('expense', { what: 'Luz', amount: 45.678, paidBy: 'yo', day: 'ayer' })).toMatchObject({ amount: 45.68, day: '1970-01-01', split: [] })
    expect(sanitize('chore', { title: 'Baño', due: '2026-13', every: 9999 })).toMatchObject({ every: 365 })
    expect(sanitize('chore', { title: 'Baño', due: '2026-13' })?.due).toBeUndefined()
  })
})
