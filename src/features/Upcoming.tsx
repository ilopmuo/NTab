import { useMemo } from 'react'
import { CalendarRange } from 'lucide-react'
import { useOpenTasks } from '@/db/hooks'
import { addDaysYmd, capitalize, dateLabel, fmt, fromYmd, today } from '@/lib/dates'
import { InlineAdd, TaskList } from '@/components/TaskList'
import { PageHeader, Section, cx } from '@/components/ui'
import { Page } from './Page'

export function UpcomingView() {
  const tasks = useOpenTasks()
  const t = today()
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysYmd(t, i)), [t])
  if (!tasks) return null
  const overdue = tasks.filter((x) => x.dueDate && x.dueDate < t)
  const later = tasks.filter((x) => x.dueDate && x.dueDate > days[days.length - 1])

  return (
    <Page>
      <PageHeader icon={<CalendarRange size={26} className="text-accent" />} title="Próximo" subtitle="Lo que viene en las próximas dos semanas." />
      {overdue.length > 0 && (
        <Section title="Atrasadas" count={overdue.length} tone="danger">
          <TaskList tasks={overdue} />
        </Section>
      )}
      {days.map((d, i) => {
        const list = tasks.filter((x) => x.dueDate === d)
        const isWeekend = [0, 6].includes(fromYmd(d).getDay())
        return (
          <section key={d} className="mb-6">
            <div className="mb-1 flex items-baseline gap-2 border-b border-line px-1 pb-2">
              <span className={cx('text-[22px] font-bold tabular-nums tracking-tight', i === 0 ? 'text-accent' : isWeekend ? 'text-muted' : '')}>
                {fmt(d, 'd')}
              </span>
              <span className="text-[14px] font-medium">{i < 2 ? dateLabel(d) : capitalize(fmt(d, 'EEEE'))}</span>
              <span className="text-[12px] text-faint">{capitalize(fmt(d, 'MMMM'))}</span>
            </div>
            <TaskList tasks={list} hideDate />
            {(list.length > 0 || i < 7) && <InlineAdd defaults={{ dueDate: d }} placeholder="Añadir" />}
          </section>
        )
      })}
      {later.length > 0 && (
        <Section title="Más adelante" count={later.length}>
          <TaskList tasks={later} />
        </Section>
      )}
    </Page>
  )
}
