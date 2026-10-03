import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'
import { pisoText, type HouseCtx } from '../../supabase/functions/mcp/casa'
import { applyOps, type HouseItem } from '../../supabase/functions/_shared/house'

// Viernes 2 de octubre de 2026, 10:00 en Madrid
const NOW = Date.parse('2026-10-02T08:00:00Z')
let n = 0
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `new-${++n}` })

function houseStore(items: HouseItem[]) {
  let house: HouseCtx = { name: 'Piso de la calle Mayor', items, me: 'yo' }
  const store: Store & { house: () => Promise<HouseCtx> } = {
    async load() {
      return [] as Row[]
    },
    async save() {},
    async house() {
      return house
    },
    async houseOps(ops) {
      house = { ...house, items: applyOps(house.items, ops).items }
    },
  }
  return store
}

const items = (): HouseItem[] => [
  { id: 'yo', kind: 'member', data: { name: 'Ignacio', order: 0 } },
  { id: 'ana', kind: 'member', data: { name: 'Ana', order: 1 } },
  { id: 'luis', kind: 'member', data: { name: 'Luis', order: 2 } },
  { id: 'basura', kind: 'chore', data: { title: 'Sacar la basura', every: 2, rotation: ['yo', 'ana', 'luis'], turn: 0, due: '2026-10-02', at: 0 } },
  { id: 'baño', kind: 'chore', data: { title: 'Limpiar el baño', every: 7, rotation: ['ana', 'luis', 'yo'], turn: 0, due: '2026-10-01', at: 0 } },
  { id: 's1', kind: 'shop', data: { name: 'Papel higiénico', by: 'ana', at: 0 } },
  { id: 'e1', kind: 'expense', data: { what: 'Internet', amount: 30, paidBy: 'yo', split: [], day: '2026-10-01', at: 0 } },
]

const call = async (store: Store, name: string, args: Record<string, unknown> = {}) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env())) as { result: { content: { text: string }[] } }
  return r.result.content[0].text
}

describe('conector: casa compartida', () => {
  it('el resumen dice lo que te toca, lo de los demás, la compra y las cuentas', async () => {
    const s = await call(houseStore(items()), 'ver_resumen')
    expect(s).toContain('CASA COMPARTIDA «Piso de la calle Mayor» (tú, Ana, Luis)')
    expect(s).toContain('- Te toca: Sacar la basura (hoy)')
    expect(s).toContain('- A los demás: Limpiar el baño (Ana, atrasada desde 2026-10-01)')
    expect(s).toContain('- Compra del piso (1): Papel higiénico')
    expect(s).toContain('- Cuentas: Ana te debe 10 €; Luis te debe 10 €')
  })

  it('ver_casa: tareas con su turno, compra y reparto', async () => {
    const s = await call(houseStore(items()), 'ver_casa')
    expect(s).toContain('- Sacar la basura: te toca a ti · cada 2 días · toca el 2026-10-02')
    expect(s).toContain('- Limpiar el baño: le toca a Ana · cada semana · atrasada desde 2026-10-01')
    expect(s).toContain('- Papel higiénico (apuntó Ana)')
  })

  it('hecho_en_casa pasa el turno; anadir_a_casa apunta compra, tareas por turnos y gastos', async () => {
    const store = houseStore(items())
    expect(await call(store, 'hecho_en_casa', { tarea: 'basura' })).toBe('Hecho: «Sacar la basura» (tú); la próxima le toca a Ana.')
    expect((await store.house())!.items.find((i) => i.id === 'basura')?.data).toMatchObject({ turn: 1, due: '2026-10-04' })
    expect(await call(store, 'hecho_en_casa', { tarea: 'baño', quien: 'Ana' })).toBe('Hecho: «Limpiar el baño» (Ana); la próxima le toca a Luis.')

    expect(await call(store, 'anadir_a_casa', { tipo: 'compra', texto: 'papel higiénico, 2 lavavajillas y aceite' })).toBe('Apuntado en la compra del piso: Lavavajillas, Aceite. Lo ve todo el piso.')
    expect(await call(store, 'anadir_a_casa', { tipo: 'tarea', texto: 'Regar las plantas', cada_dias: 4, para: 'Luis' })).toBe(
      'Tarea de casa: «Regar las plantas», cada 4 días, por turnos (empieza Luis), desde el 2026-10-02.',
    )
    expect(await call(store, 'anadir_a_casa', { tipo: 'tarea', texto: 'Llamar al casero' })).toBe('Tarea de casa: «Llamar al casero», una vez, para quien pueda.')
    expect(await call(store, 'anadir_a_casa', { tipo: 'gasto', texto: 'Luz', importe: 45, pago: 'Ana' })).toBe('Gasto del piso: Luz, 45 €, pagó Ana, entre todos.')
    expect(await call(store, 'anadir_a_casa', { tipo: 'tarea', texto: 'Algo', para: 'Pepe' })).toContain('No hay nadie que se llame «Pepe»')
  })

  it('sin piso lo dice', async () => {
    const store: Store = { async load() { return [] }, async save() {} }
    expect(await call(store, 'ver_casa')).toContain('No tiene casa compartida')
  })

  it('Siri: «piso: …» va a la compra del piso, con el precio de la última vez', async () => {
    expect(pisoText('piso: leche y pan')).toBe('leche y pan')
    expect(pisoText('Piso, papel higiénico')).toBe('papel higiénico')
    expect(pisoText('compra del piso lavavajillas')).toBe('lavavajillas')
    expect(pisoText('A la compra del piso: aceite')).toBe('aceite')
    expect(pisoText('comprar un piso nuevo')).toBeNull()
    expect(pisoText('compra: leche')).toBeNull()
    const store = houseStore([...items(), { id: 'u-leche', kind: 'usual', data: { name: 'Leche', count: 3, price: 1.2, at: 0 } }])
    expect(await call(store, 'anadir_a_casa', { tipo: 'compra', texto: 'leche' })).toContain('Leche')
    expect((await store.house())!.items.find((i) => i.kind === 'shop' && (i.data as { name: string }).name === 'Leche')?.data).toMatchObject({ price: 1.2 })
  })
})
