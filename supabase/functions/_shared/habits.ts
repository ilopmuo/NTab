/**
 * Hábitos: de hecho o no hecho, con cantidad («8 vasos») o «N veces por
 * semana», con pausas (vacaciones, «hoy no toca») que no rompen la racha. Sin
 * dependencias: lo usan la app (src/lib/habits.ts), el conector de Claude y los
 * tests. Fechas 'YYYY-MM-DD'; la semana empieza el lunes.
 */
import { addDays as addDaysYmd, weekStart, weekday } from './time.ts'

/** Días de descanso: de `from` a `to` (incluidos); sin `to`, en pausa hasta que se reanude */
export interface HabitBreak {
  from: string
  to?: string
}

export interface HabitLike {
  days: number[]
  target?: number
  unit?: string
  perWeek?: number
  breaks?: HabitBreak[]
  createdAt?: number
}
export interface HabitLogLike {
  habitId: string
  date: string
  count?: number
}
type HabitRule = Pick<HabitLike, 'days' | 'target' | 'perWeek' | 'breaks'>
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

/** ¿Ese día está de descanso (pausa, vacaciones o «hoy no toca»)? */
export const onBreak = (h: Pick<HabitLike, 'breaks'>, date: string) => !!h.breaks?.some((b) => b.from <= date && (!b.to || b.to >= date))

/** La pausa sin fecha de vuelta, si la hay */
export const openBreak = (h: Pick<HabitLike, 'breaks'>) => h.breaks?.find((b) => !b.to)

/** ¿Es uno de sus días? Con «N veces por semana», cualquier día vale; de descanso, ninguno */
export function isScheduled(h: HabitRule, date: string) {
  if (onBreak(h, date)) return false
  if (perWeekOf(h)) return true
  return h.days.includes(weekday(date))
}

/** ¿Algún día de descanso en la semana (de lunes a domingo) de `date`? */
function weekHasBreak(h: HabitRule, date: string) {
  const start = weekStart(date)
  for (let i = 0; i < 7; i++) if (onBreak(h, addDaysYmd(start, i))) return true
  return false
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
  if (onBreak(h, date)) return false
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
    // Una semana con descanso que no llegó no rompe la racha (ni suma)
    for (let i = 0; i < 104; i++, week = addDaysYmd(week, -7)) {
      if (weekDone(done, week) >= n) count++
      else if (!weekHasBreak(h, week)) break
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
  const since = firstDay(h, done, ref)
  const n = perWeekOf(h)
  if (n) {
    let expected = 0
    let hit = 0
    const weeks = Math.ceil(days / 7)
    for (let w = 0; w < weeks; w++) {
      const start = addDaysYmd(weekStart(ref), -7 * w)
      if (addDaysYmd(start, 6) < since) break
      const got = Math.min(n, weekDone(done, start))
      // La semana en curso solo cuenta si ya se ha cumplido; las de descanso, solo si se cumplieron
      if ((w === 0 || weekHasBreak(h, start)) && got < n) continue
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

/** Primer día que cuenta: cuando se creó (o el primer registro, si es anterior) */
function firstDay(h: Pick<HabitLike, 'createdAt'>, done: Set<string>, ref: string) {
  let since = h.createdAt ? localYmd(new Date(h.createdAt)) : ref
  for (const d of done) if (d < since) since = d
  return since
}

/**
 * Primer día con algo registrado. Antes de él, la fuerza y las rachas valen 0
 * pase lo que pase, así que se empieza a contar ahí (y no en la fecha de
 * creación, que puede quedar años atrás): mismo resultado, mucho menos trabajo.
 */
function firstLogged(days: Iterable<string>, ref: string) {
  let first: string | undefined
  for (const d of days) if (d <= ref && (!first || d < first)) first = d
  return first
}

/**
 * Fuerza del hábito (como en Loop Habit Tracker): media con más peso para lo
 * reciente, de 0 a 1. Cada vez que toca y se hace sube; si no, baja un poco;
 * un fallo suelto tras una buena racha no lo tira abajo. Con cantidad, cuenta
 * la parte hecha. Hoy, si aún no está hecho, no resta.
 */
export function strength(h: HabitRule & Pick<HabitLike, 'createdAt'>, counts: Map<string, number> | undefined, ref: string): number {
  const done = doneDays(h, counts)
  const since = firstLogged([...(counts ?? new Map<string, number>())].filter(([, c]) => c > 0).map(([d]) => d), ref)
  if (!since) return 0
  const n = perWeekOf(h)
  let score = 0
  if (n) {
    // Por semanas: cada una vale lo que se hizo de las N
    const keep = Math.pow(0.5, (7 * Math.sqrt(n / 7)) / 13)
    for (let week = weekStart(since); week <= ref; week = addDaysYmd(week, 7)) {
      const got = Math.min(n, weekDone(done, week))
      const current = week === weekStart(ref)
      if ((current || weekHasBreak(h, week)) && got < n) continue
      score = score * keep + (got / n) * (1 - keep)
    }
    return score
  }
  const perWeek = Math.max(1, h.days.length)
  const keep = Math.pow(0.5, Math.sqrt(7 / perWeek) / 13)
  const target = targetOf(h)
  for (let d = since; d <= ref; d = addDaysYmd(d, 1)) {
    if (!isScheduled(h, d)) continue
    const value = Math.min(1, (counts?.get(d) ?? 0) / target)
    if (d === ref && value < 1) continue
    score = score * keep + value * (1 - keep)
  }
  return score
}

/** La racha más larga hasta `ref` (en días o, con «N veces por semana», en semanas) */
export function bestStreak(h: HabitRule & Pick<HabitLike, 'createdAt'>, done: Set<string>, ref: string): number {
  const since = firstLogged(done, ref)
  if (!since) return 0
  const n = perWeekOf(h)
  let best = 0
  let run = 0
  if (n) {
    for (let week = weekStart(since); week <= ref; week = addDaysYmd(week, 7)) {
      if (weekDone(done, week) >= n) best = Math.max(best, ++run)
      else if (week !== weekStart(ref) && !weekHasBreak(h, week)) run = 0
    }
    return best
  }
  for (let d = since; d <= ref; d = addDaysYmd(d, 1)) {
    if (!isScheduled(h, d)) continue
    if (done.has(d)) best = Math.max(best, ++run)
    else if (d !== ref) run = 0
  }
  return best
}

/** «3/8 vasos», «2 de 3 esta semana» o nada (hábito de hecho o no hecho) */
export function progressLabel(h: Pick<Habit, 'target' | 'unit' | 'perWeek'>, counts: Map<string, number> | undefined, done: Set<string>, date: string) {
  if (isCounted(h)) return `${counts?.get(date) ?? 0}/${targetOf(h)}${h.unit ? ` ${h.unit}` : ''}`
  const n = perWeekOf(h)
  if (n) return `${weekDone(done, date)} de ${n} esta semana`
  return ''
}
