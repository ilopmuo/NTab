import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/db/db'
import { addDaysYmd, today } from '@/lib/dates'
import { doneDays, groupLogs } from '@/lib/habits'

/**
 * Hábitos activos y sus registros de los últimos `days` días: `counts` (cuánto
 * se hizo cada día) y `byHabit` (días en que se llegó al objetivo).
 */
export function useHabits(days = 120) {
  const t = today()
  const from = addDaysYmd(t, -days)
  const habits = useLiveQuery(() => db.habits.where('archived').equals(0).sortBy('order'), [])
  const logs = useLiveQuery(() => db.habitLogs.where('date').aboveOrEqual(from).toArray(), [from])
  const { counts, byHabit } = useMemo(() => {
    const counts = groupLogs(logs ?? [])
    const byHabit = new Map<string, Set<string>>()
    for (const h of habits ?? []) byHabit.set(h.id, doneDays(h, counts.get(h.id)))
    return { counts, byHabit }
  }, [logs, habits])
  return { habits, byHabit, counts, loaded: !!habits && !!logs, today: t }
}
