/**
 * Historial de un objetivo con cifra («Leer 12 libros»): una anotación por día
 * con la cifra de ese día (la última). Lo usan la app (src/lib/goals.ts) y el
 * conector de Claude, sin dependencias.
 */
export interface GoalPoint {
  /** YYYY-MM-DD */
  date: string
  value: number
}

/** Apunta la cifra del día (sustituye la de ese mismo día) y guarda como mucho las últimas `max` */
export function logGoal(log: GoalPoint[] | undefined, date: string, value: number, max = 400): GoalPoint[] {
  return [...(log ?? []).filter((p) => p.date !== date), { date, value }].sort((a, b) => a.date.localeCompare(b.date)).slice(-max)
}

/** Cuánto ha cambiado desde `since` (la última cifra de ese día o anterior; si no hay, la primera) */
export function goalChange(log: GoalPoint[] | undefined, since: string): number | undefined {
  if (!log?.length) return undefined
  const before = [...log].reverse().find((p) => p.date <= since) ?? log[0]
  return log[log.length - 1].value - before.value
}
