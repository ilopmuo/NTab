import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { installReminderHooks, openDatabase } from '@/db/db'
import type { Task } from '@/db/types'
import { computeRemindAt, dueMoment } from './reminders'
import { prefs } from './prefs'

const base: Task = { id: 't', title: 'x', notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0 }

describe('computeRemindAt', () => {
  it('a la hora y minutos antes', () => {
    const at = dueMoment('2026-09-24', '10:00')
    expect(computeRemindAt({ dueDate: '2026-09-24', dueTime: '10:00', reminder: { before: 0 } })).toBe(at)
    expect(computeRemindAt({ dueDate: '2026-09-24', dueTime: '10:00', reminder: { before: 15 } })).toBe(at - 15 * 60_000)
  })
  it('sin hora usa las 9:00; sin fecha no hay aviso', () => {
    expect(computeRemindAt({ dueDate: '2026-09-24', reminder: { before: 0 } })).toBe(dueMoment('2026-09-24', '09:00'))
    expect(computeRemindAt({ reminder: { before: 0 } })).toBeUndefined()
  })
  it('momento concreto y sin aviso', () => {
    expect(computeRemindAt({ reminder: { at: 123 } })).toBe(123)
    expect(computeRemindAt({ dueDate: '2026-09-24', dueTime: '10:00', reminder: null })).toBeUndefined()
  })
})

describe('hooks de avisos', () => {
  const { db } = openDatabase('reminders-test')
  installReminderHooks(db)

  it('las tareas con hora avisan a su hora automáticamente', async () => {
    prefs.autoRemind = true
    await db.tasks.add({ ...base, id: 'a', dueDate: '2026-09-24', dueTime: '10:00' })
    const t = await db.tasks.get('a')
    expect(t?.reminder).toEqual({ before: 0 })
    expect(t?.remindAt).toBe(dueMoment('2026-09-24', '10:00'))
  })

  it('al cambiar la hora se recalcula el aviso', async () => {
    await db.tasks.update('a', { dueTime: '18:30' })
    expect((await db.tasks.get('a'))?.remindAt).toBe(dueMoment('2026-09-24', '18:30'))
  })

  it('"sin aviso" elegido a propósito se respeta', async () => {
    await db.tasks.update('a', { reminder: null })
    const t = await db.tasks.get('a')
    expect(t?.remindAt).toBeUndefined()
    await db.tasks.update('a', { dueTime: '20:00' })
    expect((await db.tasks.get('a'))?.remindAt).toBeUndefined()
  })

  it('poner hora a una tarea sin aviso aplica el aviso automático', async () => {
    await db.tasks.add({ ...base, id: 'b', dueDate: '2026-09-25' })
    expect((await db.tasks.get('b'))?.remindAt).toBeUndefined()
    await db.tasks.update('b', { dueTime: '08:00' })
    expect((await db.tasks.get('b'))?.remindAt).toBe(dueMoment('2026-09-25', '08:00'))
  })

  it('con el aviso automático desactivado no se añade', async () => {
    prefs.autoRemind = false
    await db.tasks.add({ ...base, id: 'c', dueDate: '2026-09-24', dueTime: '10:00' })
    expect((await db.tasks.get('c'))?.remindAt).toBeUndefined()
    prefs.autoRemind = true
  })
})

describe('cambiar el tipo de aviso', () => {
  const { db } = openDatabase('reminders-kind-test')
  installReminderHooks(db)
  it('de "antes" a una hora concreta y vuelta', async () => {
    prefs.autoRemind = true
    await db.tasks.add({ ...base, id: 'k', dueDate: '2026-09-24', dueTime: '10:00' })
    expect((await db.tasks.get('k'))?.remindAt).toBe(dueMoment('2026-09-24', '10:00'))
    await db.tasks.update('k', { reminder: { at: 123456 } })
    expect((await db.tasks.get('k'))?.remindAt).toBe(123456)
    await db.tasks.update('k', { reminder: { before: 15 } })
    const t = await db.tasks.get('k')
    expect(t?.reminder).toEqual({ before: 15 })
    expect(t?.remindAt).toBe(dueMoment('2026-09-24', '10:00') - 15 * 60_000)
  })
})
