import { CalendarClock } from 'lucide-react'
import type { Task } from '@/db/types'
import { addDaysYmd, dateLabel, fromYmd, today, WEEKDAYS_SHORT } from '@/lib/dates'
import { href } from '@/app/router'
import { ui } from '@/app/store'
import { Card, cx } from '@/components/ui'

/** Los próximos 7 días de un vistazo (naranja = lo que viene) */
export function WeekStrip({ tasks }: { tasks: Task[] }) {
  const t = today()
  const days = Array.from({ length: 7 }, (_, i) => addDaysYmd(t, i + 1))
  const upcoming = tasks
    .filter((x) => x.dueDate && x.dueDate > t && x.dueDate <= days[6])
    .sort((a, b) => (a.dueDate! + (a.dueTime ?? '99')).localeCompare(b.dueDate! + (b.dueTime ?? '99')))
  const count = (d: string) => upcoming.filter((x) => x.dueDate === d).length

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock size={16} className="text-orange" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold text-orange">Próximos días</h3>
        <a href={href('/upcoming')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          Ver todo
        </a>
      </div>
      <div className="mb-3 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const n = count(d)
          const weekend = [0, 6].includes(fromYmd(d).getDay())
          return (
            <a
              key={d}
              href={href('/upcoming')}
              className={cx('flex flex-col items-center gap-1 rounded-xl py-1.5 transition-colors hover:bg-hover', n > 0 && 'bg-[color-mix(in_srgb,var(--c-orange)_12%,transparent)]')}
            >
              <span className={cx('text-[11px] font-semibold', weekend ? 'text-faint' : 'text-muted')}>{WEEKDAYS_SHORT[fromYmd(d).getDay()]}</span>
              <span className="font-num text-[16px] font-bold">{fromYmd(d).getDate()}</span>
              <span className="flex h-1.5 gap-0.5">
                {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-orange" />
                ))}
              </span>
            </a>
          )
        })}
      </div>
      {upcoming.length === 0 ? (
        <p className="text-[14px] text-muted">Semana despejada.</p>
      ) : (
        <div className="space-y-0.5">
          {upcoming.slice(0, 4).map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => ui.openTask(x.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-hover"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-orange" />
              <span className="min-w-0 flex-1 truncate text-[14px]">{x.title}</span>
              <span className="shrink-0 text-[12px] font-medium text-muted">{dateLabel(x.dueDate!)}</span>
            </button>
          ))}
          {upcoming.length > 4 && <p className="px-1 pt-1 text-[12px] text-faint">y {upcoming.length - 4} más</p>}
        </div>
      )}
    </Card>
  )
}
