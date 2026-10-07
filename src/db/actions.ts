import { db } from './db'
import type { Area, Task } from './types'
import { uid } from '@/lib/id'
import { today } from '@/lib/dates'
import { nextOccurrence } from '@/lib/recurrence'
import { putInTrash } from './trash'

// Lo que hace falta para arrancar (Hoy, las tareas y los hábitos); lo demás,
// en moreActions.ts, que se carga con cada pantalla

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
  // Las que vuelven a pendiente deshacen también lo que cambiaron al hacerse
  const was = await db.tasks.bulkGet(snapshots.map((s) => s.id))
  await db.transaction('rw', db.tasks, async () => {
    if (created.length) await db.tasks.bulkDelete(created)
    await db.tasks.bulkPut(snapshots)
  })
  for (const [i, s] of snapshots.entries()) if (!s.done && was[i]?.done) await undoRipples(s)
}

/** Lo que cambia en el resto de LUNO al hacer una tarea (ver ripples.ts): se carga al hacer la primera, no al abrir la app */
const loadRipples = () => import('./ripples')
/** Deshace lo que cambió al hacerse (el contacto, la «última vez», la casilla de la nota) */
export const undoRipples = async (task: Task) => (await loadRipples()).rippleUndone(task)

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
  // Todo de una vez: la tarea y lo que cambia en el resto de LUNO al hacerla
  // (personas, «Última vez», la nota de origen), así las pantallas se enteran a la vez
  const r = await loadRipples()
  return db.transaction('rw', [db.tasks, ...r.RIPPLE_TABLES], async () => {
    if (task.done) {
      await db.tasks.update(task.id, { done: 0, completedAt: undefined })
      await r.rippleUndone(task)
      return
    }
    const next = await completeOne(task)
    await r.rippleDone(task)
    return next
  })
}

async function completeOne(task: Task): Promise<Task | undefined> {
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

export async function duplicateTask(task: Task) {
  const { id, completedAt, ...rest } = task
  return createTask({
    ...rest,
    title: `${task.title} (copia)`,
    source: undefined,
    done: 0,
    subtasks: task.subtasks.map((s) => ({ ...s, id: uid() })),
    createdAt: Date.now(),
  })
}

// ── Áreas y hábitos ───────────────────────────────────────────

export async function createArea(data: Partial<Area> & { name: string }): Promise<Area> {
  const area: Area = { id: uid(), icon: 'circle', color: '#0A84FF', order: Date.now(), ...data }
  await db.areas.add(area)
  return area
}

export async function toggleHabit(habitId: string, date: string) {
  const existing = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).first()
  if (existing) await db.habitLogs.delete(existing.id)
  else await db.habitLogs.add({ id: uid(), habitId, date })
}

/** Suma (o resta) a la cantidad del día de un hábito con cantidad. Devuelve la cantidad nueva. */
export async function addHabitCount(habitId: string, date: string, delta: number): Promise<number> {
  return db.transaction('rw', db.habitLogs, async () => {
    const logs = await db.habitLogs.where('[habitId+date]').equals([habitId, date]).toArray()
    const now = logs.reduce((n, l) => n + (l.count ?? 1), 0)
    const next = Math.max(0, now + delta)
    // Un registro por día (si había varios, p. ej. de dos dispositivos, se juntan)
    await db.habitLogs.bulkDelete(logs.slice(1).map((l) => l.id))
    if (!next) {
      if (logs[0]) await db.habitLogs.delete(logs[0].id)
    } else if (logs[0]) await db.habitLogs.update(logs[0].id, { count: next })
    else await db.habitLogs.add({ id: uid(), habitId, date, count: next })
    return next
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
