import { useSyncExternalStore } from 'react'
import type { Task } from '@/db/types'

export interface UIState {
  selectedTaskId: string | null
  quickAdd: { open: boolean; defaults?: Partial<Task>; text?: string }
  paletteOpen: boolean
  helpOpen: boolean
  sidebarOpen: boolean
  /** abre el formulario de creación de la vista correspondiente */
  creating: 'project' | 'habit' | 'person' | 'area' | 'goal' | 'subscription' | null
  toast: { id: number; message: string; action?: { label: string; run: () => void } } | null
}

let state: UIState = {
  selectedTaskId: null,
  quickAdd: { open: false },
  paletteOpen: false,
  helpOpen: false,
  sidebarOpen: false,
  creating: null,
  toast: null,
}
const listeners = new Set<() => void>()

export function setUI(patch: Partial<UIState> | ((s: UIState) => Partial<UIState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}

export function getUI() {
  return state
}

export function useUI<T>(select: (s: UIState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => select(state),
  )
}

export const ui = {
  openTask: (id: string) => setUI({ selectedTaskId: id }),
  closeTask: () => setUI({ selectedTaskId: null }),
  quickAdd: (defaults?: Partial<Task>, text?: string) => setUI({ quickAdd: { open: true, defaults, text }, paletteOpen: false }),
  closeQuickAdd: () => setUI({ quickAdd: { open: false } }),
  palette: (open = true) => setUI({ paletteOpen: open }),
  help: (open = true) => setUI({ helpOpen: open }),
  sidebar: (open: boolean) => setUI({ sidebarOpen: open }),
  create: (what: UIState['creating']) => setUI({ creating: what, paletteOpen: false }),
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(message: string, action?: { label: string; run: () => void }, durationMs = 4000) {
  clearTimeout(toastTimer)
  const id = Date.now()
  setUI({ toast: { id, message, action } })
  toastTimer = setTimeout(() => setUI((s) => (s.toast?.id === id ? { toast: null } : {})), durationMs)
}
