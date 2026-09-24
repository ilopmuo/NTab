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

export const ROUTINE_PRESETS: { name: string; icon: string; time?: string; days?: number[]; steps: string[] }[] = [
  { name: 'Antes de salir de casa', icon: 'key', steps: ['Llaves', 'Cartera', 'Móvil y cargador', 'Gafas', 'Luces y fuegos apagados', 'Ventanas cerradas'] },
  { name: 'Rutina de mañana', icon: 'sun', time: '08:00', days: [1, 2, 3, 4, 5], steps: ['Beber un vaso de agua', 'Tomar la medicación', 'Mirar la agenda de hoy', 'Preparar la mochila'] },
  { name: 'Rutina de noche', icon: 'moon', time: '22:30', steps: ['Poner el móvil a cargar', 'Preparar la ropa de mañana', 'Revisar lo de mañana en NTab', 'Poner la alarma'] },
  { name: 'Al llegar a casa', icon: 'home', steps: ['Llaves en su sitio', 'Vaciar los bolsillos', 'Cargar el móvil', 'Apuntar lo pendiente en NTab'] },
]
