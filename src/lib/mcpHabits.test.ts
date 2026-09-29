import { describe, expect, it } from 'vitest'
import { buildSummary, markHabit, type Env, type Row } from '../../supabase/functions/mcp/ntab'

// Miércoles 30 de septiembre de 2026, 10:00 en Madrid
const NOW = Date.parse('2026-09-30T08:00:00Z')
let n = 0
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `new-${++n}` })
const rows = (): Row[] => [
  { tbl: 'habits', id: 'w', data: { id: 'w', name: 'Beber agua', days: [0, 1, 2, 3, 4, 5, 6], target: 8, unit: 'vasos', archived: 0 } },
  { tbl: 'habits', id: 'g', data: { id: 'g', name: 'Gimnasio', days: [0, 1, 2, 3, 4, 5, 6], perWeek: 2, archived: 0 } },
  { tbl: 'habits', id: 'r', data: { id: 'r', name: 'Leer', days: [1, 3, 5], archived: 0 } },
  { tbl: 'habitLogs', id: 'l1', data: { id: 'l1', habitId: 'w', date: '2026-09-30', count: 3 } },
  { tbl: 'habitLogs', id: 'l2', data: { id: 'l2', habitId: 'g', date: '2026-09-28' } },
]

describe('conector: hábitos con cantidad y por semana', () => {
  it('el resumen enseña el progreso', () => {
    const s = buildSummary(rows(), env())
    expect(s).toContain('Beber agua (pendiente, 3/8 vasos)')
    expect(s).toContain('Gimnasio (pendiente, 1 de 2 esta semana)')
    expect(s).toContain('Leer (pendiente)')
  })

  it('el semanal ya cumplido no sale como pendiente', () => {
    const r = [...rows(), { tbl: 'habitLogs', id: 'l3', data: { id: 'l3', habitId: 'g', date: '2026-09-29' } }]
    expect(buildSummary(r, env())).not.toContain('Gimnasio')
  })

  it('suma cantidad o completa el objetivo', () => {
    const two = markHabit(rows(), { habito: 'agua', cantidad: 2 }, env())
    expect(two.writes[0]).toMatchObject({ id: 'l1', data: { count: 5 } })
    expect(two.report[0]).toBe('«Beber agua» el 2026-09-30: 5/8 vasos.')
    const all = markHabit(rows(), { habito: 'agua' }, env())
    expect(all.writes[0].data.count).toBe(8)
    expect(all.report[0]).toContain('objetivo cumplido')
  })

  it('los de hecho o no hecho, como siempre', () => {
    const r = markHabit(rows(), { habito: 'leer' }, env())
    expect(r.writes[0].data).toMatchObject({ habitId: 'r', date: '2026-09-30' })
    expect(r.writes[0].data.count).toBeUndefined()
  })
})
