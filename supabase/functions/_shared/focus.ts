/**
 * Foco: ciclos de pomodoro con descansos, objetivo diario con su racha y las
 * horas en que mejor te concentras. Sin dependencias: lo usan la app
 * (src/lib/focusStats.ts) y el conector de Claude.
 */

/** YYYY-MM-DD + n días */
function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Una sesión del historial de foco */
export interface FocusLogLike {
  /** YYYY-MM-DD (del dispositivo) */
  date: string
  minutes: number
  endedAt: number
  taskId?: string
  title?: string
  /** 1 me ha costado · 2 normal · 3 muy concentrado */
  rating?: number
  /** el temporizador llegó al final (un pomodoro completo) */
  pomodoro?: boolean
  /** cosas apuntadas para luego durante la sesión */
  distractions?: number
}

/** Descanso corto tras cada foco y largo cada cuatro (la técnica Pomodoro) */
export const SHORT_BREAK = 5
export const LONG_BREAK = 15
export const LONG_EVERY = 4

/** El descanso que toca tras `rounds` focos completos seguidos */
export function breakAfter(rounds: number): { phase: 'short' | 'long'; minutes: number } {
  return rounds > 0 && rounds % LONG_EVERY === 0 ? { phase: 'long', minutes: LONG_BREAK } : { phase: 'short', minutes: SHORT_BREAK }
}

/** Cómo ha ido la sesión (la reflexión al acabar de Session) */
export const RATINGS = [
  { value: 1, label: 'Me ha costado' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'Muy concentrado' },
] as const

/** Minutos de foco por día */
export function minutesByDay(logs: FocusLogLike[]): Map<string, number> {
  const by = new Map<string, number>()
  for (const l of logs) by.set(l.date, (by.get(l.date) ?? 0) + (l.minutes || 0))
  return by
}

/** Los últimos `n` días hasta hoy (de más antiguo a hoy), con sus minutos */
export function lastDays(byDay: Map<string, number>, today: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n + 1)
    return { date, minutes: byDay.get(date) ?? 0 }
  })
}

/** Ajuste `focusGoal`: minutos de foco al día (como el objetivo diario de Forest o Rize) */
export interface FocusGoal {
  minutes: number
}

/**
 * Días seguidos cumpliendo el objetivo (o con algo de foco, si no hay). Hoy
 * cuenta en cuanto se cumple; mientras no, la racha sigue viva desde ayer.
 */
export function focusStreak(byDay: Map<string, number>, goal: number, today: string): { current: number; best: number } {
  const need = Math.max(1, goal)
  const ok = (d: string) => (byDay.get(d) ?? 0) >= need
  let current = 0
  for (let d = ok(today) ? today : addDays(today, -1); ok(d); d = addDays(d, -1)) current++
  let best = current
  const days = [...byDay.keys()].filter((d) => d <= today && ok(d)).sort()
  let run = 0
  let prev = ''
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return { current, best }
}

/**
 * Minutos de foco en cada hora del día (0–23), repartidos entre las horas que
 * tocó cada sesión. `clockOf` da el minuto del día (0–1439) de un instante.
 */
export function minutesByHour(logs: FocusLogLike[], clockOf: (ms: number) => number): number[] {
  const hours = Array<number>(24).fill(0)
  for (const l of logs) {
    let left = Math.max(0, Math.round(l.minutes || 0))
    if (!left || !l.endedAt) continue
    let cur = clockOf(l.endedAt - left * 60_000)
    while (left > 0) {
      const take = Math.min(left, 60 - (cur % 60))
      hours[Math.floor(cur / 60) % 24] += take
      cur = (cur + take) % 1440
      left -= take
    }
  }
  return hours
}

/**
 * Las dos horas seguidas con más foco (las «horas más productivas» de Rize).
 * Hace falta un poco de historia para decirlo: `min` minutos en total.
 */
export function bestWindow(byHour: number[], min = 120): { from: number; to: number } | null {
  const total = byHour.reduce((a, b) => a + b, 0)
  if (total < min) return null
  let best = 0
  for (let h = 1; h < 23; h++) if (byHour[h] + byHour[h + 1] > byHour[best] + byHour[best + 1]) best = h
  return byHour[best] + byHour[best + 1] > 0 ? { from: best, to: best + 2 } : null
}

export const windowLabel = (w: { from: number; to: number }) => `de ${w.from} a ${w.to} h`

/** Minutos por lo que diga `keyOf` (proyecto, tarea…), de más a menos */
export function groupMinutes<T extends FocusLogLike>(logs: T[], keyOf: (log: T) => string): { key: string; minutes: number }[] {
  const by = new Map<string, number>()
  for (const l of logs) by.set(keyOf(l), (by.get(keyOf(l)) ?? 0) + (l.minutes || 0))
  return [...by].map(([key, minutes]) => ({ key, minutes })).sort((a, b) => b.minutes - a.minutes)
}

/** Lo enfocado en una tarea: minutos y pomodoros completos */
export function taskFocus(logs: FocusLogLike[], taskId: string) {
  const mine = logs.filter((l) => l.taskId === taskId)
  return { minutes: mine.reduce((a, l) => a + (l.minutes || 0), 0), pomodoros: mine.filter((l) => l.pomodoro).length }
}
