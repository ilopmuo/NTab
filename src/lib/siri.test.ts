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

  it('el título sin lo que se dice para pedirla ni las muletillas', () => {
    const title = (s: string) => saved(say(s)).find((w) => w.tbl === 'tasks')?.data
    expect(title('Recuérdame que tengo que llamar al dentista mañana por la mañana')).toMatchObject({ title: 'Llamar al dentista', dueDate: '2026-10-06', dueTime: '09:00' })
    expect(title('Acuérdate de que mañana tengo que llevar el coche al taller')).toMatchObject({ title: 'Llevar el coche al taller', dueDate: '2026-10-06' })
    expect(title('Apúntame una tarea para revisar el contrato del piso el jueves')).toMatchObject({ title: 'Revisar el contrato del piso', dueDate: '2026-10-08' })
    expect(title('Por favor añade una tarea de enviar el informe al jefe el lunes')?.title).toBe('Enviar el informe al jefe')
    expect(title('Crea una tarea llamar a Luis')?.title).toBe('Llamar a Luis')
    expect(title('Apunta que hay que pedir cita en el médico')?.title).toBe('Pedir cita en el médico')
    expect(title('No me puedo olvidar de sacar la basura esta noche')?.title).toBe('Sacar la basura')
    expect(title('Eh vale y luego también tengo que llamar al banco')?.title).toBe('Llamar al banco')
    expect(title('Debería ir al gimnasio esta tarde')?.title).toBe('Ir al gimnasio')
    expect(title('Necesito hacer la declaración de la renta, por favor')?.title).toBe('Hacer la declaración de la renta')
    // Sin un verbo detrás, «necesito» y «quiero» son la tarea; y «pon la lavadora» o «mira el correo», también
    expect(title('Necesito un abrigo nuevo')?.title).toBe('Necesito un abrigo nuevo')
    expect(title('Pon la lavadora')?.title).toBe('Pon la lavadora')
    expect(title('Mira el correo de Hacienda')?.title).toBe('Mira el correo de Hacienda')
    expect(title('Voy a la peluquería el martes')?.title).toBe('Voy a la peluquería')
  })

  it('«antes del viernes» es la fecha límite, y se dice', () => {
    const r = say('Oye pues tengo que mirar lo del seguro del coche eh antes del viernes')
    expect(saved(r)[0].data).toMatchObject({ title: 'Mirar lo del seguro del coche', deadline: '2026-10-09' })
    expect(r.report[0]).toBe('Apuntado: Mirar lo del seguro del coche, para antes del viernes 9.')
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
    expect(saved(say('Tengo que llamar al banco mañana.'))[0].data).toMatchObject({ title: 'Llamar al banco', dueDate: '2026-10-06' })
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

describe('Siri de día a día', () => {
  const T = '2026-10-05'
  const day: Row[] = [
    ...rows,
    task('w1', 'Presupuesto del fontanero', { waitingFor: 'Luis', waitingSince: '2026-10-01', dueDate: '2026-10-05' }),
    task('e1', 'Reunión con el banco', { dueDate: T, dueTime: '18:30' }),
    task('d1', 'Enviar la factura', { done: 1, completedAt: Date.parse('2026-10-05T07:00:00Z'), dueDate: T }),
    { tbl: 'people', id: 'p1', data: { id: 'p1', name: 'Ana López', birthday: '1992-10-06', dates: [{ id: 'x', label: 'Aniversario', date: '2015-03-14' }] } },
    { tbl: 'menu', id: `${T}:cena`, data: { id: `${T}:cena`, date: T, meal: 'cena', text: 'Tortilla de patatas' } },
    { tbl: 'meds', id: 'ibu', data: { id: 'ibu', name: 'Ibuprofeno', times: ['09:00', '21:00'], archived: 0 } },
    { tbl: 'shopping', id: 's3', data: { id: 's3', name: 'Pan', checked: 0 } },
  ]
  const ask = (text: string, cx?: Parameters<typeof capture>[3]) => capture(day, text, env(), cx).report[0]

  it('«buenos días»: el día de un vistazo', () => {
    const r = ask('Buenos días.')
    expect(r).toMatch(/^Buenos días\. Hoy tienes 3 cosas: a las 17:00, Llamar al dentista; a las 18:30, Reunión con el banco; y sin hora, Comprar pilas\. Lo importante: Comprar pilas\. Además, una atrasada\./)
    expect(r).toContain('Sin tomar: Ibuprofeno de las 9:00. Te queda: Ibuprofeno de las 21:00.')
    expect(r).toContain('Te quedan 2 hábitos: Beber agua y Meditar.')
    expect(r).toContain('Mañana es el cumpleaños de Ana.')
    expect(r).toContain('Hoy toca preguntar: a Luis por presupuesto del fontanero.')
  })

  it('«buenas noches»: lo hecho, lo que queda y lo de mañana', () => {
    const r = ask('Buenas noches')
    expect(r).toContain('Hoy has hecho una cosa: Enviar la factura.')
    expect(r).toContain('Te quedan 4 sin hacer: Llamar al dentista, Comprar pilas, Pagar el seguro y 1 más.')
    expect(r).toContain('Mañana tienes una cosa: Renovar el DNI.')
  })

  it('partes del día, menú, cumpleaños, a la espera, hábitos y medicación', () => {
    expect(ask('¿Qué tengo esta tarde?')).toBe('Esta tarde tienes 2 cosas: a las 17:00, Llamar al dentista; a las 18:30, Reunión con el banco. Sin hora tienes una cosa más.')
    expect(ask('¿Qué tengo mañana por la mañana?')).toBe('Mañana por la mañana no tienes nada con hora. Sin hora tienes una cosa más.')
    expect(ask('¿Qué hay de cenar?')).toBe('Hoy para cenar: Tortilla de patatas.')
    expect(ask('¿Qué como mañana?')).toBe('Mañana no hay nada apuntado para comer.')
    expect(ask('¿Cuándo es el cumpleaños de Ana?')).toBe('El cumpleaños de Ana es mañana (cumple 34).')
    expect(ask('¿Cuándo es el aniversario de Ana?')).toBe('El aniversario de Ana es el domingo 14 de marzo de 2027, dentro de 160 días.')
    expect(ask('¿Qué cumpleaños hay esta semana?')).toBe('Esta semana: Ana mañana.')
    expect(ask('¿Qué estoy esperando?')).toBe('Esperas una cosa: Presupuesto del fontanero, de Luis, desde hace 4 días.')
    expect(ask('¿Qué hábitos me quedan?')).toBe('Te quedan 2: Beber agua (llevas 0 de 8 vasos) y Meditar.')
    expect(ask('¿Qué pastillas me tocan hoy?')).toBe('Sin tomar: Ibuprofeno de las 9:00. Te queda: Ibuprofeno de las 21:00.')
  })

  it('la casa compartida, si la hay', () => {
    const house = {
      name: 'Piso',
      me: 'yo',
      items: [
        { id: 'yo', kind: 'member', data: { name: 'Ignacio', order: 0 } },
        { id: 'ana', kind: 'member', data: { name: 'Ana', order: 1 } },
        { id: 'basura', kind: 'chore', data: { title: 'Sacar la basura', every: 2, rotation: ['yo', 'ana'], turn: 0, due: T, at: 0 } },
        { id: 'baño', kind: 'chore', data: { title: 'Limpiar el baño', every: 7, rotation: ['ana', 'yo'], turn: 0, due: T, at: 0 } },
      ],
    } as unknown as NonNullable<NonNullable<Parameters<typeof capture>[3]>['house']>
    expect(ask('¿Qué me toca en casa?', { house })).toBe('En casa te toca: Sacar la basura.')
    expect(ask('¿A quién le toca limpiar el baño?', { house })).toBe('Le toca a Ana.')
    expect(ask('¿Qué me toca en casa?')).toMatch(/^No tienes casa compartida/)
    expect(ask('Buenos días', { house })).toContain('En casa te toca: Sacar la basura.')
  })

  it('tachar de la compra por voz', () => {
    let r = capture(day, 'He comprado leche y pan.', env())
    expect(saved(r).map((w) => [w.id, w.data.checked])).toEqual([['s1', 1], ['s3', 1]])
    expect(r.report[0]).toBe('Tachado de la compra: Leche y Pan.')
    r = capture(day, 'Quita las tiritas de la compra', env())
    expect(saved(r)[0]).toMatchObject({ id: 's2', data: { checked: 1 } })
    expect(capture(day, 'Quita el café de la compra', env()).report[0]).toBe('No veo café en la compra.')
    // Lo que no está en la compra: «he comprado las pilas» completa la tarea
    expect(saved(capture(day, 'He comprado las pilas.', env()))[0]).toMatchObject({ id: 't2', data: { done: 1 } })
  })

  it('«¿qué he apuntado?» y posponer a una hora (el mismo día)', () => {
    const added = capture(day, 'Llamar al fontanero mañana a las 9', env())
    const now = apply(day, added)
    expect(capture(now, '¿Qué he apuntado?', env(NOW + 3 * 60_000)).report[0]).toBe('Hace 3 minutos: Apuntado: Llamar al fontanero, mañana a las 09:00. Te avisaré.')
    const r = capture(day, 'Pospón llamar al dentista a las 19:00', env())
    expect(saved(r)[0]).toMatchObject({ id: 't1', data: { dueDate: T, dueTime: '19:00' } })
    expect(r.report[0]).toBe('Pasada a hoy a las 19:00: Llamar al dentista.')
  })
})
