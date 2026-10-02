/**
 * «Ahora» (como Tiimo o Structured): lo que tiene hora hoy y está en curso o,
 * si no hay nada, lo siguiente. Las tareas sin duración ocupan media hora.
 */
export interface NowItem {
  kind: 'now' | 'next'
  source: 'task' | 'event'
  id: string
  title: string
  /** minutos desde medianoche */
  start: number
  end: number
}

const DEFAULT_TASK_MIN = 30

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}
const minOf = (d: Date) => d.getHours() * 60 + d.getMinutes()

export function nowNext(
  tasks: { id: string; title: string; dueTime?: string; estimate?: number; done?: boolean | number }[],
  events: { id: string; title: string; start: string; end: string; allDay?: boolean }[],
  now = new Date(),
): NowItem | null {
  const today = now.toDateString()
  const items = [
    ...tasks
      .filter((t) => t.dueTime && !t.done)
      .map((t) => {
        const start = toMin(t.dueTime!)
        return { source: 'task' as const, id: t.id, title: t.title, start, end: start + (t.estimate || DEFAULT_TASK_MIN) }
      }),
    ...events
      .filter((e) => !e.allDay && new Date(e.start).toDateString() === today)
      .map((e) => {
        const s = new Date(e.start)
        const end = new Date(e.end)
        // Un evento que acaba otro día termina, para hoy, a medianoche
        return { source: 'event' as const, id: e.id, title: e.title, start: minOf(s), end: end.toDateString() === today ? minOf(end) : 24 * 60 }
      }),
  ].sort((a, b) => a.start - b.start || a.end - b.end)
  const m = minOf(now)
  // En curso: el que empezó más tarde (lo más concreto) de los que no han acabado
  const current = items.filter((i) => i.start <= m && i.end > m).at(-1)
  if (current) return { kind: 'now', ...current }
  const next = items.find((i) => i.start > m)
  return next ? { kind: 'next', ...next } : null
}

/** «12 min», «1 h 5 min» */
export function minutesLabel(n: number) {
  const h = Math.floor(n / 60)
  const m = n % 60
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

export const hhmm = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
