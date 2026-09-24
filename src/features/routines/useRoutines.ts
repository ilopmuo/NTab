import { useMemo, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { RoutineRun } from '@/db/types'
import { addDaysYmd, today } from '@/lib/dates'

/** Rutinas activas + lo hecho en los últimos `days` días, por rutina y fecha */
export function useRoutines(days = 60) {
  const t = today()
  const from = addDaysYmd(t, -days)
  const routines = useLiveQuery(() => db.routines.where('archived').equals(0).sortBy('order'), [])
  const runs = useLiveQuery(() => db.routineRuns.where('date').aboveOrEqual(from).toArray(), [from])
  const byRoutine = useMemo(() => {
    const m = new Map<string, Map<string, RoutineRun>>()
    for (const r of runs ?? []) {
      if (!m.has(r.routineId)) m.set(r.routineId, new Map())
      m.get(r.routineId)!.set(r.date, r)
    }
    return m
  }, [runs])
  /** días en que se completó cada rutina */
  const completed = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const [id, dates] of byRoutine) m.set(id, new Set([...dates.values()].filter((r) => r.completedAt).map((r) => r.date)))
    return m
  }, [byRoutine])
  return { routines, byRoutine, completed, today: t, loaded: !!routines && !!runs }
}

// ── Rutina abierta paso a paso ────────────────────────────────
let open: string | null = null
const listeners = new Set<() => void>()
export const runner = {
  open: (id: string) => {
    open = id
    listeners.forEach((l) => l())
  },
  close: () => {
    open = null
    listeners.forEach((l) => l())
  },
}
export function useRunner() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => open,
  )
}
