import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ChevronRight, PartyPopper, RefreshCcw, Sun } from 'lucide-react'
import { db } from '@/db/db'
import { updateTask } from '@/db/actions'
import { useOpenTasks } from '@/db/hooks'
import { addDaysYmd, greeting, longDateLabel, today, weekStart } from '@/lib/dates'
import { isScheduled } from '@/lib/habits'
import { href } from '@/app/router'
import { ui } from '@/app/store'
import { TaskList } from '@/components/TaskList'
import { Button, Empty, Group, PageHeader, Section, cx, softSpring } from '@/components/ui'
import { HabitStrip } from './habits/HabitStrip'
import { useHabits } from './habits/useHabits'
import { Agenda } from './today/Agenda'
import { DayRings } from './today/DayRings'
import { PeopleCard } from './today/PeopleCard'
import { WeekStrip } from './today/WeekStrip'
import { Page } from './Page'

const PARTS = [
  { id: 'morning', title: 'Por la mañana', test: (t?: string) => !!t && t < '12:00' },
  { id: 'afternoon', title: 'Por la tarde', test: (t?: string) => !!t && t >= '12:00' && t < '19:00' },
  { id: 'evening', title: 'Por la noche', test: (t?: string) => !!t && t >= '19:00' },
]

export function TodayView() {
  const t = today()
  const open = useOpenTasks()
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const doneToday = useLiveQuery(() => db.tasks.where('completedAt').aboveOrEqual(startOfDay.getTime()).toArray(), [t])
  const monday = weekStart(t)
  const doneWeek = useLiveQuery(() => db.tasks.where('completedAt').aboveOrEqual(new Date(`${monday}T00:00:00`).getTime()).count(), [monday]) ?? 0
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const lastReview = useLiveQuery(() => db.settings.get('lastReview'), [])
  const { habits, byHabit } = useHabits(7)
  const [showDone, setShowDone] = useState(false)

  const { overdue, todays, weekOpen } = useMemo(() => {
    const list = open ?? []
    const sunday = addDaysYmd(monday, 6)
    return {
      overdue: list.filter((x) => x.dueDate && x.dueDate < t),
      todays: list.filter((x) => x.dueDate === t),
      weekOpen: list.filter((x) => x.dueDate && x.dueDate >= monday && x.dueDate <= sunday).length,
    }
  }, [open, t, monday])

  if (!open) return null
  const done = doneToday?.filter((x) => x.done) ?? []
  const pending = todays.length + overdue.length
  const total = pending + done.length
  const scheduledHabits = (habits ?? []).filter((h) => isScheduled(h, t))
  const habitsDone = scheduledHabits.filter((h) => byHabit.get(h.id)?.has(t)).length
  const reviewDays = lastReview ? Math.floor((Date.now() - (lastReview.value as number)) / 864e5) : null
  const needsReview = reviewDays === null ? [0, 5, 6].includes(new Date().getDay()) : reviewDays >= 7

  const summary =
    total === 0
      ? 'Nada planificado. Un buen día para adelantar algo.'
      : pending === 0
        ? '¡Todo hecho por hoy!'
        : [
            `${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`,
            overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'atrasada' : 'atrasadas'}` : '',
            scheduledHabits.length - habitsDone > 0 ? `${scheduledHabits.length - habitsDone} hábitos por hacer` : '',
          ]
            .filter(Boolean)
            .join(' · ')

  const timedGroups = PARTS.map((p) => ({ ...p, tasks: todays.filter((x) => p.test(x.dueTime)) })).filter((g) => g.tasks.length)
  const untimed = todays.filter((x) => !x.dueTime)

  return (
    <Page wide>
      <PageHeader eyebrow={longDateLabel(t)} tint="var(--c-blue)" title={greeting()} subtitle={summary} />

      <div
        className={cx(
          'grid gap-x-8 gap-y-6',
          '[grid-template-areas:"rings"_"tasks"_"side"]',
          '@[1000px]:grid-cols-[minmax(0,1fr)_340px] @[1000px]:grid-rows-[auto_1fr] @[1000px]:[grid-template-areas:"tasks_rings"_"tasks_side"]',
        )}
      >
        <div className="[grid-area:rings]">
          <DayRings
            rings={[
              { label: 'Tareas de hoy', done: done.length, total, color: 'var(--c-blue)' },
              { label: 'Hábitos', done: habitsDone, total: scheduledHabits.length, color: 'var(--c-green)' },
              { label: 'Esta semana', done: doneWeek, total: doneWeek + weekOpen, color: 'var(--c-orange)' },
            ]}
          />
        </div>

        <div className="min-w-0 [grid-area:tasks]">
          <AnimatePresence>
            {needsReview && (
              <motion.a
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={softSpring}
                href={href('/review')}
                className="glass mb-6 flex items-center gap-3 rounded-[18px] px-4 py-3 text-[14px] transition-transform active:scale-[0.99]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo text-white">
                  <RefreshCcw size={16} strokeWidth={2.4} />
                </span>
                <span className="flex-1">
                  <b className="font-semibold">Revisión semanal</b>
                  <span className="block text-[13px] text-muted">
                    {reviewDays === null ? 'Ordena tu semana en 5 minutos' : `Hace ${reviewDays} días de la última`}
                  </span>
                </span>
                <ArrowRight size={17} className="text-indigo" />
              </motion.a>
            )}
          </AnimatePresence>

          {overdue.length > 0 && (
            <Section
              title="Atrasadas"
              count={overdue.length}
              tone="red"
              action={
                <Button size="sm" variant="ghost" onClick={() => overdue.forEach((x) => updateTask(x.id, { dueDate: t }))}>
                  Pasar a hoy
                </Button>
              }
            >
              <TaskList tasks={overdue} />
            </Section>
          )}

          {total === 0 ? (
            <Group>
              <Empty icon={<Sun size={28} strokeWidth={2.2} />} color="var(--c-blue)" title="Día despejado" hint="Añade lo que quieras hacer hoy, o disfruta del descanso.">
                <Button variant="primary" onClick={() => ui.quickAdd({ dueDate: t })}>
                  Añadir tarea para hoy
                </Button>
              </Empty>
            </Group>
          ) : pending === 0 ? (
            <Group className="mb-8">
              <Empty icon={<PartyPopper size={28} strokeWidth={2.2} />} color="var(--c-green)" title="¡Lo has hecho todo!" hint="Buen trabajo. Mañana más." />
            </Group>
          ) : (
            <>
              {timedGroups.map((g) => (
                <Section key={g.id} title={g.title} count={g.tasks.length} tone="blue">
                  <TaskList tasks={g.tasks} hideDate />
                </Section>
              ))}
              <Section title={timedGroups.length ? 'Sin hora' : 'Hoy'} count={untimed.length} tone="blue">
                <TaskList tasks={untimed} hideDate add={{ defaults: { dueDate: t } }} />
              </Section>
            </>
          )}

          {done.length > 0 && (
            <section className="mb-8">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="mb-2 flex items-center gap-1.5 px-1 text-[17px] font-bold text-green"
              >
                <ChevronRight size={18} strokeWidth={2.6} className={cx('transition-transform duration-300', showDone && 'rotate-90')} />
                Completadas hoy
                <span className="font-num text-[15px] text-faint">{done.length}</span>
              </button>
              <AnimatePresence initial={false}>
                {showDone && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={softSpring} className="overflow-hidden">
                    <TaskList tasks={done} hideDate />
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4 [grid-area:side]">
          <Agenda tasks={todays} />
          <HabitStrip />
          <WeekStrip tasks={open} />
          <PeopleCard people={people} />
        </aside>
      </div>
    </Page>
  )
}
