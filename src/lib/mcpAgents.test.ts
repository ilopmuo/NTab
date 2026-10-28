import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'
import { sameTask, unclearTask } from '../../supabase/functions/_shared/doubt'
import { fingerprint } from '../../supabase/functions/mcp/agentLog'

// Jueves 24 de septiembre de 2026, 10:00 en Madrid; lo pide Hermes
const NOW = Date.parse('2026-09-24T08:00:00Z')
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
      // Como Postgres: lo guardado vuelve con las claves en otro orden
      for (const w of writes) rows.set(`${w.tbl}:${w.id}`, { ...w, data: Object.fromEntries(Object.entries(w.data).reverse()) })
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

const call = async (store: Store, name: string, args: Record<string, unknown> = {}) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env())) as {
    result: { content: { text: string }[]; isError?: boolean }
  }
  return { text: r.result.content[0].text, extra: r.result.content.slice(1).map((c) => c.text).join(' '), isError: !!r.result.isError }
}
const tasks = (store: ReturnType<typeof memoryStore>) => [...store.rows.values()].filter((r) => r.tbl === 'tasks').map((r) => r.data)

describe('captura que no se inventa nada', () => {
  it('lo que no se entiende se pregunta', () => {
    expect(unclearTask('Sacar También tengo que sacar')?.ask).toBe('¿Qué tienes que sacar?')
    expect(unclearTask('Sacar')?.ask).toBe('¿Qué tienes que sacar?')
    expect(unclearTask('Llamar a')?.why).toBe('parece cortada')
    expect(unclearTask('Enviar el informe al jefe')).toBeUndefined()
    expect(unclearTask('Meditar')).toBeUndefined()
    expect(sameTask('llamar dentista', [{ title: 'Llamar al dentista' }])?.title).toBe('Llamar al dentista')
    expect(sameTask('Llamar al dentista para la revisión', [{ title: 'Llamar al dentista' }])).toBeUndefined()
    expect(sameTask('Llamar al dentista', [{ title: 'Llamar al dentista', done: 1 }])).toBeUndefined()
  })

  it('crear_tareas: no crea lo dudoso ni lo repetido, y guarda de dónde sale', async () => {
    const store = memoryStore([task('t1', { title: 'Llamar al dentista', dueDate: '2026-09-25' })])
    const r = await call(store, 'crear_tareas', {
      tareas: [
        { titulo: 'Sacar También tengo que sacar' },
        { titulo: 'Llamar al dentista' },
        {
          titulo: 'Pedir el presupuesto del baño',
          texto_original: 'oye apúntame lo del presupuesto del baño que me dijo Ana',
          origen: { tipo: 'correo', enlace: 'https://mail.google.com/x', descripcion: 'Correo de Ana del martes' },
          esperando: 'Ana',
          espero: 'el presupuesto',
        },
      ],
    })
    expect(r.isError).toBe(false)
    expect(r.text).toContain('NO CREADA «Sacar También tengo que sacar»: parece un dictado a medias. Pregúntale: «¿Qué tienes que sacar?»')
    expect(r.text).toContain('YA LA TENÍA: «Llamar al dentista» [t1] (mañana)')
    const created = tasks(store).find((t) => t.title === 'Pedir el presupuesto del baño')!
    expect(created.origin).toEqual({ via: 'hermes', text: 'oye apúntame lo del presupuesto del baño que me dijo Ana', kind: 'correo', link: 'https://mail.google.com/x', about: 'Correo de Ana del martes' })
    expect(created).toMatchObject({ waitingFor: 'Ana', waitingWhat: 'el presupuesto' })
    // En el resumen, qué se espera y de dónde sale
    const s = await call(store, 'ver_resumen')
    expect(s.text).toContain('(espera: el presupuesto)')
    expect(s.text).toContain('sale de: Correo de Ana del martes https://mail.google.com/x')
    // Si ya se le ha preguntado, se crea
    const ok = await call(store, 'crear_tareas', { tareas: [{ titulo: 'Sacar', confirmado: true }] })
    expect(ok.text).toMatch(/^Creada: \[[^\]]+\] Sacar/)
  })
})

describe('conector seguro y reversible', () => {
  it('peticion_id: un reintento no hace dos veces lo mismo', async () => {
    const store = memoryStore([])
    const a = await call(store, 'apuntar_gasto', { texto: 'café 2,50', peticion_id: 'abc-1' })
    expect(a.extra).toMatch(/^\(Operación [a-z0-9-]+: se puede deshacer con deshacer\)$/)
    const b = await call(store, 'apuntar_gasto', { texto: 'café 2,50', peticion_id: 'abc-1' })
    expect(b.text).toMatch(/^Ya estaba hecho \(peticion_id abc-1/)
    expect([...store.rows.values()].filter((r) => r.tbl === 'expenses')).toHaveLength(1)
  })

  it('simular: cuenta lo que haría sin guardar nada', async () => {
    const store = memoryStore([])
    const r = await call(store, 'crear_tareas', { tareas: [{ titulo: 'Renovar el DNI' }, { titulo: 'Pagar la luz' }], simular: true })
    expect(r.text).toMatch(/^VISTA PREVIA \(no se ha guardado nada; cambiaría 2 cosas\)/)
    expect(r.text).toMatch(/Creada: \[[^\]]+\] Renovar el DNI/)
    expect(tasks(store)).toHaveLength(0)
  })

  it('historial y deshacer por operación, sin pisar lo que cambió después', async () => {
    const store = memoryStore([task('t1', { title: 'Enviar informe', dueDate: '2026-09-24' })])
    await call(store, 'crear_tareas', { tareas: [{ titulo: 'Renovar el DNI' }] })
    const moved = await call(store, 'actualizar_tareas', { cambios: [{ id: 't1', fecha: '2026-09-30' }] })
    const op = moved.extra.match(/Operación ([a-z0-9-]+)/)![1]
    const h = await call(store, 'ver_historial')
    expect(h.text.split('\n')[0]).toMatch(new RegExp(`^- \\[${op}\\] ahora mismo · hermes · actualizar_tareas: Actualizada: .*Enviar informe`))
    // Deshacer el cambio de fecha: vuelve a hoy
    const u = await call(store, 'deshacer', { operacion: op })
    expect(u.text).toMatch(/^Deshecho: Actualizada/)
    expect(tasks(store).find((t) => t.id === 't1')?.dueDate).toBe('2026-09-24')
    expect((await call(store, 'deshacer', { operacion: op })).text).toContain('ya estaba deshecha')
    // La última que queda es la de crear: deshacerla quita la tarea, salvo que se haya tocado después
    const created = tasks(store).find((t) => t.title === 'Renovar el DNI')!
    store.rows.set(`tasks:${created.id}`, { tbl: 'tasks', id: String(created.id), data: { ...created, title: 'Renovar el DNI y el pasaporte' } })
    const u2 = await call(store, 'deshacer')
    expect(u2.text).toContain('No he tocado lo que ha cambiado después: tasks «Renovar el DNI y el pasaporte»')
    expect(tasks(store).some((t) => t.title === 'Renovar el DNI y el pasaporte')).toBe(true)
  })

  it('la huella no depende del orden de las claves', () => {
    expect(fingerprint({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(fingerprint({ b: { d: [1, 2], c: 2 }, a: 1 }))
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }))
  })

  it('medicación: alta y cambios solo con lo que dice, sin inventar horas', async () => {
    const store = memoryStore([])
    const ask = await call(store, 'guardar_medicacion', { medicamento: 'Amoxicilina' })
    expect(ask.text).toBe('¿A qué horas se toma Amoxicilina? Dímelo (o si es «cuando haga falta»): no me lo invento.')
    const r = await call(store, 'guardar_medicacion', { medicamento: 'amoxicilina', dosis: '500 mg', horas: ['8:00', '16:00', '00:00'], dias_tratamiento: 7, quedan: 21 })
    expect(r.text).toBe('Apuntado: Amoxicilina (500 mg), a las 0:00, 8:00, 16:00, hasta el 2026-09-30; quedan 21. Le avisaré a su hora.')
    const med = [...store.rows.values()].find((x) => x.tbl === 'meds')!.data
    expect(med).toMatchObject({ name: 'Amoxicilina', dose: '500 mg', times: ['00:00', '08:00', '16:00'], from: '2026-09-24', until: '2026-09-30', stock: 21, archived: 0 })
    // Cambiar solo la dosis
    await call(store, 'guardar_medicacion', { medicamento: 'Amoxicilina', dosis: '875 mg' })
    expect([...store.rows.values()].find((x) => x.tbl === 'meds')!.data).toMatchObject({ dose: '875 mg', times: ['00:00', '08:00', '16:00'] })
    const bad = await call(store, 'guardar_medicacion', { medicamento: 'Amoxicilina', horas: ['a las ocho'] })
    expect(bad.text).toContain('Horas que no valen: a las ocho')
    expect((await call(store, 'guardar_medicacion', { medicamento: 'Amoxicilina', dejar: true })).text).toBe('Amoxicilina: fuera de la medicación (queda en el historial).')
  })
})
