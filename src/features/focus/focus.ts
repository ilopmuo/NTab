import { useSyncExternalStore } from 'react'
import { db } from '@/db/db'
import { uid } from '@/lib/id'
import { ymd } from '@/lib/dates'

/** Foco o descanso (corto tras cada pomodoro, largo cada cuatro) */
export type Phase = 'focus' | 'short' | 'long'

/**
 * Sesión de foco: una tarea (o una intención, en el foco libre) y un
 * temporizador, con sus descansos. Se guarda el momento de fin (no los
 * segundos que quedan), así sigue bien aunque la app pase a segundo plano o
 * se recargue. Es de este dispositivo: no se sincroniza.
 */
export interface FocusSession {
  taskId?: string
  /** foco libre: en qué te vas a concentrar */
  intention?: string
  /** sin fase: foco (sesiones de antes) */
  phase?: Phase
  /** minutos elegidos para esta fase */
  minutes: number
  /** minutos de foco elegidos (para volver tras el descanso) */
  focusLen?: number
  /** pomodoros completos seguidos (para el descanso largo) */
  rounds?: number
  /** cosas apuntadas para luego en esta sesión */
  distractions?: number
  /** última entrada del historial (para valorarla) */
  lastLogId?: string
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

export const isBreak = (s: Pick<FocusSession, 'phase'>) => s.phase === 'short' || s.phase === 'long'

export const focus = {
  open(taskId: string, minutes = 25) {
    if (session?.taskId === taskId) return set({ ...session, minimized: false })
    set({ taskId, minutes, focusLen: minutes, left: minutes * 60_000, minimized: false })
  },
  /** Foco sin tarea, con lo que quieras hacer (como la intención de Session) */
  openFree(intention: string, minutes = 25) {
    set({ intention: intention.trim() || undefined, minutes, focusLen: minutes, left: minutes * 60_000, minimized: false })
  },
  setMinutes(minutes: number) {
    if (!session || session.endAt) return
    set({ ...session, minutes, focusLen: isBreak(session) ? session.focusLen : minutes, left: minutes * 60_000, finished: false })
  },
  /** Descanso (lo que dure) tras un pomodoro: no cuenta como foco */
  startBreak(phase: 'short' | 'long', minutes: number) {
    if (!session) return
    const now = Date.now()
    set({ ...session, phase, minutes, endAt: now + minutes * 60_000, left: undefined, finished: false, spent: 0, logged: 0, runStart: undefined, distractions: 0 })
  },
  /** Otro pomodoro (tras el descanso o en vez de él) */
  nextFocus() {
    if (!session) return
    const minutes = session.focusLen ?? 25
    const now = Date.now()
    // Tras el descanso largo se empieza otra tanda de cuatro
    const rounds = session.phase === 'long' ? 0 : session.rounds
    set({ ...session, phase: 'focus', minutes, rounds, endAt: now + minutes * 60_000, left: undefined, finished: false, spent: 0, logged: 0, runStart: now, distractions: 0 })
  },
  /** Algo apuntado para luego sin dejar el foco */
  distracted() {
    if (session) set({ ...session, distractions: (session.distractions ?? 0) + 1 })
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
  /** Fin del temporizador: un pomodoro más si era foco */
  finish() {
    if (!session) return
    const end = session.endAt ?? Date.now()
    const rounds = isBreak(session) ? session.rounds : (session.rounds ?? 0) + 1
    set({ ...session, endAt: undefined, left: 0, finished: true, spent: spentMs(session, end), runStart: undefined, rounds })
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
 * a un minuto). Se llama al terminar, al salir y al completar la tarea. Los
 * descansos no cuentan.
 */
export async function logFocus(title: string) {
  if (!session || isBreak(session)) return
  const total = spentMs(session)
  const pending = total - (session.logged ?? 0)
  if (pending < 60_000) return
  const id = uid()
  const s = session
  set({ ...s, logged: total, lastLogId: id })
  await db.focusLogs.add({
    id,
    ...(s.taskId ? { taskId: s.taskId } : {}),
    title,
    date: ymd(new Date()),
    minutes: Math.round(pending / 60_000),
    endedAt: Date.now(),
    ...(s.finished ? { pomodoro: true } : {}),
    ...(s.distractions ? { distractions: s.distractions } : {}),
  })
}

/** Cómo ha ido la última sesión apuntada */
export async function rateFocus(rating: 1 | 2 | 3) {
  if (session?.lastLogId) await db.focusLogs.update(session.lastLogId, { rating })
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
