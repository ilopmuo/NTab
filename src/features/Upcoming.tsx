import { useMemo } from 'react'
import { useOpenTasks } from '@/db/hooks'
import { addDaysYmd, capitalize, fmt, fromYmd, today } from '@/lib/dates'
import { SectionIcon, section } from '@/app/sections'
import { TaskList } from '@/components/TaskList'
import { PageHeader, Section, cx } from '@/components/ui'
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
          <TaskList tasks={overdue} />
        </Section>
      )}
      {days.map((d, i) => {
        const list = tasks.filter((x) => x.dueDate === d)
        const weekend = [0, 6].includes(fromYmd(d).getDay())
        const label = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : capitalize(fmt(d, 'EEEE'))
        return (
          <section key={d} className="mb-6">
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <span className={cx('font-num text-[28px] leading-none font-bold', i === 0 ? 'text-blue' : weekend ? 'text-muted' : 'text-fg')}>
                {fromYmd(d).getDate()}
              </span>
              <span className="text-[17px] font-bold">{label}</span>
              <span className="text-[14px] text-muted">{capitalize(fmt(d, 'MMMM'))}</span>
            </div>
            <TaskList tasks={list} hideDate add={list.length > 0 || i < 7 ? { defaults: { dueDate: d }, placeholder: 'Nueva tarea', color: 'var(--c-blue)' } : undefined} />
          </section>
        )
      })}
      {later.length > 0 && (
        <Section title="Más adelante" count={later.length} tone="orange">
          <TaskList tasks={later} />
        </Section>
      )}
    </Page>
  )
}
