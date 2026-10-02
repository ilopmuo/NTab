/**
 * Hitos de racha (como Duolingo o los premios de Fitness): se celebran al
 * llegar, no al volver a la pantalla ni al deshacer y rehacer el mismo día.
 */
export const DAY_MILESTONES = [7, 30, 100, 365]
export const WEEK_MILESTONES = [4, 12, 26, 52]

export interface Milestone {
  n: number
  weekly: boolean
  title: string
  hint: string
}

const DAYS: Record<number, [string, string]> = {
  7: ['Una semana entera', 'Lo difícil es empezar, y ya lo has hecho.'],
  30: ['Un mes seguido', 'Ya no es un propósito: es parte de tus días.'],
  100: ['Cien días', 'Pocas cosas se sostienen tanto. Esta sí.'],
  365: ['Un año entero', 'Un año, día a día. Enhorabuena.'],
}
const WEEKS: Record<number, [string, string]> = {
  4: ['Un mes cumpliendo', 'Cuatro semanas seguidas llegando a lo que te propusiste.'],
  12: ['Tres meses', 'Doce semanas sin fallar. Esto ya es tuyo.'],
  26: ['Medio año', 'Veintiséis semanas seguidas. Muy pocos llegan aquí.'],
  52: ['Un año entero', 'Cincuenta y dos semanas. Enhorabuena.'],
}

/** El hito alcanzado al pasar de `prev` a `next` (solo si la racha sube justo hasta él) */
export function reachedMilestone(prev: number, next: number, weekly: boolean): Milestone | null {
  if (next <= prev) return null
  const list = weekly ? WEEK_MILESTONES : DAY_MILESTONES
  const n = [...list].reverse().find((m) => prev < m && next >= m)
  if (n === undefined || next !== n) return null
  const [title, hint] = (weekly ? WEEKS : DAYS)[n]
  return { n, weekly, title, hint }
}

/** Clave para no repetir la misma celebración el mismo día */
export const milestoneKey = (habitId: string, n: number, date: string) => `${habitId}:${n}:${date}`
