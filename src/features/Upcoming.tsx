import { useMemo } from 'react'
import { useOpenTasks } from '@/db/hooks'
import { addDaysYmd, capitalize, fmt, fromYmd, today } from '@/lib/dates'
import { SectionIcon, section } from '@/app/sections'
import { TaskList } from '@/components/TaskList'
import { PageHeader, Section, cx } from '@/components/ui'
import { useDropOver } from '@/components/dayDrag'
import type { Task } from '@/db/types'
import { Page } from './Page'

export function UpcomingView() {
  const tasks = useOpenTasks()
  const t = today()
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysYmd(t, i)), [t])
  if (!tasks) return null
  const overdue = tasks.filter((x) => x.dueDate && x.dueDate < t)
  const later = tasks.filter((x) => x.dueDate && x.dueDate > days[days.length - 1])
  const total = tasks.filter((x) => x.dueDate && x.dueDate >= t).length

  return (
    <Page>
      <PageHeader
        icon={<SectionIcon def={section('upcoming')} size={40} />}
        title="Próximo"
        subtitle={`${total} ${total === 1 ? 'tarea programada' : 'tareas programadas'} a partir de hoy`}
      />
      {overdue.length > 0 && (
        <Section title="Atrasadas" count={overdue.length} tone="red">
          <TaskList tasks={overdue} draggable />
        </Section>
      )}
      {days.map((d, i) => (
        <DaySection key={d} day={d} index={i} tasks={tasks.filter((x) => x.dueDate === d)} />
      ))}
      {later.length > 0 && (
        <Section title="Más adelante" count={later.length} tone="orange">
          <TaskList tasks={later} draggable />
        </Section>
      )}
    </Page>
  )
}

function DaySection({ day, index, tasks }: { day: string; index: number; tasks: Task[] }) {
  const over = useDropOver(day)
  const weekend = [0, 6].includes(fromYmd(day).getDay())
  const label = index === 0 ? 'Hoy' : index === 1 ? 'Mañana' : capitalize(fmt(day, 'EEEE'))
  return (
    <section data-drop-day={day} className={cx('-mx-2 mb-4 rounded-[20px] px-2 pt-1 pb-2 transition-colors', over && 'bg-accent-soft ring-2 ring-blue')}>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <span className={cx('font-num text-[28px] leading-none font-bold', index === 0 ? 'text-blue' : weekend ? 'text-muted' : 'text-fg')}>{fromYmd(day).getDate()}</span>
        <span className="text-[17px] font-bold">{label}</span>
        <span className="text-[14px] text-muted">{capitalize(fmt(day, 'MMMM'))}</span>
      </div>
      <TaskList
        tasks={tasks}
        hideDate
        draggable
        add={tasks.length > 0 || index < 7 ? { defaults: { dueDate: day }, placeholder: 'Nueva tarea', color: 'var(--c-blue)' } : undefined}
      />
    </section>
  )
}
