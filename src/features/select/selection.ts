import { useSyncExternalStore } from 'react'

/**
 * Selección múltiple de tareas. Se entra con el botón «Seleccionar» de las
 * listas o con Ctrl/⌘ + clic en una tarea; mientras está activa, tocar una
 * tarea la marca en vez de abrirla.
 */
interface State {
  active: boolean
  ids: ReadonlySet<string>
}

let state: State = { active: false, ids: new Set() }
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const selection = {
  get: () => state,
  start: (id?: string) => set({ active: true, ids: new Set(id ? [id] : []) }),
  toggle: (id: string) => {
    const ids = new Set(state.ids)
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    set({ active: true, ids })
  },
  setAll: (ids: string[]) => set({ active: true, ids: new Set(ids) }),
  clear: () => state.active && set({ active: false, ids: new Set() }),
}

export function useSelection() {
  return useSyncExternalStore(subscribe, () => state)
}
export function useSelecting() {
  return useSyncExternalStore(subscribe, () => state.active)
}
export function useIsPicked(id: string) {
  return useSyncExternalStore(subscribe, () => state.ids.has(id))
}

/** Ids de las tareas que se ven ahora en pantalla (para «Todas») */
export function visibleTaskIds(): string[] {
  const els = document.querySelectorAll<HTMLElement>('#main [data-task-id]')
  return [...new Set([...els].map((e) => e.dataset.taskId!))]
}
