import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { createProject, createTask } from '@/db/actions'
import { applyTemplate, createTemplate, expandTemplate, itemsFromTasks, templateFromProject } from './templates'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'

describe('plantillas', () => {
  it('fechas relativas al inicio', () => {
    const out = expandTemplate(
      [{ title: 'Pasaporte', offset: -7 }, { title: ' Maleta ', offset: -1, time: '20:00', subtasks: ['Cargador', ' '] }, { title: 'Sin fecha', time: '10:00' }, { title: '' }],
      '2026-10-10',
    )
    expect(out).toEqual([
      { title: 'Pasaporte', dueDate: '2026-10-03', priority: 0, subtasks: [] },
      { title: 'Maleta', dueDate: '2026-10-09', dueTime: '20:00', priority: 0, subtasks: ['Cargador'] },
      { title: 'Sin fecha', priority: 0, subtasks: [] },
    ])
  })

  it('desde tareas: fechas relativas a la primera', () => {
    expect(
      itemsFromTasks([
        { title: 'B', dueDate: '2026-10-12', dueTime: '09:00', priority: 2 },
        { title: 'A', dueDate: '2026-10-10', subtasks: [{ title: 'x' }] },
        { title: 'C' },
      ]),
    ).toEqual([{ title: 'A', offset: 0, subtasks: ['x'] }, { title: 'B', offset: 2, time: '09:00', priority: 2 }, { title: 'C' }])
  })

  it('guardar un proyecto como plantilla y usarla como proyecto nuevo', async () => {
    const p = await createProject({ name: 'Viaje a Roma' })
    await createTask({ title: 'Reservar hotel', projectId: p.id, dueDate: '2026-10-01' })
    await createTask({ title: 'Hacer la maleta', projectId: p.id, dueDate: '2026-10-05' })
    const tpl = await templateFromProject(p)
    expect(tpl.items.map((i) => [i.title, i.offset])).toEqual([['Reservar hotel', 0], ['Hacer la maleta', 4]])
    const r = await applyTemplate(tpl, { start: '2027-03-01', asProject: true, projectName: 'Viaje a Lisboa' })
    expect(r.project?.name).toBe('Viaje a Lisboa')
    const tasks = await db.tasks.where('projectId').equals(r.project!.id).sortBy('dueDate')
    expect(tasks.map((t) => [t.title, t.dueDate])).toEqual([['Reservar hotel', '2027-03-01'], ['Hacer la maleta', '2027-03-05']])
  })

  it('el conector de Claude las ve y las usa', async () => {
    const tpl = await createTemplate({ name: 'Cierre de mes', items: [{ title: 'Revisar cargos', offset: 0 }, { title: 'Apuntar gastos', offset: 1, time: '10:00' }] })
    const rows = new Map<string, Row>([
      [`templates:${tpl.id}`, { tbl: 'templates', id: tpl.id, data: tpl as unknown as Record<string, unknown> }],
      ['projects:p1', { tbl: 'projects', id: 'p1', data: { name: 'Finanzas casa', status: 'active', areaId: 'a1' } }],
    ])
    const store: Store = { load: async () => [...rows.values()], save: async (w) => void w.forEach((r) => rows.set(`${r.tbl}:${r.id}`, r)) }
    let n = 0
    const env: Env = { tz: 'Europe/Madrid', now: Date.parse('2026-09-30T08:00:00Z'), autoRemind: true, newId: () => `n${++n}` }
    const call = async (name: string, args: Record<string, unknown>) =>
      ((await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env)) as { result: { content: { text: string }[] } }).result.content[0].text
    expect(await call('ver_plantillas', {})).toContain('Cierre de mes (2 tareas):\n  - Revisar cargos (día 0)')
    const text = await call('usar_plantilla', { plantilla: 'cierre', proyecto: 'finanzas' })
    expect(text).toContain('usada en «Finanzas casa», empezando hoy (2026-09-30)')
    const created = [...rows.values()].filter((r) => r.tbl === 'tasks').map((r) => r.data)
    expect(created.map((t) => [t.title, t.dueDate, t.dueTime ?? null, t.projectId, t.areaId])).toEqual([
      ['Revisar cargos', '2026-09-30', null, 'p1', 'a1'],
      ['Apuntar gastos', '2026-10-01', '10:00', 'p1', 'a1'],
    ])
    expect(created[1].remindAt).toBeTypeOf('number')
  })
})
