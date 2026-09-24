import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { installReminderHooks, openDatabase } from '@/db/db'
import type { Goal, Project, Subscription, Task } from '@/db/types'
import { advanceCharge, computeSubRemindAt, monthly, rollForward, yearly } from './finance'
import { goalPace, goalProgress } from './goals'
import { dueMoment } from './reminders'

describe('cargos', () => {
  it('avanza por semanas, meses, trimestres y años', () => {
    expect(advanceCharge('2026-09-24', 'week')).toBe('2026-10-01')
    expect(advanceCharge('2026-09-24', 'month')).toBe('2026-10-24')
    expect(advanceCharge('2026-09-24', 'quarter')).toBe('2026-12-24')
    expect(advanceCharge('2026-09-24', 'year')).toBe('2027-09-24')
  })
  it('respeta el día 31 aunque pase por meses cortos', () => {
    const feb = advanceCharge('2027-01-31', 'month', 31)
    expect(feb).toBe('2027-02-28')
    expect(advanceCharge(feb, 'month', 31)).toBe('2027-03-31')
  })
  it('las fechas pasadas saltan al siguiente cargo', () => {
    expect(rollForward({ nextDate: '2026-07-10', cycle: 'month', anchorDay: 10 }, '2026-09-24')).toBe('2026-10-10')
    expect(rollForward({ nextDate: '2026-09-24', cycle: 'month' }, '2026-09-24')).toBe('2026-09-24')
  })
  it('equivalente mensual y anual', () => {
    expect(yearly({ amount: 10, cycle: 'month' })).toBe(120)
    expect(monthly({ amount: 120, cycle: 'year' })).toBe(10)
    expect(monthly({ amount: 30, cycle: 'quarter' })).toBe(10)
  })
  it('aviso N días antes a las 9:00', () => {
    expect(computeSubRemindAt({ nextDate: '2026-09-26', notifyDays: 2, active: true })).toBe(dueMoment('2026-09-24', '09:00'))
    expect(computeSubRemindAt({ nextDate: '2026-09-26', notifyDays: null, active: true })).toBeUndefined()
    expect(computeSubRemindAt({ nextDate: '2026-09-26', notifyDays: 1, active: false })).toBeUndefined()
  })
})

describe('hooks de pagos', () => {
  const { db } = openDatabase('finance-test')
  installReminderHooks(db)
  const sub: Subscription = {
    id: 's1', name: 'Netflix', kind: 'sub', amount: 12.99, currency: 'EUR', cycle: 'month',
    nextDate: '2026-09-26', active: true, category: '', notifyDays: 1, notes: '', createdAt: 0,
  }
  it('calcula y recalcula remindAt', async () => {
    await db.subscriptions.add(sub)
    expect((await db.subscriptions.get('s1'))?.remindAt).toBe(dueMoment('2026-09-25', '09:00'))
    await db.subscriptions.update('s1', { nextDate: '2026-10-26' })
    expect((await db.subscriptions.get('s1'))?.remindAt).toBe(dueMoment('2026-10-25', '09:00'))
    await db.subscriptions.update('s1', { active: false })
    expect((await db.subscriptions.get('s1'))?.remindAt).toBeUndefined()
  })
})

describe('objetivos', () => {
  const goal: Goal = { id: 'g', title: 'Leer', why: '', kind: 'number', current: 3, target: 12, unit: 'libros', status: 'active', order: 0, createdAt: 0 }
  const proj = (id: string, status: Project['status'] = 'active'): Project => ({ id, name: id, description: '', status, color: '', order: 0, createdAt: 0, goalId: 'g' })
  const task = (projectId: string, done: 0 | 1): Task => ({ id: Math.random().toString(), title: '', notes: '', done, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0, projectId })

  it('con una cifra', () => {
    const p = goalProgress(goal, [], [])
    expect(p.value).toBe(0.25)
    expect(p.label).toBe('3 de 12 libros')
  })
  it('con proyectos: media del avance de cada uno', () => {
    const g = { ...goal, kind: 'projects' as const }
    const p = goalProgress(g, [proj('a', 'done'), proj('b')], [task('b', 1), task('b', 0)])
    expect(p.value).toBe(0.75)
    expect(p.label).toBe('1 de 2 proyectos')
  })
  it('ritmo', () => {
    const created = new Date('2026-01-01T12:00:00').getTime()
    const g = { ...goal, createdAt: created, deadline: '2026-12-31' }
    expect(goalPace(g, 0.1, '2026-09-24')).toBe('behind')
    expect(goalPace(g, 0.8, '2026-09-24')).toBe('ok')
    expect(goalPace(g, 0.8, '2027-01-02')).toBe('late')
  })
})
