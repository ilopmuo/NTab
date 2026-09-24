import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createGoal, createProject, createTask, deleteGoal, deleteProject, deleteTask, linkGoalProjects } from './actions'
import { TRASH_DAYS, purgeTrash, restoreFromTrash, trashKey } from './trash'

beforeEach(async () => {
  await Promise.all([db.tasks.clear(), db.projects.clear(), db.goals.clear(), db.trash.clear(), db.notes.clear()])
})

describe('papelera', () => {
  it('borrar y recuperar una tarea', async () => {
    const t = await createTask({ title: 'Llamar al banco', dueDate: '2026-09-25', dueTime: '10:00' })
    await deleteTask(t.id)
    expect(await db.tasks.get(t.id)).toBeUndefined()
    const item = await db.trash.get(trashKey('tasks', t.id))
    expect(item).toMatchObject({ tbl: 'tasks', title: 'Llamar al banco' })
    await restoreFromTrash(item!.id)
    expect(await db.tasks.get(t.id)).toMatchObject({ title: 'Llamar al banco', dueTime: '10:00' })
    expect(await db.trash.count()).toBe(0)
  })

  it('proyecto con sus tareas', async () => {
    const p = await createProject({ name: 'Mudanza' })
    const a = await createTask({ title: 'Cajas', projectId: p.id })
    await deleteProject(p.id, true)
    expect(await db.tasks.count()).toBe(0)
    await restoreFromTrash(trashKey('projects', p.id))
    expect(await db.projects.get(p.id)).toBeDefined()
    expect(await db.tasks.get(a.id)).toMatchObject({ projectId: p.id })
  })

  it('proyecto conservando las tareas: al recuperarlo se vuelven a enlazar', async () => {
    const p = await createProject({ name: 'Viaje' })
    const a = await createTask({ title: 'Billetes', projectId: p.id })
    await deleteProject(p.id, false)
    expect((await db.tasks.get(a.id))?.projectId).toBeUndefined()
    await restoreFromTrash(trashKey('projects', p.id))
    expect((await db.tasks.get(a.id))?.projectId).toBe(p.id)
  })

  it('objetivo: sus proyectos se vuelven a vincular', async () => {
    const p = await createProject({ name: 'Entrenar' })
    const g = await createGoal({ title: 'Media maratón' })
    await linkGoalProjects(g.id, [p.id])
    await deleteGoal(g.id)
    expect((await db.projects.get(p.id))?.goalId).toBeUndefined()
    await restoreFromTrash(trashKey('goals', g.id))
    expect((await db.projects.get(p.id))?.goalId).toBe(g.id)
  })

  it(`se vacía sola a los ${TRASH_DAYS} días`, async () => {
    const t = await createTask({ title: 'Vieja' })
    await deleteTask(t.id)
    await purgeTrash(Date.now() + (TRASH_DAYS - 1) * 864e5)
    expect(await db.trash.count()).toBe(1)
    await purgeTrash(Date.now() + (TRASH_DAYS + 1) * 864e5)
    expect(await db.trash.count()).toBe(0)
  })
})
