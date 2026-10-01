import { describe, expect, it } from 'vitest'
import type { Task } from '@/db/types'
import { byQuadrant, moveToQuadrant, quadrantOf } from './matrix'

const task = (id: string, extra: Partial<Task> = {}) => ({ id, title: id, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0, ...extra }) as Task
const T = '2026-10-01'

describe('matriz de Eisenhower', () => {
  it('reparte por prioridad y por fecha (cuenta la fecha límite y lo atrasado)', () => {
    expect(quadrantOf(task('a', { priority: 3, dueDate: T }), T)).toBe('do')
    expect(quadrantOf(task('a', { priority: 2, dueDate: '2026-09-20' }), T)).toBe('do')
    expect(quadrantOf(task('a', { priority: 2, deadline: '2026-10-02' }), T)).toBe('do')
    expect(quadrantOf(task('a', { priority: 3, dueDate: '2026-10-03' }), T)).toBe('plan')
    expect(quadrantOf(task('a', { priority: 3 }), T)).toBe('plan')
    expect(quadrantOf(task('a', { priority: 1, dueDate: '2026-10-02' }), T)).toBe('delegate')
    expect(quadrantOf(task('a'), T)).toBe('drop')
  })

  it('deja fuera lo hecho y lo de «algún día»', () => {
    const q = byQuadrant([task('a', { priority: 3 }), task('b', { done: 1, priority: 3 }), task('c', { someday: true, priority: 3 })], T)
    expect(q.plan.map((t) => t.id)).toEqual(['a'])
    expect(q.do.length + q.delegate.length + q.drop.length).toBe(0)
  })

  it('mover cambia la prioridad y la fecha justas', () => {
    expect(moveToQuadrant(task('a'), 'do', T)).toEqual({ priority: 2, dueDate: T, someday: undefined })
    expect(moveToQuadrant(task('a', { priority: 3, dueDate: T }), 'plan', T)).toEqual({ dueDate: '2026-10-08' })
    expect(moveToQuadrant(task('a', { priority: 3, dueDate: T }), 'delegate', T)).toEqual({ priority: 0 })
    expect(moveToQuadrant(task('a', { priority: 3, deadline: T }), 'plan', T)).toBeNull()
    const moved = { ...task('a', { priority: 1 }), ...moveToQuadrant(task('a', { priority: 1 }), 'do', T) } as Task
    expect(quadrantOf(moved, T)).toBe('do')
  })
})
