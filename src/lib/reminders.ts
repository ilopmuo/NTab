import type { Reminder, Task } from '@/db/types'
import { fromYmd } from './dates'

/** Hora de referencia para tareas con fecha pero sin hora */
export const DEFAULT_REMIND_TIME = '09:00'

/** Momento (ms) de la fecha y hora de una tarea en la zona horaria del dispositivo */
export function dueMoment(dueDate: string, dueTime = DEFAULT_REMIND_TIME): number {
  const d = fromYmd(dueDate)
  const [h, m] = dueTime.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/** Calcula cuándo avisar. `undefined` si no hay aviso o falta la fecha. */
export function computeRemindAt(t: Pick<Task, 'reminder' | 'dueDate' | 'dueTime'>): number | undefined {
  const r = t.reminder
  if (!r) return undefined
  if ('at' in r) return r.at
  if (!t.dueDate) return undefined
  return dueMoment(t.dueDate, t.dueTime) - r.before * 60_000
}

/** El aviso automático: a la hora de las tareas que tienen hora */
export function withDefaultReminder<T extends Pick<Task, 'reminder' | 'dueTime'>>(t: T, auto: boolean): T {
  if (auto && t.dueTime && t.reminder === undefined) return { ...t, reminder: { before: 0 } }
  return t
}

export const REMINDER_OPTIONS: { value: string; label: string; reminder: Reminder | null }[] = [
  { value: 'none', label: 'Sin aviso', reminder: null },
  { value: '0', label: 'A la hora', reminder: { before: 0 } },
  { value: '5', label: '5 minutos antes', reminder: { before: 5 } },
  { value: '15', label: '15 minutos antes', reminder: { before: 15 } },
  { value: '30', label: '30 minutos antes', reminder: { before: 30 } },
  { value: '60', label: '1 hora antes', reminder: { before: 60 } },
  { value: '120', label: '2 horas antes', reminder: { before: 120 } },
  { value: '1440', label: '1 día antes', reminder: { before: 1440 } },
]

export function reminderValue(r: Reminder | null | undefined): string {
  if (!r) return 'none'
  if ('at' in r) return 'custom'
  return String(r.before)
}

export function reminderLabel(r: Reminder | null | undefined): string | undefined {
  if (!r) return undefined
  if ('at' in r) {
    return new Date(r.at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return REMINDER_OPTIONS.find((o) => o.value === String(r.before))?.label ?? `${r.before} minutos antes`
}

// ── Avisos insistentes ────────────────────────────────────────

/** Repeticiones como mucho (con 10 min, dos horas insistiendo) */
export const NAG_MAX = 12

export const NAG_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: 'Cada 5 minutos' },
  { value: 10, label: 'Cada 10 minutos' },
  { value: 15, label: 'Cada 15 minutos' },
  { value: 30, label: 'Cada 30 minutos' },
  { value: 60, label: 'Cada hora' },
]

export function nagLabel(nag: number) {
  return NAG_OPTIONS.find((o) => o.value === nag)?.label.toLowerCase() ?? `cada ${nag} minutos`
}

/**
 * Última repetición que ya toca (1 = la primera tras el aviso) y su momento.
 * La misma cuenta la hace el servidor en `due_nags()`.
 */
export function nagSlot(remindAt: number, nag: number, now: number): { n: number; at: number } | null {
  if (!(nag >= 1) || now <= remindAt) return null
  const step = nag * 60_000
  const n = Math.floor((now - remindAt) / step)
  if (n < 1 || n > NAG_MAX) return null
  return { n, at: remindAt + n * step }
}
