import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import { fingerprint } from '../../supabase/functions/mcp/agentLog'
import { parseSince } from '../../supabase/functions/mcp/changes'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'

/**
 * Fallos de ver_novedades encontrados al revisarlo para Hermes (bloque 1):
 * A1 atribuir al asistente lo que cambió el usuario después, A2 «desde» y
 * sin_marcar gastando la revisión, A3 lo que llega sin conexión o de la
 * papelera dado por «reabierta», A5 «desde» en UTC en vez de en su zona.
 */

// Jueves 24 de septiembre de 2026, 8:00 en Madrid
const T0 = Date.parse('2026-09-24T06:00:00Z')
let n = 0
let now = T0
let via = 'hermes'
let tz = 'Europe/Madrid'
const env = (): Env => ({ tz, now, autoRemind: true, newId: () => `id${++n}abcdefgh`, via })

function memoryStore(initial: Row[]) {
  const rows = new Map(initial.map((r) => [`${r.tbl}:${r.id}`, r]))
  let saves = 0
  const store: Store & { rows: Map<string, Row>; saves: () => number } = {
    rows,
    saves: () => saves,
    async load(tables) {
      return [...rows.values()].filter((r) => !tables || tables.includes(r.tbl))
    },
    async save(writes, deletes = []) {
      saves++
      // Postgres no conserva el orden de las claves
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
  return { text: r.result.content.map((c) => c.text).join('\n'), isError: !!r.result.isError }
}
/** Lo que cambia el usuario desde la app: directo en la tabla, sin pasar por el conector */
const edit = (store: ReturnType<typeof memoryStore>, id: string, patch: Record<string, unknown>) => {
  const r = store.rows.get(`tasks:${id}`)!
  store.rows.set(`tasks:${id}`, { ...r, data: { ...r.data, ...patch } })
}
const later = (min: number) => (now += min * 60_000)
const seenOf = (store: ReturnType<typeof memoryStore>, who = 'hermes') => store.rows.get(`settings:agentSeen:${who}`)?.data.value as Record<string, unknown> | undefined
const reset = () => {
  now = T0
  via = 'hermes'
  tz = 'Europe/Madrid'
}

describe('A1 · solo se calla lo que sigue como lo dejó el propio asistente', () => {
  it('si el usuario cambia después lo que tocó Hermes, se le cuenta (y no como «cambio tuyo»)', async () => {
    reset()
    const store = memoryStore([task('dentista', { title: 'Llamar al dentista', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    later(10)
    await call(store, 'actualizar_tareas', { cambios: [{ id: 'dentista', fecha: '2026-09-28' }] })
    later(10)
    edit(store, 'dentista', { dueDate: '2026-10-02' })
    const r = (await call(store, 'ver_novedades')).text
    expect(r).toMatch(/CON OTRA FECHA \(1\):\n- \[dentista\] Llamar al dentista: de mañana \(2026-09-25\) a .+ \(2026-10-02\) \(el usuario\)/)
    expect(r).not.toContain('cambio tuyo')
  })

  it('lo que Hermes dejó tal cual sí se calla como suyo', async () => {
    reset()
    const store = memoryStore([task('dentista', { title: 'Llamar al dentista', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    later(10)
    await call(store, 'actualizar_tareas', { cambios: [{ id: 'dentista', fecha: '2026-09-28' }] })
    const r = (await call(store, 'ver_novedades')).text
    expect(r).not.toContain('CON OTRA FECHA')
    expect(r).toContain('(Y 1 cambio tuyo, que no repito')
  })

  it('una operación deshecha no prueba nada: el cambio posterior del usuario se cuenta', async () => {
    reset()
    const store = memoryStore([task('dentista', { title: 'Llamar al dentista', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    later(5)
    await call(store, 'actualizar_tareas', { cambios: [{ id: 'dentista', fecha: '2026-09-28' }] })
    await call(store, 'deshacer')
    later(5)
    edit(store, 'dentista', { dueDate: '2026-09-30' })
    const r = (await call(store, 'ver_novedades')).text
    expect(r).toMatch(/- \[dentista\] Llamar al dentista: de .+ a .+ \(2026-09-30\) \(el usuario\)/)
  })

  it('manda la operación más reciente por su hora, no por su sitio en el historial', async () => {
    reset()
    const before = task('a', { title: 'Tarea A', dueDate: '2026-09-25' })
    const store = memoryStore([before])
    await call(store, 'ver_novedades')
    later(10)
    // Claude la movió después que Hermes (aunque en el historial vaya antes)
    edit(store, 'a', { dueDate: '2026-09-29' })
    const after = store.rows.get('tasks:a')!.data
    const hermesAfter = { ...after, dueDate: '2026-09-27' }
    const entry = (id: string, at: number, who: string, data: Record<string, unknown>) => ({
      id,
      at,
      via: who,
      tool: 'actualizar_tareas',
      summary: 'Cambiada',
      changes: [{ tbl: 'tasks', id: 'a', before: before.data, after: fingerprint(data) }],
    })
    store.rows.set('settings:agentLog', {
      tbl: 'settings',
      id: 'agentLog',
      data: { key: 'agentLog', value: [entry('claude01', now - 60_000, 'claude', after), entry('hermes01', now - 5 * 60_000, 'hermes', hermesAfter)] },
    })
    const r = (await call(store, 'ver_novedades')).text
    expect(r).toMatch(/- \[a\] Tarea A: de .+ a .+ \(2026-09-29\) \(claude\)/)
  })

  it('una tarea con origen «hermes» pero sin operación que lo pruebe no se oculta', async () => {
    reset()
    const store = memoryStore([])
    await call(store, 'ver_novedades')
    later(10)
    store.rows.set('tasks:atajo', task('atajo', { title: 'Renovar el DNI', createdAt: now, origin: { via: 'hermes' } }))
    const r = (await call(store, 'ver_novedades')).text
    expect(r).toContain('NUEVAS (1):\n- [atajo] Renovar el DNI')
    expect(r).not.toContain('cambio tuyo')
  })

  it('si el usuario borra lo que Hermes había tocado, el borrado es suyo', async () => {
    reset()
    const store = memoryStore([task('vieja', { title: 'Tarea vieja', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    later(5)
    await call(store, 'actualizar_tareas', { cambios: [{ id: 'vieja', fecha: '2026-09-26' }] })
    later(5)
    store.rows.delete('tasks:vieja')
    const r = (await call(store, 'ver_novedades')).text
    expect(r).toContain('BORRADAS (1):\n- «Tarea vieja» (borrada o en la papelera) (el usuario)')
  })
})

describe('A2 · «desde» y sin_marcar solo miran', () => {
  it('con «desde» no se gasta la revisión: lo que cambió de fecha sigue saliendo después', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    const checkpoint = JSON.stringify(seenOf(store))
    later(10)
    edit(store, 'a', { dueDate: '2026-09-27' })
    const withSince = await call(store, 'ver_novedades', { desde: '2026-09-24' })
    expect(withSince.isError).toBe(false)
    expect(JSON.stringify(seenOf(store))).toBe(checkpoint)
    expect((await call(store, 'ver_novedades')).text).toContain('CON OTRA FECHA (1)')
  })

  it('sin revisión anterior, «desde» no deja una apuntada', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' })])
    await call(store, 'ver_novedades', { desde: '2026-09-20' })
    expect(seenOf(store)).toBeUndefined()
    expect(store.saves()).toBe(0)
  })

  it('sin_marcar no escribe nada', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' })])
    await call(store, 'ver_novedades', { sin_marcar: true })
    expect(store.saves()).toBe(0)
  })

  it.each(['ayer', '24/09/2026', '2026-02-30', '2026-13-01', '2026-09-24T25:00', '2026-09-31T10:00:00Z'])('«desde» que no es una fecha válida (%s): error claro y nada escrito', async (desde) => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' })])
    const r = await call(store, 'ver_novedades', { desde })
    expect(r.isError).toBe(true)
    expect(r.text).toContain(`«desde» no es una fecha válida: «${desde}»`)
    expect(store.saves()).toBe(0)
  })
})

describe('A5 · «desde» en su zona horaria', () => {
  it('YYYY-MM-DD empieza a medianoche en su zona, no en UTC', async () => {
    reset()
    const store = memoryStore([
      // 00:30 del 24 en Madrid (22:30 del 23 en UTC): ya es del 24
      task('madrugada', { title: 'Apuntada de madrugada', createdAt: Date.parse('2026-09-23T22:30:00Z') }),
      // 23:30 del 23 en Madrid: es del día anterior
      task('noche', { title: 'Apuntada la noche antes', createdAt: Date.parse('2026-09-23T21:30:00Z') }),
    ])
    const r = (await call(store, 'ver_novedades', { desde: '2026-09-24' })).text
    expect(r).toContain('desde hoy 00:00')
    expect(r).toContain('[madrugada] Apuntada de madrugada')
    expect(r).not.toContain('[noche]')
  })

  it('una fecha y hora sin zona es la hora de su zona', async () => {
    reset()
    tz = 'Asia/Tokyo'
    // 15:00 del 24 en Tokio = 06:00 UTC
    now = Date.parse('2026-09-24T06:00:00Z')
    const store = memoryStore([
      task('despues', { title: 'Después de las 9', createdAt: Date.parse('2026-09-24T00:30:00Z') }), // 9:30 en Tokio
      task('antes', { title: 'Antes de las 9', createdAt: Date.parse('2026-09-23T23:30:00Z') }), // 8:30 en Tokio
    ])
    const r = (await call(store, 'ver_novedades', { desde: '2026-09-24T09:00' })).text
    expect(r).toContain('[despues] Después de las 9')
    expect(r).not.toContain('[antes]')
  })

  it('con zona explícita se respeta', async () => {
    reset()
    const store = memoryStore([task('x', { title: 'Apuntada a las 7:30 UTC', createdAt: Date.parse('2026-09-24T05:30:00Z') })])
    expect((await call(store, 'ver_novedades', { desde: '2026-09-24T05:00:00Z' })).text).toContain('[x]')
    expect((await call(store, 'ver_novedades', { desde: '2026-09-24T08:00:00+02:00' })).text).not.toContain('[x]')
  })
})

describe('A3 · lo que no estaba en la última revisión no se da por reabierto', () => {
  it('una tarea apuntada sin conexión que llega tarde no sale como «estaba hecha»', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' })])
    await call(store, 'ver_novedades')
    later(60)
    // Creada en el móvil antes de la revisión, sincronizada después
    store.rows.set('tasks:offline', task('offline', { title: 'Comprar pilas', createdAt: T0 - 30 * 60_000 }))
    const r = (await call(store, 'ver_novedades')).text
    expect(r).not.toContain('REABIERTAS')
    expect(r).not.toContain('estaba hecha')
    expect(r).toContain('NO ESTABAN EN TU ÚLTIMA REVISIÓN (1):\n- [offline] Comprar pilas')
    // Y no se repite
    expect((await call(store, 'ver_novedades')).text).toMatch(/^Nada ha cambiado/)
  })

  it('una tarea recuperada de la papelera tampoco sale como «estaba hecha»', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    later(5)
    const saved = store.rows.get('tasks:a')!
    store.rows.delete('tasks:a')
    expect((await call(store, 'ver_novedades')).text).toContain('BORRADAS (1)')
    later(5)
    store.rows.set('tasks:a', saved)
    const r = (await call(store, 'ver_novedades')).text
    expect(r).not.toContain('estaba hecha')
    expect(r).toContain('NO ESTABAN EN TU ÚLTIMA REVISIÓN (1):\n- [a] Tarea A')
  })

  it('la que estaba hecha en la revisión y se reabre sí es «reabierta»', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A', done: 1, completedAt: T0 - 3600_000 })])
    await call(store, 'ver_novedades')
    later(10)
    edit(store, 'a', { done: 0, completedAt: undefined })
    expect((await call(store, 'ver_novedades')).text).toContain('REABIERTAS (1):\n- [a] Tarea A (estaba hecha)')
  })

  it('creada y completada sin conexión, llega después: sale una vez como hecha', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' })])
    await call(store, 'ver_novedades')
    later(60)
    store.rows.set('tasks:pilas', task('pilas', { title: 'Comprar pilas', createdAt: T0 - 20 * 60_000, done: 1, completedAt: T0 - 10 * 60_000 }))
    expect((await call(store, 'ver_novedades')).text).toContain('HECHAS (1):\n- [pilas] Comprar pilas')
    later(10)
    expect((await call(store, 'ver_novedades')).text).toMatch(/^Nada ha cambiado/)
  })

  it('las completadas hace tiempo no salen nunca, ni una y otra vez', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' }), task('vieja', { title: 'Hecha hace un año', done: 1, completedAt: T0 - 365 * 864e5 })])
    await call(store, 'ver_novedades')
    for (let i = 0; i < 3; i++) {
      later(30)
      expect((await call(store, 'ver_novedades')).text).toMatch(/^Nada ha cambiado/)
    }
  })

  it('con muchísimas hechas, la foto no pasa de 1000 ids y las que quedan fuera no salen una y otra vez', async () => {
    reset()
    const many = Array.from({ length: 1200 }, (_, i) => task(`h${i}`, { title: `Hecha ${i}`, done: 1, completedAt: T0 - (i + 1) * 60_000 }))
    const store = memoryStore([task('a', { title: 'Tarea A' }), ...many])
    await call(store, 'ver_novedades')
    expect((seenOf(store)?.done as string[]).length).toBe(1000)
    for (let i = 0; i < 2; i++) {
      later(30)
      expect((await call(store, 'ver_novedades')).text).toMatch(/^Nada ha cambiado/)
    }
  })

  it('la foto de las hechas guarda solo sus ids (ni títulos ni notas)', async () => {
    reset()
    const store = memoryStore([task('h', { title: 'Cita médica privada', notes: 'resultado', done: 1, completedAt: T0 - 3600_000 })])
    await call(store, 'ver_novedades')
    const json = JSON.stringify(seenOf(store))
    expect(json).toContain('"h"')
    expect(json).not.toContain('Cita médica')
    expect(json).not.toContain('resultado')
  })

  it('con una revisión de antes (sin foto de hechas) no inventa que estaba hecha, y la actualiza', async () => {
    reset()
    const store = memoryStore([
      task('a', { title: 'Tarea A' }),
      task('offline', { title: 'Comprar pilas', createdAt: T0 - 2 * 3600_000 }),
      { tbl: 'settings', id: 'agentSeen:hermes', data: { key: 'agentSeen:hermes', value: { at: T0 - 3600_000, tasks: [['a', 'Tarea A', '', '', '']] } } },
    ])
    const r = (await call(store, 'ver_novedades')).text
    expect(r).not.toContain('estaba hecha')
    expect(r).toContain('NO ESTABAN EN TU ÚLTIMA REVISIÓN (1):\n- [offline] Comprar pilas')
    expect(Array.isArray(seenOf(store)?.done)).toBe(true)
  })
})

describe('Revisión del bloque 1 · controles de «desde» que solo mira', () => {
  it.each(['2026-09-24T08:00:00+25:00', '2026-09-24T08:00:00+02:60', '2026-09-24T08:00:00+2:00', '2026-09-24T08:00:00 +02:00', '2026-02-30T10:00', '2026-02-29', '2026-04-31T08:00:00Z', '2026-09-24T08:60'])(
    '«desde» con desfase o fecha imposible (%s): error, nada escrito y la revisión intacta',
    async (desde) => {
      reset()
      const store = memoryStore([task('a', { title: 'Tarea A', dueDate: '2026-09-25' })])
      await call(store, 'ver_novedades')
      const checkpoint = JSON.stringify(seenOf(store))
      const saves = store.saves()
      later(10)
      const r = await call(store, 'ver_novedades', { desde })
      expect(r.isError).toBe(true)
      expect(r.text).toContain('«desde» no es una fecha válida')
      expect(store.saves()).toBe(saves)
      expect(JSON.stringify(seenOf(store))).toBe(checkpoint)
    },
  )

  it('«desde» válido, con o sin sin_marcar, y sin_marcar solo: ninguno escribe ni toca la revisión', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    const checkpoint = JSON.stringify(seenOf(store))
    const saves = store.saves()
    later(10)
    edit(store, 'a', { dueDate: '2026-09-27' })
    await call(store, 'ver_novedades', { desde: '2026-09-24' })
    await call(store, 'ver_novedades', { desde: '2026-09-24T08:00:00.250+02:00', sin_marcar: true })
    await call(store, 'ver_novedades', { sin_marcar: true })
    await call(store, 'ver_novedades', { desde: 'no-es-fecha', sin_marcar: true })
    expect(store.saves()).toBe(saves)
    expect(JSON.stringify(seenOf(store))).toBe(checkpoint)
    // El cambio sigue pendiente de contar en la próxima revisión normal
    expect((await call(store, 'ver_novedades')).text).toContain('CON OTRA FECHA (1)')
  })
})

describe('Revisión del bloque 1 · 1. fracciones de segundo en «desde»', () => {
  it('sin zona, la fracción cuenta: solo sale lo creado después de las 08:00:00.900 en Madrid', async () => {
    reset()
    expect(new Date(parseSince('2026-09-24T08:00:00.900', 'Europe/Madrid')!).toISOString()).toBe('2026-09-24T06:00:00.900Z')
    const store = memoryStore([
      task('antes', { title: 'Creada a las .500', createdAt: Date.parse('2026-09-24T06:00:00.500Z') }),
      task('despues', { title: 'Creada a las .950', createdAt: Date.parse('2026-09-24T06:00:00.950Z') }),
    ])
    const r = (await call(store, 'ver_novedades', { desde: '2026-09-24T08:00:00.900' })).text
    expect(r).toContain('[despues] Creada a las .950')
    expect(r).not.toContain('[antes]')
  })

  it.each([
    ['2026-09-24T06:00:00.900Z', '2026-09-24T06:00:00.900Z'],
    ['2026-09-24T08:00:00.900+02:00', '2026-09-24T06:00:00.900Z'],
    ['2026-09-24T08:00:00.900+0200', '2026-09-24T06:00:00.900Z'],
    ['2026-09-24T08:00:00.9', '2026-09-24T06:00:00.900Z'],
    // Más de tres cifras: se queda en milisegundos, como Date.parse (trunca, no redondea)
    ['2026-09-24T08:00:00.123456789', '2026-09-24T06:00:00.123Z'],
    ['2026-09-24T06:00:00.9999Z', '2026-09-24T06:00:00.999Z'],
  ])('%s → %s', (desde, iso) => {
    expect(new Date(parseSince(desde, 'Europe/Madrid')!).toISOString()).toBe(iso)
  })

  it('con zona explícita da lo mismo que Date.parse', () => {
    for (const s of ['2026-09-24T08:00:00.123456Z', '2026-09-24T08:00:00.5-03:30', '2026-09-24T08:00+0545', '2026-09-24T08:00:59.999+14:00'])
      expect(parseSince(s, 'Europe/Madrid')).toBe(Date.parse(s))
  })
})

describe('Revisión del bloque 1 · 2. «desde» en los cambios de hora', () => {
  const iso = (s: string) => {
    const ms = parseSince(s, 'Europe/Madrid')
    return ms === undefined ? undefined : new Date(ms).toISOString()
  }

  it.each(['2026-03-29T02:30', '2026-03-29T02:00', '2026-03-29T02:59:59.999'])('%s no existe en Madrid (se adelanta la hora): error, nada escrito y la revisión intacta', async (desde) => {
    reset()
    expect(parseSince(desde, 'Europe/Madrid')).toBeUndefined()
    const store = memoryStore([task('a', { title: 'Tarea A', dueDate: '2026-09-25' })])
    await call(store, 'ver_novedades')
    const checkpoint = JSON.stringify(seenOf(store))
    const saves = store.saves()
    const r = await call(store, 'ver_novedades', { desde })
    expect(r.isError).toBe(true)
    expect(r.text).toContain(`«desde» no es una fecha válida: «${desde}»`)
    expect(store.saves()).toBe(saves)
    expect(JSON.stringify(seenOf(store))).toBe(checkpoint)
  })

  it('justo antes y después del salto de primavera sí existen', () => {
    expect(iso('2026-03-29T01:59')).toBe('2026-03-29T00:59:00.000Z')
    expect(iso('2026-03-29T03:00')).toBe('2026-03-29T01:00:00.000Z')
  })

  it('una hora que ocurre dos veces (otoño) sin zona es la primera vez: así no se queda nada fuera', async () => {
    reset()
    expect(iso('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z')
    expect(iso('2026-10-25T02:30:00.500')).toBe('2026-10-25T00:30:00.500Z')
    now = Date.parse('2026-10-25T09:00:00Z')
    const store = memoryStore([
      task('primera', { title: 'Entre las dos 02:30', createdAt: Date.parse('2026-10-25T01:00:00Z') }),
      task('segunda', { title: 'Después de la segunda 02:30', createdAt: Date.parse('2026-10-25T01:45:00Z') }),
    ])
    const r = (await call(store, 'ver_novedades', { desde: '2026-10-25T02:30' })).text
    expect(r).toContain('[primera]')
    expect(r).toContain('[segunda]')
  })

  it('con desfase explícito se distinguen las dos 02:30 de otoño', async () => {
    reset()
    expect(iso('2026-10-25T02:30+02:00')).toBe('2026-10-25T00:30:00.000Z')
    expect(iso('2026-10-25T02:30+01:00')).toBe('2026-10-25T01:30:00.000Z')
    now = Date.parse('2026-10-25T09:00:00Z')
    const store = memoryStore([task('primera', { title: 'Entre las dos 02:30', createdAt: Date.parse('2026-10-25T01:00:00Z') })])
    expect((await call(store, 'ver_novedades', { desde: '2026-10-25T02:30+02:00' })).text).toContain('[primera]')
    expect((await call(store, 'ver_novedades', { desde: '2026-10-25T02:30+01:00' })).text).not.toContain('[primera]')
  })
})

describe('Revisión del bloque 1 · 3. tope de hechas con empates', () => {
  const sameMoment = T0 - 3600_000
  const tied = () => Array.from({ length: 1200 }, (_, i) => task(`t${String(i).padStart(4, '0')}`, { title: `Hecha ${i}`, done: 1, completedAt: sameMoment }))

  it('1200 completadas en el mismo instante: la foto guarda 1000 y las demás no salen en ninguna revisión', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' }), ...tied()])
    await call(store, 'ver_novedades')
    expect((seenOf(store)?.done as string[]).length).toBe(1000)
    for (let i = 0; i < 3; i++) {
      later(30)
      const r = (await call(store, 'ver_novedades')).text
      expect(r).toMatch(/^Nada ha cambiado/)
      expect((seenOf(store)?.done as string[]).length).toBe(1000)
    }
  })

  it('con el tope lleno, lo hecho que llega tarde y es más reciente sale una vez; lo de antes, no se inventa', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' }), ...tied()])
    await call(store, 'ver_novedades')
    later(30)
    store.rows.set('tasks:tarde', task('tarde', { title: 'Hecha sin conexión', createdAt: T0 - 7200_000, done: 1, completedAt: T0 - 60_000 }))
    const r = (await call(store, 'ver_novedades')).text
    expect(r).toContain('HECHAS (1):\n- [tarde] Hecha sin conexión')
    expect(r).not.toContain('NUEVAS')
    expect(r).not.toContain('REABIERTAS')
    later(30)
    expect((await call(store, 'ver_novedades')).text).toMatch(/^Nada ha cambiado/)
  })

  it('si se reabre una de las que quedaron fuera de la foto, no se da por «reabierta» con certeza', async () => {
    reset()
    const store = memoryStore([task('a', { title: 'Tarea A' }), ...tied()])
    await call(store, 'ver_novedades')
    const kept = new Set(seenOf(store)?.done as string[])
    const out = tied().find((r) => !kept.has(r.id))!.id
    later(30)
    edit(store, out, { done: 0, completedAt: undefined })
    const r = (await call(store, 'ver_novedades')).text
    expect(r).not.toContain('REABIERTAS')
    expect(r).toContain(`NO ESTABAN EN TU ÚLTIMA REVISIÓN (1):\n- [${out}]`)
  })
})
