import { useSyncExternalStore } from 'react'
import { db } from '@/db/db'
import { uid } from '@/lib/id'
import { ymd } from '@/lib/dates'

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
  /** ms de foco acumulados en tramos anteriores (sin contar el tramo en marcha) */
  spent?: number
  /** inicio del tramo en marcha */
  runStart?: number
  /** ms ya apuntados en el historial de foco */
  logged?: number
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
    const now = Date.now()
    set({ ...session, endAt: now + (session.left ?? session.minutes * 60_000), left: undefined, finished: false, runStart: now })
  },
  pause() {
    if (!session?.endAt) return
    const now = Date.now()
    set({ ...session, left: Math.max(0, session.endAt - now), endAt: undefined, spent: spentMs(session, now), runStart: undefined })
  },
  addMinutes(n: number) {
    if (!session) return
    if (session.endAt) set({ ...session, endAt: Math.max(session.endAt, Date.now()) + n * 60_000, finished: false })
    else set({ ...session, left: (session.left ?? 0) + n * 60_000, finished: false })
  },
  finish() {
    if (!session) return
    const end = session.endAt ?? Date.now()
    set({ ...session, endAt: undefined, left: 0, finished: true, spent: spentMs(session, end), runStart: undefined })
  },
  minimize(min = true) {
    if (session) set({ ...session, minimized: min })
  },
  close() {
    set(null)
  },
}

/** ms de foco hasta `now` (tramos anteriores + el que está en marcha) */
export function spentMs(s: FocusSession, now = Date.now()) {
  const running = s.runStart && s.endAt ? Math.max(0, Math.min(now, s.endAt) - s.runStart) : 0
  return (s.spent ?? 0) + running
}

/**
 * Apunta en el historial lo que se ha enfocado desde la última vez (si llega
 * a un minuto). Se llama al terminar, al salir y al completar la tarea.
 */
export async function logFocus(title: string) {
  if (!session) return
  const total = spentMs(session)
  const pending = total - (session.logged ?? 0)
  if (pending < 60_000) return
  set({ ...session, logged: total })
  await db.focusLogs.add({ id: uid(), taskId: session.taskId, title, date: ymd(new Date()), minutes: Math.round(pending / 60_000), endedAt: Date.now() })
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
