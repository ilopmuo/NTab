import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import { advanceCharge, computeRemindAt, nextOccurrence, type Env, type Row } from '../../supabase/functions/mcp/ntab'
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
    expect(list.result.tools.map((t) => t.name)).toEqual(['ver_resumen', 'contar_dia', 'marcar_hecho', 'ver_eventos', 'buscar_tareas', 'crear_tareas', 'actualizar_tareas', 'buscar_notas', 'anadir_a_nota', 'crear_nota', 'marcar_habito', 'ver_habitos', 'crear_habito', 'actualizar_habito', 'crear_proyecto', 'actualizar_proyecto', 'donde_esta', 'guardar_cosa', 'marcar_devuelto', 'apuntar_gasto', 'ver_gastos', 'ver_menu', 'planificar_menu', 'crear_receta', 'cuenta_atras', 'apuntar_foco', 'que_hago', 'ver_diario', 'escribir_diario', 'ver_casa', 'anadir_a_casa', 'hecho_en_casa', 'ver_compra', 'anadir_compra', 'tachar_compra', 'ver_medicacion', 'tomar_medicacion', 'ultima_vez', 'lo_he_hecho', 'crear_rutina', 'ver_rutinas', 'actualizar_rutina', 'borrar_rutina', 'marcar_rutina', 'actualizar_objetivo', 'crear_objetivo', 'guardar_persona', 'registrar_contacto', 'guardar_pago', 'marcar_pago', 'ver_plantillas', 'usar_plantilla'])
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

  it('resumen: fechas importantes, ideas de regalo, hábitos en pausa y «días sin…»', async () => {
    const rows = base().map((r) =>
      r.tbl === 'people' ? { ...r, data: { ...r.data, dates: [{ id: 'd', label: 'Aniversario', date: '2016-09-26' }], gifts: [{ id: 'g', text: 'Una novela' }, { id: 'h', text: 'Taza', given: '2026-01-06' }] } } : r.tbl === 'habits' ? { ...r, data: { ...r.data, breaks: [{ from: '2026-09-20' }] } } : r,
    )
    rows.push({ tbl: 'trackers', id: 'f', data: { id: 'f', name: 'Fumar', avoid: true, costPerDay: 5, log: ['2026-09-14'], archived: 0, createdAt: 0 } })
    const { text } = await call(memoryStore(rows), 'ver_resumen')
    expect(text).toContain('- Aniversario (Ana): el sábado 26')
    expect(text).toContain('- Ideas de regalo para Ana: Una novela')
    expect(text).not.toContain('Correr (pendiente)')
    expect((await call(memoryStore(rows), 'ultima_vez', { cosa: 'fumar' })).text).toContain('Fumar · lo quiere dejar: 10 días sin hacerlo (última recaída 2026-09-14) · ahorra 5 al día')
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

  it('cosas: garantía, precio y estancia', async () => {
    const store = memoryStore(base())
    const r = await call(store, 'guardar_cosa', { nombre: 'Lavadora', donde: 'cocina, junto a la nevera', estancia: 'Cocina', comprado: '2026-03-01', precio: 499, garantia: '2029-03-01' })
    expect(r.text).toContain('Lavadora · está en: cocina, junto a la nevera, Cocina · garantía hasta 2029-03-01 · costó 499 € el 2026-03-01')
    expect(r.text).toContain('te avisaré el 2029-01-30')
    const d = [...store.rows.values()].find((x) => x.tbl === 'things')!.data
    expect(d).toMatchObject({ kind: 'stored', room: 'Cocina', warranty: '2029-03-01', price: 499 })
  })

  it('proyectos, objetivos, personas y pagos', async () => {
    const store = memoryStore([
      ...base(),
      { tbl: 'goals', id: 'g1', data: { id: 'g1', title: 'Leer 12 libros', kind: 'number', current: 3, target: 12, unit: 'libros', status: 'active' } },
      { tbl: 'goals', id: 'g2', data: { id: 'g2', title: 'Media maratón', kind: 'projects', status: 'active' } },
      { tbl: 'subscriptions', id: 'rent', data: { id: 'rent', name: 'Alquiler', kind: 'bill', amount: 750, cycle: 'month', nextDate: '2026-01-31', anchorDay: 31, notifyDays: 1, active: true } },
    ])
    const rows = () => [...store.rows.values()]

    expect((await call(store, 'crear_proyecto', { nombre: 'Viaje a Japón', area: 'trabajo', limite: '2027-04-01' })).text).toBe('Proyecto creado: «Viaje a Japón» en Trabajo, límite 2027-04-01.')
    expect(rows().find((r) => r.tbl === 'projects' && r.data.name === 'Viaje a Japón')!.data).toMatchObject({ status: 'active', areaId: 'a1', deadline: '2027-04-01' })
    expect((await call(store, 'crear_proyecto', { nombre: 'web nueva' })).isError).toBe(true)

    expect((await call(store, 'actualizar_objetivo', { objetivo: 'leer', sumar: 1 })).text).toBe('«Leer 12 libros»: 4 de 12 libros.')
    expect(store.rows.get('goals:g1')!.data.log).toEqual([{ date: '2026-09-24', value: 4 }])
    expect((await call(store, 'actualizar_objetivo', { objetivo: 'maraton', cifra: 3 })).isError).toBe(true)
    await call(store, 'actualizar_objetivo', { objetivo: 'maraton', conseguido: true })
    expect(store.rows.get('goals:g2')!.data).toMatchObject({ status: 'done', completedAt: NOW })

    expect((await call(store, 'registrar_contacto', { persona: 'ana', tipo: 'llamada', resumen: 'Cumpleaños' })).text).toBe('Apuntado: llamada con Ana el 2026-09-24.')
    expect(rows().find((r) => r.tbl === 'interactions')!.data).toMatchObject({ personId: 'x1', kind: 'call', date: '2026-09-24', summary: 'Cumpleaños' })
    expect(store.rows.get('people:x1')!.data.lastContact).toBe('2026-09-24')

    expect((await call(store, 'marcar_pago', { pago: 'alquiler' })).text).toBe('«Alquiler» pagado. Próximo cargo: 2026-02-28.')
    expect(store.rows.get('subscriptions:rent')!.data.remindAt).toBe(zonedToUtc('2026-02-27', '09:00', 'Europe/Madrid'))
    await call(store, 'marcar_pago', { pago: 'alquiler' })
    expect(store.rows.get('subscriptions:rent')!.data.nextDate).toBe('2026-03-31')
    expect(store.rows.get('subscriptions:rent')!.data.paidLog).toHaveLength(2)
  })

  it('pagos: guardar, pruebas gratis y subidas de precio', async () => {
    const store = memoryStore(base())
    const nb = (x: { text: string }) => x.text.replace(/\u00a0/g, ' ')
    let r = nb(await call(store, 'guardar_pago', { nombre: 'disney+', importe: 9.99, prueba_hasta: '2026-10-08' }))
    expect(r).toContain('«Disney+» guardado: 9,99 € cada mes, próximo cargo')
    expect(r).toContain('Es una prueba gratis hasta 2026-10-08: avisaré 2 días antes')
    const d = [...store.rows.values()].find((x) => x.data.name === 'Disney+')!.data
    expect(d).toMatchObject({ kind: 'sub', cycle: 'month', nextDate: '2026-10-08', trialEnds: '2026-10-08', anchorDay: 8, notifyDays: 2, remindAt: zonedToUtc('2026-10-06', '09:00', 'Europe/Madrid') })
    expect(nb(await call(store, 'ver_resumen'))).toContain('Disney+ 9.99 EUR (ACABA LA PRUEBA GRATIS')

    r = nb(await call(store, 'guardar_pago', { nombre: 'netflix', importe: 13.99 }))
    expect(r).toContain('«Netflix» actualizado: 13,99 € cada mes')
    expect(r).toContain('Sube de 12,99 € a 13,99 € (+8 %).')
    expect(store.rows.get('subscriptions:s1')!.data.priceHistory).toEqual([{ date: '2026-09-24', amount: 12.99 }])

    r = nb(await call(store, 'guardar_pago', { nombre: 'Seguro del coche', importe: 300, cada: 'año', proximo: '2025-03-01' }))
    expect(r).toContain('300 € cada año, próximo cargo')
    expect([...store.rows.values()].find((x) => x.data.name === 'Seguro del coche')!.data.nextDate).toBe('2027-03-01')
    expect((await call(store, 'guardar_pago', { nombre: 'Gimnasio' })).isError).toBe(true)
  })

  it('el día: lo importante, las pospuestas y el objetivo diario', async () => {
    const store = memoryStore([
      ...base(),
      task('t5', { title: 'Renovar el DNI', dueDate: '2026-09-20', postponed: 3 }),
      { tbl: 'settings', id: 'dailyGoal', data: { key: 'dailyGoal', value: { tasks: 1, daysOff: [0, 6] } } },
      task('d1', { title: 'Ayer', done: 1, completedAt: Date.parse('2026-09-23T10:00:00Z') }),
      task('d2', { title: 'Anteayer', done: 1, completedAt: Date.parse('2026-09-22T10:00:00Z') }),
    ])
    const rows = () => [...store.rows.values()]
    let r = await call(store, 'actualizar_tareas', { cambios: [{ id: 't2', importante: true }, { id: 't3', importante: true }] })
    expect(store.rows.get('tasks:t2')!.data.important).toBe('2026-09-24')
    let sum = (await call(store, 'ver_resumen')).text
    expect(sum).toContain('LO IMPORTANTE DE HOY (lo que eligió; ayúdale a hacerlo antes que lo demás): Llamar al banco [t2]; Regar las plantas [t3]')
    expect(sum).toContain('[t5] Renovar el DNI · domingo 20/9 (hace 4 días) (2026-09-20) · pospuesta 3 veces (propón algún día o partirla)')
    // Comprar pan se completó hoy: objetivo de 1 cumplido, con ayer y anteayer
    expect(sum).toContain('OBJETIVO DIARIO: 1 tareas; hoy lleva 1. Racha: 3 días (mejor 3).')

    // Como mucho tres
    await call(store, 'crear_tareas', { tareas: [{ titulo: 'Preparar la reunión', importante: true }] })
    expect(rows().find((x) => x.data.title === 'Preparar la reunión')!.data).toMatchObject({ important: '2026-09-24', dueDate: '2026-09-24' })
    r = await call(store, 'actualizar_tareas', { cambios: [{ id: 't1', importante: true }] })
    expect(r.text).toContain('Ya hay 3 cosas importantes para hoy')
    expect(store.rows.get('tasks:t1')!.data.important).toBeUndefined()

    // Pasarla a mañana cuenta como pospuesta y deja de ser lo importante de hoy
    await call(store, 'actualizar_tareas', { cambios: [{ id: 't2', fecha: '2026-09-25' }] })
    expect(store.rows.get('tasks:t2')!.data).toMatchObject({ postponed: 1, dueDate: '2026-09-25' })
    expect(store.rows.get('tasks:t2')!.data.important).toBeUndefined()
    // Las que se repiten no cuentan
    await call(store, 'actualizar_tareas', { cambios: [{ id: 't3', fecha: '2026-09-28' }] })
    expect(store.rows.get('tasks:t3')!.data.postponed).toBeUndefined()
    await call(store, 'actualizar_tareas', { cambios: [{ id: 't3', importante: false }] })
    expect(store.rows.get('tasks:t3')!.data.important).toBeUndefined()
  })

  it('notas: buscar, leer y añadir (como lista si ya lo es)', async () => {
    const store = memoryStore([
      ...base(),
      { tbl: 'notes', id: 'n1', data: { id: 'n1', title: 'Maleta', content: '- [x] DNI\n- [ ] Cargador', pinned: 0, createdAt: 0, updatedAt: Date.parse('2026-09-20T10:00:00Z') } },
      { tbl: 'notes', id: 'n2', data: { id: 'n2', title: 'Ideas', content: 'Una bici plegable\n#proyectos', pinned: 0, createdAt: 0, updatedAt: Date.parse('2026-09-22T10:00:00Z') } },
    ])
    let r = (await call(store, 'buscar_notas', {})).text
    expect(r).toContain('2 notas (de la más reciente')
    expect(r).toContain('- «Maleta» (2026-09-20) · lista 1/2: DNI')
    r = (await call(store, 'buscar_notas', { buscar: 'bici' })).text
    expect(r).toBe('«Ideas» (editada el 2026-09-22):\nUna bici plegable\n#proyectos')
    expect((await call(store, 'buscar_notas', { nota: 'maleta' })).text).toContain('lista: 1 de 2 marcadas')
    expect((await call(store, 'buscar_notas', { buscar: 'pasaporte' })).text).toBe('No hay notas con «pasaporte».')

    expect((await call(store, 'anadir_a_nota', { nota: 'maleta', texto: 'crema solar, gafas' })).text).toBe('Añadido a «Maleta»: 2 cosas en la lista.')
    expect(store.rows.get('notes:n1')!.data).toMatchObject({ content: '- [x] DNI\n- [ ] Cargador\n- [ ] crema solar\n- [ ] gafas', updatedAt: NOW })
    await call(store, 'anadir_a_nota', { nota: 'Ideas', texto: 'Un huerto en la terraza' })
    expect(store.rows.get('notes:n2')!.data.content).toBe('Una bici plegable\n#proyectos\nUn huerto en la terraza')
    expect((await call(store, 'anadir_a_nota', { nota: 'regalos', texto: 'libro, bufanda', como_lista: true })).text).toBe('No había una nota «regalos»: la he creado con eso.')
    expect([...store.rows.values()].find((x) => x.data.title === 'Regalos')!.data.content).toBe('- [ ] libro\n- [ ] bufanda')
  })

  it('cargos por ciclos', () => {
    expect(advanceCharge('2026-09-24', 'week')).toBe('2026-10-01')
    expect(advanceCharge('2026-11-30', 'quarter')).toBe('2027-02-28')
    expect(advanceCharge('2026-09-24', 'year')).toBe('2027-09-24')
  })

  it('personas: crear con @, buscar y resumen', async () => {
    const store = memoryStore(base())
    const r = await call(store, 'crear_tareas', { tareas: [{ titulo: 'Devolver el libro', personas: ['@ana', 'Pepe'] }] })
    expect(r.text).toContain('· con Ana')
    expect(r.text).toContain('(no encontré a: Pepe)')
    const created = [...store.rows.values()].find((x) => x.data.title === 'Devolver el libro')!
    expect(created.data.people).toEqual(['x1'])
    expect((await call(store, 'buscar_tareas', { persona: 'ana' })).text).toContain('Devolver el libro')
    expect((await call(store, 'buscar_tareas', { persona: 'nadie' })).text).toMatch(/No hay ninguna persona/)
    expect((await call(store, 'ver_resumen')).text).toContain('Devolver el libro · sin fecha · con Ana')
  })

  it('eventos de los calendarios en el resumen y en ver_eventos', async () => {
    const store = memoryStore(base())
    store.events = async () => ({
      names: { g: 'Trabajo' },
      events: [
        { sourceId: 'g', title: 'Reunión de equipo', allDay: false, start: '2026-09-24T09:00:00.000Z', end: '2026-09-24T09:30:00.000Z', location: 'Sala 2' },
        { sourceId: 'g', title: 'Congreso', allDay: true, start: '2026-09-26', end: '2026-09-28' },
        { sourceId: 'g', title: 'Ya pasó', allDay: false, start: '2026-09-23T09:00:00.000Z', end: '2026-09-23T10:00:00.000Z' },
      ],
    })
    const summary = (await call(store, 'ver_resumen')).text
    expect(summary).toContain('EVENTOS DE SUS CALENDARIOS, PRÓXIMOS 7 DÍAS (2)')
    expect(summary).toContain('- hoy (2026-09-24) 11:00–11:30: Reunión de equipo (Trabajo) · Sala 2')
    expect(summary).toContain('- el sábado 26 (2026-09-26) todo el día: Congreso (Trabajo)')
    expect(summary).not.toContain('Ya pasó')
    const list = (await call(store, 'ver_eventos', { desde: '2026-09-26', hasta: '2026-09-30' })).text
    expect(list).toBe('- el sábado 26 (2026-09-26) todo el día: Congreso (Trabajo)')
  })

  it('duración estimada y carga del día', async () => {
    const store = memoryStore(base())
    store.events = async () => ({
      names: {},
      events: [{ sourceId: 'g', title: 'Comité', allDay: false, start: '2026-09-24T12:00:00.000Z', end: '2026-09-24T17:00:00.000Z' }],
    })
    const r = await call(store, 'crear_tareas', { tareas: [{ titulo: 'Preparar la presentación', fecha: '2026-09-24', duracion: 90 }] })
    expect(r.text).toContain('Preparar la presentación · hoy (2026-09-24) · ~1 h 30')
    const summary = (await call(store, 'ver_resumen')).text
    expect(summary).toMatch(/Carga de hoy: 6 h 30 \(1 h 30 de tareas estimadas, 5 h de reuniones(, \d+ tareas? de hoy sin duración)?\)\. Jornada de referencia: 6 h — HOY ESTÁ SOBRECARGADO/)
    const task = () => [...store.rows.values()].find((x) => x.data.title === 'Preparar la presentación')!
    expect(task().data.estimate).toBe(90)
    await call(store, 'actualizar_tareas', { cambios: [{ id: task().id, duracion: null }] })
    expect(task().data.estimate).toBeUndefined()
  })

  it('insistir hasta que lo haga', async () => {
    const store = memoryStore(base())
    const r = await call(store, 'crear_tareas', { tareas: [{ titulo: 'Tomar la pastilla', fecha: '2026-09-24', hora: '22:00', insistir: 10 }] })
    expect(r.text).toContain('insiste cada 10 min')
    const task = () => [...store.rows.values()].find((x) => x.data.title === 'Tomar la pastilla')!
    expect(task().data.nag).toBe(10)
    expect(typeof task().data.remindAt).toBe('number')
    await call(store, 'actualizar_tareas', { cambios: [{ id: task().id, insistir: null }] })
    expect(task().data.nag).toBeUndefined()
  })

  it('rutinas: crear y verlas en el resumen', async () => {
    const store = memoryStore(base())
    const r = await call(store, 'crear_rutina', { nombre: 'Antes de salir', pasos: ['Llaves', 'Cartera', 'Móvil'], dias: 'todos', hora: '8:05' })
    expect(r.text).toBe('Rutina creada: «Antes de salir» con 3 pasos, todos los días, aviso a las 08:05. La tiene en LUNO → Rutinas y en Hoy los días que toca.')
    const routine = [...store.rows.values()].find((x) => x.tbl === 'routines')!
    const first = (routine.data.steps as { id: string }[])[0].id
    await store.save([{ tbl: 'routineRuns', id: 'run', data: { routineId: routine.id, date: '2026-09-24', done: [first] } }])
    const summary = (await call(store, 'ver_resumen')).text
    expect(summary).toContain('- Antes de salir (08:05): 1 de 3 pasos; faltan: Cartera, Móvil')
    expect((await call(store, 'crear_rutina', { nombre: 'antes de salir', pasos: ['x'] })).text).toContain('Ya existe')
  })

  it('cosas: apuntar, buscar, préstamos y caducidades', async () => {
    const store = memoryStore(base())
    let r = await call(store, 'guardar_cosa', { nombre: 'Pasaporte', donde: 'Cajón del escritorio', tipo: 'caduca', caduca: '2027-03-01' })
    expect(r.text).toContain('Apuntado: Pasaporte · caduca')
    expect(r.text).toContain('está en: Cajón del escritorio')
    expect(r.text).toContain('te avisaré el 2027-01-30')
    r = await call(store, 'guardar_cosa', { nombre: 'Taladro', tipo: 'prestado', persona: 'Ana', devolver: '2026-10-01' })
    expect(r.text).toContain('lo tiene Ana')
    const taladro = [...store.rows.values()].find((x) => x.data.name === 'Taladro')!
    expect(taladro.data.personId).toBe('x1')
    expect(typeof taladro.data.remindAt).toBe('number')
    expect((await call(store, 'donde_esta', { busqueda: 'cajon' })).text).toContain('Pasaporte')
    expect((await call(store, 'donde_esta', { busqueda: 'ana' })).text).toContain('Taladro')
    expect((await call(store, 'ver_resumen')).text).toContain('- Prestado: Taladro · lo tiene Ana')
    r = await call(store, 'marcar_devuelto', { cosa: 'taladro' })
    expect(r.text).toBe('«Taladro» marcado como devuelto.')
    expect((await call(store, 'guardar_cosa', { nombre: 'Libro', tipo: 'prestado' })).text).toContain('hace falta la persona')
  })

  it('última vez: apuntar, consultar y lo que toca', async () => {
    const store = memoryStore(base())
    let r = await call(store, 'lo_he_hecho', { cosa: 'cambiar las sábanas', fecha: '2026-09-01', cada_dias: 14 })
    expect(r.text).toContain('Creado y apuntado: Cambiar las sábanas · última vez')
    expect(r.text).toContain('Le avisaré el 2026-09-25')
    expect((await call(store, 'ultima_vez', { cosa: 'sabanas' })).text).toContain('hace 23 días')
    expect((await call(store, 'ver_resumen')).text).toContain('TOCA HACER')
    r = await call(store, 'lo_he_hecho', { cosa: 'sábanas' })
    expect(r.text).toContain('Apuntado: Cambiar las sábanas · última vez hoy')
    expect(r.text).toContain('2 veces apuntado')
    expect((await call(store, 'ver_resumen')).text).not.toContain('TOCA HACER')
  })

  it('compra: añadir sin repetir y verla por pasillos', async () => {
    const store = memoryStore(base())
    let r = await call(store, 'anadir_compra', { cosas: 'leche, 2 barras de pan y detergente' })
    expect(r.text).toBe('Añadido a la compra: Leche, Pan (2 barras), Detergente.')
    r = await call(store, 'anadir_compra', { cosas: ['leche', 'plátanos'] })
    expect(r.text).toBe('Añadido a la compra: Plátanos.\nYa estaba: Leche.')
    expect((await call(store, 'ver_compra')).text).toBe('Fruta y verdura: Plátanos\nPanadería: Pan (2 barras)\nLácteos y huevos: Leche\nLimpieza y hogar: Detergente')

    // Varias listas y precios
    store.rows.set('settings:shoppingLists', { tbl: 'settings', id: 'shoppingLists', data: { id: 'shoppingLists', value: [{ id: 'far', name: 'Farmacia' }] } })
    r = await call(store, 'anadir_compra', { cosas: 'ibuprofeno 3,50 €', lista: 'farmacia' })
    expect(r.text).toBe('Añadido a la compra (Farmacia): Ibuprofeno.')
    expect((await call(store, 'anadir_compra', { cosas: 'tiritas', lista: 'ferretería' })).text).toContain('No tiene ninguna lista «ferretería»')
    const listed = (await call(store, 'ver_compra')).text
    expect(listed).toContain('LISTA SÚPER:')
    expect(listed).toContain('LISTA FARMACIA:\nHigiene y farmacia: Ibuprofeno 3,50 €\nTotal estimado: 3,50 €')
    expect((await call(store, 'ver_resumen')).text).toContain('LISTA DE LA COMPRA (6)')
  })

  it('diario: escribir, añadir y leer; ánimo en el resumen', async () => {
    const store = memoryStore(base())
    let r = await call(store, 'escribir_diario', { texto: 'Buen día de trabajo.', animo: 4, cosas_buenas: ['Terminé el informe'] })
    expect(r.text).toBe('Apuntado en el diario de hoy (ánimo: bien).')
    r = await call(store, 'escribir_diario', { texto: 'Por la tarde, cine.' })
    const entry = [...store.rows.values()].find((x) => x.tbl === 'journal')!
    expect(entry.id).toBe('2026-09-24')
    expect(entry.data.text).toBe('Buen día de trabajo.\n\nPor la tarde, cine.')
    expect(entry.data.mood).toBe(4)
    expect((await call(store, 'ver_diario', {})).text).toContain('ánimo bien: Buen día de trabajo.')
    expect((await call(store, 'ver_resumen')).text).toContain('ÁNIMO ÚLTIMOS DÍAS (diario, 1 muy mal – 5 muy bien): hoy 4')
  })

  it('qué hago ahora', async () => {
    const store = memoryStore(base())
    await call(store, 'crear_tareas', { tareas: [{ titulo: 'Preparar la presentación', fecha: '2026-09-24', prioridad: 3, duracion: 90 }, { titulo: 'Regar las plantas', fecha: '2026-09-24', duracion: 10 }] })
    const short = (await call(store, 'que_hago', { minutos: 30 })).text
    expect(short).toContain('Regar las plantas')
    expect(short).not.toContain('Preparar la presentación')
    const long = (await call(store, 'que_hago', { minutos: 120, energia: 'mucha' })).text
    expect(long.split('\n')[1]).toContain('Preparar la presentación')
  })

  it('gastos: apuntar con texto y ver el mes', async () => {
    const store = memoryStore(base())
    await store.save([{ tbl: 'settings', id: 'budget', data: { key: 'budget', value: { monthly: 100 } } }])
    const nb = (x: { text: string }) => ({ ...x, text: x.text.replace(/\u00a0/g, ' ') })
    let r = nb(await call(store, 'apuntar_gasto', { texto: '63 súper' }))
    expect(r.text).toBe('Apuntado: 63 € · Súper (Supermercado, hoy). Este mes: 63 € de 100 €.')
    r = nb(await call(store, 'apuntar_gasto', { texto: 'ayer 45,50 cena' }))
    expect(r.text).toContain('45,50 € · Cena (Comer fuera, ayer)')
    expect(r.text).toContain('SE HA PASADO DEL PRESUPUESTO')
    const list = nb(await call(store, 'ver_gastos', {})).text
    expect(list).toContain('Gastos de 2026-09: 108,50 € en 2 gastos, presupuesto 100 €')
    expect(list).toContain('- Supermercado: 63 € (58 %)')
    expect(nb(await call(store, 'ver_resumen')).text).toContain('GASTOS DE ESTE MES: 108,50 € de un presupuesto de 100 €')
  })

  it('gastos: categorías aprendidas, etiquetas, límites y búsqueda', async () => {
    const store = memoryStore(base())
    await store.save([
      { tbl: 'settings', id: 'budget', data: { key: 'budget', value: { monthly: 1000, categories: { comer: 50 } } } },
      { tbl: 'settings', id: 'expenseRules', data: { key: 'expenseRules', value: { 'bizum ana': 'regalos' } } },
    ])
    const nb = (x: { text: string }) => x.text.replace(/\u00a0/g, ' ')
    expect(nb(await call(store, 'apuntar_gasto', { texto: '20 bizum Ana' }))).toContain('Bizum Ana (Regalos, hoy)')
    let r = nb(await call(store, 'apuntar_gasto', { texto: '42 cena #Roma' }))
    expect(r).toContain('Cena (Comer fuera, #roma, hoy)')
    expect(r).toContain('lleva el 84 % del límite de comer fuera')
    r = nb(await call(store, 'apuntar_gasto', { texto: '15 museo', etiquetas: ['roma'] }))
    expect(r).toContain('#roma')
    expect(nb(await call(store, 'apuntar_gasto', { texto: '10 helado' }))).toContain('se ha pasado del límite de comer fuera (52 € de 50 €)')
    const month = nb(await call(store, 'ver_gastos', {}))
    expect(month).toContain('- Comer fuera: 52 € (60 %) de un límite de 50 € — SE HA PASADO 2 €')
    expect(month).toContain('- #roma: 57 € (2026-09-24 a 2026-09-24)')
    expect(month).toContain('Últimos 6 meses: 2026-04 0 € · 2026-05 0 € · 2026-06 0 € · 2026-07 0 € · 2026-08 0 € · 2026-09 87 €.')
    expect(nb(await call(store, 'ver_gastos', { buscar: '#roma' }))).toContain('«#roma»: 2 gastos, 57 € en total')
    expect(nb(await call(store, 'ver_gastos', { buscar: 'mercadona' }))).toBe('No hay gastos con «mercadona».')
  })

  it('menú: recetas, planificar y ver', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'crear_receta', { nombre: 'Tortilla de patatas', ingredientes: ['6 huevos', '1 kg de patatas'] })).text).toBe('Receta guardada: Tortilla de patatas (2 ingredientes).')
    const r = await call(store, 'planificar_menu', { comidas: [{ fecha: '2026-09-24', comida: 'tortilla de patatas', cena: 'Sobras' }] })
    expect(r.text).toContain('2026-09-24 comida: Tortilla de patatas (receta)')
    expect(r.text).toContain('2026-09-24 cena: Sobras')
    expect((await call(store, 'ver_menu', {})).text).toContain('- hoy (2026-09-24): comida Tortilla de patatas · cena Sobras')
    expect((await call(store, 'ver_resumen')).text).toContain('MENÚ DE HOY: comida: Tortilla de patatas; cena: Sobras')
  })

  it('cuenta atrás', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'cuenta_atras', { nombre: 'Vacaciones', fecha: '2026-10-14' })).text).toContain('faltan 20 días')
    expect((await call(store, 'ver_resumen')).text).toContain('CUENTAS ATRÁS: Vacaciones (2026-10-14, faltan 20 días)')
    expect((await call(store, 'cuenta_atras', { nombre: 'Algo', fecha: '2026-01-01' })).text).toBe('Esa fecha ya ha pasado.')
  })
})
