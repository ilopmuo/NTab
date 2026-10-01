import type { Tracker } from '@/db/types'
import { addDaysYmd, fromYmd, today as todayYmd, ymd } from './dates'

export const TRACKER_PRESETS: { name: string; icon: string; every?: number; avoid?: boolean }[] = [
  { name: 'Cambiar las sábanas', icon: 'bed', every: 14 },
  { name: 'Regar las plantas', icon: 'leaf', every: 4 },
  { name: 'Ir al dentista', icon: 'heart', every: 180 },
  { name: 'Cortarme el pelo', icon: 'sparkles', every: 45 },
  { name: 'Limpiar la nevera', icon: 'home', every: 30 },
  { name: 'Cambiar el cepillo de dientes', icon: 'droplet', every: 90 },
  { name: 'Lavar el coche', icon: 'car', every: 30 },
  { name: 'Hacer copia de las fotos', icon: 'camera', every: 60 },
]

/** Ideas de «Días sin…» (como Quitzilla): lo que quieres dejar */
export const AVOID_PRESETS: { name: string; icon: string; avoid: true }[] = [
  { name: 'Fumar', icon: 'cigarette', avoid: true },
  { name: 'Alcohol', icon: 'wine', avoid: true },
  { name: 'Comida basura', icon: 'food', avoid: true },
  { name: 'Móvil en la cama', icon: 'moon', avoid: true },
]

const dayMs = 864e5
export const daysBetween = (a: string, b: string) => Math.round((fromYmd(b).getTime() - fromYmd(a).getTime()) / dayMs)

export const lastDone = (t: Pick<Tracker, 'log'>) => t.log[0]

/** Añade una fecha al historial (sin repetir, de más reciente a más antigua) */
export function withDate(log: string[], date: string) {
  return [...new Set([date, ...log])].sort((a, b) => b.localeCompare(a)).slice(0, 200)
}

/** Cada cuántos días se hace de media (hacen falta al menos dos veces) */
export function averageEvery(t: Pick<Tracker, 'log'>): number | undefined {
  if (t.log.length < 2) return undefined
  const span = daysBetween(t.log[t.log.length - 1], t.log[0])
  return Math.max(1, Math.round(span / (t.log.length - 1)))
}

export type TrackerState =
  | { kind: 'never' }
  | { kind: 'ok'; since: number; nextIn?: number }
  | { kind: 'due'; since: number; late: number }

export function trackerState(t: Pick<Tracker, 'log' | 'every'>, today = todayYmd()): TrackerState {
  const last = t.log[0]
  if (!last) return { kind: 'never' }
  const since = daysBetween(last, today)
  if (!t.every) return { kind: 'ok', since }
  const late = since - t.every
  return late >= 0 ? { kind: 'due', since, late } : { kind: 'ok', since, nextIn: -late }
}

export function sinceLabel(days: number) {
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 14) return `Hace ${days} días`
  if (days < 60) return `Hace ${Math.round(days / 7)} semanas`
  if (days < 365) return `Hace ${Math.round(days / 30)} meses`
  const y = Math.floor(days / 365)
  return `Hace ${y} ${y === 1 ? 'año' : 'años'}`
}

/** «en 4 días», «en 3 semanas», «en 6 meses» */
export function inLabel(days: number) {
  if (days === 1) return 'mañana'
  if (days < 14) return `en ${days} días`
  if (days < 60) return `en ${Math.round(days / 7)} semanas`
  return `en ${Math.round(days / 30)} meses`
}

export function everyLabel(every: number) {
  if (every === 1) return 'cada día'
  if (every === 7) return 'cada semana'
  if (every % 30 === 0 && every >= 30) return every === 30 ? 'cada mes' : `cada ${every / 30} meses`
  if (every % 7 === 0) return `cada ${every / 7} semanas`
  return `cada ${every} días`
}

/** Aviso: el día que toca, a las 10:00. Si ya pasó, a las 10:00 siguientes (una vez). Lo que se quiere dejar no avisa. */
export function computeTrackerRemindAt(t: Pick<Tracker, 'log' | 'every' | 'archived' | 'avoid'>, now = Date.now()): number | undefined {
  if (t.avoid || !t.every || !t.log[0] || t.archived) return undefined
  const at = fromYmd(addDaysYmd(t.log[0], t.every))
  at.setHours(10, 0, 0, 0)
  if (at.getTime() > now) return at.getTime()
  const next = new Date(now)
  if (next.getHours() >= 10) next.setDate(next.getDate() + 1)
  next.setHours(10, 0, 0, 0)
  return next.getTime()
}

/** Primero lo que toca (lo más atrasado), luego lo que hace más que no se hace; al final, lo que quieres dejar */
export function sortTrackers<T extends Tracker>(list: T[], today = todayYmd()): T[] {
  const score = (t: Tracker) => {
    if (t.avoid) return -1 - t.createdAt / 1e13
    const s = trackerState(t, today)
    return s.kind === 'due' ? 100000 + s.late : s.kind === 'never' ? 50000 : s.since
  }
  return [...list].sort((a, b) => score(b) - score(a))
}

// ── «Días sin…» (como Quitzilla o las tareas negativas de Streaks) ──

/** Desde cuándo se cuenta: la última recaída o, si no hay, el día en que se creó */
const startOf = (t: Pick<Tracker, 'log' | 'createdAt'>) => t.log[0] ?? ymd(new Date(t.createdAt))

/** Días seguidos sin hacerlo */
export const cleanDays = (t: Pick<Tracker, 'log' | 'createdAt'>, today = todayYmd()) => Math.max(0, daysBetween(startOf(t), today))

/** La racha más larga sin hacerlo (la actual incluida) */
export function cleanRecord(t: Pick<Tracker, 'log' | 'createdAt'>, today = todayYmd()) {
  let best = cleanDays(t, today)
  for (let i = 0; i + 1 < t.log.length; i++) best = Math.max(best, daysBetween(t.log[i + 1], t.log[i]))
  return best
}

const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1095]

/** Siguiente meta (1 día, 3, 1 semana, 2 semanas, 1 mes…) y cuánto falta */
export function nextMilestone(days: number): { at: number; left: number } | undefined {
  const at = MILESTONES.find((m) => m > days)
  return at ? { at, left: at - days } : undefined
}

/** «1 semana», «1 mes», «1 año», «45 días» */
export function milestoneLabel(days: number) {
  if (days === 7) return '1 semana'
  if (days === 14) return '2 semanas'
  if (days >= 30 && days < 365 && days % 30 === 0) return days === 30 ? '1 mes' : `${days / 30} meses`
  if (days >= 365 && days % 365 === 0) return days === 365 ? '1 año' : `${days / 365} años`
  return `${days} ${days === 1 ? 'día' : 'días'}`
}

/** Lo ahorrado en la racha actual */
export const savedSince = (t: Pick<Tracker, 'log' | 'createdAt' | 'costPerDay'>, today = todayYmd()) => (t.costPerDay ? cleanDays(t, today) * t.costPerDay : 0)

// ── Limpieza por estancias (como Tody o Sweepy) ──

/** Lo típico de cada estancia, con cada cuántos días */
export const CLEANING_PRESETS: { room: string; name: string; icon: string; every: number }[] = [
  { room: 'Cocina', name: 'Limpiar la encimera y la vitro', icon: 'food', every: 2 },
  { room: 'Cocina', name: 'Fregar el suelo de la cocina', icon: 'home', every: 7 },
  { room: 'Cocina', name: 'Limpiar la nevera', icon: 'home', every: 30 },
  { room: 'Baño', name: 'Limpiar el baño', icon: 'droplet', every: 7 },
  { room: 'Baño', name: 'Cambiar las toallas', icon: 'droplet', every: 5 },
  { room: 'Dormitorio', name: 'Cambiar las sábanas', icon: 'bed', every: 14 },
  { room: 'Dormitorio', name: 'Aspirar el dormitorio', icon: 'home', every: 7 },
  { room: 'Salón', name: 'Aspirar el salón', icon: 'home', every: 7 },
  { room: 'Salón', name: 'Quitar el polvo', icon: 'sparkles', every: 14 },
  { room: 'Entrada', name: 'Barrer la entrada', icon: 'door', every: 7 },
]

/**
 * Suciedad (como en Tody): 0 recién hecho, 1 justo cuando toca, más si se pasa
 * (hasta 1,5). Sin frecuencia o lo que se quiere dejar: no aplica.
 */
export function dirtiness(t: Pick<Tracker, 'log' | 'every' | 'avoid'>, today = todayYmd()): number | undefined {
  if (t.avoid || !t.every) return undefined
  if (!t.log[0]) return 1
  return Math.min(1.5, Math.max(0, daysBetween(t.log[0], today) / t.every))
}

/** Estancias con lo suyo, de la más sucia a la más limpia (la suciedad es la media) */
export function byRoom<T extends Tracker>(list: T[], today = todayYmd()): { room: string; level: number; items: T[] }[] {
  const rooms = new Map<string, T[]>()
  for (const t of list) {
    const r = t.room?.trim()
    if (!r || t.avoid) continue
    rooms.set(r, [...(rooms.get(r) ?? []), t])
  }
  return [...rooms]
    .map(([room, items]) => {
      const levels = items.map((t) => dirtiness(t, today)).filter((n): n is number => n !== undefined)
      const sorted = [...items].sort((a, b) => (dirtiness(b, today) ?? -1) - (dirtiness(a, today) ?? -1))
      return { room, level: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0, items: sorted }
    })
    .sort((a, b) => b.level - a.level || a.room.localeCompare(b.room, 'es'))
}

/** «Limpio», «Bien», «Toca pronto», «Toca» */
export function dirtinessLabel(level: number) {
  return level >= 1 ? 'Toca' : level >= 0.75 ? 'Toca pronto' : level >= 0.35 ? 'Bien' : 'Limpio'
}
