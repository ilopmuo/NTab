import { db } from './db'
import type { Area, Habit, Interaction, Note, Person, Project, Task } from './types'
import { uid } from '@/lib/id'
import { today } from '@/lib/dates'
import { nextOccurrence } from '@/lib/recurrence'

// ── Tareas ────────────────────────────────────────────────────

export async function createTask(data: Partial<Task> & { title: string }): Promise<Task> {
  const task: Task = {
    id: uid(),
    notes: '',
    done: 0,
    priority: 0,
    tags: [],
    subtasks: [],
    order: Date.now(),
    createdAt: Date.now(),
    ...data,
  }
  await db.tasks.add(task)
  return task
}

export async function updateTask(id: string, changes: Partial<Task>) {
  await db.tasks.update(id, changes)
}

/** Modifica la tarea a partir de su estado actual en la base de datos (evita pisar cambios rápidos). */
export async function mutateTask(id: string, fn: (t: Task) => void) {
  await db.tasks.where('id').equals(id).modify(fn)
}

/**
 * Completa o reabre una tarea. Si es recurrente, al completarla se crea
 * automáticamente la siguiente ocurrencia.
 */
export async function toggleTask(task: Task): Promise<Task | undefined> {
  if (task.done) {
    await db.tasks.update(task.id, { done: 0, completedAt: undefined })
    return
  }
  return db.transaction('rw', db.tasks, async () => {
    await db.tasks.update(task.id, { done: 1, completedAt: Date.now() })
    if (!task.recurrence) return
    const base = task.dueDate ?? today()
    let next = nextOccurrence(base, task.recurrence)
    // Si la tarea estaba muy atrasada, no generar ocurrencias en el pasado
    while (next < today()) next = nextOccurrence(next, task.recurrence)
    const copy: Task = {
      ...task,
      id: uid(),
      done: 0,
      completedAt: undefined,
      dueDate: next,
      subtasks: task.subtasks.map((s) => ({ ...s, id: uid(), done: false })),
      createdAt: Date.now(),
    }
    await db.tasks.add(copy)
    // La completada ya no repite: la regla pasa a la nueva
    await db.tasks.update(task.id, { recurrence: undefined })
    return copy
  })
}

export async function deleteTask(id: string) {
  await db.tasks.delete(id)
}

export async function duplicateTask(task: Task) {
  const { id, completedAt, ...rest } = task
  return createTask({
    ...rest,
    title: `${task.title} (copia)`,
    done: 0,
    subtasks: task.subtasks.map((s) => ({ ...s, id: uid() })),
    createdAt: Date.now(),
  })
}

// ── Áreas y proyectos ─────────────────────────────────────────

export async function createArea(data: Partial<Area> & { name: string }): Promise<Area> {
  const area: Area = { id: uid(), icon: 'circle', color: '#0A84FF', order: Date.now(), ...data }
  await db.areas.add(area)
  return area
}

export async function deleteArea(id: string) {
  await db.transaction('rw', [db.areas, db.projects, db.tasks, db.notes], async () => {
    await db.projects.where('areaId').equals(id).modify({ areaId: undefined })
    await db.tasks.where('areaId').equals(id).modify({ areaId: undefined })
    await db.notes.where('areaId').equals(id).modify({ areaId: undefined })
    await db.areas.delete(id)
  })
}

export async function createProject(data: Partial<Project> & { name: string }): Promise<Project> {
  const project: Project = {
    id: uid(),
    description: '',
    status: 'active',
    color: '#0A84FF',
    order: Date.now(),
    createdAt: Date.now(),
    ...data,
  }
  await db.projects.add(project)
  return project
}

export async function deleteProject(id: string, withTasks: boolean) {
  await db.transaction('rw', [db.projects, db.tasks, db.notes], async () => {
    if (withTasks) await db.tasks.where('projectId').equals(id).delete()
    else await db.tasks.where('projectId').equals(id).modify({ projectId: undefined })
    await db.notes.where('projectId').equals(id).modify({ projectId: undefined })
    await db.projects.delete(id)
  })
}

// ── Notas ─────────────────────────────────────────────────────

export async function createNote(data: Partial<Note> = {}): Promise<Note> {
  const note: Note = {
    id: uid(),
    title: '',
    content: '',
    pinned: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...data,
  }
  await db.notes.add(note)
  return note
}

export async function updateNote(id: string, changes: Partial<Note>) {
  await db.notes.update(id, { ...changes, updatedAt: Date.now() })
}

// ── Hábitos ───────────────────────────────────────────────────

export async function createHabit(data: Partial<Habit> & { name: string }): Promise<Habit> {
  const habit: Habit = {
    id: uid(),
    icon: 'sparkles',
    color: '#30D158',
    days: [0, 1, 2, 3, 4, 5, 6],
    archived: 0,
    order: Date.now(),
    createdAt: Date.now(),
    ...data,
  }
  await db.habits.add(habit)
  return habit
}

export async function toggleHabit(habitId: string, date: string) {
  const existing = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).first()
  if (existing) await db.habitLogs.delete(existing.id)
  else await db.habitLogs.add({ id: uid(), habitId, date })
}

export async function deleteHabit(id: string) {
  await db.transaction('rw', db.habits, db.habitLogs, async () => {
    await db.habitLogs.where('habitId').equals(id).delete()
    await db.habits.delete(id)
  })
}

// ── Personas ──────────────────────────────────────────────────

export async function createPerson(data: Partial<Person> & { name: string }): Promise<Person> {
  const person: Person = {
    id: uid(),
    email: '',
    phone: '',
    company: '',
    role: '',
    notes: '',
    tags: [],
    createdAt: Date.now(),
    ...data,
  }
  await db.people.add(person)
  return person
}

export async function logInteraction(data: Omit<Interaction, 'id' | 'createdAt'>) {
  await db.transaction('rw', db.people, db.interactions, async () => {
    await db.interactions.add({ ...data, id: uid(), createdAt: Date.now() })
    const person = await db.people.get(data.personId)
    if (person && (!person.lastContact || person.lastContact < data.date)) {
      await db.people.update(data.personId, { lastContact: data.date })
    }
  })
}

export async function deletePerson(id: string) {
  await db.transaction('rw', db.people, db.interactions, async () => {
    await db.interactions.where('personId').equals(id).delete()
    await db.people.delete(id)
  })
}

// ── Ajustes ───────────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return (row?.value as T) ?? fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}
