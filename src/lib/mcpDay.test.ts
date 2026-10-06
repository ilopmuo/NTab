import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'

// Martes 6 de octubre de 2026, 21:30 en Madrid: cuenta su día por la noche
const NOW = Date.parse('2026-10-06T19:30:00Z')
let n = 0
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `new-${++n}` })

function memoryStore(initial: Row[]) {
  const rows = new Map(initial.map((r) => [`${r.tbl}:${r.id}`, r]))
  const store: Store & { rows: Map<string, Row> } = {
    rows,
    load: async () => [...rows.values()],
    save: async (writes, deletes = []) => {
      for (const w of writes) rows.set(`${w.tbl}:${w.id}`, w)
      for (const d of deletes) rows.delete(`${d.tbl}:${d.id}`)
    },
  }
  return store
}
const call = async (store: Store, name: string, args: Record<string, unknown> = {}) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env())) as {
    result: { content: { text: string }[]; isError?: boolean }
  }
  return { text: r.result.content[0].text, isError: !!r.result.isError }
}
const task = (id: string, data: Record<string, unknown>): Row => ({ tbl: 'tasks', id, data: { id, done: 0, priority: 0, tags: [], subtasks: [], notes: '', order: 0, createdAt: 0, ...data } })
const base = (): Row[] => [
  task('t1', { title: 'Llamar al banco', dueDate: '2026-10-06' }),
  task('t2', { title: 'Enviar el informe trimestral', dueDate: '2026-10-05' }),
  { tbl: 'habits', id: 'h1', data: { id: 'h1', name: 'Beber agua', days: [0, 1, 2, 3, 4, 5, 6], target: 8, unit: 'vasos', archived: 0 } },
  { tbl: 'habits', id: 'h2', data: { id: 'h2', name: 'Meditar', days: [0, 1, 2, 3, 4, 5, 6], archived: 0 } },
  { tbl: 'routines', id: 'r1', data: { id: 'r1', name: 'Al levantarme', days: [0, 1, 2, 3, 4, 5, 6], steps: [{ id: 's1', title: 'Beber un vaso de agua' }, { id: 's2', title: 'Estirar' }, { id: 's3', title: 'Mirar la agenda' }], archived: 0 } },
  { tbl: 'trackers', id: 'k1', data: { id: 'k1', name: 'Regar las plantas', archived: 0 } },
  { tbl: 'people', id: 'p1', data: { id: 'p1', name: 'Ana López', email: '', phone: '', company: '', role: '', notes: '', tags: [], createdAt: 0 } },
  { tbl: 'people', id: 'p2', data: { id: 'p2', name: 'Mariana', email: '', phone: '', company: '', role: '', notes: '', tags: [], createdAt: 0 } },
  { tbl: 'shopping', id: 'b1', data: { id: 'b1', name: 'Leche', aisle: 'lacteos', checked: 0, order: 0, createdAt: 0 } },
  { tbl: 'shopping', id: 'b2', data: { id: 'b2', name: 'Pan', aisle: 'panaderia', checked: 0, order: 0, createdAt: 0 } },
  { tbl: 'areas', id: 'a1', data: { id: 'a1', name: 'Personal' } },
  { tbl: 'projects', id: 'pr1', data: { id: 'pr1', name: 'Mudanza', status: 'active', description: '', color: '#0A84FF', order: 0, createdAt: 0 } },
]
const all = (store: { rows: Map<string, Row> }, tbl: string) => [...store.rows.values()].filter((r) => r.tbl === tbl)
const one = (store: { rows: Map<string, Row> }, tbl: string, id: string) => store.rows.get(`${tbl}:${id}`)?.data

describe('contar el día desde Claude', () => {
  it('contar_dia: todo lo que cuenta queda en su sitio, de una vez', async () => {
    const store = memoryStore(base())
    const r = await call(store, 'contar_dia', {
      hecho: ['he llamado al banco', 'he enviado el informe', 'he meditado', 'he regado las plantas', 'he ido al gimnasio'],
      habitos: [{ habito: 'agua', cantidad: 5 }],
      rutinas: ['al levantarme'],
      foco: [{ que: 'el informe trimestral', minutos: 90 }],
      personas: [
        { nombre: 'Ana', tipo: 'llamada', resumen: 'Quedamos el sábado' },
        { nombre: 'Luis', tipo: 'reunión', resumen: 'Presupuesto de la reforma' },
      ],
      comida: 'Lentejas',
      cena: 'Tortilla',
      gastos: [{ texto: '12,50 comida con Ana' }],
      comprado: ['leche', 'huevos'],
      tareas: [{ titulo: 'Pedir cita al dentista' }, { titulo: 'Enviar presupuesto a Luis', hora: '10:00' }, { titulo: 'Ir a correos', fecha: '2026-10-09' }],
      diario: { texto: 'Día productivo.', animo: 4, cosas_buenas: ['Terminé el informe'] },
    })
    expect(r.isError).toBe(false)
    expect(r.text).toContain('Apuntado lo de hoy:')
    expect(r.text).toContain('LO HECHO\n- Tarea hecha: Llamar al banco.\n- Tarea hecha: Enviar el informe trimestral.\n- «Meditar» marcado como hecho el 2026-10-06.')
    expect(r.text).toContain('- «he ido al gimnasio»: no hay tarea pendiente, hábito, rutina ni «Última vez» que encaje')
    expect(r.text).toContain('- Apuntado: reunión con Luis el 2026-10-06.\n- Luis no estaba en tus personas: la he añadido.')
    expect(r.text).toContain('- Tachado de la compra: Leche.\n- No estaba en la compra: huevos.')

    // Tareas hechas y las de mañana (la que tenía fecha, la conserva)
    expect(one(store, 'tasks', 't1')).toMatchObject({ done: 1, completedAt: NOW })
    expect(one(store, 'tasks', 't2')).toMatchObject({ done: 1 })
    const created = all(store, 'tasks').filter((t) => !['t1', 't2'].includes(t.id)).map((t) => t.data)
    expect(created).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Pedir cita al dentista', dueDate: '2026-10-07' }),
        expect.objectContaining({ title: 'Enviar presupuesto a Luis', dueDate: '2026-10-07', dueTime: '10:00' }),
        expect.objectContaining({ title: 'Ir a correos', dueDate: '2026-10-09' }),
      ]),
    )
    // Hábitos: meditar hecho; agua, 5 de 8
    const logs = all(store, 'habitLogs').map((l) => l.data)
    expect(logs).toEqual(expect.arrayContaining([expect.objectContaining({ habitId: 'h2', date: '2026-10-06' }), expect.objectContaining({ habitId: 'h1', date: '2026-10-06', count: 5 })]))
    // Rutina entera, «Última vez», foco enlazado a su tarea
    expect(all(store, 'routineRuns')[0].data).toMatchObject({ routineId: 'r1', date: '2026-10-06', done: ['s1', 's2', 's3'], completedAt: NOW })
    expect(one(store, 'trackers', 'k1')).toMatchObject({ log: ['2026-10-06'] })
    expect(all(store, 'focusLogs')[0].data).toMatchObject({ taskId: 't2', title: 'Enviar el informe trimestral', date: '2026-10-06', minutes: 90, endedAt: NOW })
    // Personas: «Ana» es Ana López (no Mariana); Luis, nuevo
    const interactions = all(store, 'interactions').map((i) => i.data)
    expect(interactions).toEqual(
      expect.arrayContaining([expect.objectContaining({ personId: 'p1', kind: 'call', summary: 'Quedamos el sábado', date: '2026-10-06' }), expect.objectContaining({ kind: 'meeting', summary: 'Presupuesto de la reforma' })]),
    )
    const luis = all(store, 'people').find((p) => p.data.name === 'Luis')!
    expect(luis.data).toMatchObject({ lastContact: '2026-10-06', email: '', tags: [] })
    expect(one(store, 'people', 'p1')).toMatchObject({ lastContact: '2026-10-06' })
    expect(one(store, 'people', 'p2')).not.toHaveProperty('lastContact')
    // Comida, gasto, compra y diario
    expect(one(store, 'menu', '2026-10-06:comida')).toMatchObject({ text: 'Lentejas', meal: 'comida' })
    expect(one(store, 'menu', '2026-10-06:cena')).toMatchObject({ text: 'Tortilla', meal: 'cena' })
    expect(all(store, 'expenses')[0].data).toMatchObject({ amount: 12.5, date: '2026-10-06' })
    expect(one(store, 'shopping', 'b1')).toMatchObject({ checked: 1 })
    expect(one(store, 'shopping', 'b2')).toMatchObject({ checked: 0 })
    expect(one(store, 'journal', '2026-10-06')).toMatchObject({ text: 'Día productivo.', mood: 4, good: ['Terminé el informe'] })

    // Y el resumen lo ve todo
    const summary = (await call(store, 'ver_resumen')).text
    expect(summary).toContain('HÁBITOS DE HOY: Beber agua (pendiente, 5/8 vasos); Meditar (hecho)')
    expect(summary).toContain('- Al levantarme: hecha')
    expect(summary).toContain('FOCO: hoy 1 h 30')
    expect(summary).toContain('MENÚ DE HOY: comida: Lentejas; cena: Tortilla')
    expect(summary).toContain('LISTA DE LA COMPRA (1): Pan')
  })

  it('contar_dia de ayer: todo con la fecha de ayer; las tareas, para hoy', async () => {
    const store = memoryStore(base())
    await call(store, 'contar_dia', { fecha: '2026-10-05', hecho: ['he meditado'], cena: 'Pizza', tareas: [{ titulo: 'Llamar a Ana' }], diario: { animo: 2 }, foco: [{ que: 'Leer', minutos: 30 }] })
    expect(all(store, 'habitLogs')[0].data).toMatchObject({ habitId: 'h2', date: '2026-10-05' })
    expect(one(store, 'menu', '2026-10-05:cena')).toMatchObject({ text: 'Pizza' })
    expect(all(store, 'tasks').find((t) => t.data.title === 'Llamar a Ana')!.data).toMatchObject({ dueDate: '2026-10-06' })
    expect(one(store, 'journal', '2026-10-05')).toMatchObject({ mood: 2 })
    expect(all(store, 'focusLogs')[0].data).toMatchObject({ date: '2026-10-05', minutes: 30 })
    // Una fecha futura no vale: se queda en hoy
    await call(store, 'contar_dia', { fecha: '2026-12-01', comida: 'Arroz' })
    expect(one(store, 'menu', '2026-10-06:comida')).toMatchObject({ text: 'Arroz' })
  })

  it('contar_dia sin nada que guardar lo dice', async () => {
    const store = memoryStore(base())
    const r = await call(store, 'contar_dia', { hecho: ['he volado a la luna'] })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('No se ha guardado nada')
  })
})

describe('herramientas sueltas', () => {
  it('marcar_hecho: tarea, hábito con cantidad (+1) y lo que no encaja', async () => {
    const store = memoryStore(base())
    const r = await call(store, 'marcar_hecho', { cosas: ['he llamado al banco', 'he bebido agua', 'he pintado la valla'] })
    expect(r.text.split('\n')).toEqual([
      'Tarea hecha: Llamar al banco.',
      '«Beber agua» el 2026-10-06: 1/8 vasos.',
      expect.stringContaining('«he pintado la valla»: no hay tarea pendiente'),
    ])
    expect((await call(store, 'marcar_hecho', { cosas: ['he volado'] })).isError).toBe(true)
  })

  it('marcar_rutina: unos pasos, luego el resto; desmarcar', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'marcar_rutina', { rutina: 'levantarme', pasos: ['estirar'] })).text).toBe('«Al levantarme» hoy: 1 de 3 pasos; faltan Beber un vaso de agua y Mirar la agenda.')
    expect((await call(store, 'marcar_rutina', { rutina: 'levantarme' })).text).toBe('Rutina «Al levantarme» hecha hoy.')
    expect(all(store, 'routineRuns')).toHaveLength(1)
    expect((await call(store, 'marcar_rutina', { rutina: 'levantarme', pasos: ['mirar la agenda'], hecha: false })).text).toContain('2 de 3 pasos')
    expect(all(store, 'routineRuns')[0].data).not.toHaveProperty('completedAt')
    expect((await call(store, 'marcar_rutina', { rutina: 'levantarme', pasos: ['ducha'] })).text).toContain('no tiene el paso «ducha»')
    expect((await call(store, 'marcar_rutina', { rutina: 'dormir' })).text).toBe('No hay ninguna rutina que se llame «dormir». Rutinas: Al levantarme.')
  })

  it('apuntar_foco: con hora de fin y validando', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'apuntar_foco', { que: 'Preparar la charla', minutos: 45, hora_fin: '12:00' })).text).toBe('Foco apuntado: 45 min en «Preparar la charla» hoy (hasta las 12:00). Lleva 45 min de foco hoy.')
    expect(all(store, 'focusLogs')[0].data).toMatchObject({ endedAt: Date.parse('2026-10-06T10:00:00Z') })
    expect(all(store, 'focusLogs')[0].data).not.toHaveProperty('taskId')
    expect((await call(store, 'apuntar_foco', { que: 'x', minutos: 0 })).text).toContain('de 1 a 720')
    expect((await call(store, 'apuntar_foco', { que: 'x', minutos: 10, hora_fin: '25:00' })).text).toContain('no vale: usa HH:MM')
  })

  it('tachar_compra: texto libre como Siri', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'tachar_compra', { cosas: 'leche y 2 barras de pan' })).text).toBe('Tachado de la compra: Leche y Pan.')
    expect((await call(store, 'tachar_compra', { cosas: ['café'] })).text).toBe('No estaba en la compra: café.')
  })

  it('guardar_persona: crea, completa la ficha y no confunde nombres', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'guardar_persona', { nombre: 'Ana', cumpleanos: '03-14', telefono: '600 000 000', notas: 'Le encanta el café', idea_regalo: ['Una taza'], cada_dias: 14, etiquetas: ['#amigos'] })).text).toBe(
      'Persona actualizada: Ana López (cumpleaños 03-14, teléfono 600 000 000, notas, etiquetas #amigos, hablar cada 14 días, idea de regalo: Una taza).',
    )
    expect(one(store, 'people', 'p1')).toMatchObject({ birthday: '03-14', phone: '600 000 000', notes: 'Le encanta el café', contactEvery: 14, tags: ['amigos'], gifts: [{ text: 'Una taza' }] })
    await call(store, 'guardar_persona', { nombre: 'Ana López', notas: 'Vive en Valencia' })
    expect(one(store, 'people', 'p1')!.notes).toBe('Le encanta el café\nVive en Valencia')
    expect((await call(store, 'guardar_persona', { nombre: 'Carlos Ruiz', empresa: 'Acme', cumpleanos: '1988-07-02' })).text).toBe('Persona creada: Carlos Ruiz (cumpleaños 1988-07-02, empresa Acme).')
    expect((await call(store, 'guardar_persona', { nombre: 'Pepe', cumpleanos: '02-30' })).text).toContain('no vale: usa MM-DD')
    expect(all(store, 'people').some((p) => p.data.name === 'Pepe')).toBe(false)
    // «Ana» con dos Anas: pregunta
    await call(store, 'guardar_persona', { nombre: 'Ana Gil' })
    expect((await call(store, 'guardar_persona', { nombre: 'Ana', telefono: '1' })).text).toBe('Hay varias personas que encajan con «Ana»: Ana López, Ana Gil. ¿Quién?')
  })

  it('registrar_contacto: si no está, la añade', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'registrar_contacto', { persona: 'Marta', tipo: 'mensaje', resumen: 'Cumpleaños' })).text).toBe('Apuntado: mensaje con Marta el 2026-10-06.\nMarta no estaba en tus personas: la he añadido.')
    expect(all(store, 'people').find((p) => p.data.name === 'Marta')!.data).toMatchObject({ lastContact: '2026-10-06' })
    expect(all(store, 'people')).toHaveLength(3)
    expect((await call(store, 'registrar_contacto', { persona: 'Marta' })).text).toBe('Apuntado: contacto con Marta el 2026-10-06.')
    expect(all(store, 'people')).toHaveLength(3)
  })

  it('actualizar_proyecto: terminar, fecha límite y área', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'actualizar_proyecto', { proyecto: 'mudanza', limite: '2026-11-30', area: 'personal' })).text).toBe('Proyecto actualizado: «Mudanza»: límite 2026-11-30, área Personal.')
    expect((await call(store, 'actualizar_proyecto', { proyecto: 'mudanza', estado: 'terminado' })).text).toBe('Proyecto actualizado: «Mudanza»: terminado 🎉.')
    expect(one(store, 'projects', 'pr1')).toMatchObject({ status: 'done', deadline: '2026-11-30', areaId: 'a1' })
    expect((await call(store, 'actualizar_proyecto', { proyecto: 'mudanza', estado: 'roto' })).text).toContain('Estado «roto» no válido')
    expect((await call(store, 'actualizar_proyecto', { proyecto: 'mudanza', limite: '30/11' })).text).toContain('usa YYYY-MM-DD')
  })

  it('crear_objetivo: con cifra, con etiqueta y con proyectos', async () => {
    const store = memoryStore(base())
    expect((await call(store, 'crear_objetivo', { titulo: 'Leer 12 libros', cifra: 12, unidad: 'libros', limite: '2026-12-31' })).text).toBe(
      'Objetivo creado: «Leer 12 libros»: 0 de 12 libros (súmale con actualizar_objetivo), para 2026-12-31.',
    )
    expect(all(store, 'goals')[0].data).toMatchObject({ kind: 'number', target: 12, current: 0, unit: 'libros', status: 'active' })
    expect((await call(store, 'actualizar_objetivo', { objetivo: 'leer', sumar: 1 })).text).toBe('«Leer 12 libros»: 1 de 12 libros.')
    await call(store, 'crear_objetivo', { titulo: 'Correr 20 veces', etiqueta: '#correr', cifra: 20 })
    expect(all(store, 'goals').find((g) => g.data.title === 'Correr 20 veces')!.data).toMatchObject({ kind: 'tasks', tag: 'correr', target: 20 })
    expect((await call(store, 'crear_objetivo', { titulo: 'Casa nueva', proyectos: ['mudanza'] })).text).toBe('Objetivo creado: «Casa nueva»: con «Mudanza».')
    const goal = all(store, 'goals').find((g) => g.data.title === 'Casa nueva')!
    expect(one(store, 'projects', 'pr1')).toMatchObject({ goalId: goal.id })
    expect((await call(store, 'crear_objetivo', { titulo: 'leer 12 libros' })).text).toContain('Ya existe el objetivo')
    expect((await call(store, 'crear_objetivo', { titulo: 'X', etiqueta: 'y' })).text).toContain('di también cuántas')
  })
})
