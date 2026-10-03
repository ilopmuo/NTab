import { useSyncExternalStore } from 'react'
import type { Task } from '@/db/types'

/**
 * El menú contextual de una tarea (pulsación larga en el móvil, clic derecho
 * en el ordenador). Aquí solo su estado: el menú se carga aparte la primera
 * vez que se abre (ver App → Panels).
 */
export interface TaskMenuState {
  task: Task
  /** dónde está la fila (para levantarla y poner el menú debajo) */
  rect: { top: number; left: number; width: number; height: number }
  /** con ratón, donde se hizo clic (el menú sale ahí, sin levantar la fila) */
  at?: { x: number; y: number }
}

let state: TaskMenuState | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const taskMenu = {
  open(next: TaskMenuState) {
    state = next
    emit()
  },
  close() {
    if (!state) return
    state = null
    emit()
  },
  isOpen: () => !!state,
}

export function useTaskMenu() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => state,
  )
}
