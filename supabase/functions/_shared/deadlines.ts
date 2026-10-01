/**
 * Avisos de fecha límite: la víspera y el mismo día, a la hora elegida (por
 * defecto, a las 9). Ajuste `deadlineAlerts` = { enabled, time } (sin él,
 * encendido). Lo usan la app (avisos con la app abierta) y el servidor (push),
 * sin dependencias.
 */
export type DeadlineAlert = 'today' | 'tomorrow'

export const DEADLINE_ALERT_TIME = '09:00'

export interface DeadlineAlertPrefs {
  enabled?: boolean
  time?: string
}

/** ¿Toca avisar de esta fecha límite hoy? (`today` y `tomorrow` como YYYY-MM-DD) */
export function deadlineAlert(deadline: string | undefined | null, today: string, tomorrow: string): DeadlineAlert | null {
  if (deadline === today) return 'today'
  if (deadline === tomorrow) return 'tomorrow'
  return null
}

export function deadlineMessage(kind: DeadlineAlert): string {
  return kind === 'today' ? 'Hoy es la fecha límite.' : 'Mañana es la fecha límite. ¿La dejas hecha hoy?'
}
