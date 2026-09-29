import { describe, expect, it } from 'vitest'
import { capture, type Env, type Row } from '../../supabase/functions/mcp/ntab'
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

  it('texto vacío', () => {
    expect(capture(rows, '   ', env())).toEqual({ writes: [], report: ['No he oído nada que apuntar.'] })
  })
})
