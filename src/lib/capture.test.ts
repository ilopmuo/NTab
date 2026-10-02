import { describe, expect, it } from 'vitest'
import { capture, captureFields, readAmount, type Env, type Row } from '../../supabase/functions/mcp/ntab'
import { zonedToUtc } from '../../supabase/functions/_shared/time'

// Jueves 24 de septiembre de 2026, 00:30 en Madrid (aún miércoles 23 en UTC)
const NOW = Date.parse('2026-09-23T22:30:00Z')
let n = 0
const env = (): Env => ({ tz: 'Europe/Madrid', now: NOW, autoRemind: true, newId: () => `new-${++n}` })
const rows: Row[] = [
  { tbl: 'areas', id: 'a1', data: { id: 'a1', name: 'Salud' } },
  { tbl: 'projects', id: 'p1', data: { id: 'p1', name: 'Mudanza', status: 'active' } },
  { tbl: 'people', id: 'x1', data: { id: 'x1', name: 'Ana López' } },
  { tbl: 'shopping', id: 's1', data: { id: 's1', name: 'Leche', checked: 0 } },
  { tbl: 'habits', id: 'h1', data: { id: 'h1', name: 'Beber agua', days: [0, 1, 2, 3, 4, 5, 6], target: 8, unit: 'vasos', archived: 0 } },
  { tbl: 'habits', id: 'h2', data: { id: 'h2', name: 'Meditar', days: [0, 1, 2, 3, 4, 5, 6], archived: 0 } },
  { tbl: 'habitLogs', id: 'l1', data: { id: 'l1', habitId: 'h1', date: '2026-09-24', count: 2 } },
  { tbl: 'trackers', id: 't1', data: { id: 't1', name: 'Cambiar las sábanas', log: ['2026-09-10'], every: 14, archived: 0 } },
]

describe('captura con Siri', () => {
  it('entiende la tarea como la captura rápida, con «hoy» en la zona del usuario', () => {
    const r = capture(rows, 'Llamar al dentista mañana a las 10 !alta #salud +Salud', env())
    const t = r.writes[0].data
    expect(r.writes[0].tbl).toBe('tasks')
    expect(t).toMatchObject({ title: 'Llamar al dentista', dueDate: '2026-09-25', dueTime: '10:00', priority: 3, tags: ['salud'], areaId: 'a1', done: 0 })
    // Aviso automático a la hora, en hora de Madrid
    expect(t.remindAt).toBe(zonedToUtc('2026-09-25', '10:00', 'Europe/Madrid'))
    expect(r.report[0]).toBe('Apuntado: Llamar al dentista, mañana a las 10:00 (en Salud). Te avisaré.')
  })

  it('sin fecha va a la bandeja', () => {
    const r = capture(rows, '  comprar un regalo para @ana  ', env())
    expect(r.writes[0].data).toMatchObject({ title: 'Comprar un regalo para Ana', people: ['x1'] })
    expect(r.writes[0].data.dueDate).toBeUndefined()
    expect(r.report[0]).toBe('Apuntado: Comprar un regalo para Ana (en la bandeja).')
  })

  it('proyectos, repeticiones e insistir', () => {
    const r = capture(rows, 'Empaquetar libros +mudanza cada sábado a las 11 insísteme', env())
    expect(r.writes[0].data).toMatchObject({ projectId: 'p1', dueDate: '2026-09-26', dueTime: '11:00', nag: 10, recurrence: { freq: 'week', weekdays: [6] } })
  })

  it('«compra:» va a la lista de la compra', () => {
    const r = capture(rows, 'Compra: leche, 2 barras de pan y detergente', env())
    expect(r.writes.map((w) => w.data.name)).toEqual(['Pan', 'Detergente'])
    expect(r.report.join(' ')).toBe('Añadido a la compra: Pan (2 barras), Detergente. Ya estaba: Leche.')
    expect(capture(rows, 'a la compra huevos', env()).writes[0].data.name).toBe('Huevos')
    expect(capture(rows, 'Añade a la lista de la compra: café', env()).writes[0].data.name).toBe('Café')
    expect(capture(rows, 'lista de la compra tomates', env()).writes[0].data.name).toBe('Tomates')
    expect(capture(rows, 'Comprar un regalo', env()).writes[0].tbl).toBe('tasks')
  })

  it('«gasto» va a gastos', () => {
    const r = capture(rows, 'gasto 12,50 café', env())
    expect(r.writes[0]).toMatchObject({ tbl: 'expenses', data: { amount: 12.5, date: '2026-09-24' } })
    expect(r.report[0]).not.toContain('Este mes')
  })

  it('gastos dichos con naturalidad, también con el importe en palabras', () => {
    const nb = (s: string) => s.replace(/\u00a0/g, ' ')
    let r = capture(rows, 'Mete un gasto de quince euros en Mercadona', env())
    expect(r.writes[0]).toMatchObject({ tbl: 'expenses', data: { amount: 15, note: 'Mercadona', category: 'super' } })
    expect(nb(r.report[0])).toBe('Apuntado: 15 € · Mercadona (Supermercado, hoy).')
    expect(capture(rows, 'apunta un gasto de 8,50 en la farmacia', env()).writes[0].data).toMatchObject({ amount: 8.5, note: 'Farmacia', category: 'salud' })
    expect(capture(rows, 'me he gastado veinte euros con cincuenta en la cena', env()).writes[0].data).toMatchObject({ amount: 20.5, note: 'Cena', category: 'comer' })
    expect(capture(rows, 'he pagado 30 de luz', env()).writes[0].data).toMatchObject({ amount: 30, note: 'Luz', category: 'casa' })
    // Sin importe: «he pagado la luz» es una tarea; «gasto en el súper», una pregunta
    expect(capture(rows, 'he pagado la luz', env()).writes[0].tbl).toBe('tasks')
    r = capture(rows, 'gasto en el súper', env())
    expect(r.writes).toEqual([])
    expect(r.report[0]).toContain('¿Cuánto has gastado?')
    // El atajo de gastos solo manda lo dictado
    expect(capture(rows, { gasto: 'doce con cincuenta en el bar' }, env()).writes[0].data).toMatchObject({ amount: 12.5, note: 'Bar', category: 'comer' })
  })

  it('pagos con Apple Pay desde la automatización «Transacción»', () => {
    const nb = (s: string) => s.replace(/\u00a0/g, ' ')
    const r = capture(rows, captureFields({ importe: '15,30 €', comercio: 'MERCADONA S.A.' }), env())
    expect(r.writes[0]).toMatchObject({ tbl: 'expenses', data: { amount: 15.3, note: 'Mercadona S.A.', category: 'super', date: '2026-09-24' } })
    expect(nb(r.report[0])).toBe('Apuntado: 15,30 € · Mercadona S.A. (Supermercado, hoy).')
    expect(capture(rows, captureFields({ amount: 4.5, merchant: 'Starbucks' }), env()).writes[0].data).toMatchObject({ amount: 4.5, note: 'Starbucks' })
    expect(capture(rows, captureFields({ importe: '-4,99 €', comercio: 'Amazon' }), env())).toEqual({ writes: [], report: ['Es una devolución: no la apunto como gasto.'] })
    // Lanzada a mano: los campos llegan vacíos, y lo dice claro
    expect(capture(rows, captureFields({ importe: '', comercio: '' }), env()).report[0]).toContain('La automatización llega bien a LUNO, pero sin ningún pago')
    expect(capture(rows, captureFields({ importe: { tipo: 'transacción' }, comercio: 'Amazon' }), env()).report[0]).toContain('Ha llegado el comercio (Amazon) pero no el importe')
    expect(capture(rows, captureFields({ texto: 'llamar a mamá' }), env()).writes[0].tbl).toBe('tasks')
    expect(capture(rows, captureFields({ importe: 'gratis' }), env()).report[0]).toBe('No me ha llegado el importe del pago.')
  })

  it('«a la nota X: …» añade a esa nota', () => {
    const withNote: Row[] = [...rows, { tbl: 'notes', id: 'n1', data: { id: 'n1', title: 'Maleta', content: '- [ ] DNI', pinned: 0, createdAt: 0, updatedAt: 0 } }]
    let r = capture(withNote, 'a la nota maleta: crema solar', env())
    expect(r.writes[0]).toMatchObject({ tbl: 'notes', id: 'n1', data: { content: '- [ ] DNI\n- [ ] crema solar' } })
    expect(r.report[0]).toBe('Añadido a «Maleta»: 1 cosa en la lista.')
    r = capture(withNote, 'Añade a la nota de ideas, una bici plegable', env())
    expect(r.writes[0].data).toMatchObject({ title: 'Ideas', content: 'una bici plegable' })
  })

  it('importes de cualquier formato', () => {
    expect(readAmount('15,30 €')).toBe(15.3)
    expect(readAmount('€15.30')).toBe(15.3)
    expect(readAmount('1.234,56 EUR')).toBe(1234.56)
    expect(readAmount('$1,234.56')).toBe(1234.56)
    expect(readAmount('1.234 €')).toBe(1234)
    expect(readAmount('−4,99 €')).toBe(-4.99)
    expect(readAmount('-€4.99')).toBe(-4.99)
    expect(readAmount(12)).toBe(12)
    expect(readAmount('nada')).toBeUndefined()
  })

  it('«dentro de 2 horas» cuenta desde la hora del usuario', () => {
    // 00:30 en Madrid
    expect(capture(rows, 'Sacar al perro dentro de 2 horas', env()).writes[0].data).toMatchObject({ title: 'Sacar al perro', dueDate: '2026-09-24', dueTime: '02:30' })
  })

  it('«nota:» guarda una nota', () => {
    const r = capture(rows, 'Nota: el código del portal es 4512. Cambia en octubre.', env())
    expect(r.writes[0]).toMatchObject({ tbl: 'notes', data: { title: 'El código del portal es 4512', content: 'el código del portal es 4512. Cambia en octubre.' } })
    expect(r.report[0]).toBe('Nota guardada: «El código del portal es 4512».')
  })

  it('«hecho:» apunta la última vez', () => {
    const r = capture(rows, 'hecho: cambiar las sábanas', env())
    expect(r.writes[0]).toMatchObject({ tbl: 'trackers', id: 't1' })
    expect((r.writes[0].data.log as string[])[0]).toBe('2026-09-24')
    expect(r.report[0]).toMatch(/^Apuntado: Cambiar las sábanas/)
  })

  it('hábitos: «+2 agua», «hábito: meditar» o solo su nombre', () => {
    const two = capture(rows, '+2 agua', env())
    expect(two.writes[0]).toMatchObject({ tbl: 'habitLogs', id: 'l1', data: { count: 4 } })
    expect(two.report[0]).toBe('«Beber agua» hoy: 4/8 vasos.')
    expect(capture(rows, 'hábito: meditar', env()).writes[0]).toMatchObject({ tbl: 'habitLogs', data: { habitId: 'h2', date: '2026-09-24' } })
    expect(capture(rows, 'Meditar', env()).writes[0].tbl).toBe('habitLogs')
    // Un texto que solo contiene el nombre no es el hábito
    expect(capture(rows, 'Meditar con Ana el viernes', env()).writes[0].tbl).toBe('tasks')
    expect(capture(rows, '+1 yoga', env()).report[0]).toMatch(/No hay ningún hábito/)
  })

  it('texto vacío', () => {
    expect(capture(rows, '   ', env())).toEqual({ writes: [], report: ['No he oído nada que apuntar.'] })
  })
})
