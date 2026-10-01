import { describe as group, expect, it } from 'vitest'
import type { Task } from '@/db/types'
import { defaultsFor, describe, filterTasks, matches } from './smartLists'

const task = (id: string, extra: Partial<Task> = {}) => ({ id, title: id, notes: '', done: 0, priority: 0, tags: [], subtasks: [], order: 0, createdAt: 0, ...extra }) as Task
const T = '2026-10-01'

group('listas inteligentes', () => {
  const tasks = [
    task('urgente', { priority: 3, dueDate: '2026-09-30', tags: ['trabajo'] }),
    task('hoy', { dueDate: T, estimate: 10 }),
    task('semana', { dueDate: '2026-10-05', projectId: 'p1', areaId: 'a1', people: ['ana'] }),
    task('limite', { deadline: '2026-10-03', priority: 2 }),
    task('suelta', { tags: ['casa'] }),
    task('idea', { someday: true }),
    task('hecha', { done: 1, priority: 3 }),
  ]
  const ids = (l: Parameters<typeof matches>[0]) => filterTasks(l, tasks, T).map((t) => t.id)

  it('por cuándo (cuenta la fecha límite; «algún día» solo si se pide)', () => {
    expect(ids({ id: '1', name: '', when: 'overdue' })).toEqual(['urgente'])
    expect(ids({ id: '1', name: '', when: 'today' })).toEqual(['urgente', 'hoy'])
    expect(ids({ id: '1', name: '', when: 'week' })).toEqual(['urgente', 'hoy', 'semana', 'limite'])
    expect(ids({ id: '1', name: '', when: 'nodate' })).toEqual(['suelta'])
    expect(ids({ id: '1', name: '', when: 'deadline' })).toEqual(['limite'])
    expect(ids({ id: '1', name: '', when: 'someday' })).toEqual(['idea'])
    expect(ids({ id: '1', name: '' })).not.toContain('idea')
    expect(ids({ id: '1', name: '' })).not.toContain('hecha')
  })

  it('por prioridad, etiquetas, lista, persona y duración (todo a la vez)', () => {
    expect(ids({ id: '1', name: '', minPriority: 2 })).toEqual(['urgente', 'limite'])
    expect(ids({ id: '1', name: '', tags: ['casa', 'trabajo'] })).toEqual(['urgente', 'suelta'])
    expect(ids({ id: '1', name: '', list: 'p:p1' })).toEqual(['semana'])
    expect(ids({ id: '1', name: '', list: 'a:a1' })).toEqual(['semana'])
    expect(ids({ id: '1', name: '', person: 'ana' })).toEqual(['semana'])
    expect(ids({ id: '1', name: '', maxEstimate: 15 })).toEqual(['hoy'])
    expect(ids({ id: '1', name: '', when: 'today', minPriority: 3 })).toEqual(['urgente'])
  })

  it('se describe en una línea', () => {
    expect(describe({ id: '1', name: '', when: 'week', minPriority: 3, tags: ['trabajo'], maxEstimate: 30 })).toBe('Próximos 7 días · Prioridad alta · #trabajo · 30 min o menos')
    expect(describe({ id: '1', name: '' })).toBe('Todas las pendientes')
  })

  it('una tarea nueva dentro de la lista se queda en ella', () => {
    const l = { id: '1', name: '', when: 'today' as const, minPriority: 2, tags: ['trabajo', 'casa'], list: 'p:p1', person: 'ana', maxEstimate: 30 }
    const d = defaultsFor(l, T)
    expect(d).toEqual({ dueDate: T, priority: 2, tags: ['trabajo'], projectId: 'p1', people: ['ana'], estimate: 30 })
    expect(matches(l, task('nueva', d), T)).toBe(true)
    expect(defaultsFor({ id: '1', name: '', when: 'nodate' }, T)).toEqual({})
  })
})
