import { useSyncExternalStore } from 'react'

/**
 * Sesión de foco: una tarea y un temporizador. Se guarda el momento de fin (no
 * los segundos que quedan), así sigue bien aunque la app pase a segundo plano o
 * se recargue. Es de este dispositivo: no se sincroniza.
 */
export interface FocusSession {
  taskId: string
  /** minutos elegidos */
  minutes: number
  /** fin (ms) si está en marcha */
  endAt?: number
  /** ms que quedaban al pausar */
  left?: number
  /** pantalla completa o minimizada en una cápsula */
  minimized: boolean
  /** ya ha sonado el final */
  finished?: boolean
}

const KEY = 'ntab-focus'
function load(): FocusSession | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as FocusSession | null
  } catch {
    return null
  }
}

let session: FocusSession | null = load()
const listeners = new Set<() => void>()
function set(next: FocusSession | null) {
  session = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* sin almacenamiento */
  }
  listeners.forEach((l) => l())
}

export function useFocus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => session,
  )
}

export const DURATIONS = [15, 25, 50]

export const focus = {
  open(taskId: string, minutes = 25) {
    if (session?.taskId === taskId) return set({ ...session, minimized: false })
    set({ taskId, minutes, left: minutes * 60_000, minimized: false })
  },
  setMinutes(minutes: number) {
    if (!session || session.endAt) return
    set({ ...session, minutes, left: minutes * 60_000, finished: false })
  },
  start() {
    if (!session) return
    set({ ...session, endAt: Date.now() + (session.left ?? session.minutes * 60_000), left: undefined, finished: false })
  },
  pause() {
    if (!session?.endAt) return
    set({ ...session, left: Math.max(0, session.endAt - Date.now()), endAt: undefined })
  },
  addMinutes(n: number) {
    if (!session) return
    if (session.endAt) set({ ...session, endAt: Math.max(session.endAt, Date.now()) + n * 60_000, finished: false })
    else set({ ...session, left: (session.left ?? 0) + n * 60_000, finished: false })
  },
  finish() {
    if (session) set({ ...session, endAt: undefined, left: 0, finished: true })
  },
  minimize(min = true) {
    if (session) set({ ...session, minimized: min })
  },
  close() {
    set(null)
  },
}

/** ms que quedan */
export function remaining(s: FocusSession, now = Date.now()) {
  if (s.endAt) return Math.max(0, s.endAt - now)
  return s.left ?? s.minutes * 60_000
}

export function clock(ms: number) {
  const total = Math.ceil(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
