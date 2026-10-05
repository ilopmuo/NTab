import { describe, expect, it } from 'vitest'
import type { Env, Row } from '../../supabase/functions/mcp/ntab'
import { calendarRange, capture, cleanDictation, likeness, spokenDay, type CaptureResult } from '../../supabase/functions/mcp/capture'

// Lunes 5 de octubre de 2026, 10:30 en Madrid
const NOW = Date.parse('2026-10-05T08:30:00Z')
let n = 0
const env = (now = NOW): Env => ({ tz: 'Europe/Madrid', now, autoRemind: true, newId: () => `new-${++n}` })
const task = (id: string, title: string, extra: Record<string, unknown> = {}): Row => ({ tbl: 'tasks', id, data: { id, title, done: 0, tags: [], subtasks: [], priority: 0, order: 1, createdAt: 1, notes: '', ...extra } })
const rows: Row[] = [
  { tbl: 'projects', id: 'p1', data: { id: 'p1', name: 'Mudanza', status: 'active' } },
  task('t1', 'Llamar al dentista', { dueDate: '2026-10-05', dueTime: '17:00' }),
  task('t2', 'Comprar pilas', { dueDate: '2026-10-05', important: '2026-10-05' }),
  task('t3', 'Renovar el DNI', { dueDate: '2026-10-06' }),
  task('t4', 'Pedir cita al dentista'),
  task('t5', 'Regar las plantas', { done: 1, completedAt: Date.parse('2026-10-03T18:00:00Z') }),
  task('t6', 'Pagar el seguro', { dueDate: '2026-10-01' }),
  { tbl: 'habits', id: 'h1', data: { id: 'h1', name: 'Beber agua', days: [0, 1, 2, 3, 4, 5, 6], target: 8, unit: 'vasos', archived: 0 } },
  { tbl: 'habits', id: 'h2', data: { id: 'h2', name: 'Meditar', days: [0, 1, 2, 3, 4, 5, 6], archived: 0 } },
  { tbl: 'notes', id: 'n1', data: { id: 'n1', title: 'Maleta', content: '- [ ] cargador' } },
  { tbl: 'trackers', id: 'tr1', data: { id: 'tr1', name: 'Cambiar las sábanas', log: ['2026-09-20'], every: 14, archived: 0 } },
  { tbl: 'things', id: 'th1', data: { id: 'th1', name: 'Pasaporte', kind: 'stored', location: 'el cajón del despacho' } },
  { tbl: 'things', id: 'th2', data: { id: 'th2', name: 'Taladro', kind: 'lent', personName: 'Luis', since: '2026-09-28' } },
  { tbl: 'shopping', id: 's1', data: { id: 's1', name: 'Leche', checked: 0 } },
  { tbl: 'shopping', id: 's2', data: { id: 's2', name: 'Tiritas', checked: 0, list: 'far' } },
  { tbl: 'expenses', id: 'e1', data: { id: 'e1', amount: 42.5, category: 'super', date: '2026-10-02', note: 'Mercadona' } },
  { tbl: 'expenses', id: 'e2', data: { id: 'e2', amount: 12, category: 'comer', date: '2026-10-03', note: 'Bar' } },
  { tbl: 'settings', id: 'shoppingLists', data: { key: 'shoppingLists', value: [{ id: 'far', name: 'Farmacia' }] } },
  { tbl: 'settings', id: 'budget', data: { key: 'budget', value: { monthly: 400 } } },
]
const say = (text: string, at = NOW, from = rows) => capture(from, text, env(at))
/** Lo que se guarda, sin el registro para deshacer */
const saved = (r: CaptureResult) => r.writes.filter((w) => !(w.tbl === 'settings' && w.id === 'siriUndo'))
/** Los registros después de guardar una captura */
function apply(from: Row[], r: CaptureResult) {
  const key = (x: Row) => `${x.tbl}/${x.id}`
  const map = new Map(from.map((x) => [key(x), x]))
  for (const w of r.writes) map.set(key(w), w)
  for (const d of r.deletes ?? []) map.delete(key(d))
  return [...map.values()]
}

describe('Siri: el dictado tal como llega', () => {
  it('quita la mayúscula y la puntuación del dictado y recuerda si era pregunta', () => {
    expect(cleanDictation('Compra leche y pan.')).toEqual({ text: 'Compra leche y pan', question: false })
    expect(cleanDictation('¿Qué tengo mañana?')).toEqual({ text: 'Qué tengo mañana', question: true })
  })

  it('una tarea sin el punto del dictado, y las fechas como se dicen', () => {
    expect(say('Llamar a mamá el jueves a las 7 de la tarde.').report[0]).toBe('Apuntado: Llamar a mamá, el jueves 8 a las 19:00. Te avisaré.')
    expect(say('Reunión con Luis el 12 de octubre a las 16:30.').report[0]).toBe('Apuntado: Reunión con Luis, el lunes 12 de octubre a las 16:30. Te avisaré.')
    // Frases sueltas del dictado, en una
    expect(saved(say('Llamar al banco. Mañana a las 10.'))[0].data).toMatchObject({ title: 'Llamar al banco', dueDate: '2026-10-06', dueTime: '10:00' })
    expect(spokenDay('2027-01-04', '2026-10-05')).toBe('el lunes 4 de enero de 2027')
  })

  it('la compra dicha con naturalidad, también en otras listas', () => {
    expect(saved(say('Compra pan y huevos.')).map((w) => w.data.name)).toEqual(['Pan', 'Huevos'])
    expect(say('Añade huevos a la lista de la compra.').report[0]).toBe('Añadido a la compra: Huevos.')
    expect(say('Pon pan en la compra').report[0]).toBe('Añadido a la compra: Pan.')
    expect(say('Añade ibuprofeno a la lista de la farmacia.').report[0]).toBe('Añadido a la compra (Farmacia): Ibuprofeno.')
    // A la lista de un proyecto: una tarea en él
    expect(saved(say('Añade llamar al seguro a la lista de Mudanza.'))[0].data).toMatchObject({ title: 'Llamar al seguro', projectId: 'p1' })
    // Con un día por delante, «compra…» es una tarea
    expect(saved(say('Compra entradas para el concierto el viernes.'))[0]).toMatchObject({ tbl: 'tasks', data: { dueDate: '2026-10-09' } })
  })

  it('notas y hábitos sin los dos puntos', () => {
    expect(say('Añade a la nota maleta crema solar.').report[0]).toBe('Añadido a «Maleta»: 1 cosa en la lista.')
    expect(String(saved(say('Añade crema solar a la nota maleta.'))[0].data.content)).toContain('- [ ] crema solar')
    expect(saved(say('Meditar.'))[0]).toMatchObject({ tbl: 'habitLogs', data: { habitId: 'h2' } })
  })
})

describe('Siri: hacer', () => {
  it('«hecho» o «he…» completan la tarea pendiente que encaja', () => {
    for (const s of ['Hecho llamar al dentista.', 'He llamado al dentista.', 'Llamé al dentista.']) {
      const r = say(s)
      expect(saved(r)).toHaveLength(1)
      expect(saved(r)[0]).toMatchObject({ tbl: 'tasks', id: 't1', data: { done: 1 } })
      expect(r.report[0]).toBe('Hecho: Llamar al dentista.')
    }
    // El verbo cuenta: «he llamado al dentista» no es «Pedir cita al dentista»
    expect(likeness('he llamado al dentista', 'Pedir cita al dentista')).toBe(0)
    expect(saved(say('He comprado las pilas.'))[0]).toMatchObject({ id: 't2', data: { done: 1 } })
  })

  it('si no es una tarea: un hábito o «Última vez»', () => {
    expect(saved(say('He meditado.'))[0]).toMatchObject({ tbl: 'habitLogs', data: { habitId: 'h2' } })
    expect(saved(say('Medité.'))[0]).toMatchObject({ tbl: 'habitLogs', data: { habitId: 'h2' } })
    // Con cantidad, uno más (no los 8 de golpe)
    expect(saved(say('He bebido agua.'))[0]).toMatchObject({ tbl: 'habitLogs', data: { habitId: 'h1', count: 1 } })
    const r = say('He cambiado las sábanas.')
    expect(saved(r)[0]).toMatchObject({ tbl: 'trackers', id: 'tr1' })
    expect(r.report[0]).toBe('Apuntado en «Última vez»: Cambiar las sábanas, hoy. Toca otra vez el lunes 19 de octubre.')
    // Algo nuevo, con su infinitivo
    expect(saved(say('He regado las plantas.'))[0]).toMatchObject({ tbl: 'trackers', data: { name: 'Regar las plantas' } })
    expect(saved(say('He pedido la tarjeta sanitaria.'))[0].data.name).toBe('Pedir la tarjeta sanitaria')
    // «he quedado con Ana el viernes» es algo por hacer
    expect(saved(say('He quedado con Ana el viernes a las 8.'))[0].tbl).toBe('tasks')
    // Un pretérito que no es nada de lo tuyo tampoco se inventa
    expect(saved(say('Café con Ana'))[0].tbl).toBe('tasks')
  })

  it('posponer: «pospón…», o «pasa…» si es una tarea que ya existe', () => {
    let r = say('Pospón llamar al dentista a mañana.')
    expect(saved(r)[0]).toMatchObject({ id: 't1', data: { dueDate: '2026-10-06', dueTime: '17:00' } })
    expect(r.report[0]).toBe('Pasada a mañana a las 17:00: Llamar al dentista.')
    r = say('Pospón lo del dentista al viernes a las 5 de la tarde.')
    expect(r.report[0]).toBe('Pasada al viernes 9 a las 17:00: Llamar al dentista.')
    // Sin día, al siguiente
    expect(saved(say('Pospón comprar pilas.'))[0].data.dueDate).toBe('2026-10-06')
    expect(saved(say('Pasa renovar el DNI al lunes.'))[0]).toMatchObject({ id: 't3', data: { dueDate: '2026-10-12' } })
    // «Pasar la ITV el lunes» no existe: es una tarea nueva
    expect(saved(say('Pasar la ITV el lunes.'))[0].data).toMatchObject({ title: 'Pasar la ITV', dueDate: '2026-10-12' })
    expect(say('Pospón ir al gimnasio.').report[0]).toBe('No encuentro «ir al gimnasio» entre lo pendiente.')
  })

  it('dónde dejas las cosas y a quién se las prestas', () => {
    expect(saved(say('He dejado las llaves en el cajón de la entrada.'))[0].data).toMatchObject({ name: 'Llaves', location: 'el cajón de la entrada' })
    expect(say('Le he prestado la escalera a Marta.').report[0]).toBe('Apuntado: Escalera, lo tiene Marta.')
    expect(saved(say('Apunta que el pasaporte está debajo de la cama.'))[0]).toMatchObject({ id: 'th1', data: { location: 'debajo de la cama' } })
  })

  it('«deshaz» quita lo último que dictaste (durante media hora)', () => {
    // Una tarea nueva: se borra
    const added = say('Llamar al fontanero mañana.')
    const id = saved(added)[0].id
    let now = apply(rows, added)
    let r = say('Deshaz.', NOW + 60_000, now)
    expect(r.report[0]).toBe('Deshecho: «Llamar al fontanero».')
    expect(r.deletes).toEqual([{ tbl: 'tasks', id, data: {} }])
    // Una completada: vuelve a estar pendiente; y no se deshace dos veces
    const done = say('Hecho llamar al dentista.')
    now = apply(rows, done)
    r = say('Borra lo último.', NOW + 60_000, now)
    expect(r.report[0]).toBe('Deshecho: «Llamar al dentista» vuelve a estar pendiente.')
    expect(r.writes.find((w) => w.id === 't1')?.data.done).toBe(0)
    now = apply(now, r)
    expect(say('Deshaz.', NOW + 120_000, now).report[0]).toBe('No hay nada reciente que deshacer.')
    // Pasada la media hora, tampoco
    expect(say('Deshaz.', NOW + 31 * 60_000, apply(rows, done)).report[0]).toBe('No hay nada reciente que deshacer.')
  })
})

describe('Siri: preguntar', () => {
  const event = (title: string, start: string, end: string, allDay = false) => ({ title, start, end, allDay, sourceId: 'g' })
  const cal = {
    events: [event('Reunión de equipo', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z'), event('Ya pasó', '2026-10-05T06:00:00Z', '2026-10-05T07:00:00Z'), event('Cumpleaños de Ana', '2026-10-06', '2026-10-07', true)],
    names: { g: 'Trabajo' },
  }

  it('¿qué tengo hoy, mañana o esta semana? (con tus calendarios)', () => {
    expect(capture(rows, '¿Qué tengo hoy?', env(), cal).report[0]).toBe('Hoy tienes 3 cosas: a las 12:00, Reunión de equipo; a las 17:00, Llamar al dentista; y sin hora, Comprar pilas. Lo importante: Comprar pilas. Además, una atrasada.')
    expect(capture(rows, '¿Qué tengo que hacer mañana?', env(), cal).report[0]).toBe('Mañana tienes 2 cosas: todo el día, Cumpleaños de Ana; y sin hora, Renovar el DNI.')
    expect(say('¿Qué hay para el jueves?').report[0]).toBe('El jueves 8 no tienes nada apuntado.')
    expect(say('¿Qué tengo esta semana?').report[0]).toBe('Esta semana tienes 3 cosas: 2 hoy y 1 mañana. Además, una atrasada.')
    // Solo se leen los calendarios cuando hace falta
    expect(calendarRange({ texto: '¿Qué tengo mañana?' }, env())).toEqual({ from: Date.parse('2026-10-05T22:00:00Z'), to: Date.parse('2026-10-06T22:00:00Z') })
    expect(calendarRange({ texto: 'Compra leche' }, env())).toBeUndefined()
  })

  it('qué hago, dónde está, la compra, los gastos y la última vez', () => {
    expect(say('¿Qué hago ahora?').report[0]).toMatch(/^Te propongo: /)
    expect(say('¿Dónde está el pasaporte?').report[0]).toBe('Pasaporte: en el cajón del despacho.')
    expect(say('¿Quién tiene el taladro?').report[0]).toBe('Taladro: lo tiene Luis desde el lunes 28 de septiembre.')
    expect(say('¿Dónde dejé las gafas?').report[0]).toBe('No tengo apuntado dónde están las gafas. Cuando lo sepas, dímelo así: «he dejado las gafas en el cajón».')
    expect(say('¿Qué falta en la compra?').report[0]).toBe('En la compra hay una cosa: Leche. En Farmacia: Tiritas.')
    expect(say('¿Cuánto llevo gastado este mes?').report[0].replace(/ /g, ' ')).toBe('Este mes llevas 54,50 € de 400 €: te quedan 345,50 €. Lo que más, supermercado: 42,50 €.')
    expect(say('¿Cuánto he gastado en Mercadona?').report[0].replace(/ /g, ' ')).toBe('En Mercadona llevas 42,50 € este mes, en un gasto.')
    expect(say('¿Cuándo cambié las sábanas?').report[0]).toBe('La última vez fue hace 15 días, el domingo 20 de septiembre.')
    expect(say('¿Cuándo fue la última vez que regué las plantas?').report[0]).toBe('La última vez fue hace 2 días, el sábado 3 de octubre.')
  })

  it('lo que empieza como una pregunta pero no lo es se apunta como siempre', () => {
    expect(saved(say('Tengo que llamar al banco mañana.'))[0].data).toMatchObject({ title: 'Tengo que llamar al banco', dueDate: '2026-10-06' })
    expect(saved(say('Hay que sacar la basura esta noche.'))[0].tbl).toBe('tasks')
    expect(saved(say('Como con Ana el viernes.'))[0].data).toMatchObject({ dueDate: '2026-10-09' })
    expect(saved(say('Recuerda que tengo cita en el médico el martes.'))[0].tbl).toBe('tasks')
    expect(saved(say('He puesto la lavadora en marcha.'))[0].tbl).not.toBe('things')
    // Sin «?» también se entienden
    expect(say('Tengo 20 minutos, ¿qué hago').report[0]).toMatch(/^Te propongo: /)
    expect(say('Lista de la compra').report[0]).toBe('En la compra hay una cosa: Leche. En Farmacia: Tiritas.')
    expect(say('Qué tengo mañana').report[0]).toBe('Mañana tienes una cosa: Renovar el DNI.')
    expect(say('¿Cuánto gasté este mes?').report[0]).toMatch(/^Este mes llevas/)
  })

  it('una pregunta que no sabe responder no se apunta como tarea', () => {
    const r = say('¿Cuál es la capital de Francia?')
    expect(r.writes).toEqual([])
    expect(r.report[0]).toMatch(/^Puedo decirte qué tienes hoy/)
  })
})
