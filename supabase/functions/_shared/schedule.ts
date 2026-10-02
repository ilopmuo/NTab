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

// ── Mover y estirar bloques a mano ────────────────────────────

const DAY = 24 * 60

/** Nueva hora de inicio al arrastrar `delta` minutos, en pasos de `step` y sin salirse del día */
export function snapMove(start: number, duration: number, delta: number, step = 15) {
  const s = Math.round((start + delta) / step) * step
  return Math.max(0, Math.min(s, DAY - duration))
}

/** Nueva duración al estirar el borde inferior `delta` minutos (mínimo un paso, sin pasar de medianoche) */
export function snapResize(start: number, duration: number, delta: number, step = 15) {
  const end = Math.round((start + duration + delta) / step) * step
  return Math.max(step, Math.min(end, DAY) - start)
}

/** Primer bloque que se solapa con `b` (para avisar de que choca con una reunión) */
export function firstOverlap<T extends Block>(b: Block, others: T[]): T | undefined {
  return others.find((o) => o.start < b.end && b.start < o.end)
}

/**
 * Reparte en columnas lo que se solapa (como Google Calendar): cada bloque sale
 * con su columna y cuántas columnas tiene su grupo.
 */
export function layoutColumns<T extends Block>(items: T[]): (T & { col: number; cols: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: (T & { col: number; cols: number })[] = []
  let group: (T & { col: number; cols: number })[] = []
  let groupEnd = -1
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1))
    for (const g of group) g.cols = cols
    out.push(...group)
    group = []
  }
  for (const it of sorted) {
    if (it.start >= groupEnd && group.length) flush()
    const used = new Set(group.filter((g) => g.end > it.start).map((g) => g.col))
    let col = 0
    while (used.has(col)) col++
    group.push({ ...it, col, cols: 1 })
    groupEnd = Math.max(groupEnd, it.end)
  }
  if (group.length) flush()
  return out
}

/** «10:00–11:30, 16:00–18:00»: los huecos de al menos `min` minutos */
export const slotsLabel = (slots: Block[], min = 30) =>
  slots
    .filter((s) => s.end - s.start >= min)
    .map((s) => `${toHHMM(s.start)}–${toHHMM(s.end)}`)
    .join(', ')
