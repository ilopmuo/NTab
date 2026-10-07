import { useSyncExternalStore } from 'react'

// El estado del foco, aparte de sus acciones: la app lo mira al arrancar
// (para esconder la barra) sin traer todo el temporizador

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

/** La sesión de ahora (en vivo para quien la importa) */
export let session: FocusSession | null = load()
const listeners = new Set<() => void>()
export function set(next: FocusSession | null) {
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
