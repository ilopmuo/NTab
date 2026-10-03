import { describe, expect, it } from 'vitest'
import { sendHouseReminders, type SendPush } from '../../supabase/functions/send-reminders/house'

type Row = Record<string, unknown>

/** Lo justo de Supabase para la función: select con in/eq, upsert y delete, en memoria */
function fakeAdmin(tables: Record<string, Row[]>) {
  const from = (name: string) => {
    let rows = tables[name] ?? []
    let mode: 'select' | 'delete' = 'select'
    const q = {
      select: () => q,
      in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[col]))), q),
      eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), q),
      limit: () => q,
      delete: () => ((mode = 'delete'), q),
      upsert: async (add: Row[]) => {
        tables[name] = [...(tables[name] ?? []), ...add]
        return { error: null }
      },
      then: (ok: (v: { data: Row[]; error: null }) => void) => {
        if (mode === 'delete') tables[name] = (tables[name] ?? []).filter((r) => !rows.includes(r))
        ok({ data: rows, error: null })
      },
    }
    return q
  }
  return { from } as never
}

const sub = (endpoint: string, member: string, open = 'piso') => ({ endpoint, household_id: 'h1', member, p256dh: 'k', auth: 'a', tz: 'Europe/Madrid', open })
const tables = () => ({
  households: [{ id: 'h1', token: 'tok' }],
  household_items: [
    { id: 'ana', kind: 'member', data: { name: 'Ana', order: 0 } },
    { id: 'yo', kind: 'member', data: { name: 'Yo', order: 1 } },
    { id: 'basura', kind: 'chore', data: { title: 'Sacar la basura', rotation: ['ana', 'yo'], turn: 0, due: '2026-10-03', at: 0 } },
  ].map((i) => ({ ...i, household_id: 'h1' })),
  household_push: [sub('https://push/ana-movil', 'ana'), sub('https://push/ana-viejo', 'ana'), sub('https://push/yo', 'yo', 'house')],
  household_push_log: [] as Row[],
})

// Sábado 3 de octubre de 2026 a las 9:02 en Madrid
const NINE = Date.parse('2026-10-03T07:02:00Z')

describe('avisos del piso (send-reminders)', () => {
  it('a las 9, a cada uno lo suyo y una sola vez; los móviles que ya no existen se quitan', async () => {
    const t = tables()
    const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = []
    const send: SendPush = async (s, payload) => {
      if (s.endpoint.endsWith('viejo')) return 'gone'
      sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) })
      return 'ok'
    }
    expect(await sendHouseReminders(fakeAdmin(t), send, NINE)).toBe(1)
    expect(sent).toEqual([{ endpoint: 'https://push/ana-movil', payload: { title: 'Hoy te toca en casa', body: 'Sacar la basura', tag: 'ntab-house-morning', url: './#/piso/tok' } }])
    expect(t.household_push.map((s) => s.endpoint)).toEqual(['https://push/ana-movil', 'https://push/yo'])
    // Apuntado también lo de «yo» (sin nada que avisar), para no mirarlo otra vez hoy
    expect(t.household_push_log.map((l) => `${l.member} ${l.kind} ${l.day}`)).toEqual(['ana morning 2026-10-03', 'yo morning 2026-10-03'])
    // Un minuto después no se repite
    expect(await sendHouseReminders(fakeAdmin(t), send, NINE + 60_000)).toBe(0)
  })

  it('fuera de las 9 y las 20 no hace nada; un error temporal se reintenta', async () => {
    const t = tables()
    const send: SendPush = async () => 'error'
    expect(await sendHouseReminders(fakeAdmin(t), send, NINE + 3 * 3600_000)).toBe(0)
    expect(await sendHouseReminders(fakeAdmin(t), send, NINE)).toBe(0)
    expect(t.household_push_log.map((l) => l.member)).toEqual(['yo'])
  })
})
