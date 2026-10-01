import type { Task } from '@/db/types'
import { addDaysYmd, today as todayYmd } from './dates'
import { isSomeday, whenDue } from './tasks'

/**
 * Matriz de Eisenhower (como la de TickTick): las tareas pendientes en cuatro
 * cuadrantes. Importante = prioridad media o alta. Urgente = para hoy o mañana
 * (contando la fecha límite) o ya atrasada.
 */
export type Quadrant = 'do' | 'plan' | 'delegate' | 'drop'

export const QUADRANTS: { id: Quadrant; title: string; action: string; important: boolean; urgent: boolean }[] = [
  { id: 'do', title: 'Urgente e importante', action: 'Hazlo ya', important: true, urgent: true },
  { id: 'plan', title: 'Importante, no urgente', action: 'Ponle fecha', important: true, urgent: false },
  { id: 'delegate', title: 'Urgente, no importante', action: 'Despáchalo rápido o pídeselo a alguien', important: false, urgent: true },
  { id: 'drop', title: 'Ni urgente ni importante', action: 'Para cuando sobre tiempo… o bórralo', important: false, urgent: false },
]

export const isImportant = (t: Pick<Task, 'priority'>) => t.priority >= 2

export function isUrgent(t: Pick<Task, 'dueDate' | 'deadline'>, ref = todayYmd()) {
  const d = whenDue(t)
  return !!d && d <= addDaysYmd(ref, 1)
}

export function quadrantOf(t: Task, ref = todayYmd()): Quadrant {
  const q = QUADRANTS.find((x) => x.important === isImportant(t) && x.urgent === isUrgent(t, ref))
  return q!.id
}

/** Las tareas pendientes de cada cuadrante («algún día» se queda fuera) */
export function byQuadrant(tasks: Task[], ref = todayYmd()) {
  const out: Record<Quadrant, Task[]> = { do: [], plan: [], delegate: [], drop: [] }
  for (const t of tasks) if (!t.done && !isSomeday(t)) out[quadrantOf(t, ref)].push(t)
  return out
}

/**
 * Qué cambiar para que una tarea pase a otro cuadrante: la prioridad (media si
 * pasa a importante, ninguna si deja de serlo) y la fecha (hoy si pasa a
 * urgente, dentro de una semana si deja de serlo). Si su fecha límite la hace
 * urgente igualmente, no se puede: devuelve null.
 */
export function moveToQuadrant(t: Task, to: Quadrant, ref = todayYmd()): Partial<Task> | null {
  const q = QUADRANTS.find((x) => x.id === to)!
  const patch: Partial<Task> = {}
  if (q.important && !isImportant(t)) patch.priority = 2
  if (!q.important && isImportant(t)) patch.priority = 0
  if (q.urgent && !isUrgent(t, ref)) {
    patch.dueDate = ref
    patch.someday = undefined
  }
  if (!q.urgent && isUrgent(t, ref)) {
    if (t.deadline && t.deadline <= addDaysYmd(ref, 1)) return null
    patch.dueDate = addDaysYmd(ref, 7)
  }
  return patch
}
