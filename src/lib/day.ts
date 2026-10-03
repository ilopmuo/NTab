import { ymd } from './dates'

// La misma lógica que supabase/functions/_shared/day.ts (la usa el conector de
// Claude), copiada aquí a propósito: importar de _shared desde el arranque hace
// que el empaquetador parta la app en muchos trozos (+8 KB). day.test.ts
// comprueba que las dos versiones dicen lo mismo.

/** YYYY-MM-DD + n días (aquí, para no arrastrar time.ts al arranque de la app) */
function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Lo importante de cada día: como mucho tres (los «objetivos» de Sunsama) */
export const MAX_IMPORTANT = 3

/** Desde cuántas veces pospuesta se propone dejarla para algún día */
export const STUCK = 3

/**
 * ¿Este cambio de fecha es posponer? Lo es mover hacia delante una tarea que
 * ya tocaba (hoy o antes) y que no está hecha. Las que se repiten no cuentan:
 * sus fechas avanzan solas.
 */
export function isPostpone(task: { done?: number | boolean; dueDate?: string; recurrence?: unknown; waitingFor?: string }, next: string | undefined, today: string): boolean {
  // Volver a preguntar más tarde por lo que esperas de alguien no es posponer
  return !task.done && !task.recurrence && !task.waitingFor && !!task.dueDate && task.dueDate <= today && !!next && next > task.dueDate
}

/** «Pospuesta 4 veces» a partir de 3: la que se arrastra día tras día */
export const isStuck = (t: { postponed?: number }) => (t.postponed ?? 0) >= STUCK

export const postponedLabel = (n: number) => (n === 1 ? 'Pospuesta 1 vez' : `Pospuesta ${n} veces`)

/** Ajuste `dailyGoal`: cuántas tareas al día (como el objetivo diario de Todoist) y los días libres */
export interface DailyGoal {
  tasks: number
  /** días de la semana (0 domingo … 6 sábado) que no cuentan ni rompen la racha */
  daysOff?: number[]
}

/** Cuántas veces sale cada día (YYYY-MM-DD) */
export function countByDay(days: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const d of days) map.set(d, (map.get(d) ?? 0) + 1)
  return map
}

const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay()

/**
 * Racha de días seguidos cumpliendo el objetivo, hasta hoy. Si hoy aún no se ha
 * cumplido, cuenta hasta ayer (el día no ha acabado). Los días libres se saltan
 * sin romperla. También la mejor racha de los días que hay.
 */
export function goalStreak(byDay: Map<string, number>, goal: DailyGoal, today: string, maxDays = 400) {
  const off = new Set(goal.daysOff ?? [])
  const met = (d: string) => (byDay.get(d) ?? 0) >= goal.tasks
  let current = 0
  let d = met(today) ? today : addDays(today, -1)
  for (let i = 0; i < maxDays; i++, d = addDays(d, -1)) {
    if (off.has(weekday(d)) && !met(d)) continue
    if (!met(d)) break
    current++
  }
  let best = current
  let run = 0
  d = addDays(today, -maxDays)
  for (let i = 0; i <= maxDays; i++, d = addDays(d, 1)) {
    if (met(d)) best = Math.max(best, ++run)
    else if (!off.has(weekday(d)) && d !== today) run = 0
  }
  return { current, best, today: byDay.get(today) ?? 0, dayOff: off.has(weekday(today)) }
}

/** Tareas completadas por día (en la hora del dispositivo) */
export const doneByDay = (completedAt: number[]) => countByDay(completedAt.map((at) => ymd(new Date(at))))
