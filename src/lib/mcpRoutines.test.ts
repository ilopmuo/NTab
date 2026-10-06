import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'
import { parseDays } from '../../supabase/functions/mcp/days'
import { db } from '@/db/db'
import { restoreFromTrash } from '@/db/trash'
import type { TrashItem } from '@/db/types'

// Martes 6 de octubre de 2026, 10:00 en Madrid
const NOW = Date.parse('2026-10-06T08:00:00Z')
let n = 0
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `new-${++n}` })

/** Como el de index.ts: lo borrado queda marcado (deleted), no desaparece */
function memoryStore(initial: Row[]) {
  const rows = new Map(initial.map((r) => [`${r.tbl}:${r.id}`, { ...r, deleted: false }]))
  const store: Store & { rows: typeof rows } = {
    rows,
    load: async () => [...rows.values()].filter((r) => !r.deleted).map(({ tbl, id, data }) => ({ tbl, id, data })),
    save: async (writes, deletes = []) => {
      for (const w of writes) rows.set(`${w.tbl}:${w.id}`, { ...w, deleted: false })
      for (const d of deletes) rows.set(`${d.tbl}:${d.id}`, { tbl: d.tbl, id: d.id, data: null as unknown as Row['data'], deleted: true })
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
const routine = (store: ReturnType<typeof memoryStore>, name: string) => [...store.rows.values()].find((r) => r.tbl === 'routines' && !r.deleted && r.data.name === name)!

describe('rutinas desde Claude', () => {
  it('crear, ver, editar y borrar: sale de Hoy, deja de avisar y va a la Papelera', async () => {
    const store = memoryStore([])

    // Días como lista, que es lo que dice el esquema
    const made = await call(store, 'crear_rutina', { nombre: 'Rutina de prueba', pasos: ['Beber agua', 'Estirar', 'Mirar la agenda'], dias: [1, 2, 3, 5], hora: '7:30' })
    expect(made.text).toBe('Rutina creada: «Rutina de prueba» con 3 pasos, lunes, martes, miércoles y viernes, aviso a las 07:30. La tiene en LUNO → Rutinas y en Hoy los días que toca.')
    const r = routine(store, 'Rutina de prueba')
    // Mismo registro que la app (createRoutine) y lo que lee el aviso del servidor (days, time HH:MM, steps)
    expect(r.data).toMatchObject({ icon: 'list', days: [1, 2, 3, 5], time: '07:30', archived: 0, order: NOW, createdAt: NOW })
    const [water, stretch] = r.data.steps as { id: string; title: string }[]

    // Hoy (martes) la ha empezado: un paso hecho
    await store.save([{ tbl: 'routineRuns', id: 'run-hoy', data: { id: 'run-hoy', routineId: r.id, date: '2026-10-06', done: [water.id] } }])

    expect((await call(store, 'ver_rutinas')).text).toBe(
      'RUTINAS (1):\n- Rutina de prueba: lunes, martes, miércoles y viernes, aviso a las 07:30 · hoy 1 de 3\n  Pasos: Beber agua → Estirar → Mirar la agenda',
    )
    expect((await call(store, 'ver_resumen')).text).toContain('RUTINAS DE HOY (listas de pasos que hace siempre igual):\n- Rutina de prueba (07:30): 1 de 3 pasos')

    // Editar: nombre, días, hora y pasos (lista completa nueva)
    const edit = await call(store, 'actualizar_rutina', { rutina: 'rutina de prueba', nombre: 'Al levantarme', dias: 'laborables', hora: '07:00', pasos: ['Beber agua', 'Ducha', 'Estirar'] })
    expect(edit.text).toBe('Rutina actualizada: «Al levantarme»: ahora se llama «Al levantarme», laborables, aviso a las 07:00, 3 pasos: Beber agua → Ducha → Estirar.')
    const edited = routine(store, 'Al levantarme')
    expect(edited.id).toBe(r.id)
    expect(edited.data).toMatchObject({ days: [1, 2, 3, 4, 5], time: '07:00' })
    // Los pasos que siguen conservan su id: lo hecho hoy no se pierde
    expect((edited.data.steps as { id: string }[]).map((s) => s.id)).toEqual([water.id, expect.stringMatching(/^new-/), stretch.id])
    expect((await call(store, 'ver_rutinas')).text).toContain('aviso a las 07:00 · hoy 1 de 3')
    // Quitar el aviso
    expect((await call(store, 'actualizar_rutina', { rutina: 'levantarme', hora: null })).text).toBe('Rutina actualizada: «Al levantarme»: sin aviso.')
    expect(routine(store, 'Al levantarme').data).not.toHaveProperty('time')
    await call(store, 'actualizar_rutina', { rutina: 'Al levantarme', hora: '07:00' })

    // Borrar (con otra que no existe: lo dice y sigue)
    const del = await call(store, 'borrar_rutina', { rutinas: ['Al levantarme', 'Antes de dormir'] })
    expect(del.isError).toBe(false)
    expect(del.text).toBe(
      'Rutina borrada: «Al levantarme». Ya no sale en Hoy ni avisa; está en la Papelera de LUNO 30 días por si la quiere recuperar.\n' +
        'No hay ninguna rutina que se llame «Antes de dormir». Rutinas: Al levantarme.',
    )
    // Borrada como en la sincronización: la rutina y sus días hechos, marcados como borrados
    expect(store.rows.get(`routines:${r.id}`)).toMatchObject({ deleted: true, data: null })
    expect(store.rows.get('routineRuns:run-hoy')).toMatchObject({ deleted: true, data: null })
    expect((await call(store, 'ver_rutinas')).text).toBe('No tiene rutinas. Se crean con crear_rutina.')
    expect((await call(store, 'ver_resumen')).text).not.toContain('RUTINAS DE HOY')
    expect((await call(store, 'borrar_rutina', { rutinas: 'Al levantarme' })).isError).toBe(true)

    // En la Papelera, como al borrarla desde la app: se recupera con sus días hechos
    const trash = store.rows.get(`trash:routines:${r.id}`)!
    expect(trash.data).toMatchObject({ tbl: 'routines', itemId: r.id, title: 'Al levantarme', deletedAt: NOW })
    await db.trash.put(trash.data as unknown as TrashItem)
    await restoreFromTrash(`routines:${r.id}`)
    expect(await db.routines.get(r.id)).toMatchObject({ name: 'Al levantarme', time: '07:00', days: [1, 2, 3, 4, 5] })
    expect(await db.routineRuns.get('run-hoy')).toMatchObject({ routineId: r.id, done: [water.id] })
  })

  it('borra varias de una vez, también con la lista como texto', async () => {
    const store = memoryStore([])
    for (const nombre of ['Antes de salir', 'Al llegar a casa', 'Antes de dormir']) await call(store, 'crear_rutina', { nombre, pasos: ['Uno'] })
    const del = await call(store, 'borrar_rutina', { rutinas: '["Antes de salir", "antes de dormir"]' })
    expect(del.text.split('\n')).toEqual([
      expect.stringContaining('Rutina borrada: «Antes de salir».'),
      expect.stringContaining('Rutina borrada: «Antes de dormir».'),
    ])
    expect((await call(store, 'ver_rutinas')).text).toContain('RUTINAS (1):\n- Al llegar a casa')
    // Un nombre que encaja con varias: pregunta cuál y no borra nada
    await call(store, 'crear_rutina', { nombre: 'Al llegar al trabajo', pasos: ['Uno'] })
    const both = await call(store, 'borrar_rutina', { rutinas: 'al llegar' })
    expect(both).toEqual({ text: 'Hay varias rutinas que encajan con «al llegar»: Al llegar a casa, Al llegar al trabajo. ¿Cuál?', isError: true })
    expect((await call(store, 'borrar_rutina', { rutinas: [] })).text).toBe('Falta qué rutina borrar (rutinas: un nombre o una lista).')
  })

  it('valida hora, días y pasos', async () => {
    const store = memoryStore([])
    const bad = async (tool: string, args: Record<string, unknown>) => {
      const r = await call(store, tool, args)
      expect(r.isError).toBe(true)
      return r.text
    }
    expect(await bad('crear_rutina', { nombre: 'X', pasos: ['a'], hora: '25:00' })).toBe('La hora «25:00» no vale: usa HH:MM en 24 h (p. ej. 08:30 o 21:00).')
    expect(await bad('crear_rutina', { nombre: 'X', pasos: ['a'], dias: [1, 9] })).toContain('no vale «9»')
    // Antes, una lista como texto se ignoraba y la rutina quedaba para todos los días
    expect(await bad('crear_rutina', { nombre: 'X', pasos: ['a'], dias: '[1, 9]' })).toContain('no vale «9»')
    expect(await bad('crear_rutina', { nombre: 'X', pasos: [] })).toBe('Falta el nombre o los pasos de la rutina.')
    expect(routine(store, 'X')).toBeUndefined()

    await call(store, 'crear_rutina', { nombre: 'Antes de salir', pasos: ['Llaves'] })
    await call(store, 'crear_rutina', { nombre: 'Al volver', pasos: ['Zapatos'] })
    const before = routine(store, 'Antes de salir').data
    expect(await bad('actualizar_rutina', { rutina: 'antes de salir', hora: '7.30', dias: [1, 2] })).toContain('La hora «7.30» no vale')
    expect(routine(store, 'Antes de salir').data).toEqual(before)
    expect(await bad('actualizar_rutina', { rutina: 'antes de salir', pasos: [] })).toContain('al menos un paso')
    expect(await bad('actualizar_rutina', { rutina: 'antes de salir', nombre: 'al volver' })).toBe('Ya hay otra rutina «Al volver».')
    expect(await bad('actualizar_rutina', { rutina: 'antes de salir' })).toBe('No has dicho qué cambiar de «Antes de salir».')
    expect(await bad('actualizar_rutina', { rutina: 'nadar', hora: '08:00' })).toBe('No hay ninguna rutina que se llame «nadar». Rutinas: Antes de salir, Al volver.')
    expect(await bad('crear_rutina', { nombre: 'antes de salir', pasos: ['x'] })).toContain('Ya existe la rutina «Antes de salir»')
  })
})

describe('días: en todas las herramientas, igual', () => {
  it('lista, lista como texto, «1,2,3,5», palabras, nombres y letras', () => {
    const days = (v: unknown) => parseDays(v).days
    expect(days([1, 2, 3, 5])).toEqual([1, 2, 3, 5])
    expect(days('[1, 2, 3, 5]')).toEqual([1, 2, 3, 5])
    expect(days('["1", "3"]')).toEqual([1, 3])
    expect(days('1,2,3,5')).toEqual([1, 2, 3, 5])
    expect(days('1, 2, 3 y 5')).toEqual([1, 2, 3, 5])
    expect(days('1 3 5')).toEqual([1, 3, 5])
    expect(days(['5', 1])).toEqual([1, 5])
    expect(days(3)).toEqual([3])
    expect(days('todos')).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(days('laborables')).toEqual([1, 2, 3, 4, 5])
    expect(days('Fines de semana')).toEqual([0, 6])
    expect(days('de lunes a viernes')).toEqual([1, 2, 3, 4, 5])
    expect(days('lunes, miércoles y viernes')).toEqual([1, 3, 5])
    expect(days(['lunes', 'sábado'])).toEqual([1, 6])
    expect(days('L, X, V')).toEqual([1, 3, 5])
    expect(days('[lunes, martes]')).toEqual([1, 2])
    expect(parseDays(undefined)).toEqual({})
    expect(parseDays('[]').error).toContain('Indica al menos un día')
    expect(parseDays('a veces').error).toContain('No entiendo los días «a veces»')
    expect(parseDays([0, 7]).error).toContain('no vale «7»')
    expect(parseDays([1.5]).error).toContain('no vale «1.5»')
  })

  it('crear_habito y actualizar_habito aceptan la lista y la lista como texto', async () => {
    const store = memoryStore([])
    const habitDays = (name: string) => [...store.rows.values()].find((r) => r.tbl === 'habits' && r.data.name === name)!.data.days
    expect((await call(store, 'crear_habito', { nombre: 'Correr', dias: [1, 2, 3, 5] })).text).toContain('Hábito creado: «Correr», lunes, martes, miércoles y viernes.')
    expect(habitDays('Correr')).toEqual([1, 2, 3, 5])
    // Así llegaba desde Claude y daba «No entiendo los días»
    expect((await call(store, 'crear_habito', { nombre: 'Leer', dias: '[1, 2, 3, 5]' })).isError).toBe(false)
    expect(habitDays('Leer')).toEqual([1, 2, 3, 5])
    await call(store, 'crear_habito', { nombre: 'Meditar', dias: '1,2,3,5' })
    expect(habitDays('Meditar')).toEqual([1, 2, 3, 5])
    expect((await call(store, 'actualizar_habito', { habito: 'correr', dias: '[0, 6]' })).text).toBe('Hábito actualizado: «Correr»: fines de semana.')
    expect((await call(store, 'actualizar_habito', { habito: 'leer', dias: [2, 4] })).text).toBe('Hábito actualizado: «Leer»: martes y jueves.')
    expect((await call(store, 'actualizar_habito', { habito: 'meditar', dias: 'todos' })).text).toBe('Hábito actualizado: «Meditar»: todos los días.')
  })
})
