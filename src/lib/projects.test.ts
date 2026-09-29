import { describe, expect, it } from 'vitest'
import type { Task } from '@/db/types'
import { nextStep, projectOrder } from './projects'

const task = (id: string, extra: Partial<Task> = {}) =>
  ({ id, title: id, projectId: 'p', done: 0, priority: 0, order: 0, createdAt: 0, tags: [], ...extra }) as Task

describe('orden de un proyecto', () => {
  const project = { id: 'p', sections: [{ id: 's1', name: 'Diseño' }, { id: 's2', name: 'Lanzamiento' }] }

  it('primero sin sección, luego cada sección en su orden', () => {
    const tasks = [
      task('lanzar', { sectionId: 's2' }),
      task('maquetas', { sectionId: 's1', order: 2 }),
      task('bocetos', { sectionId: 's1', order: 1 }),
      task('suelta'),
      task('hecha', { done: 1 }),
      task('de otro', { projectId: 'q' }),
      task('huérfana', { sectionId: 'borrada', order: 5 }),
    ]
    expect(projectOrder(project, tasks).map((t) => t.id)).toEqual(['suelta', 'huérfana', 'bocetos', 'maquetas', 'lanzar'])
  })

  it('el siguiente paso respeta el orden a mano y las fechas', () => {
    const tasks = [task('a', { order: 1, orders: { 'project:p': 20 } }), task('b', { order: 2, orders: { 'project:p': 10 } })]
    expect(nextStep(project, tasks)?.id).toBe('a')
    expect(nextStep(project, tasks, { 'project:p': 'manual' })?.id).toBe('b')
    expect(nextStep(project, [...tasks, task('c', { dueDate: '2026-10-01' })])?.id).toBe('c')
    expect(nextStep(project, [task('x', { done: 1 })])).toBeUndefined()
  })
})
