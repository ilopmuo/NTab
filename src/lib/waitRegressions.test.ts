import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'
import { confirmReply, discardReply, followUp, judgeReply, reopenWait, undoDecision, waitKey, type WaitTask } from '../../supabase/functions/_shared/waitReplies'

/**
 * Fallos que reprodujo Hermes en la primera versión de las esperas (895a51d):
 * cada test fallaba antes del arreglo.
 */
const base = { what: 'el presupuesto del baño', sent: '2026-09-23', since: '2026-09-21', claimed: 'entregado' }
const judge = (excerpt: string, extra: Partial<typeof base> = {}) => judgeReply({ ...base, ...extra, excerpt })

describe('regresión 1: «entregado» necesita la entrega de lo esperado', () => {
  it('adjuntar otra cosa no es entregar el presupuesto', () => {
    const r = judge('Te adjunto las fotos de las vacaciones')
    expect(r.kind).toBe('dudoso')
    expect(r.notes.join(' ')).toContain('manda otra cosa')
  })

  it('preguntar por el asunto no es entregarlo', () => {
    expect(judge('¿Qué importe esperabas para el presupuesto del baño?').kind).toBe('contestado')
  })

  it('compartir una palabra secundaria no basta («del baño»)', () => {
    expect(judge('Te adjunto las fotos del baño').kind).toBe('dudoso')
  })

  it('negaciones, ofertas y promesas no son entregas', () => {
    expect(judge('No te adjunto el presupuesto porque aún no lo tengo').kind).toBe('contestado')
    expect(judge('Si quieres te paso el presupuesto del baño').kind).toBe('contestado')
    expect(judge('¿Te paso el presupuesto por aquí o por correo?').kind).toBe('contestado')
    expect(judge('Te mando el presupuesto mañana').kind).toBe('contestado')
    // Dice que lo manda y que aún no: contradictorio
    expect(judge('Te adjunto el presupuesto. Bueno, todavía no, falta una partida').kind).toBe('dudoso')
  })

  it('en inglés', () => {
    expect(judge('Attached is the presupuesto for the bathroom').kind).toBe('entregado')
    expect(judge('Please find attached the vacation photos').kind).toBe('dudoso')
    expect(judge("I'll send the presupuesto tomorrow").kind).toBe('contestado')
    expect(judge("I haven't sent the presupuesto yet").kind).toBe('contestado')
    // Lo esperado en otro idioma no se reconoce: se queda en duda (límite documentado)
    expect(judge('Attached is the quote you were waiting for').kind).toBe('dudoso')
  })

  it('lo citado no cuenta: solo lo que ha escrito', () => {
    const reply = 'Gracias, lo miro esta semana.\n\nEl lun, 21 sept 2026 a las 10:00, Nacho escribió:\n> Te adjunto el presupuesto del baño anterior'
    expect(judge(reply).kind).toBe('contestado')
    expect(judge('> Te adjunto el presupuesto del baño').kind).toBe('dudoso')
    const fwd = 'Mira esto\n---------- Forwarded message ---------\nAttached is the presupuesto'
    expect(judge(fwd).kind).toBe('dudoso')
  })

  it('lo que sí es una entrega del objeto esperado', () => {
    expect(judge('Te paso el presupuesto adjunto, son 1.200 €.').kind).toBe('entregado')
    expect(judge('Aquí tienes el presupuesto del baño, mañana te llamo').kind).toBe('entregado')
    expect(judge('Ya te he enviado los presupuestos').kind).toBe('entregado')
    expect(judge('Te adjunto lo que me pediste').kind).toBe('entregado')
  })
})

describe('regresión 2: «Volver a esperar» no pisa cambios posteriores', () => {
  const wait = { waitingFor: 'Ana', waitingSince: '2026-09-21', waitingWhat: 'el presupuesto' }
  const task = (): WaitTask => ({
    id: 't1',
    title: 'Presupuesto del baño',
    done: 0,
    dueDate: '2026-09-25',
    ...wait,
    waitingReplies: [{ id: 'r1', source: 'gmail', msg: 'm', sent: '2026-09-23', kind: 'entregado', why: '', wait: waitKey(wait), via: 'hermes', at: 0, status: 'pendiente', excerpt: 'x' }],
  })

  it('si nadie la ha tocado, vuelve la fecha de antes', () => {
    const closed = confirmReply(task(), 'r1', { now: 1, today: '2026-09-24' }).task!
    expect(closed.dueDate).toBe('2026-09-24')
    const back = reopenWait(closed, 'r1')
    expect(back).toMatchObject({ task: { dueDate: '2026-09-25', waitingFor: 'Ana' } })
    expect(back.kept).toBeUndefined()
  })

  it('un cierre antiguo (sin saber en qué fecha quedó) no toca la fecha', () => {
    const closed = confirmReply(task(), 'r1', { now: 1, today: '2026-09-24' }).task!
    delete closed.waitingReplies![0].closed!.dueAfter
    expect(reopenWait(closed, 'r1').task?.dueDate).toBe('2026-09-24')
  })

  it('conserva el vencimiento que cambió el usuario después de cerrar', () => {
    const closed = confirmReply(task(), 'r1', { now: 1, today: '2026-09-24' }).task!
    const edited = { ...closed, dueDate: '2026-10-10' }
    const back = reopenWait(edited, 'r1')
    expect(back.task?.waitingFor).toBe('Ana')
    expect(back.task?.dueDate).toBe('2026-10-10')
  })
})

type FullTask = WaitTask & { notes: string; tags: string[] }
const full = (): FullTask => ({
  id: 't1',
  title: 'Presupuesto del baño',
  notes: '',
  tags: [],
  done: 0,
  dueDate: '2026-09-25',
  waitingFor: 'Ana',
  waitingSince: '2026-09-21',
  waitingWhat: 'el presupuesto',
  waitingReplies: [
    {
      id: 'r1',
      source: 'gmail',
      msg: 'm',
      sent: '2026-09-23',
      kind: 'entregado',
      why: '',
      wait: waitKey({ waitingFor: 'Ana', waitingSince: '2026-09-21', waitingWhat: 'el presupuesto' }),
      via: 'hermes',
      at: 0,
      status: 'pendiente',
      excerpt: 'Te paso el presupuesto adjunto',
      link: 'https://mail.google.com/x',
    },
  ],
})

describe('Deshacer en la app: solo lo que cambió la decisión', () => {
  it('deshacer el cierre conserva título, notas y fecha cambiados después', () => {
    const before = full()
    const after = confirmReply(before, 'r1', { now: 1, today: '2026-09-24' }).task!
    const edited: FullTask = { ...after, title: 'Revisar el presupuesto del baño', notes: 'Llamar a Ana', tags: ['casa'], dueDate: '2026-10-10' }
    const u = undoDecision(edited, before, after, 'r1')
    expect(u.task).toMatchObject({ title: 'Revisar el presupuesto del baño', notes: 'Llamar a Ana', tags: ['casa'], dueDate: '2026-10-10', waitingFor: 'Ana', waitingSince: '2026-09-21', waitingWhat: 'el presupuesto' })
    expect(u.kept).toBe('2026-10-10')
    // La propuesta vuelve a estar pendiente, con su extracto
    expect(u.task!.waitingReplies![0]).toMatchObject({ status: 'pendiente', excerpt: 'Te paso el presupuesto adjunto' })
    expect(followUp(u.task!, '2026-09-24').state).toBe('decidir')
  })

  it('sin cambios después, vuelve exactamente como estaba', () => {
    const before = full()
    const after = confirmReply(before, 'r1', { now: 1, today: '2026-09-24' }).task!
    expect(undoDecision(after, before, after, 'r1')).toEqual({ task: before, kept: undefined })
  })

  it('si después ha empezado otra espera, no la pisa', () => {
    const before = full()
    const after = confirmReply(before, 'r1', { now: 1, today: '2026-09-24' }).task!
    const again: FullTask = { ...after, waitingFor: 'Luis', waitingSince: '2026-09-24' }
    expect(undoDecision(again, before, after, 'r1')).toEqual({ error: 'ha cambiado después (de quién espera)' })
  })

  it('si la propuesta ha cambiado después (p. ej. «Volver a esperar»), no la toca', () => {
    const before = full()
    const after = confirmReply(before, 'r1', { now: 1, today: '2026-09-24' }).task!
    const reopened = reopenWait(after, 'r1').task!
    expect(undoDecision(reopened, before, after, 'r1').error).toBe('la propuesta ha cambiado después')
  })

  it('deshacer un descarte devuelve la propuesta y respeta lo demás', () => {
    const before = full()
    const after = discardReply(before, 'r1', 1).task!
    const edited = { ...after, title: 'Otro título' }
    const u = undoDecision(edited, before, after, 'r1')
    expect(u.task).toMatchObject({ title: 'Otro título', waitingReplies: [{ status: 'pendiente', excerpt: 'Te paso el presupuesto adjunto' }] })
    expect(undoDecision(undefined, before, after, 'r1').error).toBe('la tarea ya no existe')
  })
})

// ── Con el conector, como lo usa Hermes ─────────────────────────
const NOW = Date.parse('2026-09-24T08:00:00Z') // jueves 24, 10:00 en Madrid
let n = 0
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `id-${++n}-abcdef`, via: 'hermes' })
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
const call = async (store: Store, name: string, args: Record<string, unknown> = {}) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env())) as { result: { content: { text: string }[]; isError?: boolean } }
  return { text: r.result.content[0].text, extra: r.result.content.slice(1).map((c) => c.text).join(' '), isError: !!r.result.isError }
}
const waitingRow = (due: string): Row => ({
  tbl: 'tasks',
  id: 't1',
  data: { id: 't1', title: 'Presupuesto del baño', notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0, dueDate: due, waitingFor: 'Ana', waitingSince: '2026-09-21', waitingWhat: 'el presupuesto' },
})
const msg = (extra: Record<string, unknown>) => ({ id: 't1', fuente: 'gmail', mensaje_id: 'm-1', fecha: '2026-09-23', de: 'Ana', extracto: 'Te lo mando el lunes', tipo: 'contestado', motivo: 'Ana contesta', ...extra })
const line = (text: string) => text.split('\n').find((l) => l.startsWith('- [t1]'))!
const task1 = (store: ReturnType<typeof memoryStore>) => store.rows.get('tasks:t1')!.data as unknown as WaitTask

describe('regresión 3: contestar no silencia el seguimiento', () => {
  it('«te lo mando el lunes»: la fecha sigue y, cuando toca, toca preguntar', async () => {
    const store = memoryStore([waitingRow('2026-09-24')])
    const r = await call(store, 'proponer_cierre_espera', msg({ fecha: '2026-09-22' }))
    expect(r.text).toContain('La espera sigue con su fecha (volver a preguntar hoy, 2026-09-24)')
    expect(task1(store).dueDate).toBe('2026-09-24')
    const s = line((await call(store, 'ver_resumen')).text.split('A LA ESPERA DE OTRAS PERSONAS')[1])
    expect(s).toContain('volver a preguntar hoy (2026-09-24): TOCA PREGUNTAR')
    expect(s).toContain('HA CONTESTADO por Gmail de Ana martes 22/9 (hace 2 días), AÚN SIN ENTREGAR')
    expect(s).not.toContain('no le insistas')
    // Siri también sigue proponiendo preguntar
    expect(followUp(task1(store), '2026-09-24').state).toBe('preguntar')
  })

  it('si ha contestado hoy, hoy no se insiste; mañana sí', async () => {
    const store = memoryStore([waitingRow('2026-09-24')])
    await call(store, 'proponer_cierre_espera', msg({ fecha: '2026-09-24T07:30:00Z' }))
    expect(followUp(task1(store), '2026-09-24').state).toBe('contestado-hoy')
    expect(line((await call(store, 'ver_resumen')).text.split('A LA ESPERA DE OTRAS PERSONAS')[1])).toContain('pero ha contestado hoy: hoy no insistas')
    expect(followUp(task1(store), '2026-09-25').state).toBe('preguntar')
  })

  it('una fecha nueva solo se propone: no cambia sin su sí', async () => {
    const store = memoryStore([waitingRow('2026-09-25')])
    const r = await call(store, 'proponer_cierre_espera', msg({ extracto: 'Te lo mando el martes', volver_a_preguntar: '2026-09-29' }))
    expect(r.text).toContain('Propones volver a preguntar el 2026-09-29: no lo cambio; pregúntale y, solo si dice que sí, actualizar_tareas con esa fecha.')
    expect(task1(store).dueDate).toBe('2026-09-25')
    expect(task1(store).waitingReplies![0].nextAsk).toBe('2026-09-29')
    expect((await call(store, 'ver_esperas')).text).toContain('propone volver a preguntar el martes 29 (2026-09-29), sin aplicar: pregúntale si cambia la fecha')
    // Con su sí, con la herramienta de siempre
    await call(store, 'actualizar_tareas', { cambios: [{ id: 't1', fecha: '2026-09-29' }] })
    expect(task1(store).dueDate).toBe('2026-09-29')
  })

  it('sin fecha clara no se deduce nada, y en una entrega no se guarda', async () => {
    const store = memoryStore([waitingRow('2026-09-25')])
    await call(store, 'proponer_cierre_espera', msg({ volver_a_preguntar: 'el lunes' }))
    expect(task1(store).waitingReplies![0].nextAsk).toBeUndefined()
    await call(store, 'proponer_cierre_espera', msg({ mensaje_id: 'm-2', tipo: 'entregado', extracto: 'Te paso el presupuesto adjunto', volver_a_preguntar: '2026-09-29' }))
    expect(task1(store).waitingReplies![1]).toMatchObject({ kind: 'entregado' })
    expect(task1(store).waitingReplies![1].nextAsk).toBeUndefined()
  })

  it('una posible coincidencia no cambia el seguimiento', async () => {
    const store = memoryStore([waitingRow('2026-09-24')])
    await call(store, 'proponer_cierre_espera', msg({ tipo: 'dudoso', extracto: '¿Quedamos el viernes?' }))
    expect(followUp(task1(store), '2026-09-24').state).toBe('preguntar')
    expect(line((await call(store, 'ver_resumen')).text.split('A LA ESPERA DE OTRAS PERSONAS')[1])).toContain('posible coincidencia por Gmail de Ana ayer sin confirmar')
  })

  it('una posible entrega sí pausa: toca decidir, no insistir', async () => {
    const store = memoryStore([waitingRow('2026-09-24')])
    await call(store, 'proponer_cierre_espera', msg({ tipo: 'entregado', extracto: 'Te paso el presupuesto adjunto' }))
    const s = line((await call(store, 'ver_resumen')).text.split('A LA ESPERA DE OTRAS PERSONAS')[1])
    expect(s).toContain('POSIBLE RESPUESTA RECIBIDA')
    expect(s).toContain('no le insistas a Ana')
    expect(s).not.toContain('TOCA PREGUNTAR')
  })

  it('lo citado no se guarda como si lo hubiera escrito', async () => {
    const store = memoryStore([waitingRow('2026-09-25')])
    await call(store, 'proponer_cierre_espera', msg({ tipo: 'entregado', extracto: 'Gracias, lo miro.\n\nEl lun, 21 sept, Nacho escribió:\n> te adjunto el presupuesto' }))
    expect(task1(store).waitingReplies![0]).toMatchObject({ kind: 'contestado', excerpt: 'Gracias, lo miro.' })
  })
})

describe('deshacer por el conector tampoco pisa cambios posteriores', () => {
  it('si cambió la fecha después del cierre, deshacer no la toca', async () => {
    const store = memoryStore([waitingRow('2026-09-25')])
    const p = (await call(store, 'proponer_cierre_espera', msg({ tipo: 'entregado', extracto: 'Te paso el presupuesto adjunto' }))).text.match(/Propuesta ([a-z0-9]+)/)![1]
    const yes = await call(store, 'confirmar_cierre_espera', { propuesta: p, confirmado: true })
    const op = yes.extra.match(/Operación ([a-z0-9]+)/)![1]
    await call(store, 'actualizar_tareas', { cambios: [{ id: 't1', fecha: '2026-10-10' }] })
    const u = await call(store, 'deshacer', { operacion: op })
    expect(u.text).toContain('No he tocado lo que ha cambiado después')
    expect(task1(store)).toMatchObject({ dueDate: '2026-10-10' })
    expect(task1(store).waitingFor).toBeUndefined()
  })
})

