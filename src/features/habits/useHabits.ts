import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/db/db'
import { addDaysYmd, today } from '@/lib/dates'

/** Hábitos activos + registros de los últimos `days` días agrupados por hábito */
export function useHabits(days = 120) {
  const t = today()
  const from = addDaysYmd(t, -days)
  const habits = useLiveQuery(() => db.habits.where('archived').equals(0).sortBy('order'), [])
  const logs = useLiveQuery(() => db.habitLogs.where('date').aboveOrEqual(from).toArray(), [from])
  const byHabit = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const l of logs ?? []) {
      if (!m.has(l.habitId)) m.set(l.habitId, new Set())
      m.get(l.habitId)!.add(l.date)
    }
    return m
  }, [logs])
  return { habits, byHabit, loaded: !!habits && !!logs, today: t }
}
