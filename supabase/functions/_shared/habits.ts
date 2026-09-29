/**
 * Hábitos: de hecho o no hecho, con cantidad («8 vasos») o «N veces por
 * semana». Sin dependencias: lo usan la app (src/lib/habits.ts), el conector de
 * Claude y los tests. Fechas 'YYYY-MM-DD'; la semana empieza el lunes.
 */
import { addDays as addDaysYmd, weekStart, weekday } from './time.ts'

export interface HabitLike {
  days: number[]
  target?: number
  unit?: string
  perWeek?: number
  createdAt?: number
}
export interface HabitLogLike {
  habitId: string
  date: string
  count?: number
}
type HabitRule = Pick<HabitLike, 'days' | 'target' | 'perWeek'>
type Habit = HabitLike
type HabitLog = HabitLogLike

const pad = (n: number) => String(n).padStart(2, '0')
/** 'YYYY-MM-DD' local de un instante */
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Cantidad a la que hay que llegar cada día (1 = hecho o no hecho) */
export const targetOf = (h: Pick<Habit, 'target'>) => Math.max(1, Math.round(h.target ?? 1))
export const isCounted = (h: Pick<Habit, 'target'>) => targetOf(h) > 1
/** «N veces por semana» (1–6); 7 o más es lo mismo que cada día */
export const perWeekOf = (h: Pick<Habit, 'perWeek'>) => (h.perWeek && h.perWeek >= 1 && h.perWeek < 7 ? Math.round(h.perWeek) : undefined)

/** Registros agrupados: hábito → fecha → cantidad */
export function groupLogs(logs: Pick<HabitLog, 'habitId' | 'date' | 'count'>[]) {
  const m = new Map<string, Map<string, number>>()
  for (const l of logs) {
    if (!m.has(l.habitId)) m.set(l.habitId, new Map())
    const byDate = m.get(l.habitId)!
    byDate.set(l.date, (byDate.get(l.date) ?? 0) + (l.count ?? 1))
  }
  return m
}

/** Días en que se llegó al objetivo */
export function doneDays(h: Pick<Habit, 'target'>, counts: Map<string, number> | undefined): Set<string> {
  const target = targetOf(h)
  return new Set([...(counts ?? [])].filter(([, n]) => n >= target).map(([d]) => d))
}

/** ¿Es uno de sus días? Con «N veces por semana», cualquier día vale */
export function isScheduled(h: HabitRule, date: string) {
  if (perWeekOf(h)) return true
  return h.days.includes(weekday(date))
}

/** Días cumplidos en la semana (de lunes a domingo) de `date` */
export function weekDone(done: Set<string>, date: string): number {
  const start = weekStart(date)
  let n = 0
  for (let i = 0; i < 7; i++) if (done.has(addDaysYmd(start, i))) n++
  return n
}

/**
 * ¿Toca hoy? Con días fijos, si es uno de ellos. Con «N veces por semana»,
 * mientras no se haya llegado esta semana (o si ya se hizo hoy, para contarlo).
 */
export function isDue(h: HabitRule, done: Set<string>, date: string) {
  const n = perWeekOf(h)
  if (!n) return isScheduled(h, date)
  return done.has(date) || weekDone(done, date) < n
}

/**
 * Racha. Con días fijos, días seguidos cumplidos (solo cuentan los programados;
 * hoy sin hacer no la rompe). Con «N veces por semana», semanas seguidas
 * cumplidas (la semana en curso cuenta si ya se ha llegado y no la rompe si no).
 */
export function streak(h: HabitRule, done: Set<string>, ref: string): number {
  const n = perWeekOf(h)
  if (n) {
    let count = 0
    let week = weekStart(ref)
    if (weekDone(done, week) < n) week = addDaysYmd(week, -7)
    for (let i = 0; i < 104 && weekDone(done, week) >= n; i++) {
      count++
      week = addDaysYmd(week, -7)
    }
    return count
  }
  let count = 0
  let d = ref
  if (!done.has(d)) d = addDaysYmd(d, -1)
  for (let i = 0; i < 730; i++) {
    if (isScheduled(h, d)) {
      if (done.has(d)) count++
      else break
    }
    d = addDaysYmd(d, -1)
  }
  return count
}

/** «5 días» o «3 semanas» */
export const streakLabel = (h: HabitRule, n: number) => (perWeekOf(h) ? `${n} ${n === 1 ? 'semana' : 'semanas'}` : `${n} ${n === 1 ? 'día' : 'días'}`)

/** Proporción cumplida en los últimos `days` días (0–1) */
export function completionRate(h: HabitRule & Pick<Habit, 'createdAt'>, done: Set<string>, ref: string, days = 30): number {
  // No contar los días anteriores a empezar con el hábito
  let since = h.createdAt ? localYmd(new Date(h.createdAt)) : ref
  for (const d of done) if (d < since) since = d
  const n = perWeekOf(h)
  if (n) {
    let expected = 0
    let hit = 0
    const weeks = Math.ceil(days / 7)
    for (let w = 0; w < weeks; w++) {
      const start = addDaysYmd(weekStart(ref), -7 * w)
      if (addDaysYmd(start, 6) < since) break
      const got = Math.min(n, weekDone(done, start))
      // La semana en curso solo cuenta si ya se ha cumplido
      if (w === 0 && got < n) continue
      expected += n
      hit += got
    }
    return expected ? hit / expected : 0
  }
  let scheduled = 0
  let hit = 0
  for (let i = 0; i < days; i++) {
    const d = addDaysYmd(ref, -i)
    if (d < since) break
    if (!isScheduled(h, d)) continue
    scheduled++
    if (done.has(d)) hit++
  }
  return scheduled ? hit / scheduled : 0
}

/** «3/8 vasos», «2 de 3 esta semana» o nada (hábito de hecho o no hecho) */
export function progressLabel(h: Pick<Habit, 'target' | 'unit' | 'perWeek'>, counts: Map<string, number> | undefined, done: Set<string>, date: string) {
  if (isCounted(h)) return `${counts?.get(date) ?? 0}/${targetOf(h)}${h.unit ? ` ${h.unit}` : ''}`
  const n = perWeekOf(h)
  if (n) return `${weekDone(done, date)} de ${n} esta semana`
  return ''
}
