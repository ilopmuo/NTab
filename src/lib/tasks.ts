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

// ── Orden manual ──────────────────────────────────────────────

/** Separación entre tareas al numerar una lista de nuevo */
export const ORDER_STEP = 1024

/** Posición de la tarea en una lista ordenada a mano (cada lista tiene la suya) */
export const orderIn = (t: Pick<Task, 'order' | 'orders'>, list: string) => t.orders?.[list] ?? t.order

/** Orden manual de una lista: las completadas al final y, si no, el orden en que las dejaste */
export function sortManual(list: string) {
  return (a: Task, b: Task) => {
    if (a.done !== b.done) return a.done - b.done
    return orderIn(a, list) - orderIn(b, list) || a.createdAt - b.createdAt
  }
}

type Ordered = { id: string; order: number }

/** Numera la lista tal y como se ve ahora (al pasar a orden manual, para que nada salte) */
export function renumber(list: Ordered[]): Ordered[] {
  if (!list.length) return []
  const base = Math.min(...list.map((t) => t.order))
  return list.map((t, i) => ({ id: t.id, order: base + i * ORDER_STEP })).filter((u, i) => u.order !== list[i].order)
}

/**
 * Qué `order` guardar después de mover `movedId` a su nueva posición en `list`
 * (ya reordenada). Normalmente solo cambia la tarea movida, a medio camino entre
 * sus vecinas; si no cabe (empate o sin precisión), se numera la lista entera.
 */
export function reorderUpdates(list: Ordered[], movedId: string): Ordered[] {
  const i = list.findIndex((t) => t.id === movedId)
  if (i < 0) return []
  const cur = list[i].order
  const prev = list[i - 1]?.order
  const next = list[i + 1]?.order
  // Ya está bien colocada
  if ((prev === undefined || prev < cur) && (next === undefined || cur < next)) return []
  let order: number | undefined
  if (prev === undefined && next !== undefined) order = next - ORDER_STEP
  else if (next === undefined && prev !== undefined) order = prev + ORDER_STEP
  else if (prev !== undefined && next !== undefined && prev < next) {
    const mid = (prev + next) / 2
    if (mid > prev && mid < next) order = mid
  }
  return order === undefined ? renumber(list) : [{ id: movedId, order }]
}

/** Mueve un elemento de `from` a `to` (para mover con el teclado) */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item)
  return next
}
