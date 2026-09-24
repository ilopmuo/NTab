import { describe, expect, it } from 'vitest'
import { captureTasks } from '../../supabase/functions/capture/logic'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'
import { zonedToUtc } from '../../supabase/functions/_shared/time'

// Jueves 24 de septiembre de 2026, 23:30 en Madrid (en UTC aún es día 24, 21:30)
const NOW = Date.parse('2026-09-24T21:30:00Z')
let n = 0
const env: Env = { tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `id-${++n}` }
const rows: Row[] = [
  { tbl: 'areas', id: 'a1', data: { name: 'Salud' } },
  { tbl: 'projects', id: 'p1', data: { name: 'Mudanza', status: 'active', areaId: 'a2' } },
]

describe('captura (Siri y Atajos)', () => {
  it('una tarea con fecha, hora, prioridad y proyecto', () => {
    const r = captureTasks(rows, 'llamar al casero mañana a las 10 !alta +mudanza', env)
    expect(r.writes).toHaveLength(1)
    expect(r.writes[0].data).toMatchObject({ title: 'Llamar al casero', dueDate: '2026-09-25', dueTime: '10:00', priority: 3, projectId: 'p1', areaId: 'a2', done: 0 })
    expect(r.writes[0].data.remindAt).toBe(zonedToUtc('2026-09-25', '10:00', 'Europe/Madrid'))
    expect(r.reply).toBe('Apuntado: Llamar al casero, mañana a las 10:00, en Mudanza.')
  })

  it('"hoy" es el día del usuario, no el del servidor', () => {
    const late = captureTasks(rows, 'sacar la basura hoy', { ...env, now: Date.parse('2026-09-24T22:30:00Z') })
    expect(late.writes[0].data.dueDate).toBe('2026-09-25')
  })

  it('varias líneas (lista compartida) y enlaces', () => {
    const r = captureTasks(rows, '- Comprar leche\n- pedir cita médico el viernes #salud\n\nhttps://www.ejemplo.com/articulo', env)
    expect(r.writes.map((w) => w.data.title)).toEqual(['Comprar leche', 'Pedir cita médico', 'Revisar ejemplo.com'])
    expect(r.writes[1].data).toMatchObject({ dueDate: '2026-09-25', tags: ['salud'] })
    expect(r.writes[2].data.notes).toBe('https://www.ejemplo.com/articulo')
    expect(r.reply).toMatch(/^Apuntadas 3 tareas: /)
  })

  it('nada que apuntar', () => {
    expect(captureTasks(rows, '   \n  ', env)).toEqual({ writes: [], reply: 'No he entendido qué apuntar.' })
  })
})
