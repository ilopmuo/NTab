import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from './db'
import { createTask, skipOccurrence, toggleTask } from './actions'
import { addDaysYmd, today } from '@/lib/dates'

describe('tareas que se repiten', () => {
  it('desde que la completo: la siguiente cuenta desde hoy', async () => {
    const t = today()
    const task = await createTask({ title: 'Regar', dueDate: addDaysYmd(t, -5), recurrence: { freq: 'day', interval: 3, afterDone: true } })
    const next = await toggleTask(task)
    expect(next?.dueDate).toBe(addDaysYmd(t, 3))
  })
  it('normal: la siguiente cuenta desde la fecha prevista', async () => {
    const t = today()
    const task = await createTask({ title: 'Pagar', dueDate: addDaysYmd(t, -1), recurrence: { freq: 'day', interval: 3 } })
    const next = await toggleTask(task)
    expect(next?.dueDate).toBe(addDaysYmd(t, 2))
  })
  it('saltar esta vez: pasa a la siguiente sin completarla', async () => {
    const t = today()
    const task = await createTask({ title: 'Gimnasio', dueDate: t, recurrence: { freq: 'day', interval: 2 } })
    expect(await skipOccurrence(task)).toBe(addDaysYmd(t, 2))
    const after = await db.tasks.get(task.id)
    expect(after).toMatchObject({ done: 0, dueDate: addDaysYmd(t, 2) })
    expect(await db.tasks.count()).toBeGreaterThan(0)
  })
})
