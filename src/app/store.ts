import { useSyncExternalStore } from 'react'
import type { Task } from '@/db/types'

export interface ToastAction {
  label: string
  run: () => void
}

export interface UIState {
  selectedTaskId: string | null
  quickAdd: { open: boolean; defaults?: Partial<Task>; text?: string }
  paletteOpen: boolean
  helpOpen: boolean
  sidebarOpen: boolean
  /** en el ordenador, barra lateral plegada (se recuerda en este dispositivo) */
  sidebarHidden: boolean
  /** editor de la barra lateral o de las pestañas del móvil */
  navEditor: 'sidebar' | 'tabs' | null
  /** abre el formulario de creación de la vista correspondiente */
  creating: 'project' | 'habit' | 'person' | 'area' | 'goal' | 'subscription' | 'template' | 'routine' | 'thing' | 'tracker' | 'shopping' | null
  toast: { id: number; message: string; actions: ToastAction[]; icon: 'check' | 'bell'; onClick?: () => void; duration: number } | null
}

function readSidebarHidden() {
  try {
    return localStorage.getItem('ntab-sidebar-hidden') === '1'
  } catch {
    return false
  }
}

let state: UIState = {
  selectedTaskId: null,
  quickAdd: { open: false },
  paletteOpen: false,
  helpOpen: false,
  sidebarOpen: false,
  sidebarHidden: readSidebarHidden(),
  navEditor: null,
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
  /** Pliega o despliega la barra lateral del ordenador */
  toggleSidebarHidden: () => {
    const hidden = !state.sidebarHidden
    try {
      localStorage.setItem('ntab-sidebar-hidden', hidden ? '1' : '0')
    } catch {
      /* solo en memoria */
    }
    setUI({ sidebarHidden: hidden })
  },
  navEditor: (mode: UIState['navEditor']) => setUI({ navEditor: mode, sidebarOpen: false, paletteOpen: false }),
  create: (what: UIState['creating']) => setUI({ creating: what, paletteOpen: false }),
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
export function toast(
  message: string,
  action?: ToastAction | ToastAction[],
  durationMs = 4000,
  opts: { icon?: 'check' | 'bell'; onClick?: () => void } = {},
) {
  clearTimeout(toastTimer)
  const id = Date.now()
  const actions = action ? (Array.isArray(action) ? action : [action]) : []
  setUI({ toast: { id, message, actions, icon: opts.icon ?? 'check', onClick: opts.onClick, duration: durationMs } })
  toastTimer = setTimeout(() => setUI((s) => (s.toast?.id === id ? { toast: null } : {})), durationMs)
}
