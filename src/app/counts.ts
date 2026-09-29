import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { useOpenTasks } from '@/db/hooks'
import { addDaysYmd, today, weekStart } from '@/lib/dates'
import { doneDays, groupLogs, isDue } from '@/lib/habits'
import { dueForContact } from '@/lib/people'
import { isInbox } from '@/lib/tasks'

/** Números que se muestran en la barra lateral y en la barra inferior */
export function useNavCounts() {
  const t = today()
  const tasks = useOpenTasks() ?? []
  const habits = useLiveQuery(() => db.habits.where('archived').equals(0).toArray(), []) ?? []
  // Desde el lunes: los hábitos de «N veces por semana» dependen de la semana
  const logs = useLiveQuery(() => db.habitLogs.where('date').aboveOrEqual(weekStart(t)).toArray(), [t]) ?? []
  const notes = useLiveQuery(() => db.notes.count(), []) ?? 0
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const shopping = useLiveQuery(() => db.shopping.where('checked').equals(0).count(), []) ?? 0

  return useMemo(() => {
    const week = addDaysYmd(t, 7)
    const counts = groupLogs(logs)
    const done = new Map(habits.map((h) => [h.id, doneDays(h, counts.get(h.id))]))
    const scheduled = habits.filter((h) => isDue(h, done.get(h.id)!, t))
    const doneIds = new Set(scheduled.filter((h) => done.get(h.id)!.has(t)).map((h) => h.id))
    const byProject = new Map<string, number>()
    const byArea = new Map<string, number>()
    for (const x of tasks) {
      if (x.projectId) byProject.set(x.projectId, (byProject.get(x.projectId) ?? 0) + 1)
      if (x.areaId) byArea.set(x.areaId, (byArea.get(x.areaId) ?? 0) + 1)
    }
    return {
      today: tasks.filter((x) => x.dueDate && x.dueDate <= t).length,
      overdue: tasks.filter((x) => x.dueDate && x.dueDate < t).length,
      upcoming: tasks.filter((x) => x.dueDate && x.dueDate > t && x.dueDate <= week).length,
      inbox: tasks.filter(isInbox).length,
      calendar: tasks.filter((x) => x.dueDate === t && x.dueTime).length,
      habitsDone: scheduled.filter((h) => doneIds.has(h.id)).length,
      habitsTotal: scheduled.length,
      habitsLeft: scheduled.filter((h) => !doneIds.has(h.id)).length,
      notes,
      peopleDue: dueForContact(people, t).length,
      shopping,
      byProject,
      byArea,
    }
  }, [tasks, habits, logs, notes, people, shopping, t])
}
