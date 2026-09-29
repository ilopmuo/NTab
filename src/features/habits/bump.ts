import type { Habit } from '@/db/types'
import { addHabitCount } from '@/db/actions'
import { targetOf } from '@/lib/habits'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'

/** +1 (o −1) a un hábito con cantidad, con «Deshacer» */
export async function bumpHabit(h: Habit, date: string, delta = 1) {
  haptic()
  const n = await addHabitCount(h.id, date, delta)
  const target = targetOf(h)
  if (delta > 0 && n === target) haptic('success')
  toast(`${h.name}: ${n}/${target}${h.unit ? ` ${h.unit}` : ''}${n >= target ? ' ✓' : ''}`, { label: 'Deshacer', run: () => void addHabitCount(h.id, date, -delta) }, 2500)
}
