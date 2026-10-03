import { describe, expect, it } from 'vitest'
import { dueMedJobs } from '../../supabase/functions/send-reminders/meds'

type Row = Record<string, unknown>

/** Lo justo de Supabase: select con eq/in, en memoria */
function fakeAdmin(tables: Record<string, Row[]>) {
  const from = (name: string) => {
    let rows = tables[name] ?? []
    const q = {
      select: () => q,
      in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[col]))), q),
      eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), q),
      then: (ok: (v: { data: Row[]; error: null }) => void) => ok({ data: rows, error: null }),
    }
    return q
  }
  return { from } as never
}

const med = (id: string, data: Row) => ({ user_id: 'u1', tbl: 'meds', id, deleted: false, data: { id, archived: 0, ...data } })
const tables = () => ({
  push_subscriptions: [
    { user_id: 'u1', tz: 'Europe/Madrid', last_used_at: '2026-10-01T10:00:00Z', created_at: '2026-09-01T10:00:00Z' },
    { user_id: 'u1', tz: 'America/New_York', last_used_at: null, created_at: '2026-08-01T10:00:00Z' },
  ],
  records: [
    med('ibu', { name: 'Ibuprofeno', dose: '600 mg', times: ['09:00', '21:00'] }),
    med('vit', { name: 'Vitamina D', times: ['09:00'], days: [1] }),
    med('para', { name: 'Paracetamol', times: [] }),
    med('old', { name: 'Antibiótico', times: ['09:00'], until: '2026-10-01' }),
  ] as Row[],
  push_log: [] as Row[],
})
// Sábado 3 de octubre de 2026, 9:05 en Madrid
const AT = Date.parse('2026-10-03T07:05:00Z')

describe('avisos de la medicación (send-reminders)', () => {
  it('a la hora, solo lo que toca hoy, con «Tomada» en el aviso', async () => {
    const jobs = await dueMedJobs(fakeAdmin(tables()), AT)
    expect(jobs.map((j) => j.log.item_id)).toEqual(['ibu:2026-10-03:09:00:0'])
    expect(jobs[0].payload()).toEqual({
      title: 'Hora de tomar: Ibuprofeno',
      body: '600 mg · 09:00',
      tag: 'meds-ibu-09:00',
      key: 'meds-ibu-2026-10-03-09:00-0',
      url: './#/meds',
      medDose: 'ibu|2026-10-03|09:00',
    })
  })

  it('insiste a los 15 min; nada si ya está marcada o ya se avisó', async () => {
    const t = tables()
    const later = AT + 12 * 60_000
    expect((await dueMedJobs(fakeAdmin(t), later)).map((j) => [j.log.item_id, (j.payload() as { title: string }).title])).toEqual([['ibu:2026-10-03:09:00:1', '¿Te has tomado Ibuprofeno?']])
    t.push_log.push({ user_id: 'u1', tbl: 'meds', item_id: 'ibu:2026-10-03:09:00:1' })
    expect(await dueMedJobs(fakeAdmin(t), later)).toEqual([])
    const t2 = tables()
    t2.records.push({ user_id: 'u1', tbl: 'medLogs', id: 'ibu:2026-10-03:09:00', deleted: false, data: {} })
    expect(await dueMedJobs(fakeAdmin(t2), AT)).toEqual([])
  })
})
