/**
 * Colocar tareas en los huecos del día (time-blocking). Todo en minutos desde
 * las 00:00. Las reuniones y las tareas que ya tienen hora están fijas; las
 * demás se reparten en los huecos libres, primero las más importantes.
 */
export interface Block {
  start: number
  end: number
}

export interface Placeable {
  id: string
  priority: number
  estimate?: number
}

export interface ScheduleOptions {
  /** desde cuándo se puede colocar (p. ej. ahora) */
  from: number
  /** fin de la jornada */
  dayEnd?: number
  /** respiro entre bloques */
  gap?: number
  /** duración si la tarea no la tiene */
  fallback?: number
}

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Redondea hacia arriba a múltiplos de `step` minutos */
export const ceilTo = (min: number, step = 15) => Math.ceil(min / step) * step

/** Une bloques que se solapan o se tocan */
export function mergeBlocks(blocks: Block[]): Block[] {
  const sorted = blocks.filter((b) => b.end > b.start).sort((a, b) => a.start - b.start)
  const out: Block[] = []
  for (const b of sorted) {
    const last = out[out.length - 1]
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end)
    else out.push({ ...b })
  }
  return out
}

/** Huecos libres entre `from` y `dayEnd` */
export function freeSlots(busy: Block[], from: number, dayEnd: number): Block[] {
  const slots: Block[] = []
  let cur = from
  for (const b of mergeBlocks(busy)) {
    if (b.end <= cur) continue
    if (b.start > cur) slots.push({ start: cur, end: Math.min(b.start, dayEnd) })
    cur = Math.max(cur, b.end)
    if (cur >= dayEnd) break
  }
  if (cur < dayEnd) slots.push({ start: cur, end: dayEnd })
  return slots.filter((s) => s.end - s.start > 0)
}

export function autoSchedule(tasks: Placeable[], busy: Block[], opts: ScheduleOptions) {
  const { from, dayEnd = 21 * 60, gap = 5, fallback = 30 } = opts
  const taken: Block[] = [...busy]
  const placed: { id: string; start: number; end: number }[] = []
  const unplaced: string[] = []
  // Primero lo importante; a igual prioridad, lo más largo (las piedras grandes antes que la arena)
  const order = [...tasks].sort((a, b) => b.priority - a.priority || (b.estimate ?? fallback) - (a.estimate ?? fallback))
  for (const t of order) {
    const len = t.estimate ?? fallback
    const slot = freeSlots(taken, ceilTo(from, 5), dayEnd).find((s) => s.end - s.start >= len)
    if (!slot) {
      unplaced.push(t.id)
      continue
    }
    const start = ceilTo(slot.start, 5)
    if (start + len > slot.end) {
      unplaced.push(t.id)
      continue
    }
    placed.push({ id: t.id, start, end: start + len })
    taken.push({ start, end: start + len + gap })
  }
  placed.sort((a, b) => a.start - b.start)
  return { placed, unplaced }
}
