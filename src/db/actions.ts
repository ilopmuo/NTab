import { db } from './db'
import type { Area, Goal, Habit, Interaction, Note, Person, Project, Subscription, Task } from './types'
import { uid } from '@/lib/id'
import { today } from '@/lib/dates'
import { nextOccurrence } from '@/lib/recurrence'
import { advanceCharge, rollForward } from '@/lib/finance'
import { putInTrash } from './trash'

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

/** Cambia varias tareas a la vez. Devuelve cómo estaban, para poder deshacer. */
export async function mutateTasks(ids: string[], fn: (t: Task) => void): Promise<Task[]> {
  return db.transaction('rw', db.tasks, async () => {
    const before = (await db.tasks.bulkGet(ids)).filter((t): t is Task => !!t)
    await db.tasks.where('id').anyOf(ids).modify(fn)
    return structuredClone(before)
  })
}

/** Deja las tareas como estaban (deshacer de las acciones en bloque) */
export async function restoreTasks(snapshots: Task[], created: string[] = []) {
  await db.transaction('rw', db.tasks, async () => {
    if (created.length) await db.tasks.bulkDelete(created)
    await db.tasks.bulkPut(snapshots)
  })
}

/** Completa varias tareas (las que se repiten crean la siguiente) */
export async function completeTasks(ids: string[]) {
  const before = (await db.tasks.bulkGet(ids)).filter((t): t is Task => !!t && !t.done)
  const snapshot = structuredClone(before)
  const created: string[] = []
  for (const t of before) {
    const next = await toggleTask(t)
    if (next) created.push(next.id)
  }
  return { before: snapshot, created }
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
    // «Desde que la completo»: la siguiente se cuenta desde hoy
    const base = task.recurrence.afterDone ? today() : (task.dueDate ?? today())
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

/** Borra una tarea (va a la papelera) */
/** Tarea que se repite: saltar esta vez (pasa a la siguiente sin completarla) */
export async function skipOccurrence(task: Task): Promise<string | undefined> {
  if (!task.recurrence) return
  const t = today()
  let next = nextOccurrence(task.dueDate ?? t, task.recurrence)
  while (next < t) next = nextOccurrence(next, task.recurrence)
  await db.tasks.update(task.id, { dueDate: next })
  return next
}

export async function deleteTask(id: string) {
  await db.transaction('rw', db.tasks, db.trash, async () => {
    const task = await db.tasks.get(id)
    if (!task) return
    await putInTrash('tasks', task)
    await db.tasks.delete(id)
  })
}

/** Borra una nota (va a la papelera) */
export async function deleteNote(id: string) {
  await db.transaction('rw', db.notes, db.trash, async () => {
    const note = await db.notes.get(id)
    if (!note) return
    await putInTrash('notes', note)
    await db.notes.delete(id)
  })
}

/** Borra un pago recurrente (va a la papelera) */
export async function deleteSubscription(id: string) {
  await db.transaction('rw', db.subscriptions, db.trash, async () => {
    const sub = await db.subscriptions.get(id)
    if (!sub) return
    await putInTrash('subscriptions', sub)
    await db.subscriptions.delete(id)
  })
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
  await db.transaction('rw', [db.areas, db.projects, db.tasks, db.notes, db.goals], async () => {
    await db.projects.where('areaId').equals(id).modify({ areaId: undefined })
    await db.goals.where('areaId').equals(id).modify({ areaId: undefined })
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
  await db.transaction('rw', [db.projects, db.tasks, db.notes, db.trash], async () => {
    const project = await db.projects.get(id)
    if (!project) return
    const tasks = await db.tasks.where('projectId').equals(id).toArray()
    const notes = await db.notes.where('projectId').equals(id).toArray()
    await putInTrash('projects', project, {
      related: withTasks ? tasks.map((t) => ({ tbl: 'tasks', data: t as unknown as Record<string, unknown> })) : [],
      unlinked: [
        ...(withTasks ? [] : tasks.map((t) => ({ tbl: 'tasks' as const, id: t.id, field: 'projectId' as const }))),
        ...notes.map((n) => ({ tbl: 'notes' as const, id: n.id, field: 'projectId' as const })),
      ],
    })
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
  await db.transaction('rw', db.habits, db.habitLogs, db.trash, async () => {
    const habit = await db.habits.get(id)
    if (!habit) return
    const logs = await db.habitLogs.where('habitId').equals(id).toArray()
    await putInTrash('habits', habit, { related: logs.map((l) => ({ tbl: 'habitLogs', data: l as unknown as Record<string, unknown> })) })
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
  await db.transaction('rw', db.people, db.interactions, db.trash, async () => {
    const person = await db.people.get(id)
    if (!person) return
    const history = await db.interactions.where('personId').equals(id).toArray()
    await putInTrash('people', person, { related: history.map((i) => ({ tbl: 'interactions', data: i as unknown as Record<string, unknown> })) })
    await db.interactions.where('personId').equals(id).delete()
    await db.people.delete(id)
  })
}

// ── Objetivos ─────────────────────────────────────────────────

export async function createGoal(data: Partial<Goal> & { title: string }): Promise<Goal> {
  const goal: Goal = {
    id: uid(),
    why: '',
    kind: 'projects',
    status: 'active',
    order: Date.now(),
    createdAt: Date.now(),
    ...data,
  }
  await db.goals.add(goal)
  return goal
}

export async function setGoalStatus(id: string, status: Goal['status']) {
  await db.goals.update(id, { status, completedAt: status === 'done' ? Date.now() : undefined })
}

/** Vincula exactamente estos proyectos al objetivo (y desvincula el resto) */
export async function linkGoalProjects(goalId: string, projectIds: string[]) {
  await db.transaction('rw', db.projects, async () => {
    await db.projects.where('goalId').equals(goalId).filter((p) => !projectIds.includes(p.id)).modify({ goalId: undefined })
    if (projectIds.length) await db.projects.where('id').anyOf(projectIds).modify({ goalId })
  })
}

export async function deleteGoal(id: string) {
  await db.transaction('rw', db.goals, db.projects, db.trash, async () => {
    const goal = await db.goals.get(id)
    if (!goal) return
    const linked = await db.projects.where('goalId').equals(id).primaryKeys()
    await putInTrash('goals', goal, { unlinked: linked.map((p) => ({ tbl: 'projects' as const, id: String(p), field: 'goalId' as const })) })
    await db.projects.where('goalId').equals(id).modify({ goalId: undefined })
    await db.goals.delete(id)
  })
}

// ── Pagos recurrentes ─────────────────────────────────────────

export async function createSubscription(data: Partial<Subscription> & { name: string; amount: number; nextDate: string }): Promise<Subscription> {
  const sub: Subscription = {
    id: uid(),
    kind: 'sub',
    currency: 'EUR',
    cycle: 'month',
    active: true,
    category: '',
    notifyDays: 1,
    notes: '',
    createdAt: Date.now(),
    anchorDay: Number(data.nextDate.slice(8, 10)),
    ...data,
  }
  await db.subscriptions.add(sub)
  return sub
}

/** Recibo pagado: pasa al siguiente cargo */
export async function markPaid(s: Subscription) {
  await db.subscriptions.update(s.id, { nextDate: advanceCharge(s.nextDate, s.cycle, s.anchorDay) })
}

/** Las suscripciones se cobran solas: las fechas pasadas avanzan al siguiente cargo */
export async function rollSubscriptions(ref = today()) {
  const past = await db.subscriptions.where('nextDate').below(ref).toArray()
  for (const s of past) {
    if (s.kind !== 'sub' || !s.active) continue
    await db.subscriptions.update(s.id, { nextDate: rollForward(s, ref) })
  }
}

// ── Ajustes ───────────────────────────────────────────────────

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return (row?.value as T) ?? fallback
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}
