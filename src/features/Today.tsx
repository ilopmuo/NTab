import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Cake, CalendarClock, ChevronDown, PartyPopper, RefreshCcw, Sun } from 'lucide-react'
import { db } from '@/db/db'
import { updateTask } from '@/db/actions'
import { useOpenTasks } from '@/db/hooks'
import { addDaysYmd, dateLabel, greeting, longDateLabel, today } from '@/lib/dates'
import { dueForContact, upcomingBirthdays } from '@/lib/people'
import { InlineAdd, TaskList } from '@/components/TaskList'
import { Button, Card, Empty, ProgressRing, Section, cx } from '@/components/ui'
import { HabitStrip } from './habits/HabitStrip'
import { href } from '@/app/router'
import { ui } from '@/app/store'
import { Page } from './Page'

export function TodayView() {
  const t = today()
  const open = useOpenTasks()
  const doneToday = useLiveQuery(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return db.tasks.where('completedAt').aboveOrEqual(start.getTime()).toArray()
  }, [t])
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const lastReview = useLiveQuery(() => db.settings.get('lastReview'), [])
  const [showDone, setShowDone] = useState(false)

  const { overdue, todays, upcoming } = useMemo(() => {
    const list = open ?? []
    return {
      overdue: list.filter((x) => x.dueDate && x.dueDate < t),
      todays: list.filter((x) => x.dueDate === t),
      upcoming: list.filter((x) => x.dueDate && x.dueDate > t && x.dueDate <= addDaysYmd(t, 7)),
    }
  }, [open, t])

  if (!open) return null
  const done = doneToday?.filter((x) => x.done) ?? []
  const total = todays.length + overdue.length + done.length
  const progress = total ? done.length / total : 0
  const contact = dueForContact(people, t)
  const birthdays = upcomingBirthdays(people, t, 7)
  const reviewDays = lastReview ? Math.floor((Date.now() - (lastReview.value as number)) / 864e5) : null
  const needsReview = reviewDays === null ? new Date().getDay() === 0 || new Date().getDay() === 5 : reviewDays >= 7

  return (
    <Page wide>
      <div className="grid gap-10 @[1000px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <header className="mb-8 flex items-center gap-5 animate-fade-in">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-accent">{longDateLabel(t)}</p>
              <h1 className="mt-0.5 text-[30px] leading-tight font-bold tracking-[-0.025em]">{greeting()}</h1>
              <p className="mt-1 text-[14px] text-muted">
                {total === 0
                  ? 'Nada planificado para hoy.'
                  : done.length === total
                    ? '¡Todo hecho por hoy! 🎉'
                    : `${total - done.length} ${total - done.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}${overdue.length ? `, ${overdue.length} atrasada${overdue.length > 1 ? 's' : ''}` : ''}.`}
              </p>
            </div>
            {total > 0 && (
              <div className="relative flex shrink-0 items-center justify-center">
                <ProgressRing value={progress} size={60} stroke={5} />
                <span className="absolute text-[13px] font-semibold tabular-nums">
                  {done.length}/{total}
                </span>
              </div>
            )}
          </header>

          {needsReview && (
            <a
              href={href('/review')}
              className="mb-8 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-[13.5px] transition-colors hover:border-accent/60"
            >
              <RefreshCcw size={16} className="text-accent" />
              <span className="flex-1">
                {reviewDays === null ? 'Haz tu primera revisión semanal' : `Hace ${reviewDays} días de tu última revisión semanal`}
              </span>
              <ArrowRight size={15} className="text-accent" />
            </a>
          )}

          {overdue.length > 0 && (
            <Section
              title="Atrasadas"
              count={overdue.length}
              tone="danger"
              action={
                <Button size="sm" variant="ghost" onClick={() => overdue.forEach((x) => updateTask(x.id, { dueDate: t }))}>
                  Mover todo a hoy
                </Button>
              }
            >
              <TaskList tasks={overdue} />
            </Section>
          )}

          <Section title="Hoy" count={todays.length} tone="accent">
            {todays.length === 0 && overdue.length === 0 && done.length === 0 ? (
              <Empty icon={<Sun size={22} />} title="Día despejado" hint="Añade lo que quieras hacer hoy o disfruta del descanso." />
            ) : todays.length === 0 && done.length > 0 && overdue.length === 0 ? (
              <Empty icon={<PartyPopper size={22} />} title="¡Lo has hecho todo!" hint="Buen trabajo. Mañana más." />
            ) : (
              <TaskList tasks={todays} hideDate />
            )}
            <InlineAdd defaults={{ dueDate: t }} />
          </Section>

          {done.length > 0 && (
            <section className="mb-8">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="mb-1 flex items-center gap-1.5 px-1 text-[12px] font-semibold tracking-wider text-muted uppercase hover:text-fg"
              >
                <ChevronDown size={14} className={cx('transition-transform', !showDone && '-rotate-90')} />
                Completadas hoy <span className="font-normal text-faint">{done.length}</span>
              </button>
              {showDone && <TaskList tasks={done} hideDate />}
            </section>
          )}
        </div>

        <aside className="space-y-4 @[1000px]:pt-[92px]">
          <HabitStrip />

          {(contact.length > 0 || birthdays.length > 0) && (
            <Card className="p-4">
              <h3 className="mb-3 text-[12px] font-semibold tracking-wider text-muted uppercase">Personas</h3>
              <div className="space-y-2">
                {birthdays.map(({ person, date, age }) => (
                  <a key={person.id} href={href(`/people/${person.id}`)} className="flex items-center gap-2.5 text-[13.5px] hover:text-accent">
                    <Cake size={15} className="text-warn" />
                    <span className="flex-1 truncate">{person.name}</span>
                    <span className="text-[12px] text-muted">
                      {dateLabel(date)}
                      {age ? ` · ${age}` : ''}
                    </span>
                  </a>
                ))}
                {contact.slice(0, 5).map(({ person, days }) => (
                  <a key={person.id} href={href(`/people/${person.id}`)} className="flex items-center gap-2.5 text-[13.5px] hover:text-accent">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-hover text-[10px] font-semibold">
                      {person.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{person.name}</span>
                    <span className="text-[12px] text-danger">{days === Infinity ? 'Sin contacto' : `${days} d`}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <div className="mb-3 flex items-center">
              <h3 className="text-[12px] font-semibold tracking-wider text-muted uppercase">Próximos 7 días</h3>
              <a href={href('/upcoming')} className="ml-auto text-[12px] text-accent hover:underline">
                Ver todo
              </a>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-[13px] text-faint">Nada a la vista.</p>
            ) : (
              <div className="space-y-2">
                {[...upcoming]
                  .sort((a, b) => (a.dueDate! + (a.dueTime ?? '')).localeCompare(b.dueDate! + (b.dueTime ?? '')))
                  .slice(0, 6)
                  .map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() => ui.openTask(x.id)}
                      className="flex w-full items-center gap-2.5 text-left text-[13.5px] hover:text-accent"
                    >
                      <CalendarClock size={14} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{x.title}</span>
                      <span className="shrink-0 text-[12px] text-muted">{dateLabel(x.dueDate!)}</span>
                    </button>
                  ))}
                {upcoming.length > 6 && <p className="text-[12px] text-faint">y {upcoming.length - 6} más…</p>}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </Page>
  )
}
