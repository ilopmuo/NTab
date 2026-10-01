/**
 * Funciones apagadas (ajuste `features`, ver src/lib/features.ts): sus avisos
 * no se envían. Tabla de la sincronización → función de la que depende.
 */
export const REMINDER_FEATURE: Record<string, string> = {
  habits: 'habits',
  routines: 'routines',
  journal: 'journal',
  trackers: 'trackers',
  things: 'things',
  subscriptions: 'finance',
}

/** ¿Se puede enviar un aviso de la tabla `tbl` con estas funciones? */
export function reminderAllowed(flags: Record<string, unknown> | null | undefined, tbl: string) {
  const f = REMINDER_FEATURE[tbl]
  return !f || flags?.[f] !== false
}
