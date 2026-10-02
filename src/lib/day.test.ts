import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { installReminderHooks, openDatabase } from '@/db/db'
import type { Task } from '@/db/types'
import { addDaysYmd, today } from './dates'
import { doneByDay, goalStreak, isPostpone, isStuck, postponedLabel } from './day'
import * as shared from '../../supabase/functions/_shared/day.ts'

describe('tareas que se arrastran', () => {
  it('posponer es mover hacia delante lo que ya tocaba', () => {
    const t = '2026-10-02'
    expect(isPostpone({ done: 0, dueDate: '2026-10-02' }, '2026-10-03', t)).toBe(true)
    expect(isPostpone({ done: 0, dueDate: '2026-09-28' }, '2026-10-02', t)).toBe(true)
    expect(isPostpone({ done: 0, dueDate: '2026-10-05' }, '2026-10-08', t)).toBe(false)
    expect(isPostpone({ done: 0, dueDate: '2026-10-02' }, '2026-10-01', t)).toBe(false)
    expect(isPostpone({ done: 1, dueDate: '2026-10-02' }, '2026-10-03', t)).toBe(false)
    expect(isPostpone({ done: 0, dueDate: '2026-10-02', recurrence: { freq: 'day', interval: 1 } }, '2026-10-03', t)).toBe(false)
    expect(isPostpone({ done: 0, dueDate: '2026-10-02' }, undefined, t)).toBe(false)
    expect(isStuck({ postponed: 3 })).toBe(true)
    expect(isStuck({})).toBe(false)
    expect(postponedLabel(1)).toBe('Pospuesta 1 vez')
    expect(postponedLabel(4)).toBe('Pospuesta 4 veces')
  })

  it('al pasarla a otro día se cuenta y deja de ser lo importante', async () => {
    const { db } = openDatabase('day-test')
    installReminderHooks(db)
    const t = today()
    const task: Task = { id: 'x', title: 'Llamar al seguro', notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0, dueDate: t, important: t }
    await db.tasks.add(task)
    await db.tasks.update('x', { dueDate: addDaysYmd(t, 1) })
    expect(await db.tasks.get('x')).toMatchObject({ postponed: 1 })
    expect((await db.tasks.get('x'))?.important).toBeUndefined()
    // Mañana aún no toca: moverla otra vez no cuenta
    await db.tasks.update('x', { dueDate: addDaysYmd(t, 3) })
    expect((await db.tasks.get('x'))?.postponed).toBe(1)
    // Traerla a hoy tampoco
    await db.tasks.update('x', { dueDate: t })
    await db.tasks.update('x', { dueDate: addDaysYmd(t, 1) })
    expect((await db.tasks.get('x'))?.postponed).toBe(2)
  })
})

describe('objetivo diario y racha (como Todoist)', () => {
  const at = (d: string, n: number) => Array.from({ length: n }, () => new Date(`${d}T10:00:00`).getTime())
  it('cuenta lo hecho por día', () => {
    expect(doneByDay([...at('2026-10-01', 2), ...at('2026-10-02', 1)])).toEqual(
      new Map([
        ['2026-10-01', 2],
        ['2026-10-02', 1],
      ]),
    )
  })
  it('racha hasta ayer si hoy aún no se ha cumplido; los días libres no la rompen', () => {
    // Jueves 1 de octubre de 2026; el sábado 26 y el domingo 27 de septiembre, libres
    const byDay = doneByDay([...at('2026-09-23', 3), ...at('2026-09-24', 3), ...at('2026-09-25', 3), ...at('2026-09-28', 4), ...at('2026-09-29', 3), ...at('2026-09-30', 5), ...at('2026-10-01', 1)])
    expect(goalStreak(byDay, { tasks: 3, daysOff: [0, 6] }, '2026-10-01')).toEqual({ current: 6, best: 6, today: 1, dayOff: false })
    // Sin días libres, el fin de semana la rompe
    expect(goalStreak(byDay, { tasks: 3 }, '2026-10-01')).toMatchObject({ current: 3, best: 3 })
    // Cumplido hoy: cuenta hoy
    expect(goalStreak(doneByDay([...at('2026-09-30', 3), ...at('2026-10-01', 3)]), { tasks: 3 }, '2026-10-01')).toMatchObject({ current: 2, today: 3 })
    expect(goalStreak(new Map(), { tasks: 3 }, '2026-10-01')).toMatchObject({ current: 0, best: 0 })
  })
})

describe('la app y el conector cuentan igual', () => {
  it('posponer, racha y etiquetas', () => {
    const cases: [Parameters<typeof isPostpone>[0], string | undefined][] = [
      [{ done: 0, dueDate: '2026-10-02' }, '2026-10-03'],
      [{ done: 0, dueDate: '2026-10-05' }, '2026-10-06'],
      [{ done: 1, dueDate: '2026-10-01' }, '2026-10-03'],
      [{ done: 0, dueDate: '2026-10-01', recurrence: { freq: 'day', interval: 1 } }, '2026-10-03'],
    ]
    for (const [t, next] of cases) expect(isPostpone(t, next, '2026-10-02')).toBe(shared.isPostpone(t, next, '2026-10-02'))
    const days = ['2026-09-20', '2026-09-21', '2026-09-21', '2026-09-22', '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']
    const byDay = shared.countByDay(days)
    for (const goal of [{ tasks: 1 }, { tasks: 1, daysOff: [0, 6] }, { tasks: 2, daysOff: [0] }])
      for (const day of ['2026-10-01', '2026-10-02', '2026-09-27']) expect(goalStreak(byDay, goal, day)).toEqual(shared.goalStreak(byDay, goal, day))
    expect(postponedLabel(5)).toBe(shared.postponedLabel(5))
    expect(isStuck({ postponed: 3 })).toBe(shared.isStuck({ postponed: 3 }))
  })
})
