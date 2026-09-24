import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/sync/supabase'
import { useSync } from '@/sync/service'
import type { CalEvent } from '../../supabase/functions/events/expand.ts'
import { addDaysYmd, ymd } from './dates'

export type { CalEvent }

/**
 * Eventos de los calendarios externos (Google, iCloud, Outlook…), de solo
 * lectura. Se piden a la Edge Function `events` por rangos de fechas, se
 * guardan 10 minutos y se conserva una copia para verlos sin conexión.
 */
interface RangeData {
  events: CalEvent[]
  names: Record<string, string>
  errors: { sourceId: string; name: string; error: string }[]
  at: number
}

const TTL = 10 * 60_000
const KEY = 'ntab-events'
const ranges = new Map<string, RangeData>()
const inflight = new Map<string, Promise<void>>()
const listeners = new Set<() => void>()
let version = 0

try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, RangeData>
  for (const [k, v] of Object.entries(saved)) ranges.set(k, v)
} catch {
  /* sin copia */
}

function emit() {
  version++
  try {
    // Solo los rangos más recientes, para no llenar el almacenamiento
    const keep = [...ranges.entries()].sort((a, b) => b[1].at - a[1].at).slice(0, 6)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep)))
  } catch {
    /* sin almacenamiento */
  }
  listeners.forEach((l) => l())
}

async function fetchRange(from: string, to: string) {
  const key = `${from}|${to}`
  if (inflight.has(key)) return inflight.get(key)
  const p = (async () => {
    const { data, error } = await supabase.functions.invoke<Omit<RangeData, 'at'>>('events', { body: { from, to } })
    if (error || !data) return
    ranges.set(key, { ...data, at: Date.now() })
    emit()
  })().finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

/** Vuelve a pedir todo (al añadir o quitar un calendario) */
export function refreshEvents() {
  for (const [key, v] of ranges) ranges.set(key, { ...v, at: 0 })
  emit()
}

/** Eventos entre dos fechas (YYYY-MM-DD, ambas incluidas) */
export function useEvents(from: string, to: string) {
  const sync = useSync()
  const key = `${from}|${to}`
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  const signedIn = !!sync.user
  useEffect(() => {
    if (!signedIn) return
    const check = () => {
      const cur = ranges.get(key)
      if (!cur || Date.now() - cur.at > TTL) void fetchRange(from, to)
    }
    check()
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, TTL)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [key, from, to, signedIn, version])
  const data = signedIn ? ranges.get(key) : undefined
  return { events: data?.events ?? [], names: data?.names ?? {}, errors: data?.errors ?? [], loaded: !!data }
}

/** Días (YYYY-MM-DD, hora local) que ocupa un evento */
export function eventDays(e: CalEvent): string[] {
  if (e.allDay) {
    const days: string[] = []
    for (let d = e.start; d < e.end && days.length < 60; d = addDaysYmd(d, 1)) days.push(d)
    return days
  }
  const s = ymd(new Date(e.start))
  const last = ymd(new Date(Date.parse(e.end) - 1))
  const days: string[] = []
  for (let d = s; d <= last && days.length < 60; d = addDaysYmd(d, 1)) days.push(d)
  return days.length ? days : [s]
}

export function eventsByDay(events: CalEvent[]) {
  const m = new Map<string, CalEvent[]>()
  for (const e of events) for (const d of eventDays(e)) m.set(d, [...(m.get(d) ?? []), e])
  return m
}

/** Hora local de inicio "HH:MM" (vacío si es de todo el día) */
export function eventTime(e: CalEvent) {
  return e.allDay ? '' : new Date(e.start).toTimeString().slice(0, 5)
}

/** Minutos que dura (solo eventos con hora) */
export function eventMinutes(e: CalEvent) {
  return e.allDay ? 0 : Math.max(0, Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000))
}
