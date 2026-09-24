import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CalendarCheck, ChevronRight, RefreshCcw, Sparkles, Sun } from 'lucide-react'
import { whatNow } from './whatnow/WhatNow'
import { DayComplete } from '@/components/Celebrate'
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
import { RoutinesCard } from './routines/RoutinesCard'
import { JournalPrompt } from './journal/JournalPrompt'
import { TodayMeals } from './menu/TodayMeals'
import { ThingsAttention } from './things/ThingsAttention'
import { TrackersDue } from './trackers/TrackersDue'
import { useHabits } from './habits/useHabits'
import { Agenda } from './today/Agenda'
import { useEvents } from '@/lib/calendarEvents'
import { DayRings } from './today/DayRings'
import { PaymentsCard } from './today/PaymentsCard'
import { PeopleCard } from './today/PeopleCard'
import { WeekStrip } from './today/WeekStrip'
import { Page } from './Page'
import { SelectButton } from '@/features/select/SelectionBar'

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
  // null = nunca se ha planificado; undefined = aún cargando
  const lastPlan = useLiveQuery(() => db.settings.get('lastPlan').then((r) => r ?? null), [])
  const { habits, byHabit } = useHabits(7)
  const cal = useEvents(t, t)
  const todayEvents = cal.events.filter((e) => (e.allDay ? e.start <= t && e.end > t : new Date(e.start).toDateString() === new Date().toDateString()))
  const [showDone, setShowDone] = useState(false)
  // Confeti solo si el día se completa ahora (no al volver a la pantalla)
  const lastPending = useRef<number | null>(null)
  const [justFinished, setJustFinished] = useState(false)

  const { overdue, todays, weekOpen } = useMemo(() => {
    const list = open ?? []
    const sunday = addDaysYmd(monday, 6)
    return {
      overdue: list.filter((x) => x.dueDate && x.dueDate < t),
      todays: list.filter((x) => x.dueDate === t),
      weekOpen: list.filter((x) => x.dueDate && x.dueDate >= monday && x.dueDate <= sunday).length,
    }
  }, [open, t, monday])

  const done = doneToday?.filter((x) => x.done) ?? []
  const pending = todays.length + overdue.length
  const ready = !!open && !!doneToday
  useEffect(() => {
    if (!ready) return
    if (lastPending.current !== null && lastPending.current > 0 && pending === 0 && done.length > 0) setJustFinished(true)
    lastPending.current = pending
  }, [ready, pending, done.length])

  if (!open) return null
  const total = pending + done.length
  const scheduledHabits = (habits ?? []).filter((h) => isScheduled(h, t))
  const habitsDone = scheduledHabits.filter((h) => byHabit.get(h.id)?.has(t)).length
  const reviewDays = lastReview ? Math.floor((Date.now() - (lastReview.value as number)) / 864e5) : null
  const needsReview = reviewDays === null ? [0, 5, 6].includes(new Date().getDay()) : reviewDays >= 7
  const inboxCount = (open ?? []).filter((x) => !x.areaId && !x.projectId && !x.dueDate).length
  // Planificar el día: si aún no se ha hecho hoy y hay algo que decidir
  const needsPlan = lastPlan !== undefined && lastPlan?.value !== t && (overdue.length > 0 || inboxCount > 0)

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
      <PageHeader eyebrow={longDateLabel(t)} tint="var(--c-blue)" title={greeting()}
        subtitle={summary}
        actions={
          <>
            {pending > 0 && (
              <button
                type="button"
                onClick={whatNow.open}
                aria-label="¿Qué hago ahora?"
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[14px] font-semibold text-white transition-transform active:scale-95 max-sm:w-9 max-sm:justify-center max-sm:px-0"
              >
                <Sparkles size={16} strokeWidth={2.4} />
                <span className="max-sm:hidden">¿Qué hago?</span>
              </button>
            )}
            <SelectButton />
          </>
        }
      />

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
              { label: 'Esta semana', done: doneWeek, total: doneWeek + weekOpen, color: 'var(--c-text)' },
            ]}
          />
        </div>

        <div className="min-w-0 [grid-area:tasks]">
          <AnimatePresence>
            {needsPlan && (
              <motion.a
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={softSpring}
                href={href('/plan')}
                className="glass mb-4 flex items-center gap-3 rounded-[18px] px-4 py-3 text-[14px] transition-transform active:scale-[0.99]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white">
                  <CalendarCheck size={16} strokeWidth={2.4} />
                </span>
                <span className="flex-1">
                  <b className="font-semibold">Planifica tu día</b>
                  <span className="block text-[13px] text-muted">
                    {[overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'atrasada' : 'atrasadas'}` : '', inboxCount ? `${inboxCount} en la bandeja` : '']
                      .filter(Boolean)
                      .join(' · ')}{' '}
                    · 1 minuto
                  </span>
                </span>
                <ArrowRight size={17} className="text-muted" />
              </motion.a>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {needsReview && (
              <motion.a
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={softSpring}
                href={href('/review')}
                className="glass mb-6 flex items-center gap-3 rounded-[18px] px-4 py-3 text-[14px] transition-transform active:scale-[0.99]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fill text-fg">
                  <RefreshCcw size={16} strokeWidth={2.4} />
                </span>
                <span className="flex-1">
                  <b className="font-semibold">Revisión semanal</b>
                  <span className="block text-[13px] text-muted">
                    {reviewDays === null ? 'Ordena tu semana en 5 minutos' : `Hace ${reviewDays} días de la última`}
                  </span>
                </span>
                <ArrowRight size={17} className="text-muted" />
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
              <DayComplete count={done.length} celebrate={justFinished} />
            </Group>
          ) : (
            <>
              {timedGroups.map((g) => (
                <Section key={g.id} title={g.title} count={g.tasks.length}>
                  <TaskList tasks={g.tasks} hideDate />
                </Section>
              ))}
              <Section title={timedGroups.length ? 'Sin hora' : 'Hoy'} count={untimed.length}>
                <TaskList tasks={untimed} hideDate add={{ defaults: { dueDate: t } }} />
              </Section>
            </>
          )}

          {done.length > 0 && (
            <section className="mb-8">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="mb-2 flex items-center gap-1.5 px-1 text-[17px] font-bold"
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
          <Agenda tasks={todays} events={todayEvents} names={cal.names} />
          <JournalPrompt />
          <TodayMeals />
          <RoutinesCard />
          <TrackersDue />
          <ThingsAttention />
          <HabitStrip />
          <WeekStrip tasks={open} />
          <PaymentsCard />
          <PeopleCard people={people} />
        </aside>
      </div>
    </Page>
  )
}
