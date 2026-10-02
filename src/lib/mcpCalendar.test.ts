import { describe, expect, it } from 'vitest'
import { buildSummary, type Env, type EventLike, type Row } from '../../supabase/functions/mcp/ntab'

// Miércoles 30 de septiembre de 2026, 10:05 en Madrid
const NOW = Date.parse('2026-09-30T08:05:00Z')
const env = (now = NOW): Env => ({ tz: 'Europe/Madrid', now, autoRemind: true, newId: () => 'x' })
const task = (id: string, data: Record<string, unknown>): Row => ({
  tbl: 'tasks',
  id,
  data: { id, title: id, done: 0, priority: 0, order: 0, ...data },
})
const event = (start: string, end: string, allDay = false): EventLike => ({ title: 'Reunión', allDay, start, end, sourceId: 's' })

describe('conector: huecos libres de hoy y mañana', () => {
  it('quita reuniones y tareas con hora y empieza en la hora actual', () => {
    const rows = [task('dentista', { dueDate: '2026-09-30', dueTime: '13:00', estimate: 60 }), task('sin hora', { dueDate: '2026-09-30', estimate: 120 })]
    const events = [event('2026-09-30T09:00:00Z', '2026-09-30T10:00:00Z'), event('2026-10-01', '2026-10-02', true)]
    const s = buildSummary(rows, env(), { events, names: {} })
    // 10:05 → desde las 10:15; reunión 11–12 y dentista 13–14
    expect(s).toContain('HUECOS LIBRES HOY (9–20 h, sin reuniones ni tareas con hora): 10:15–11:00, 12:00–13:00, 14:00–20:00.')
    // Los de todo el día no ocupan
    expect(s).toContain('HUECOS LIBRES MAÑANA (9–20 h, sin reuniones ni tareas con hora): 09:00–20:00.')
  })

  it('sin huecos de media hora lo dice; de noche no hay línea de hoy', () => {
    const rows = [task('largo', { dueDate: '2026-10-01', dueTime: '09:00', estimate: 660 })]
    expect(buildSummary(rows, env())).toContain('HUECOS LIBRES MAÑANA (9–20 h, sin reuniones ni tareas con hora): ninguno de media hora o más.')
    const night = buildSummary([], env(Date.parse('2026-09-30T19:00:00Z')))
    expect(night).not.toContain('HUECOS LIBRES HOY')
    expect(night).toContain('HUECOS LIBRES MAÑANA')
  })
})
