import { describe, expect, it } from 'vitest'
import { englishDate, fromRrule, parseCsv, readImport } from './importers'

const T = '2026-10-03' // sábado

describe('traer de otras apps', () => {
  it('CSV con comillas, comillas dobladas, saltos de línea y punto y coma', () => {
    expect(parseCsv('﻿a,b,c\n"x, y","di ""hola""","dos\nlíneas"\r\n\n')).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'di "hola"', 'dos\nlíneas'],
    ])
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('fechas de Todoist en inglés, como se escriben en LUNO', () => {
    expect(englishDate('tomorrow at 10am')).toBe('mañana a las 10am')
    expect(englishDate('every monday')).toBe('cada lunes')
    expect(englishDate('Oct 15 2026')).toBe('15 de octubre de 2026')
    expect(englishDate('15 Oct')).toBe('15 de octubre')
  })

  it('Todoist: secciones, subtareas, comentarios, etiquetas, prioridad y fechas', () => {
    const csv = [
      'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE,DURATION,DURATION_UNIT,DEADLINE,DEADLINE_LANG',
      'section,Diseño:,,,,,,,,,,,,',
      'task,Hacer el logo @trabajo,Con colores,1,1,Ana (1),,tomorrow at 10am,en,Europe/Madrid,,,,',
      'task,Boceto,,4,2,Ana (1),,,,,,,,',
      'note,Mira las referencias,,,,,,,,,,,,',
      ',,,,,,,,,,,,,',
      'task,Revisar [el informe](https://docs.google.com/x),,2,1,,,every monday,en,,,,,',
      'task,Llamar al gestor,,4,1,,,15 oct,es,,,,,',
      'task,Pagar,,3,1,,,whenever i want,en,,,,,',
    ].join('\n')
    const r = readImport(csv, 'Web nueva.csv', T, 'Europe/Madrid')
    expect(r.source).toBe('Todoist')
    expect(r.projects).toEqual([{ name: 'Web nueva', sections: ['Diseño'] }])
    expect(r.tasks[0]).toMatchObject({ title: 'Hacer el logo', tags: ['trabajo'], priority: 3, dueDate: '2026-10-04', dueTime: '10:00', section: 'Diseño', project: 'Web nueva', notes: 'Con colores\nMira las referencias', subtasks: [{ title: 'Boceto', done: false }] })
    expect(r.tasks[1]).toMatchObject({ title: 'Revisar el informe', notes: 'https://docs.google.com/x', priority: 2, recurrence: { freq: 'week', interval: 1, weekdays: [1] }, dueDate: '2026-10-05' })
    expect(r.tasks[2]).toMatchObject({ title: 'Llamar al gestor', dueDate: '2026-10-15', priority: 0 })
    expect(r.tasks[3]).toMatchObject({ title: 'Pagar', priority: 1, notes: 'Fecha en Todoist: whenever i want' })
    expect(r.tasks[3].dueDate).toBeUndefined()
  })

  it('TickTick: listas, columnas, checklist, fechas en su zona, repetición, prioridad, subtareas y hechas', () => {
    const csv = [
      '"Date: 2026-10-03+0000"',
      '"Version: 7.1"',
      '"Status: \n0 Normal\n1 Completed\n2 Archived"',
      '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"',
      '"","Inbox","Comprar sellos","TEXT","","","N","","2026-10-05T22:00:00+0000","","","0","0","","","1","Europe/Madrid","true","false","","","list","t1",""',
      '"Casa","Mudanza","Empaquetar libros","CHECKLIST","casa, urgente","Cajas grandes\n▫Salón\n▪Dormitorio","Y","","2026-10-10T08:30:00+0000","","RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=SA","5","0","","","2","Europe/Madrid","false","false","Por hacer","","kanban","t2",""',
      '"Casa","Mudanza","Contratar camión","TEXT","","","N","","","","","3","2","","","3","Europe/Madrid","","","","","list","t3",""',
      '"","Mudanza","Pedir presupuesto","TEXT","","","N","","","","","0","0","","","4","","","","","","list","t4","t3"',
      '"","Inbox","Idea suelta","NOTE","","Texto","N","","","","","0","0","","","5","","","","","","list","t5",""',
    ].join('\n')
    const r = readImport(csv, 'TickTick-backup.csv', T, 'Europe/Madrid')
    expect(r.source).toBe('TickTick')
    expect(r.skipped).toBe(1)
    expect(r.projects).toEqual([{ name: 'Mudanza', sections: ['Por hacer'] }])
    expect(r.tasks[0]).toMatchObject({ title: 'Comprar sellos', dueDate: '2026-10-06', project: undefined, done: false })
    expect(r.tasks[0].dueTime).toBeUndefined()
    expect(r.tasks[1]).toMatchObject({
      title: 'Empaquetar libros',
      notes: 'Cajas grandes',
      dueDate: '2026-10-10',
      dueTime: '10:30',
      priority: 3,
      tags: ['casa', 'urgente'],
      section: 'Por hacer',
      recurrence: { freq: 'week', interval: 1, weekdays: [6] },
      subtasks: [
        { title: 'Salón', done: false },
        { title: 'Dormitorio', done: true },
      ],
    })
    expect(r.tasks[2]).toMatchObject({ title: 'Contratar camión', done: true, priority: 2, subtasks: [{ title: 'Pedir presupuesto', done: false }] })
  })

  it('Google Tasks (Takeout): la primera lista a la Bandeja, las demás como proyectos', () => {
    const json = JSON.stringify({
      kind: 'tasks#taskLists',
      items: [
        { kind: 'tasks#taskList', title: 'Mis tareas', items: [{ kind: 'tasks#task', id: 'a', title: 'Renovar el DNI', due: '2026-10-20T00:00:00.000Z', status: 'needsAction' }, { kind: 'tasks#task', id: 'b', title: 'Pedir cita', parent: 'a', status: 'completed' }] },
        { kind: 'tasks#taskList', title: 'Viaje', items: [{ kind: 'tasks#task', id: 'c', title: 'Reservar hotel', notes: 'En el centro', status: 'completed' }, { kind: 'tasks#task', id: 'd', title: '', status: 'needsAction' }] },
      ],
    })
    const r = readImport(json, 'Tasks.json', T, 'Europe/Madrid')
    expect(r.source).toBe('Google Tasks')
    expect(r.projects).toEqual([{ name: 'Viaje', sections: [] }])
    expect(r.tasks).toMatchObject([
      { title: 'Renovar el DNI', dueDate: '2026-10-20', project: undefined, subtasks: [{ title: 'Pedir cita', done: true }] },
      { title: 'Reservar hotel', notes: 'En el centro', project: 'Viaje', done: true },
    ])
  })

  it('una lista pegada: una tarea por línea, entendida como en la captura; lo sangrado, subtareas', () => {
    const r = readImport('- [ ] Llamar al dentista mañana a las 10 !alta\n  - Buscar el teléfono\n- [x] Comprar pan\n- Leer https://ejemplo.com/a', '', T, 'Europe/Madrid')
    expect(r.source).toBe('Lista')
    expect(r.tasks).toMatchObject([
      { title: 'Llamar al dentista', dueDate: '2026-10-04', dueTime: '10:00', priority: 3, subtasks: [{ title: 'Buscar el teléfono', done: false }], done: false },
      { title: 'Comprar pan', done: true },
      { title: 'Leer', notes: 'https://ejemplo.com/a' },
    ])
  })

  it('repeticiones de iCalendar', () => {
    expect(fromRrule('FREQ=DAILY;INTERVAL=3')).toEqual({ freq: 'day', interval: 3 })
    expect(fromRrule('RRULE:FREQ=MONTHLY')).toEqual({ freq: 'month', interval: 1 })
    expect(fromRrule('FREQ=HOURLY')).toBeUndefined()
  })
})
