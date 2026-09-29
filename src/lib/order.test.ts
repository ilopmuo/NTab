import { describe, expect, it } from 'vitest'
import { ORDER_STEP, moveItem, renumber, reorderUpdates } from './tasks'

const L = (...orders: number[]) => orders.map((order, i) => ({ id: String.fromCharCode(97 + i), order }))
const apply = (list: { id: string; order: number }[], ups: { id: string; order: number }[]) =>
  list.map((t) => ({ ...t, order: ups.find((u) => u.id === t.id)?.order ?? t.order })).sort((a, b) => a.order - b.order).map((t) => t.id).join('')

describe('orden manual', () => {
  it('entre dos vecinas, solo cambia la movida', () => {
    // b y c ordenadas 100 y 300; se mueve «d» (900) entre ellas
    const list = [{ id: 'a', order: 0 }, { id: 'b', order: 100 }, { id: 'd', order: 900 }, { id: 'c', order: 300 }]
    const ups = reorderUpdates(list, 'd')
    expect(ups).toEqual([{ id: 'd', order: 200 }])
    expect(apply(list, ups)).toBe('abdc')
  })

  it('arriba del todo y al final', () => {
    const top = [{ id: 'c', order: 500 }, { id: 'a', order: 100 }, { id: 'b', order: 200 }]
    expect(reorderUpdates(top, 'c')).toEqual([{ id: 'c', order: 100 - ORDER_STEP }])
    const bottom = [{ id: 'b', order: 200 }, { id: 'c', order: 300 }, { id: 'a', order: 100 }]
    expect(reorderUpdates(bottom, 'a')).toEqual([{ id: 'a', order: 300 + ORDER_STEP }])
  })

  it('si ya estaba en su sitio no cambia nada', () => {
    expect(reorderUpdates(L(1, 2, 3), 'b')).toEqual([])
    expect(reorderUpdates(L(1), 'a')).toEqual([])
    expect(reorderUpdates(L(1, 2), 'z')).toEqual([])
  })

  it('con empates renumera la lista', () => {
    const list = [{ id: 'a', order: 5 }, { id: 'c', order: 9 }, { id: 'b', order: 5 }]
    const ups = reorderUpdates(list, 'c')
    expect(apply(list, ups)).toBe('acb')
  })

  it('sin precisión entre vecinas renumera', () => {
    const big = 1_700_000_000_000
    const list = [{ id: 'a', order: big }, { id: 'c', order: big + 5000 }, { id: 'b', order: big + 0.0001 }]
    const ups = reorderUpdates(list, 'c')
    expect(apply(list, ups)).toBe('acb')
  })

  it('renumerar respeta el orden visible y solo toca lo que cambia', () => {
    expect(renumber([{ id: 'x', order: 10 }, { id: 'y', order: 10 + ORDER_STEP }, { id: 'z', order: 3 }])).toEqual([
      { id: 'x', order: 3 },
      { id: 'y', order: 3 + ORDER_STEP },
      { id: 'z', order: 3 + 2 * ORDER_STEP },
    ])
    expect(renumber([])).toEqual([])
  })

  it('mover con el teclado', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 2, 5)).toEqual(['a', 'b', 'c'])
  })
})
