import type { Task } from '@/db/types'
import { today } from './dates'

export function isInbox(t: Task) {
  return !t.areaId && !t.projectId && !t.dueDate
}

export function isOverdue(t: Task, ref = today()) {
  return !t.done && !!t.dueDate && t.dueDate < ref
}

/** Hora primero, luego prioridad, luego orden manual */
export function sortTasks(a: Task, b: Task) {
  if (a.done !== b.done) return a.done - b.done
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate < b.dueDate ? -1 : 1
  }
  if (a.dueTime !== b.dueTime) {
    if (!a.dueTime) return 1
    if (!b.dueTime) return -1
    return a.dueTime < b.dueTime ? -1 : 1
  }
  if (a.priority !== b.priority) return b.priority - a.priority
  return a.order - b.order
}

export const PRIORITY_LABEL = ['Sin prioridad', 'Baja', 'Media', 'Alta'] as const
/** Monocromo: cuanto más importante, más contraste; la máxima, en azul */
export const PRIORITY_COLOR = ['var(--c-faint)', 'var(--c-muted)', 'var(--c-text)', 'var(--c-blue)'] as const

/** Fecha: azul si es hoy, texto fuerte si ya pasó, gris si viene */
export function dateColor(date: string | undefined, ref = today()) {
  if (!date) return 'var(--c-muted)'
  if (date === ref) return 'var(--c-blue)'
  if (date < ref) return 'var(--c-text)'
  return 'var(--c-muted)'
}
