import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'

// Jueves 24 de septiembre de 2026 en Madrid
const T0 = Date.parse('2026-09-24T06:00:00Z') // 8:00
let n = 0
let now = T0
let via = 'hermes'
const env = (): Env => ({ tz: 'Europe/Madrid', now, autoRemind: true, newId: () => `id${++n}abcdefgh`, via })

function memoryStore(initial: Row[]) {
  const rows = new Map(initial.map((r) => [`${r.tbl}:${r.id}`, r]))
  const store: Store & { rows: Map<string, Row> } = {
    rows,
    async load(tables) {
      return [...rows.values()].filter((r) => !tables || tables.includes(r.tbl))
    },
    async save(writes, deletes = []) {
      for (const w of writes) rows.set(`${w.tbl}:${w.id}`, { ...w, data: Object.fromEntries(Object.entries(w.data).reverse()) })
      for (const d of deletes) rows.delete(`${d.tbl}:${d.id}`)
    },
  }
  return store
}
const task = (id: string, data: Record<string, unknown>): Row => ({
  tbl: 'tasks',
  id,
  data: { id, title: id, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: T0 - 864e5 * 3, ...data },
})
const call = async (store: Store, name: string, args: Record<string, unknown> = {}) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env())) as { result: { content: { text: string }[]; isError?: boolean } }
  return { text: r.result.content[0].text, extra: r.result.content.slice(1).map((c) => c.text).join(' '), isError: !!r.result.isError }
}
/** Lo que cambia el usuario desde la app: directo en la tabla, sin pasar por el conector */
const edit = (store: ReturnType<typeof memoryStore>, id: string, patch: Record<string, unknown>) => {
  const r = store.rows.get(`tasks:${id}`)!
  store.rows.set(`tasks:${id}`, { ...r, data: { ...r.data, ...patch } })
}
const later = (min: number) => (now += min * 60_000)

describe('ver_novedades: qué ha cambiado desde la última revisión', () => {
  it('la primera vez dice lo nuevo y lo hecho; después, también fechas, esperas y borradas', async () => {
    now = T0
    via = 'hermes'
    const store = memoryStore([
      task('dentista', { title: 'Llamar al dentista', dueDate: '2026-09-25' }),
      task('informe', { title: 'Enviar informe', dueDate: '2026-09-24' }),
      task('fontanero', { title: 'Presupuesto del fontanero', dueDate: '2026-09-26' }),
      task('vieja', { title: 'Tarea vieja' }),
      task('nueva', { title: 'Comprar regalo', createdAt: T0 - 3600_000, origin: { via: 'siri' } }),
    ])
    const first = await call(store, 'ver_novedades')
    expect(first.text).toContain('NOVEDADES EN SUS TAREAS desde ayer 08:00 (hace 24 h)')
    expect(first.text).toContain('- [nueva] Comprar regalo · sin fecha (siri)')
    expect(first.text).toContain('Es tu primera revisión: solo sé lo nuevo y lo hecho.')
    // No es un cambio de sus cosas: no sale en el historial
    expect((await call(store, 'ver_historial')).text).toBe('Ningún asistente ha cambiado nada todavía.')

    // Sin cambios
    later(30)
    expect((await call(store, 'ver_novedades')).text).toBe('Nada ha cambiado en sus tareas desde tu última revisión (hoy 08:00, hace 30 min).')

    // Cambios del usuario en la app, y uno de Hermes
    later(60)
    edit(store, 'informe', { done: 1, completedAt: now })
    edit(store, 'dentista', { dueDate: '2026-09-30', dueTime: '10:00' })
    edit(store, 'fontanero', { waitingFor: 'Luis', waitingSince: '2026-09-24' })
    store.rows.delete('tasks:vieja')
    await call(store, 'crear_tareas', { tareas: [{ titulo: 'Pedir cita del coche' }] })
    store.rows.set('tasks:movil', task('movil', { title: 'Renovar el DNI', createdAt: now, dueDate: '2026-09-28' }))
    const r = await call(store, 'ver_novedades')
    expect(r.text).toContain('NOVEDADES EN SUS TAREAS desde tu última revisión (hoy 08:30, hace 1 h)')
    expect(r.text).toContain('HECHAS (1):\n- [informe] Enviar informe (el usuario)')
    expect(r.text).toMatch(/CON OTRA FECHA \(1\):\n- \[dentista\] Llamar al dentista: de mañana \(2026-09-25\) a .+ \(2026-09-30\) 10:00 \(el usuario\)/)
    expect(r.text).toContain('ESPERAS QUE CAMBIAN (1):\n- [fontanero] Presupuesto del fontanero: ahora espera a Luis (el usuario)')
    expect(r.text).toContain('BORRADAS (1):\n- «Tarea vieja» (borrada o en la papelera) (el usuario)')
    expect(r.text).toContain('NUEVAS (1):\n- [movil] Renovar el DNI')
    // Lo que hizo el propio Hermes no se le repite
    expect(r.text).not.toContain('Pedir cita del coche')
    expect(r.text).toContain('(Y 1 cambio tuyo, que no repito: incluir_mias=true para verlos.)')
  })

  it('cada asistente lleva su propia revisión, y sin_marcar solo mira', async () => {
    now = T0
    via = 'hermes'
    const store = memoryStore([task('a', { title: 'Tarea A', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    later(10)
    edit(store, 'a', { dueDate: '2026-09-27' })
    expect((await call(store, 'ver_novedades', { sin_marcar: true })).text).toContain('CON OTRA FECHA (1)')
    // Como no se marcó, sigue saliendo
    expect((await call(store, 'ver_novedades')).text).toContain('CON OTRA FECHA (1)')
    expect((await call(store, 'ver_novedades')).text).toMatch(/^Nada ha cambiado/)
    // Claude no ha mirado nunca: su primera revisión
    via = 'claude'
    expect((await call(store, 'ver_novedades')).text).toContain('Es tu primera revisión')
    via = 'hermes'
  })

  it('lo que cambió otro asistente se dice con su nombre', async () => {
    now = T0
    via = 'hermes'
    const store = memoryStore([task('a', { title: 'Tarea A', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    later(5)
    via = 'claude'
    await call(store, 'actualizar_tareas', { cambios: [{ id: 'a', fecha: '2026-09-29' }] })
    via = 'hermes'
    expect((await call(store, 'ver_novedades')).text).toContain('- [a] Tarea A: de mañana (2026-09-25) a')
    expect((await call(store, 'ver_novedades', { desde: '2026-09-24', incluir_mias: true })).text).toContain('Con «desde»: solo sé lo nuevo y lo hecho.')
  })
})

describe('apuntar_aviso: no repetirle lo mismo', () => {
  it('se apunta qué, cuándo y por dónde; sale en el resumen y en ver_esperas, con su respuesta', async () => {
    now = T0
    via = 'hermes'
    const store = memoryStore([
      task('dentista', { title: 'Llamar al dentista', dueDate: '2026-09-24' }),
      task('fontanero', { title: 'Presupuesto del fontanero', dueDate: '2026-09-24', waitingFor: 'Luis', waitingSince: '2026-09-21', waitingWhat: 'el presupuesto' }),
    ])
    const a = await call(store, 'apuntar_aviso', { tema: 'Buenos días: dentista y preguntar a Luis', sobre: ['resumen', 'dentista', 'fontanero'], canal: 'Telegram', peticion_id: 'av-1' })
    const id = a.text.match(/Aviso apuntado \[([a-z0-9]+)\]/)![1]
    expect(a.text).toContain('(sobre: resumen, «Llamar al dentista» [dentista], «Presupuesto del fontanero» [fontanero])')
    expect(a.extra).toBe('') // no es un cambio de sus cosas: sin operación que deshacer
    expect((await call(store, 'apuntar_aviso', { tema: 'otra vez', sobre: ['resumen'], peticion_id: 'av-1' })).text).toBe(`Ya estaba apuntado (peticion_id av-1): aviso [${id}].`)

    later(60)
    const s = (await call(store, 'ver_resumen')).text
    expect(s).toContain('AVISOS QUE YA LE HAN DADO LOS ASISTENTES (últimas 24 h)')
    expect(s).toContain(`- [${id}] hoy 08:00 · hermes por telegram · «Buenos días: dentista y preguntar a Luis» · sobre: resumen, «Llamar al dentista» [dentista], «Presupuesto del fontanero» [fontanero] · SIN RESPUESTA`)
    expect((await call(store, 'ver_esperas')).text).toContain(`AVISADO hoy 08:00 por telegram (hermes): sin respuesta [aviso ${id}]`)

    // Hace el dentista desde el móvil: ya no es «sin respuesta»
    edit(store, 'dentista', { done: 1, completedAt: now })
    expect((await call(store, 'ver_resumen')).text).toContain('sin respuesta, pero desde el aviso «Llamar al dentista» está hecha')

    // Contesta por Telegram
    const r = await call(store, 'apuntar_aviso', { aviso: id, respuesta: 'a Luis le escribo yo mañana' })
    expect(r.text).toBe(`Apuntado: al aviso [${id}] («Buenos días: dentista y preguntar a Luis») respondió «a Luis le escribo yo mañana».`)
    expect((await call(store, 'ver_resumen')).text).toContain('respondió: «a Luis le escribo yo mañana»')
  })

  it('los avisos de otro asistente salen en ver_novedades; pasadas 24 h, no en el resumen', async () => {
    now = T0
    via = 'hermes'
    const store = memoryStore([task('a', { title: 'Tarea A' })])
    await call(store, 'ver_novedades')
    via = 'claude'
    await call(store, 'apuntar_aviso', { tema: 'Recordatorio de la tarea A', sobre: ['a'] })
    via = 'hermes'
    later(5)
    expect((await call(store, 'ver_novedades')).text).toContain('AVISOS DESDE ENTONCES (1):')
    later(25 * 60)
    expect((await call(store, 'ver_resumen')).text).not.toContain('AVISOS QUE YA LE HAN DADO')
  })

  it('sin tema o sin sobre, o con un aviso que no existe, no apunta nada', async () => {
    now = T0
    const store = memoryStore([])
    expect((await call(store, 'apuntar_aviso', { tema: 'x' })).isError).toBe(true)
    expect((await call(store, 'apuntar_aviso', { aviso: 'nope', respuesta: 'vale' })).text).toContain('No encuentro el aviso nope')
    expect([...store.rows.keys()]).toEqual([])
  })
})
