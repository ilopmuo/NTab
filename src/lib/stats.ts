import type { FocusLog, Habit, HabitLog, Task } from '@/db/types'
import { addDaysYmd, ymd } from './dates'
import { doneDays, groupLogs, isScheduled, perWeekOf } from './habits'

export interface DayStat {
  date: string
  done: number
  focusMin: number
}

export interface WeekStats {
  /** últimos 7 días, de más antiguo a hoy */
  days: DayStat[]
  done: number
  /** los 7 días anteriores, para comparar */
  donePrev: number
  focusMin: number
  /** 0…1, o null si no había hábitos programados */
  habitRate: number | null
  /** días seguidos (hasta hoy o ayer) completando al menos una tarea */
  streak: number
  best?: DayStat
}

export function weekStats(input: { tasks: Pick<Task, 'done' | 'completedAt'>[]; focus: Pick<FocusLog, 'date' | 'minutes'>[]; habits: Habit[]; logs: Pick<HabitLog, 'habitId' | 'date' | 'count'>[]; today: string }): WeekStats {
  const { today } = input
  const doneBy = new Map<string, number>()
  for (const t of input.tasks) {
    if (!t.done || !t.completedAt) continue
    const d = ymd(new Date(t.completedAt))
    doneBy.set(d, (doneBy.get(d) ?? 0) + 1)
  }
  const focusBy = new Map<string, number>()
  for (const f of input.focus) focusBy.set(f.date, (focusBy.get(f.date) ?? 0) + f.minutes)

  const days: DayStat[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysYmd(today, i - 6)
    return { date, done: doneBy.get(date) ?? 0, focusMin: focusBy.get(date) ?? 0 }
  })
  let donePrev = 0
  for (let i = 7; i < 14; i++) donePrev += doneBy.get(addDaysYmd(today, -i)) ?? 0

  let scheduled = 0
  let hit = 0
  const counts = groupLogs(input.logs)
  for (const h of input.habits) {
    if (h.archived) continue
    const done = doneDays(h, counts.get(h.id))
    // Un hábito cuenta desde el día en que se creó
    const live = days.filter((d) => ymd(new Date(h.createdAt)) <= d.date)
    const perWeek = perWeekOf(h)
    if (perWeek) {
      // «N veces por semana»: en estos 7 días se esperaban N
      if (!live.length) continue
      scheduled += perWeek
      hit += Math.min(perWeek, live.filter((d) => done.has(d.date)).length)
      continue
    }
    for (const d of live) {
      if (!isScheduled(h, d.date)) continue
      scheduled++
      if (done.has(d.date)) hit++
    }
  }

  let streak = 0
  let cur = (doneBy.get(today) ?? 0) > 0 ? today : addDaysYmd(today, -1)
  while ((doneBy.get(cur) ?? 0) > 0) {
    streak++
    cur = addDaysYmd(cur, -1)
  }

  const best = days.reduce<DayStat | undefined>((b, d) => (d.done > (b?.done ?? 0) ? d : b), undefined)
  return {
    days,
    done: days.reduce((a, d) => a + d.done, 0),
    donePrev,
    focusMin: days.reduce((a, d) => a + d.focusMin, 0),
    habitRate: scheduled ? hit / scheduled : null,
    streak,
    best,
  }
}

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
