import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'

/**
 * Avisos fiables entre asistentes (bloque 2): dos asistentes que apuntan a la
 * vez no se pisan, los reintentos no duplican y las respuestas no se pierden.
 * El almacén se comporta como la tabla `records`: un upsert por registro, sin
 * transacciones entre registros.
 */

// Jueves 24 de septiembre de 2026, 8:00 en Madrid
const T0 = Date.parse('2026-09-24T06:00:00Z')
let n = 0
/** Ids que dará newId antes de los de por defecto (para forzar UUID con el mismo prefijo) */
const nextIds: string[] = []
const env = (via: string, now = T0): Env => ({ tz: 'Europe/Madrid', now, autoRemind: true, newId: () => nextIds.shift() ?? `${(++n).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`, via })

/**
 * Almacén en memoria con barrera: cada `load` espera a que lleguen `parties`
 * lecturas antes de devolver nada, así las llamadas concurrentes leen el mismo
 * estado antes de que ninguna escriba (lo que pasa en producción cuando dos
 * peticiones se solapan).
 */
function racyStore(initial: Row[], parties = 1) {
  const rows = new Map(initial.map((r) => [`${r.tbl}:${r.id}`, r]))
  let waiting: (() => void)[] = []
  const barrier = () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve)
      if (waiting.length >= parties) {
        waiting.forEach((r) => r())
        waiting = []
      }
    })
  const store: Store & { rows: Map<string, Row>; parties: number; saves: number } = {
    rows,
    parties,
    saves: 0,
    async load(tables) {
      const snapshot = [...rows.values()].filter((r) => !tables || tables.includes(r.tbl)).map((r) => structuredClone(r))
      if (store.parties > 1) await barrier()
      return snapshot
    },
    async save(writes, deletes = []) {
      store.saves++
      for (const w of writes) rows.set(`${w.tbl}:${w.id}`, structuredClone(w))
      for (const d of deletes) rows.delete(`${d.tbl}:${d.id}`)
    },
  }
  return store
}

const call = async (store: Store, via: string, name: string, args: Record<string, unknown> = {}, now = T0) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env(via, now))) as { result: { content: { text: string }[]; isError?: boolean } }
  return { text: r.result.content.map((c) => c.text).join('\n'), isError: !!r.result.isError }
}
const summary = async (store: ReturnType<typeof racyStore>) => {
  store.parties = 1
  return (await call(store, 'hermes', 'ver_resumen', {}, T0 + 60_000)).text
}

describe('avisos concurrentes de dos asistentes', () => {
  it('control: uno detrás de otro se conservan los dos', async () => {
    const store = racyStore([], 1)
    await call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'], canal: 'telegram' })
    await call(store, 'claude', 'apuntar_aviso', { tema: 'Recordatorio del dentista', sobre: ['resumen'] })
    const s = await summary(store)
    expect(s).toContain('«Buenos días»')
    expect(s).toContain('«Recordatorio del dentista»')
  })

  it('si Hermes y Claude apuntan un aviso a la vez, se conservan los dos', async () => {
    const store = racyStore([], 2)
    await Promise.all([
      call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'], canal: 'telegram' }),
      call(store, 'claude', 'apuntar_aviso', { tema: 'Recordatorio del dentista', sobre: ['resumen'] }),
    ])
    const s = await summary(store)
    expect(s).toContain('«Buenos días»')
    expect(s).toContain('«Recordatorio del dentista»')
  })
})

describe('reintentos con peticion_id', () => {
  const count = (s: string, needle: string) => s.split(needle).length - 1

  it('el mismo reintento de Hermes llegando dos veces a la vez se apunta una sola vez, con el mismo id', async () => {
    const store = racyStore([], 2)
    const args = { tema: 'Buenos días', sobre: ['resumen'], canal: 'telegram', peticion_id: 'buenos-dias-0924' }
    const [a, b] = await Promise.all([call(store, 'hermes', 'apuntar_aviso', args), call(store, 'hermes', 'apuntar_aviso', args)])
    const id = (t: string) => t.match(/\[([a-z0-9]+)\]/)?.[1]
    expect(id(a.text)).toBeDefined()
    expect(id(a.text)).toBe(id(b.text))
    expect(count(await summary(store), '«Buenos días»')).toBe(1)
  })

  it('dos avisos distintos a la vez del mismo asistente se conservan los dos', async () => {
    const store = racyStore([], 2)
    await Promise.all([
      call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'], peticion_id: 'p-1' }),
      call(store, 'hermes', 'apuntar_aviso', { tema: 'Pastillas', sobre: ['medicación'], peticion_id: 'p-2' }),
    ])
    const s = await summary(store)
    expect(s).toContain('«Buenos días»')
    expect(s).toContain('«Pastillas»')
  })

  it('el mismo peticion_id de dos asistentes distintos no choca: son dos avisos', async () => {
    const store = racyStore([], 1)
    await call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días de Hermes', sobre: ['resumen'], peticion_id: 'p-1' })
    const r = await call(store, 'claude', 'apuntar_aviso', { tema: 'Buenos días de Claude', sobre: ['resumen'], peticion_id: 'p-1' })
    expect(r.text).toContain('Aviso apuntado')
    const s = await summary(store)
    expect(s).toContain('«Buenos días de Hermes»')
    expect(s).toContain('«Buenos días de Claude»')
  })

  it('y si llegan a la vez tampoco', async () => {
    const store = racyStore([], 2)
    await Promise.all([
      call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días de Hermes', sobre: ['resumen'], peticion_id: 'p-1' }),
      call(store, 'claude', 'apuntar_aviso', { tema: 'Buenos días de Claude', sobre: ['resumen'], peticion_id: 'p-1' }),
    ])
    const s = await summary(store)
    expect(s).toContain('«Buenos días de Hermes»')
    expect(s).toContain('«Buenos días de Claude»')
  })
})

describe('avisos en el formato de antes (lista en el ajuste agentNotices)', () => {
  const task = (id: string, title: string): Row => ({ tbl: 'tasks', id, data: { id, title, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: T0 - 864e5, waitingFor: 'Luis', waitingSince: '2026-09-21', dueDate: '2026-09-24' } })
  const legacy = (list: Record<string, unknown>[]): Row => ({ tbl: 'settings', id: 'agentNotices', data: { key: 'agentNotices', value: list } })
  const old = { id: 'abc12345', at: T0 - 3600_000, via: 'hermes', canal: 'telegram', tema: 'Preguntar a Luis', sobre: [{ ref: 'fontanero' }], req: 'viejo-1' }

  it('se siguen leyendo: resumen, ver_esperas y ver_novedades', async () => {
    const store = racyStore([task('fontanero', 'Presupuesto del fontanero'), legacy([old])])
    expect(await summary(store)).toContain('[abc12345] hoy 07:00 · hermes por telegram · «Preguntar a Luis»')
    expect((await call(store, 'hermes', 'ver_esperas')).text).toContain('AVISADO hoy 07:00 por telegram (hermes): sin respuesta [aviso abc12345]')
    expect((await call(store, 'claude', 'ver_novedades', { desde: '2026-09-24' })).text).toContain('«Preguntar a Luis»')
  })

  it('un reintento de una petición apuntada en el formato de antes no la duplica', async () => {
    const store = racyStore([legacy([old])])
    expect((await call(store, 'hermes', 'apuntar_aviso', { tema: 'Preguntar a Luis', sobre: ['fontanero'], canal: 'telegram', peticion_id: 'viejo-1' })).text).toBe('Ya estaba apuntado (peticion_id viejo-1): aviso [abc12345].')
  })

  it('si un aviso está en los dos formatos, sale una sola vez (manda el registro nuevo)', async () => {
    const record: Row = { tbl: 'agentNotices', id: 'abc12345', data: { ...old, respuesta: { at: T0 - 600_000, text: 'ya le escribo yo' } } }
    const store = racyStore([legacy([old]), record])
    const s = await summary(store)
    expect(s.split('[abc12345]').length - 1).toBe(1)
    expect(s).toContain('respondió: «ya le escribo yo»')
  })

  it('apuntar uno nuevo no toca la lista de antes', async () => {
    const store = racyStore([legacy([old])])
    const before = JSON.stringify(store.rows.get('settings:agentNotices'))
    await call(store, 'claude', 'apuntar_aviso', { tema: 'Otro', sobre: ['resumen'] })
    expect(JSON.stringify(store.rows.get('settings:agentNotices'))).toBe(before)
  })
})

describe('respuestas a un aviso', () => {
  const legacy = (list: Record<string, unknown>[]): Row => ({ tbl: 'settings', id: 'agentNotices', data: { key: 'agentNotices', value: list } })
  const notice = async (store: ReturnType<typeof racyStore>) => {
    store.parties = 1
    const r = await call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'], canal: 'telegram' })
    return r.text.match(/Aviso apuntado \[([a-z0-9]+)\]/)![1]
  }

  it('dos respuestas al mismo aviso que llegan a la vez se conservan las dos (la última manda)', async () => {
    const store = racyStore([])
    const id = await notice(store)
    store.parties = 2
    await Promise.all([
      call(store, 'hermes', 'apuntar_aviso', { aviso: id, respuesta: 'lo hago a las 10' }, T0 + 1000),
      call(store, 'claude', 'apuntar_aviso', { aviso: id, respuesta: 'mejor mañana' }, T0 + 2000),
    ])
    const s = await summary(store)
    expect(s).toContain('respondió: «mejor mañana» (antes: «lo hago a las 10»)')
  })

  it('respuestas a la vez a dos avisos de la lista de antes no se pisan', async () => {
    const a = { id: 'aaaa1111', at: T0 - 3600_000, via: 'hermes', tema: 'Pastillas', sobre: [{ ref: 'medicación' }] }
    const b = { id: 'bbbb2222', at: T0 - 1800_000, via: 'hermes', tema: 'Dentista', sobre: [{ ref: 'resumen' }] }
    const store = racyStore([legacy([a, b])], 2)
    await Promise.all([call(store, 'hermes', 'apuntar_aviso', { aviso: 'aaaa1111', respuesta: 'tomadas' }), call(store, 'claude', 'apuntar_aviso', { aviso: 'bbbb2222', respuesta: 'pedida cita' })])
    const s = await summary(store)
    expect(s).toContain('«Pastillas» · sobre: medicación · respondió: «tomadas»')
    expect(s).toContain('«Dentista» · sobre: resumen · respondió: «pedida cita»')
  })

  it('una respuesta reintentada con el mismo peticion_id no se repite, y sale en ver_novedades de otro asistente', async () => {
    const store = racyStore([])
    await call(store, 'claude', 'ver_novedades')
    const id = await notice(store)
    store.parties = 2
    const args = { aviso: id, respuesta: 'hecho', peticion_id: 'resp-1' }
    await Promise.all([call(store, 'hermes', 'apuntar_aviso', args, T0 + 1000), call(store, 'hermes', 'apuntar_aviso', args, T0 + 1000)])
    const s = await summary(store)
    expect(s).toContain('respondió: «hecho»')
    expect(s).not.toContain('(antes:')
    store.parties = 1
    expect((await call(store, 'claude', 'ver_novedades', {}, T0 + 5000)).text).toContain('respondió: «hecho»')
  })
})

describe('revisión del bloque 2 · 3. retención: se ven 14 días, se borra a los 30', () => {
  const DAY = 864e5
  const rec = (id: string, at: number, extra: Record<string, unknown> = {}): Row => ({ tbl: 'agentNotices', id, data: { id, at, via: 'hermes', tema: `Aviso ${id}`, sobre: [{ ref: 'resumen' }], ...extra } })
  const reply = (id: string, aviso: string, at: number): Row => ({ tbl: 'agentNoticeReplies', id, data: { id, aviso, at, via: 'hermes', text: 'vale' } })
  const legacy = (at: number, extra: Record<string, unknown> = {}): Row => ({ tbl: 'settings', id: 'agentNotices', data: { key: 'agentNotices', value: [{ id: 'viejo001', at, via: 'hermes', tema: 'De la lista de antes', sobre: [{ ref: 'resumen' }], ...extra }] } })
  const since = (store: ReturnType<typeof racyStore>) => {
    store.parties = 1
    return call(store, 'claude', 'ver_novedades', { desde: '2026-08-01' })
  }

  it('una respuesta apuntada mientras otro asistente limpia no se queda huérfana: el aviso no se borra con una lectura vieja', async () => {
    // Al límite de las dos semanas: Hermes lo ve y responde; Claude, un minuto después, apunta otro
    const store = racyStore([rec('limite', T0 - 14 * DAY + 30_000)], 2)
    await Promise.all([call(store, 'hermes', 'apuntar_aviso', { aviso: 'limite', respuesta: 'ya está' }, T0), call(store, 'claude', 'apuntar_aviso', { tema: 'Nuevo', sobre: ['resumen'] }, T0 + 60_000)])
    const replyRow = [...store.rows.values()].find((r) => r.tbl === 'agentNoticeReplies')!
    expect(replyRow.data.aviso).toBe('limite')
    expect(store.rows.has('agentNotices:limite')).toBe(true)
  })

  it('un reintento después de la limpieza no resucita el aviso como nuevo', async () => {
    const store = racyStore([rec('p-viejo', T0 - 15 * DAY, { req: 'r-1' })])
    await call(store, 'claude', 'apuntar_aviso', { tema: 'Nuevo', sobre: ['resumen'] })
    const r = await call(store, 'hermes', 'apuntar_aviso', { tema: 'Aviso p-viejo', sobre: ['resumen'], peticion_id: 'r-1' }, T0 + 1000)
    expect(r.text).toBe('Ya estaba apuntado (peticion_id r-1): aviso [p-viejo].')
    expect([...store.rows.values()].filter((x) => x.tbl === 'agentNotices' && x.data.req === 'r-1')).toHaveLength(1)
  })

  it('lo de más de 14 días no se ve (tampoco de la lista de antes), pero se guarda hasta los 30', async () => {
    const store = racyStore([rec('reciente', T0 - 13 * DAY), rec('oculto', T0 - 20 * DAY), reply('r-oculto', 'oculto', T0 - 19 * DAY), legacy(T0 - 20 * DAY)])
    await call(store, 'claude', 'apuntar_aviso', { tema: 'Nuevo', sobre: ['resumen'] })
    const text = (await since(store)).text
    expect(text).toContain('«Aviso reciente»')
    expect(text).not.toContain('«Aviso oculto»')
    expect(text).not.toContain('«De la lista de antes»')
    expect(store.rows.has('agentNotices:oculto')).toBe(true)
    expect(store.rows.has('agentNoticeReplies:r-oculto')).toBe(true)
  })

  it('al apuntar uno, se borran solo los de más de 30 días (avisos y respuestas); la lista de antes no se toca', async () => {
    const store = racyStore([rec('antiguo', T0 - 31 * DAY), reply('r-antigua', 'antiguo', T0 - 31 * DAY), reply('r-de-lista', 'viejo001', T0 - 31 * DAY), rec('mes', T0 - 29 * DAY), legacy(T0 - 40 * DAY)])
    const before = JSON.stringify(store.rows.get('settings:agentNotices'))
    await call(store, 'claude', 'apuntar_aviso', { tema: 'Nuevo', sobre: ['resumen'] })
    expect(store.rows.has('agentNotices:antiguo')).toBe(false)
    expect(store.rows.has('agentNoticeReplies:r-antigua')).toBe(false)
    expect(store.rows.has('agentNoticeReplies:r-de-lista')).toBe(false)
    expect(store.rows.has('agentNotices:mes')).toBe(true)
    expect(JSON.stringify(store.rows.get('settings:agentNotices'))).toBe(before)
  })

  it('por número no se borra nada: con 61 recientes, se ven los 60 últimos y no se pierde ninguno', async () => {
    const store = racyStore(Array.from({ length: 61 }, (_, i) => rec(`n${String(i).padStart(2, '0')}`, T0 - (61 - i) * 60_000)))
    await call(store, 'claude', 'apuntar_aviso', { tema: 'Nuevo', sobre: ['resumen'] }, T0)
    expect([...store.rows.keys()].filter((k) => k.startsWith('agentNotices:'))).toHaveLength(62)
    const text = (await since(store)).text
    // Se ven 60 (n02…n60 y «Nuevo»); a Claude no se le repite el suyo
    expect(text).toContain('AVISOS DESDE ENTONCES (59)')
    expect(text).not.toContain('«Nuevo»')
    expect(text).not.toContain('«Aviso n01»')
    expect(text).toContain('«Aviso n02»')
  })

  it('no se puede responder a un aviso que ya no se ve (no quedan respuestas sueltas)', async () => {
    const store = racyStore([rec('oculto', T0 - 15 * DAY)])
    const r = await call(store, 'hermes', 'apuntar_aviso', { aviso: 'oculto', respuesta: 'vale' })
    expect(r.isError).toBe(true)
    expect([...store.rows.keys()].some((k) => k.startsWith('agentNoticeReplies:'))).toBe(false)
  })
})

describe('revisión del bloque 2 · 1. ids completos', () => {
  it('dos avisos a la vez cuyos UUID empiezan igual se conservan los dos', async () => {
    const store = racyStore([], 2)
    nextIds.push('deadbeef-1111-4000-8000-000000000001', 'deadbeef-2222-4000-8000-000000000002')
    await Promise.all([
      call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'] }),
      call(store, 'claude', 'apuntar_aviso', { tema: 'Recordatorio del dentista', sobre: ['resumen'] }),
    ])
    const s = await summary(store)
    expect(s).toContain('«Buenos días»')
    expect(s).toContain('«Recordatorio del dentista»')
  })

  it('dos respuestas a la vez cuyos UUID empiezan igual se conservan las dos', async () => {
    const store = racyStore([])
    const id = (await call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'] })).text.match(/Aviso apuntado \[([a-z0-9]+)\]/)![1]
    store.parties = 2
    nextIds.push('cafebabe-1111-4000-8000-000000000001', 'cafebabe-2222-4000-8000-000000000002')
    await Promise.all([call(store, 'hermes', 'apuntar_aviso', { aviso: id, respuesta: 'lo hago a las 10' }, T0 + 1000), call(store, 'claude', 'apuntar_aviso', { aviso: id, respuesta: 'mejor mañana' }, T0 + 2000)])
    expect(await summary(store)).toContain('respondió: «mejor mañana» (antes: «lo hago a las 10»)')
  })

  it('los ids de 8 cifras del formato de antes se siguen pudiendo responder', async () => {
    const legacy: Row = { tbl: 'settings', id: 'agentNotices', data: { key: 'agentNotices', value: [{ id: 'abc12345', at: T0 - 3600_000, via: 'hermes', tema: 'Pastillas', sobre: [{ ref: 'medicación' }] }] } }
    const store = racyStore([legacy])
    expect((await call(store, 'claude', 'apuntar_aviso', { aviso: 'abc12345', respuesta: 'tomadas' })).isError).toBe(false)
    expect(await summary(store)).toContain('«Pastillas» · sobre: medicación · respondió: «tomadas»')
  })
})

describe('revisión del bloque 2 · 2. contrato de peticion_id', () => {
  const setup = async () => {
    const store = racyStore([])
    const id = (await call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'] })).text.match(/Aviso apuntado \[([a-z0-9]+)\]/)![1]
    const other = (await call(store, 'hermes', 'apuntar_aviso', { tema: 'Pastillas', sobre: ['medicación'] })).text.match(/Aviso apuntado \[([a-z0-9]+)\]/)![1]
    return { store, id, other }
  }
  const replies = (store: ReturnType<typeof racyStore>) => [...store.rows.values()].filter((r) => r.tbl === 'agentNoticeReplies').map((r) => r.data)

  it('respuesta reintentada con el mismo contenido: no escribe nada (ni cambia su hora)', async () => {
    const { store, id } = await setup()
    await call(store, 'hermes', 'apuntar_aviso', { aviso: id, respuesta: 'hecho', peticion_id: 'r-1' }, T0 + 1000)
    const before = JSON.stringify(replies(store))
    const saves = store.saves
    const again = await call(store, 'hermes', 'apuntar_aviso', { aviso: id, respuesta: 'hecho', peticion_id: 'r-1' }, T0 + 9000)
    expect(again.isError).toBe(false)
    expect(again.text).toContain('Ya estaba apuntada')
    expect(store.saves).toBe(saves)
    expect(JSON.stringify(replies(store))).toBe(before)
  })

  it('respuesta con el mismo peticion_id y otro texto: conflicto, se queda la primera', async () => {
    const { store, id } = await setup()
    await call(store, 'hermes', 'apuntar_aviso', { aviso: id, respuesta: 'hecho', peticion_id: 'r-1' }, T0 + 1000)
    const r = await call(store, 'hermes', 'apuntar_aviso', { aviso: id, respuesta: 'mejor mañana', peticion_id: 'r-1' }, T0 + 9000)
    expect(r.isError).toBe(true)
    expect(r.text).toContain('peticion_id r-1 ya se usó')
    expect(await summary(store)).toContain('respondió: «hecho»')
    expect(await summary(store)).not.toContain('mejor mañana')
  })

  it('respuesta con el mismo peticion_id a otro aviso: conflicto, no se mueve de aviso', async () => {
    const { store, id, other } = await setup()
    await call(store, 'hermes', 'apuntar_aviso', { aviso: id, respuesta: 'hecho', peticion_id: 'r-1' }, T0 + 1000)
    const r = await call(store, 'hermes', 'apuntar_aviso', { aviso: other, respuesta: 'hecho', peticion_id: 'r-1' }, T0 + 9000)
    expect(r.isError).toBe(true)
    const s = await summary(store)
    expect(s).toContain('«Buenos días» · sobre: resumen · respondió: «hecho»')
    expect(s).toContain('«Pastillas» · sobre: medicación · SIN RESPUESTA')
  })

  it('aviso con el mismo peticion_id y otro contenido: conflicto, no dice «ya estaba» como si fuera lo mismo', async () => {
    const store = racyStore([])
    await call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'], peticion_id: 'p-1' })
    const r = await call(store, 'hermes', 'apuntar_aviso', { tema: 'Pastillas', sobre: ['medicación'], peticion_id: 'p-1' })
    expect(r.isError).toBe(true)
    expect(r.text).toContain('peticion_id p-1 ya se usó')
    const s = await summary(store)
    expect(s).toContain('«Buenos días»')
    expect(s).not.toContain('«Pastillas»')
  })

  it('aviso reintentado con el mismo contenido: no escribe nada', async () => {
    const store = racyStore([])
    const args = { tema: 'Buenos días', sobre: ['resumen'], canal: 'Telegram', peticion_id: 'p-1' }
    await call(store, 'hermes', 'apuntar_aviso', args)
    const saves = store.saves
    const r = await call(store, 'hermes', 'apuntar_aviso', args, T0 + 5000)
    expect(r.isError).toBe(false)
    expect(r.text).toContain('Ya estaba apuntado')
    expect(store.saves).toBe(saves)
  })

  it('límite conocido: mismo peticion_id con contenido distinto A LA VEZ deja un solo aviso, el último en escribir (no hay escritura condicional)', async () => {
    const store = racyStore([], 2)
    await Promise.all([
      call(store, 'hermes', 'apuntar_aviso', { tema: 'Buenos días', sobre: ['resumen'], peticion_id: 'p-1' }),
      call(store, 'hermes', 'apuntar_aviso', { tema: 'Pastillas', sobre: ['medicación'], peticion_id: 'p-1' }),
    ])
    const left = [...store.rows.values()].filter((r) => r.tbl === 'agentNotices')
    expect(left).toHaveLength(1)
    expect(left[0].data.tema).toBe('Pastillas')
  })
})
