/** Duración estimada de las tareas (en minutos) y carga del día */

export const DURATION_OPTIONS = [5, 15, 30, 45, 60, 90, 120, 180]

/** 30 → "30 min", 60 → "1 h", 90 → "1 h 30" */
export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/**
 * Lee una duración escrita a mano: "30", "30m", "45 min", "2h", "1h30",
 * "1,5 h", "1:30". Sin unidad son minutos. Devuelve minutos o undefined.
 */
export function parseDuration(raw: string): number | undefined {
  const s = raw.trim().toLowerCase().replace(',', '.')
  let m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m) return clamp(Number(m[1]) * 60 + Number(m[2]))
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:h|hrs?|horas?)\s*(?:(\d{1,2})\s*(?:m|min|minutos?)?)?$/)
  if (m) return clamp(Math.round(Number(m[1]) * 60) + (m[2] ? Number(m[2]) : 0))
  m = s.match(/^(\d+)\s*(?:m|min|mins|minutos?)?$/)
  if (m) return clamp(Number(m[1]))
  return undefined
}

function clamp(n: number) {
  return n > 0 && n <= 24 * 60 ? n : undefined
}

/** Minutos que caben en un día normal antes de avisar de que es demasiado */
export const DAY_CAPACITY = 6 * 60

export interface DayLoad {
  /** minutos estimados de las tareas */
  tasks: number
  /** minutos de reuniones y citas */
  events: number
  /** tareas sin duración estimada */
  unestimated: number
  total: number
  level: 'free' | 'ok' | 'busy' | 'over'
}

export function dayLoad(tasks: { estimate?: number }[], eventMinutes: number[]): DayLoad {
  const t = tasks.reduce((s, x) => s + (x.estimate ?? 0), 0)
  const e = eventMinutes.reduce((s, x) => s + x, 0)
  const total = t + e
  const level = total === 0 && !tasks.length ? 'free' : total <= DAY_CAPACITY * 0.7 ? 'ok' : total <= DAY_CAPACITY ? 'busy' : 'over'
  return { tasks: t, events: e, unestimated: tasks.filter((x) => !x.estimate).length, total, level }
}
