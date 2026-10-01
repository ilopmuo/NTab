import type { Routine, RoutineRun } from '@/db/types'
import { addDaysYmd, fromYmd } from './dates'

export function routineToday(r: Pick<Routine, 'days'>, date: string) {
  return (r.days ?? []).includes(fromYmd(date).getDay())
}

/** Pasos hechos de los que existen hoy (si se borró un paso, no cuenta) */
export function routineProgress(r: Routine, run?: RoutineRun) {
  const ids = new Set(r.steps.map((s) => s.id))
  const done = (run?.done ?? []).filter((id) => ids.has(id)).length
  return { done, total: r.steps.length, complete: r.steps.length > 0 && done >= r.steps.length }
}

/** Días seguidos completada (solo cuentan los días que toca). Hoy sin terminar no rompe la racha. */
export function routineStreak(r: Routine, completed: Set<string>, today: string) {
  let n = 0
  let d = completed.has(today) ? today : addDaysYmd(today, -1)
  for (let i = 0; i < 730; i++) {
    if (routineToday(r, d)) {
      if (completed.has(d)) n++
      else break
    }
    d = addDaysYmd(d, -1)
  }
  return n
}

/** Minutos de los pasos (los que no tienen, no suman) */
export const stepsMinutes = (steps: Pick<Routine['steps'][number], 'minutes'>[]) => steps.reduce((n, s) => n + (s.minutes ?? 0), 0)

/** Minutos que quedan: los de los pasos sin hacer */
export function minutesLeft(r: Routine, run?: RoutineRun) {
  const done = new Set(run?.done ?? [])
  return stepsMinutes(r.steps.filter((s) => !done.has(s.id)))
}

/** «8:15»: a qué hora acabas si empiezas ahora */
export function finishAt(minutes: number, now = new Date()) {
  const end = new Date(now.getTime() + minutes * 60_000)
  return `${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}`
}

/** «15 min», «1 h 10 min» */
export function minutesLabel(m: number) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

/** «04:59» de una cuenta atrás en segundos */
export const clock = (secs: number) => `${String(Math.floor(Math.max(0, secs) / 60)).padStart(2, '0')}:${String(Math.max(0, secs) % 60).padStart(2, '0')}`

export const ROUTINE_PRESETS: { name: string; icon: string; time?: string; days?: number[]; steps: string[] }[] = [
  { name: 'Antes de salir de casa', icon: 'key', steps: ['Llaves', 'Cartera', 'Móvil y cargador', 'Gafas', 'Luces y fuegos apagados', 'Ventanas cerradas'] },
  { name: 'Rutina de mañana', icon: 'sun', time: '08:00', days: [1, 2, 3, 4, 5], steps: ['Beber un vaso de agua', 'Tomar la medicación', 'Mirar la agenda de hoy', 'Preparar la mochila'] },
  { name: 'Rutina de noche', icon: 'moon', time: '22:30', steps: ['Poner el móvil a cargar', 'Preparar la ropa de mañana', 'Revisar lo de mañana en LUNO', 'Poner la alarma'] },
  { name: 'Al llegar a casa', icon: 'home', steps: ['Llaves en su sitio', 'Vaciar los bolsillos', 'Cargar el móvil', 'Apuntar lo pendiente en LUNO'] },
]
