import { describe, expect, it } from 'vitest'
import { hhmm, minutesLabel, nowNext } from './nowNext'

const at = (h: number, m = 0) => new Date(2026, 9, 2, h, m)
const iso = (h: number, m = 0) => at(h, m).toISOString()

describe('nowNext', () => {
  it('sin nada con hora, no hay nada', () => {
    expect(nowNext([{ id: 'a', title: 'Sin hora' }], [], at(10))).toBeNull()
  })

  it('la tarea con hora en curso (media hora si no tiene duración)', () => {
    const r = nowNext([{ id: 'a', title: 'Llamar', dueTime: '10:00' }], [], at(10, 20))
    expect(r).toMatchObject({ kind: 'now', id: 'a', start: 600, end: 630 })
    expect(nowNext([{ id: 'a', title: 'Llamar', dueTime: '10:00' }], [], at(10, 30))).toBeNull()
  })

  it('usa la duración estimada y salta las hechas', () => {
    const tasks = [
      { id: 'a', title: 'Hecha', dueTime: '09:00', estimate: 120, done: true },
      { id: 'b', title: 'Informe', dueTime: '09:30', estimate: 90 },
    ]
    expect(nowNext(tasks, [], at(10, 45))).toMatchObject({ kind: 'now', id: 'b', end: 660 })
  })

  it('si no hay nada en curso, lo siguiente', () => {
    const r = nowNext([{ id: 'a', title: 'Gimnasio', dueTime: '19:00' }], [{ id: 'e', title: 'Comida', start: iso(14), end: iso(15) }], at(12))
    expect(r).toMatchObject({ kind: 'next', source: 'event', title: 'Comida', start: 840 })
  })

  it('con dos a la vez, el que empezó más tarde', () => {
    const r = nowNext([{ id: 'a', title: 'Tarea', dueTime: '10:15' }], [{ id: 'e', title: 'Reunión', start: iso(10), end: iso(11) }], at(10, 20))
    expect(r).toMatchObject({ kind: 'now', id: 'a' })
  })

  it('ignora los eventos de todo el día y los de otros días', () => {
    const events = [
      { id: 'x', title: 'Vacaciones', start: '2026-10-02', end: '2026-10-03', allDay: true },
      { id: 'y', title: 'Mañana', start: new Date(2026, 9, 3, 10).toISOString(), end: new Date(2026, 9, 3, 11).toISOString() },
    ]
    expect(nowNext([], events, at(9))).toBeNull()
  })

  it('textos', () => {
    expect(minutesLabel(12)).toBe('12 min')
    expect(minutesLabel(60)).toBe('1 h')
    expect(minutesLabel(65)).toBe('1 h 5 min')
    expect(hhmm(605)).toBe('10:05')
  })
})
