/**
 * Cómo va un proyecto, para que ninguno se quede olvidado (la revisión de
 * GTD, hecha sola): si va con retraso o justo para su fecha límite, si no
 * tiene siguiente paso, si ya está todo hecho o si lleva días parado. Lo
 * usan la app (Proyectos, Planificar, la revisión) y el servidor (Claude y
 * Siri). Sin dependencias.
 */
import { diffDays } from './time.ts'

export interface HealthTask {
  done: number | boolean
  completedAt?: number
  createdAt: number
  someday?: boolean
  waitingFor?: string
}

export interface HealthProject {
  status: string
  deadline?: string
  createdAt: number
}

export type Health =
  /** se pasó la fecha límite con cosas pendientes */
  | { kind: 'late'; days: number; open: number }
  /** la fecha límite se acerca y queda mucho */
  | { kind: 'atRisk'; daysLeft: number; open: number }
  /** todo hecho: ¿se da por terminado? */
  | { kind: 'finished' }
  /** nada que hacer ahora (sin tareas, o todo a la espera o para algún día) */
  | { kind: 'noNext' }
  /** nada hecho ni añadido en días */
  | { kind: 'stalled'; days: number }
  | { kind: 'ok' }

/** A partir de cuántos días sin movimiento un proyecto está parado */
export const STALLED_DAYS = 14

/**
 * `dayOf` pasa un instante (ms) a su día (YYYY-MM-DD) en la zona del usuario.
 * Solo se miran los proyectos activos: los pausados y terminados no avisan.
 */
export function projectHealth(p: HealthProject, tasks: HealthTask[], today: string, dayOf: (ms: number) => string): Health {
  if (p.status !== 'active') return { kind: 'ok' }
  const open = tasks.filter((t) => !t.done)
  const actionable = open.filter((t) => !t.someday && !t.waitingFor)
  if (p.deadline && open.length) {
    const left = diffDays(p.deadline, today)
    if (left < 0) return { kind: 'late', days: -left, open: open.length }
    // Más de una tarea por día que queda, o los últimos tres días
    if ((left <= 14 && open.length > Math.max(1, left)) || left <= 3) return { kind: 'atRisk', daysLeft: left, open: open.length }
  }
  if (tasks.length && !open.length) return { kind: 'finished' }
  if (!actionable.length) return { kind: 'noNext' }
  const last = Math.max(p.createdAt, ...tasks.map((t) => Math.max(t.createdAt, t.completedAt ?? 0)))
  const days = diffDays(today, dayOf(last))
  if (days >= STALLED_DAYS) return { kind: 'stalled', days }
  return { kind: 'ok' }
}

/** En pocas palabras, para una etiqueta o para leer en voz alta */
export function healthLabel(h: Health): string | undefined {
  switch (h.kind) {
    case 'late':
      return `Fecha límite pasada hace ${h.days === 1 ? '1 día' : `${h.days} días`} · quedan ${h.open}`
    case 'atRisk':
      return h.daysLeft === 0 ? `Fecha límite hoy · quedan ${h.open}` : `Faltan ${h.daysLeft === 1 ? '1 día' : `${h.daysLeft} días`} · quedan ${h.open}`
    case 'finished':
      return 'Todo hecho: ¿lo terminas?'
    case 'noNext':
      return 'Sin siguiente paso'
    case 'stalled':
      return `Parado ${h.days} días`
    default:
      return undefined
  }
}

/** Lo que pide atención antes (para ordenar y para los avisos) */
export const healthRank: Record<Health['kind'], number> = { late: 5, atRisk: 4, finished: 3, noNext: 2, stalled: 1, ok: 0 }
