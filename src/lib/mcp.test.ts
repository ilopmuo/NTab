import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import { computeRemindAt, nextOccurrence, type Env, type Row } from '../../supabase/functions/mcp/ntab'
import { zonedToUtc } from '../../supabase/functions/_shared/time'

// Jueves 24 de septiembre de 2026, 10:00 en Madrid
const NOW = Date.parse('2026-09-24T08:00:00Z')
let n = 0
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `new-${++n}` })

function memoryStore(initial: Row[]) {
  const rows = new Map(initial.map((r) => [`${r.tbl}:${r.id}`, r]))
  const store: Store & { rows: Map<string, Row> } = {
    rows,
    async load() {
      return [...rows.values()]
    },
    async save(writes, deletes = []) {
      for (const w of writes) rows.set(`${w.tbl}:${w.id}`, w)
      for (const d of deletes) rows.delete(`${d.tbl}:${d.id}`)
    },
  }
  return store
}

const task = (id: string, data: Record<string, unknown>): Row => ({
  tbl: 'tasks',
  id,
  data: { id, title: id, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0, ...data },
})

const base = (): Row[] => [
  { tbl: 'areas', id: 'a1', data: { id: 'a1', name: 'Trabajo' } },
  { tbl: 'projects', id: 'p1', data: { id: 'p1', name: 'Web nueva', status: 'active', areaId: 'a1' } },
  task('t1', { title: 'Enviar informe', dueDate: '2026-09-23', priority: 3, projectId: 'p1' }),
  task('t2', { title: 'Llamar al banco', dueDate: '2026-09-24', dueTime: '12:00' }),
  task('t3', { title: 'Regar las plantas', dueDate: '2026-09-24', recurrence: { freq: 'week', interval: 1, weekdays: [1, 4] } }),
  task('t4', { title: 'Comprar pan', done: 1, completedAt: NOW - 1000 }),
  { tbl: 'habits', id: 'h1', data: { id: 'h1', name: 'Correr', days: [1, 2, 3, 4, 5], archived: 0 } },
  { tbl: 'subscriptions', id: 's1', data: { id: 's1', name: 'Netflix', amount: 12.99, currency: 'EUR', nextDate: '2026-09-26', active: true } },
  { tbl: 'people', id: 'x1', data: { id: 'x1', name: 'Ana', birthday: '1990-09-27' } },
]

const call = async (store: Store, name: string, args: Record<string, unknown> = {}) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env())) as {
    result: { content: { text: string }[]; isError?: boolean }
  }
  return { text: r.result.content[0].text, isError: !!r.result.isError }
}

describe('conector MCP', () => {
  it('saluda y lista herramientas', async () => {
    const store = memoryStore([])
    const init = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, store, env())) as {
      result: { protocolVersion: string; capabilities: object; serverInfo: { name: string } }
    }
    expect(init.result.protocolVersion).toBe('2025-06-18')
    expect(init.result.capabilities).toHaveProperty('tools')
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, store, env())).toBeNull()
    const list = (await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, store, env())) as { result: { tools: { name: string }[] } }
    expect(list.result.tools.map((t) => t.name)).toEqual(['ver_resumen', 'buscar_tareas', 'crear_tareas', 'actualizar_tareas', 'crear_nota', 'marcar_habito'])
    const bad = (await handleMessage({ jsonrpc: '2.0', id: 3, method: 'nada' }, store, env())) as { error: { code: number } }
    expect(bad.error.code).toBe(-32601)
  })

  it('resumen con lo importante', async () => {
    const { text } = await call(memoryStore(base()), 'ver_resumen')
    expect(text).toContain('HOY: jueves 24 de septiembre de 2026')
    expect(text).toContain('ATRASADAS (1):\n- [t1] Enviar informe · ayer (2026-09-23) · !alta · Web nueva')
    expect(text).toContain('[t2] Llamar al banco · hoy (2026-09-24) a las 12:00')
    expect(text).toContain('HÁBITOS DE HOY: Correr (pendiente)')
    expect(text).toContain('Netflix 12.99 EUR')
    expect(text).toContain('Cumpleaños de Ana: el domingo 27')
    expect(text).not.toContain('Comprar pan')
  })

  it('busca tareas', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'buscar_tareas', { texto: 'banco' })).text).toContain('[t2]')
    expect((await call(store, 'buscar_tareas', { estado: 'hechas' })).text).toContain('Comprar pan')
    expect((await call(store, 'buscar_tareas', { proyecto: 'web' })).text).toContain('[t1]')
    expect((await call(store, 'buscar_tareas', { proyecto: 'inexistente' })).text).toMatch(/No hay ningún proyecto/)
  })

  it('crea tareas como la app (proyecto, área y aviso automático)', async () => {
    const store = memoryStore(base())
    const r = await call(store, 'crear_tareas', {
      tareas: [
        { titulo: 'Enviar presupuesto', fecha: '2026-09-25', hora: '9:30', prioridad: 5, proyecto: 'web nueva', etiquetas: ['#Cliente'] },
        { titulo: '  ' },
        { titulo: 'Idea suelta', hora: '10:00' },
      ],
    })
    expect(r.isError).toBe(false)
    const created = [...store.rows.values()].filter((x) => x.id.startsWith('new-')).map((x) => x.data)
    expect(created).toHaveLength(2)
    const [a, b] = created
    expect(a).toMatchObject({ title: 'Enviar presupuesto', dueDate: '2026-09-25', dueTime: '09:30', priority: 3, projectId: 'p1', areaId: 'a1', tags: ['cliente'], done: 0, reminder: { before: 0 } })
    expect(a.remindAt).toBe(zonedToUtc('2026-09-25', '09:30', 'Europe/Madrid'))
    // Sin fecha no hay hora ni aviso
    expect(b).not.toHaveProperty('dueTime')
    expect(b).not.toHaveProperty('remindAt')
  })

  it('reprograma, completa y repite', async () => {
    const store = memoryStore(base())
    await call(store, 'actualizar_tareas', {
      cambios: [
        { id: 't1', fecha: '2026-09-25', hora: '16:00' },
        { id: 't2', fecha: null },
        { id: 't3', hecha: true },
        { id: 'zzz', hecha: true },
      ],
    })
    const get = (id: string) => store.rows.get(`tasks:${id}`)!.data
    expect(get('t1')).toMatchObject({ dueDate: '2026-09-25', dueTime: '16:00' })
    expect(get('t1').remindAt).toBe(zonedToUtc('2026-09-25', '16:00', 'Europe/Madrid'))
    expect(get('t2')).not.toHaveProperty('dueDate')
    expect(get('t2')).not.toHaveProperty('dueTime')
    expect(get('t2')).not.toHaveProperty('remindAt')
    expect(get('t3')).toMatchObject({ done: 1, completedAt: NOW })
    expect(get('t3')).not.toHaveProperty('recurrence')
    // Siguiente repetición: lunes 28
    const next = [...store.rows.values()].find((x) => x.data.title === 'Regar las plantas' && x.data.done === 0)!.data
    expect(next).toMatchObject({ dueDate: '2026-09-28', recurrence: { freq: 'week', interval: 1, weekdays: [1, 4] } })
  })

  it('notas y hábitos', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'crear_nota', { titulo: 'Reunión', contenido: '- [ ] algo', proyecto: 'Web' })).text).toContain('en Web nueva')
    expect((await call(store, 'marcar_habito', { habito: 'correr' })).text).toContain('marcado como hecho el 2026-09-24')
    expect((await call(store, 'marcar_habito', { habito: 'correr' })).text).toContain('ya estaba hecho')
    expect((await call(store, 'marcar_habito', { habito: 'correr', hecho: false })).text).toContain('desmarcado')
    expect([...store.rows.values()].filter((x) => x.tbl === 'habitLogs')).toHaveLength(0)
    expect((await call(store, 'marcar_habito', { habito: 'yoga' })).text).toContain('Hábitos: Correr')
  })

  it('repeticiones y avisos', () => {
    expect(nextOccurrence('2026-01-31', { freq: 'month', interval: 1 })).toBe('2026-02-28')
    expect(nextOccurrence('2026-09-24', { freq: 'day', interval: 2 })).toBe('2026-09-26')
    expect(nextOccurrence('2024-02-29', { freq: 'year', interval: 1 })).toBe('2025-02-28')
    expect(computeRemindAt({ reminder: { before: 15 }, dueDate: '2026-12-01' }, 'Europe/Madrid')).toBe(Date.parse('2026-12-01T07:45:00Z'))
  })
})
