import { useEffect, useState } from 'react'
import { m as motion } from 'motion/react'
import { CalendarDays, CircleDot } from 'lucide-react'
import type { Task } from '@/db/types'
import type { CalEvent } from '@/lib/calendarEvents'
import { hhmm, minutesLabel, nowNext } from '@/lib/nowNext'
import { navigate } from '@/app/router'
import { ui } from '@/app/store'
import { ProgressRing, cx, softSpring } from '@/components/ui'

/**
 * «Ahora», como en Tiimo: lo que está en curso con un anillo que se vacía y lo
 * que le queda; si no hay nada en curso, lo siguiente y cuándo empieza. El
 * acento solo cuando algo está en marcha.
 */
export function NowCard({ tasks, events }: { tasks: Task[]; events: CalEvent[] }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  const item = nowNext(tasks, events, now)
  if (!item) return null
  const m = now.getHours() * 60 + now.getMinutes()
  const isNow = item.kind === 'now'
  const left = isNow ? item.end - m : item.start - m
  const value = isNow ? left / Math.max(1, item.end - item.start) : 0
  const open = () => (item.source === 'task' ? ui.openTask(item.id) : navigate('/calendar'))
  const Icon = item.source === 'event' ? CalendarDays : CircleDot
  return (
    <motion.button
      type="button"
      onClick={open}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={softSpring}
      className="glass mb-6 flex w-full items-center gap-4 rounded-[22px] p-4 text-left transition-transform active:scale-[0.985]"
    >
      <span className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center">
        <span className="absolute inset-0">
          <ProgressRing value={value} size={60} stroke={6} color="var(--c-blue)" track="var(--c-fill)" />
        </span>
        <span className={cx('flex h-9 w-9 items-center justify-center rounded-full', isNow ? 'bg-accent-fill text-white' : 'bg-fill text-fg')}>
          <Icon size={18} strokeWidth={2.4} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[12px] font-bold tracking-wide uppercase', isNow ? 'text-blue' : 'text-muted')}>
          {isNow ? 'Ahora' : `Después · ${hhmm(item.start)}`}
        </span>
        <span className="mt-0.5 block truncate text-[17px] leading-snug font-semibold">{item.title}</span>
        <span className="font-num mt-0.5 block text-[13px] text-muted">
          {isNow ? `Termina en ${minutesLabel(left)} · ${hhmm(item.start)}–${hhmm(item.end)}` : `Empieza en ${minutesLabel(left)}`}
        </span>
      </span>
    </motion.button>
  )
}
