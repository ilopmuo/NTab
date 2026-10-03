import { describe, expect, it } from 'vitest'
import { handleMessage, type Store } from '../../supabase/functions/mcp/server'
import { capture, type Env, type Row } from '../../supabase/functions/mcp/ntab'

// Sábado 3 de octubre de 2026, 9:20 en Madrid
const NOW = Date.parse('2026-10-03T07:20:00Z')
let n = 0
const env = (now = NOW): Env => ({ tz: 'Europe/Madrid', now, autoRemind: true, newId: () => `new-${++n}` })

function memoryStore(initial: Row[]) {
  const rows = new Map(initial.map((r) => [`${r.tbl}:${r.id}`, r]))
  const store: Store & { rows: Map<string, Row> } = {
    rows,
    load: async () => [...rows.values()],
    save: async (writes) => {
      for (const w of writes) rows.set(`${w.tbl}:${w.id}`, w)
    },
  }
  return store
}
const call = async (store: Store, name: string, args: Record<string, unknown> = {}, now = NOW) => {
  const r = (await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, store, env(now))) as { result: { content: { text: string }[] } }
  return r.result.content[0].text
}
const meds = (): Row[] => [
  { tbl: 'meds', id: 'ibu', data: { id: 'ibu', name: 'Ibuprofeno', dose: '600 mg', times: ['09:00', '21:00'], stock: 6, archived: 0 } },
  { tbl: 'meds', id: 'para', data: { id: 'para', name: 'Paracetamol', times: [], maxPerDay: 3, archived: 0 } },
  { tbl: 'people', id: 'p1', data: { id: 'p1', name: 'Luis Pérez' } },
]

describe('a prueba de despistes, desde Claude', () => {
  it('«¿me he tomado la pastilla?»: en el resumen y con ver_medicacion; tomar_medicacion la marca y descuenta', async () => {
    const store = memoryStore(meds())
    expect(await call(store, 'ver_resumen')).toContain('MEDICACIÓN DE HOY')
    expect(await call(store, 'ver_medicacion', { medicamento: 'ibuprofeno' })).toContain('Ibuprofeno 600 mg: 09:00 toca ahora; 21:00 pendiente')
    expect(await call(store, 'tomar_medicacion', { medicamento: 'el ibuprofeno' })).toBe('Ibuprofeno de las 9:00: tomada a las 9:20.\nQuedan 5: toca reponer.')
    expect(store.rows.get('medLogs:ibu:2026-10-03:09:00')?.data).toMatchObject({ status: 'taken', time: '09:00' })
    expect(store.rows.get('meds:ibu')?.data.stock).toBe(5)
    // Otra vez la misma: no se descuenta dos veces
    expect(await call(store, 'tomar_medicacion', { medicamento: 'Ibuprofeno', hora: '9:00' })).toContain('Ya estaba marcada')
    expect(await call(store, 'ver_medicacion')).toContain('09:00 tomada a las 9:20')
  })

  it('crear y cambiar tareas a la espera de alguien', async () => {
    const store = memoryStore(meds())
    expect(await call(store, 'crear_tareas', { tareas: [{ titulo: 'Presupuesto del fontanero', esperando: 'Luis' }] })).toContain('A LA ESPERA de Luis')
    const t = [...store.rows.values()].find((r) => r.tbl === 'tasks')!
    expect(t.data).toMatchObject({ waitingFor: 'Luis', waitingSince: '2026-10-03', dueDate: '2026-10-06' })
    expect(await call(store, 'ver_resumen')).toContain(`A LA ESPERA DE OTRAS PERSONAS (1)`)
    await call(store, 'actualizar_tareas', { cambios: [{ id: t.id, esperando: null }] })
    expect(store.rows.get(`tasks:${t.id}`)?.data.waitingFor).toBeUndefined()
  })
})

describe('a prueba de despistes, desde Siri', () => {
  it('«tomada: …» la marca; «¿me he tomado…?» lo dice', () => {
    const rows = meds()
    expect(capture(rows, '¿Me he tomado el ibuprofeno?', env()).report).toEqual(['No: Ibuprofeno de las 9:00, aún no.'])
    const r = capture(rows, 'tomada: ibuprofeno', env())
    expect(r.report[0]).toBe('Ibuprofeno de las 9:00: tomada a las 9:20.')
    const after = [...rows, ...r.writes.filter((w) => w.tbl === 'medLogs')]
    expect(capture(after, '¿me he tomado las pastillas?', env()).report).toEqual(['Sí: Ibuprofeno a las 9:20. Paracetamol: hoy no.'])
    expect(capture(rows, 'me he tomado un paracetamol', env()).report[0]).toBe('Paracetamol: tomada a las 9:20.')
    // Sin medicamento que encaje, es una tarea más
    expect(capture(rows, 'he tomado café con Ana', env()).writes[0].tbl).toBe('tasks')
  })

  it('«esperando a Luis» se apunta a la espera, con cuándo volver a preguntar', () => {
    const r = capture(meds(), 'presupuesto del fontanero esperando a Luis', env())
    expect(r.writes[0].data).toMatchObject({ title: 'Presupuesto del fontanero', waitingFor: 'Luis Pérez', people: ['p1'], dueDate: '2026-10-06' })
    expect(r.report[0]).toBe('Apuntado: Presupuesto del fontanero, esperando a Luis Pérez; te lo recuerdo el martes 6.')
  })
})
