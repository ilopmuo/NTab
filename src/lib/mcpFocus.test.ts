import { describe, expect, it } from 'vitest'
import { buildSummary, type Env, type Row } from '../../supabase/functions/mcp/ntab'

// Viernes 2 de octubre de 2026, 18:00 en Madrid
const NOW = Date.parse('2026-10-02T16:00:00Z')
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => 'x' })
let n = 0
/** Una sesión que acaba a esa hora de Madrid (UTC+2) */
const log = (date: string, end: string, minutes: number, pomodoro = true): Row => ({
  tbl: 'focusLogs',
  id: `f${++n}`,
  data: { date, minutes, endedAt: Date.parse(`${date}T${end}:00+02:00`), title: 'Informe', ...(pomodoro ? { pomodoro } : {}) },
})

describe('conector: foco en el resumen', () => {
  it('hoy frente al objetivo, la semana, la racha y las mejores horas', () => {
    const rows: Row[] = [
      { tbl: 'settings', id: 'focusGoal', data: { value: { minutes: 60 } } },
      log('2026-09-30', '11:00', 60),
      log('2026-10-01', '11:00', 50),
      log('2026-10-01', '11:55', 25),
      log('2026-10-02', '10:25', 25),
      log('2026-10-02', '10:55', 25),
      log('2026-10-02', '12:00', 15, false),
    ]
    const s = buildSummary(rows, env())
    expect(s).toContain('FOCO: hoy 1 h 05 de 1 h de objetivo (2 pomodoros); últimos 7 días 3 h 20; racha de 3 días; se concentra mejor de 10 a 12 h')
  })

  it('sin sesiones ni objetivo no dice nada', () => {
    expect(buildSummary([], env())).not.toContain('FOCO')
  })
})
