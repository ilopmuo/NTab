import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from './parse'
import { nextOccurrence, recurrenceLabel } from './recurrence'

// Miércoles, 23 de septiembre de 2026
const now = new Date(2026, 8, 23, 9, 0)
const ctx = {
  now,
  areas: [
    { id: 'a-trabajo', name: 'Trabajo' },
    { id: 'a-salud', name: 'Salud' },
  ],
  projects: [
    { id: 'p-web', name: 'Web nueva', areaId: 'a-trabajo' },
    { id: 'p-mudanza', name: 'Mudanza' },
  ],
}
const p = (s: string) => parseQuickAdd(s, ctx)

describe('parseQuickAdd', () => {
  it('deja el texto tal cual si no hay nada que entender', () => {
    expect(p('Comprar leche')).toEqual({ title: 'Comprar leche', priority: 0, tags: [] })
  })

  it('entiende hoy, mañana y pasado mañana', () => {
    expect(p('Llamar a Juan hoy').dueDate).toBe('2026-09-23')
    expect(p('Llamar a Juan mañana')).toMatchObject({ title: 'Llamar a Juan', dueDate: '2026-09-24' })
    expect(p('Llamar a Juan pasado mañana').dueDate).toBe('2026-09-25')
    expect(p('Llamar a Juan pasado manana').dueDate).toBe('2026-09-25')
  })

  it('entiende días de la semana', () => {
    expect(p('Reunión el viernes')).toMatchObject({ title: 'Reunión', dueDate: '2026-09-25' })
    expect(p('Reunión lunes').dueDate).toBe('2026-09-28')
    expect(p('Reunión el miércoles').dueDate).toBe('2026-09-30')
    expect(p('Reunión este miércoles').dueDate).toBe('2026-09-23')
    expect(p('Reunión el próximo sábado').dueDate).toBe('2026-09-26')
  })

  it('entiende fechas concretas', () => {
    expect(p('Dentista el 15 de octubre').dueDate).toBe('2026-10-15')
    expect(p('Dentista 15/10').dueDate).toBe('2026-10-15')
    expect(p('Dentista el 2 de marzo').dueDate).toBe('2027-03-02')
    expect(p('Pagar el 30')).toMatchObject({ title: 'Pagar', dueDate: '2026-09-30' })
    expect(p('Pagar el 5').dueDate).toBe('2026-10-05')
  })

  it('entiende fechas relativas', () => {
    expect(p('Revisar en 3 días').dueDate).toBe('2026-09-26')
    expect(p('Revisar en dos semanas').dueDate).toBe('2026-10-07')
    expect(p('Revisar en un mes').dueDate).toBe('2026-10-23')
    expect(p('Planificar la semana que viene').dueDate).toBe('2026-09-28')
    expect(p('Salir el fin de semana').dueDate).toBe('2026-09-26')
  })

  it('entiende horas', () => {
    expect(p('Llamar mañana a las 10')).toMatchObject({ title: 'Llamar', dueDate: '2026-09-24', dueTime: '10:00' })
    expect(p('Llamar a las 17:30').dueTime).toBe('17:30')
    expect(p('Llamar 9am').dueTime).toBe('09:00')
    expect(p('Llamar 5pm').dueTime).toBe('17:00')
    expect(p('Cena a las 9 de la noche').dueTime).toBe('21:00')
    expect(p('Correr mañana a las 7 de la mañana')).toMatchObject({ dueDate: '2026-09-24', dueTime: '07:00' })
    expect(p('Comer al mediodía').dueTime).toBe('12:00')
  })

  it('una hora sin fecha implica hoy', () => {
    expect(p('Llamar a las 18').dueDate).toBe('2026-09-23')
  })

  it('no confunde números sueltos con horas', () => {
    const r = p('Comprar 3 manzanas a las 10')
    expect(r.title).toBe('Comprar 3 manzanas')
    expect(r.dueTime).toBe('10:00')
  })

  it('no toma "por la mañana" como mañana', () => {
    expect(p('Llamar por la mañana').dueDate).toBeUndefined()
  })

  it('entiende prioridad', () => {
    expect(p('Pagar !alta').priority).toBe(3)
    expect(p('Pagar !!').priority).toBe(2)
    expect(p('Pagar !3').priority).toBe(1)
    expect(p('Pagar !1')).toMatchObject({ title: 'Pagar', priority: 3 })
  })

  it('entiende etiquetas', () => {
    expect(p('Comprar pienso #casa #Recados')).toMatchObject({ title: 'Comprar pienso', tags: ['casa', 'recados'] })
  })

  it('asigna proyecto o área', () => {
    expect(p('Diseñar home +web')).toMatchObject({ title: 'Diseñar home', projectId: 'p-web', areaId: 'a-trabajo' })
    expect(p('Pedir cajas +mudanza').projectId).toBe('p-mudanza')
    expect(p('Analítica +salud')).toMatchObject({ title: 'Analítica', areaId: 'a-salud' })
    expect(p('Analítica +salud').projectId).toBeUndefined()
    expect(p('Sumar 2 +desconocido').title).toBe('Sumar 2 +desconocido')
  })

  it('entiende repeticiones', () => {
    expect(p('Regar plantas cada semana')).toMatchObject({
      title: 'Regar plantas',
      recurrence: { freq: 'week', interval: 1 },
      dueDate: '2026-09-23',
    })
    expect(p('Gimnasio cada lunes y jueves')).toMatchObject({
      title: 'Gimnasio',
      recurrence: { freq: 'week', weekdays: [1, 4] },
      dueDate: '2026-09-24',
    })
    expect(p('Vitaminas diario').recurrence).toEqual({ freq: 'day', interval: 1 })
    expect(p('Backup cada 2 semanas').recurrence).toEqual({ freq: 'week', interval: 2 })
    expect(p('Revisar correo días laborables').recurrence?.weekdays).toEqual([1, 2, 3, 4, 5])
    expect(p('Pagar alquiler el 1 de cada mes')).toMatchObject({
      title: 'Pagar alquiler',
      dueDate: '2026-10-01',
      recurrence: { freq: 'month', interval: 1 },
    })
  })

  it('entiende avisos', () => {
    expect(p('Recuérdame llamar al banco mañana a las 10')).toMatchObject({ title: 'Llamar al banco', dueTime: '10:00', reminder: { before: 0 } })
    expect(p('Dentista el viernes a las 17 avísame 30 minutos antes').reminder).toEqual({ before: 30 })
    expect(p('Pagar seguro el 5 con aviso 1 día antes').reminder).toEqual({ before: 1440 })
    expect(p('Llamar a Juan avísame 2 horas antes').reminder).toEqual({ before: 120 })
    expect(p('Comprar pan').reminder).toBeUndefined()
  })

  it('combina todo', () => {
    expect(p('Llamar al dentista mañana a las 10 !alta #salud +Salud')).toEqual({
      title: 'Llamar al dentista',
      dueDate: '2026-09-24',
      dueTime: '10:00',
      priority: 3,
      tags: ['salud'],
      areaId: 'a-salud',
    })
  })
})

describe('recurrence', () => {
  it('calcula la siguiente fecha', () => {
    expect(nextOccurrence('2026-09-23', { freq: 'day', interval: 1 })).toBe('2026-09-24')
    expect(nextOccurrence('2026-09-23', { freq: 'week', interval: 1 })).toBe('2026-09-30')
    expect(nextOccurrence('2026-01-31', { freq: 'month', interval: 1 })).toBe('2026-02-28')
    expect(nextOccurrence('2026-09-24', { freq: 'week', interval: 1, weekdays: [1, 4] })).toBe('2026-09-28')
    expect(nextOccurrence('2026-09-28', { freq: 'week', interval: 1, weekdays: [1, 4] })).toBe('2026-10-01')
    expect(nextOccurrence('2026-09-24', { freq: 'week', interval: 2, weekdays: [1, 4] })).toBe('2026-10-05')
  })

  it('describe la regla en español', () => {
    expect(recurrenceLabel({ freq: 'day', interval: 1 })).toBe('Cada día')
    expect(recurrenceLabel({ freq: 'month', interval: 3 })).toBe('Cada 3 meses')
    expect(recurrenceLabel({ freq: 'week', interval: 1, weekdays: [4, 1] })).toBe('Cada lunes y jueves')
    expect(recurrenceLabel({ freq: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5] })).toBe('Días laborables')
  })
})

import { completionRate, streak } from './habits'
import type { Habit } from '@/db/types'

describe('habits', () => {
  const h: Habit = { id: 'h', name: 'x', icon: 'x', color: '', days: [1, 2, 3, 4, 5], archived: 0, order: 0, createdAt: 0 }
  it('cuenta la racha saltando días no programados', () => {
    // Lunes 21, martes 22, viernes 18 (fin de semana no cuenta), hoy miércoles 23 sin hacer
    const done = new Set(['2026-09-18', '2026-09-21', '2026-09-22'])
    expect(streak(h, done, '2026-09-23')).toBe(3)
    done.add('2026-09-23')
    expect(streak(h, done, '2026-09-23')).toBe(4)
  })
  it('se rompe si falta un día programado', () => {
    expect(streak(h, new Set(['2026-09-21', '2026-09-23']), '2026-09-23')).toBe(1)
  })
  it('el porcentaje solo cuenta desde que empezó el hábito', () => {
    const recent = { ...h, createdAt: new Date(2026, 8, 21).getTime() }
    expect(completionRate(recent, new Set(['2026-09-21', '2026-09-23']), '2026-09-23', 30)).toBeCloseTo(2 / 3)
  })
})

describe('personas con @', () => {
  const withPeople = { ...ctx, people: [{ id: 'ana', name: 'Ana García' }, { id: 'luis', name: 'Luis' }] }
  it('enlaza a la persona y deja su nombre en el título', () => {
    const r = parseQuickAdd('llamar a @ana mañana a las 10', withPeople)
    expect(r.title).toBe('Llamar a Ana')
    expect(r.people).toEqual(['ana'])
    expect(r.dueTime).toBe('10:00')
  })
  it('varias personas y nombres desconocidos', () => {
    const r = parseQuickAdd('Cena con @Luis y @ana y @pepe', withPeople)
    expect(r.people).toEqual(['luis', 'ana'])
    expect(r.title).toBe('Cena con Luis y Ana y pepe')
  })
  it('sin personas en el contexto, solo quita la @', () => {
    const r = parseQuickAdd('Escribir a @marta', ctx)
    expect(r.title).toBe('Escribir a marta')
    expect(r.people).toBeUndefined()
  })
})

describe('repetir desde que se completa', () => {
  it('lo entiende y lo explica', () => {
    const r = parseQuickAdd('regar las plantas cada 3 días desde que la haga', ctx)
    expect(r.title).toBe('Regar las plantas')
    expect(r.recurrence).toEqual({ freq: 'day', interval: 3, afterDone: true })
    expect(recurrenceLabel(r.recurrence!)).toBe('Cada 3 días, desde que la completas')
  })
  it('sin repetición, la frase no se toca', () => {
    expect(parseQuickAdd('llamar desde que la haga', ctx).recurrence).toBeUndefined()
  })
})

describe('duración estimada', () => {
  it('~30m, ~2h, ~1h30, ~1,5h, ~45', () => {
    expect(p('escribir el informe ~30m').estimate).toBe(30)
    expect(p('escribir el informe ~2h').estimate).toBe(120)
    expect(p('escribir el informe ~1h30').estimate).toBe(90)
    expect(p('escribir el informe ~1,5h').estimate).toBe(90)
    expect(p('escribir el informe ~45 min').estimate).toBe(45)
    expect(p('escribir el informe ~45').estimate).toBe(45)
  })
  it('no se confunde con la hora ni queda en el título', () => {
    const r = p('Revisar contrato mañana a las 10 ~2h !alta')
    expect(r.title).toBe('Revisar contrato')
    expect(r.estimate).toBe(120)
    expect(r.dueTime).toBe('10:00')
    expect(r.dueDate).toBe('2026-09-24')
  })
  it('sin ~ no hay duración', () => {
    expect(p('leer 30 páginas').estimate).toBeUndefined()
  })
})

describe('insistir', () => {
  it('insísteme y hasta que lo haga', () => {
    const a = p('tomar la pastilla a las 22 insísteme')
    expect(a.title).toBe('Tomar la pastilla')
    expect(a.nag).toBe(10)
    expect(a.reminder).toEqual({ before: 0 })
    expect(a.dueTime).toBe('22:00')
    const b = p('sacar la basura hoy a las 21 hasta que lo haga')
    expect(b.title).toBe('Sacar la basura')
    expect(b.nag).toBe(10)
    expect(p('regar insiste cada 5 minutos').nag).toBe(5)
  })
  it('respeta el aviso que ya había', () => {
    expect(p('llamar mañana a las 10 avísame 15 minutos antes insísteme').reminder).toEqual({ before: 15 })
  })
})
