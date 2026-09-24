/**
 * «¿Qué hago ahora?»: de las tareas pendientes, cuál conviene hacer con el
 * tiempo y la energía que hay. Sin dependencias: lo usan la app y el conector.
 */
export interface SuggestTask {
  id: string
  title: string
  priority: number
  dueDate?: string
  dueTime?: string
  estimate?: number
  createdAt?: number
}

export type Energy = 'low' | 'normal' | 'high'

export interface Suggestion<T extends SuggestTask = SuggestTask> {
  task: T
  score: number
  minutes: number
  reasons: string[]
}

/** Si una tarea no tiene duración, se supone esto */
export const UNKNOWN_MINUTES = 20

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)

export function suggest<T extends SuggestTask>(
  tasks: T[],
  opts: { minutes: number; energy?: Energy; today: string; nowMin: number; now?: number },
): Suggestion<T>[] {
  const { minutes, energy = 'normal', today, nowMin } = opts
  const out: Suggestion<T>[] = []
  for (const t of tasks) {
    // Lo de otros días no se propone
    if (t.dueDate && t.dueDate > today) continue
    const len = t.estimate ?? UNKNOWN_MINUTES
    if (len > minutes) continue
    // Con hora más tarde (fuera de este rato), mejor a su hora
    if (t.dueDate === today && t.dueTime && toMin(t.dueTime) > nowMin + minutes) continue
    let score = 0
    const reasons: string[] = []
    if (t.dueDate && t.dueDate < today) {
      const late = daysBetween(t.dueDate, today)
      score += 40 + Math.min(late, 10) * 3
      reasons.push(late === 1 ? 'Atrasada desde ayer' : `Atrasada ${late} días`)
    } else if (t.dueDate === today) {
      score += 30
      if (t.dueTime && toMin(t.dueTime) <= nowMin + 15) {
        score += 25
        reasons.push(toMin(t.dueTime) <= nowMin ? `Era a las ${t.dueTime}` : `Es a las ${t.dueTime}`)
      } else reasons.push('Para hoy')
    } else if (t.createdAt && opts.now) {
      // Sin fecha: cuanto más tiempo lleva esperando, un poco más arriba
      score += Math.min(10, Math.floor((opts.now - t.createdAt) / 864e5 / 3))
    }
    if (t.priority) {
      score += t.priority * 15
      reasons.push(['', 'Prioridad baja', 'Prioridad media', 'Prioridad alta'][t.priority] ?? '')
    }
    // Energía: con poca, lo corto; con mucha, lo gordo e importante
    if (energy === 'low') score += Math.max(0, 60 - len) / 3
    if (energy === 'high') score += len / 6 + t.priority * 5
    // Aprovechar el rato: mejor lo que lo llena que lo que sobra mucho
    score += (10 * len) / minutes
    reasons.push(t.estimate ? `Cabe: ${t.estimate} min` : 'Algo rápido')
    out.push({ task: t, score, minutes: len, reasons: reasons.filter(Boolean) })
  }
  return out.sort((a, b) => b.score - a.score)
}
