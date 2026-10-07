import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence, m as motion } from 'motion/react'
import { ArrowRight, CalendarCheck, ChevronRight, Moon, MoreHorizontal, RefreshCcw, SlidersHorizontal, Sparkles, Sun, Timer } from 'lucide-react'
import { whatNow } from './whatnow/store'
import { db } from '@/db/db'
import { setSetting, updateTask } from '@/db/actions'
import { useOpenTasks } from '@/db/hooks'
import { addDaysYmd, greeting, longDateLabel, today, weekStart } from '@/lib/dates'
import { isDue } from '@/lib/habits'
import { whenDue } from '@/lib/tasks'
import { href, navigate } from '@/app/router'
import { ui } from '@/app/store'
import { TaskList } from '@/components/TaskList'
import { OrderToggle } from '@/components/ManualOrder'
import { Menu } from '@/components/Menu'
import { Button, Empty, Group, PageHeader, Section, cx, softSpring } from '@/components/ui'
import { TodayCardsEditor, useTodayCards } from './today/cards'
import { useFeatures } from '@/app/features'
import { useHabits } from './habits/useHabits'
import { Agenda } from './today/Agenda'
import { NowCard } from './today/NowCard'
import { useEvents } from '@/lib/calendarEvents'
import { DayRings } from './today/DayRings'
import { WeekStrip } from './today/WeekStrip'
import { ImportantPrompt, ImportantSection } from './today/Important'
import { GoalFooter } from './today/DailyGoal'
import { Page } from './Page'
import { SelectButton } from '@/features/select/SelectButton'

// El anillo y el confeti de «día completado», solo cuando hace falta
// Elegir lo importante, solo al abrirlo
const ImportantPicker = lazy(() => import('./today/ImportantPicker'))
// Solo si tienes piso: se carga aparte para no pesar en el arranque
const HouseCard = lazy(() => import('./today/HouseCard'))
const MedsCard = lazy(() => import('./today/MedsCard'))
// Las tarjetas que solo salen si tienen algo (y no en todos los días) también,
// para que el arranque traiga lo justo: aparecen a la vez que sus datos
const RoutinesCard = lazy(() => import('./routines/RoutinesCard').then((m) => ({ default: m.RoutinesCard })))
const JournalPrompt = lazy(() => import('./journal/JournalPrompt').then((m) => ({ default: m.JournalPrompt })))
const TodayMeals = lazy(() => import('./menu/TodayMeals').then((m) => ({ default: m.TodayMeals })))
const CountdownsCard = lazy(() => import('./countdowns/CountdownsCard').then((m) => ({ default: m.CountdownsCard })))
const ThingsAttention = lazy(() => import('./things/ThingsAttention').then((m) => ({ default: m.ThingsAttention })))
const TrackersDue = lazy(() => import('./trackers/TrackersDue').then((m) => ({ default: m.TrackersDue })))
const PaymentsCard = lazy(() => import('./today/PaymentsCard').then((m) => ({ default: m.PaymentsCard })))
const HabitStrip = lazy(() => import('./habits/HabitStrip').then((m) => ({ default: m.HabitStrip })))
const PeopleCard = lazy(() => import('./today/PeopleCard').then((m) => ({ default: m.PeopleCard })))
const DayComplete = lazy(() => import('@/components/Celebrate').then((m) => ({ default: m.DayComplete })))

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
  const lastShutdown = useLiveQuery(() => db.settings.get('lastShutdown').then((r) => r?.value ?? null), [])
  // Una vez: presentar Ajustes → Funciones (null = aún no se ha visto)
  const featuresIntro = useLiveQuery(() => db.settings.get('featuresIntro').then((r) => r ?? null), [])
  const { habits, byHabit } = useHabits(7)
  const cal = useEvents(t, t)
  const todayEvents = cal.events.filter((e) => (e.allDay ? e.start <= t && e.end > t : new Date(e.start).toDateString() === new Date().toDateString()))
  const [showDone, setShowDone] = useState(false)
  const [picking, setPicking] = useState(false)
  const cards = useTodayCards()
  const features = useFeatures()
  const [customizing, setCustomizing] = useState(false)
  // Confeti solo si el día se completa ahora (no al volver a la pantalla)
  const lastPending = useRef<number | null>(null)
  const [justFinished, setJustFinished] = useState(false)

  const { overdue, todays, weekOpen, important } = useMemo(() => {
    const list = open ?? []
    const sunday = addDaysYmd(monday, 6)
    // Lo importante de hoy va arriba y no se repite más abajo
    const important = list.filter((x) => x.important === t)
    const rest = list.filter((x) => x.important !== t)
    return {
      important,
      // Cuenta también la fecha límite: lo que vence hoy sale en Hoy aunque no tenga fecha
      overdue: rest.filter((x) => (whenDue(x) ?? '9') < t),
      todays: rest.filter((x) => whenDue(x) === t),
      weekOpen: list.filter((x) => x.dueDate && x.dueDate >= monday && x.dueDate <= sunday).length,
    }
  }, [open, t, monday])

  const done = doneToday?.filter((x) => x.done) ?? []
  const pending = todays.length + overdue.length + important.length
  const ready = !!open && !!doneToday
  useEffect(() => {
    if (!ready) return
    if (lastPending.current !== null && lastPending.current > 0 && pending === 0 && done.length > 0) setJustFinished(true)
    lastPending.current = pending
  }, [ready, pending, done.length])

  if (!open) return null
  const total = pending + done.length
  const scheduledHabits = features.on('habits') ? (habits ?? []).filter((h) => isDue(h, byHabit.get(h.id) ?? new Set(), t)) : []
  const habitsDone = scheduledHabits.filter((h) => byHabit.get(h.id)?.has(t)).length
  const reviewDays = lastReview ? Math.floor((Date.now() - (lastReview.value as number)) / 864e5) : null
  const needsReview = features.on('review') && (reviewDays === null ? [0, 5, 6].includes(new Date().getDay()) : reviewDays >= 7)
  const inboxCount = (open ?? []).filter((x) => !x.areaId && !x.projectId && !x.dueDate).length
  // Planificar el día: si aún no se ha hecho hoy y hay algo que decidir
  const needsPlan = lastPlan !== undefined && lastPlan?.value !== t && (overdue.length > 0 || inboxCount > 0)
  // Por la tarde, cerrar el día (como Sunsama): si aún no se ha cerrado y hay algo que repasar
  const needsShutdown = lastShutdown !== undefined && lastShutdown !== t && new Date().getHours() >= 18 && (pending > 0 || done.length > 0)

  // Una sola sugerencia cada vez (la que toca ahora), no un montón de avisos apilados
  const importantPrompt = important.length === 0 && todays.length + overdue.length >= 3
  // Por la tarde, cerrar el día; la primera vez, elegir funciones (para que todo lo demás sea menos);
  // por la mañana, planificar (que ya incluye elegir lo importante); luego lo importante y la revisión
  const suggestion: 'shutdown' | 'plan' | 'important' | 'review' | 'features' | null = needsShutdown
    ? 'shutdown'
    : featuresIntro === null
      ? 'features'
      : needsPlan
        ? 'plan'
        : importantPrompt
          ? 'important'
          : needsReview
            ? 'review'
            : null

  /** Cada tarjeta de la columna de Hoy */
  const sideCard = (id: string) => {
    switch (id) {
      case 'agenda':
        return <Agenda tasks={todays} events={todayEvents} names={cal.names} />
      case 'journal':
        return <JournalPrompt />
      case 'meals':
        return <TodayMeals />
      case 'countdowns':
        return <CountdownsCard />
      case 'routines':
        return <RoutinesCard />
      case 'trackers':
        return <TrackersDue />
      case 'house':
        return <HouseCard />
      case 'meds':
        return <MedsCard />
      case 'things':
        return <ThingsAttention />
      case 'habits':
        return <HabitStrip />
      case 'week':
        return <WeekStrip tasks={open} />
      case 'payments':
        return <PaymentsCard />
      case 'people':
        return <PeopleCard people={people} />
      default:
        return null
    }
  }

  const summary =
    total === 0
      ? 'Nada planificado. Un buen día para adelantar algo.'
      : pending === 0
        ? '¡Todo hecho por hoy!'
        : [
            `${pending} ${pending === 1 ? 'pendiente' : 'pendientes'}`,
            overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'atrasada' : 'atrasadas'}` : '',
            scheduledHabits.length - habitsDone > 0 ? `${scheduledHabits.length - habitsDone} ${scheduledHabits.length - habitsDone === 1 ? 'hábito' : 'hábitos'} por hacer` : '',
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
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-accent-fill px-3.5 text-[14px] font-semibold text-white transition-transform active:scale-95 max-sm:w-9 max-sm:justify-center max-sm:px-0"
              >
                <Sparkles size={16} strokeWidth={2.4} />
                <span className="max-sm:hidden">¿Qué hago?</span>
              </button>
            )}
            <SelectButton />
            {/* Planificar, foco, cierre y revisión: momentos del día, que salen de aquí (no son lugares) */}
            <Menu
              label="Tu día"
              trigger={<MoreHorizontal size={17} strokeWidth={2.4} />}
              items={[
                { label: 'Planificar el día', icon: <Sun size={14} />, onSelect: () => navigate('/plan') },
                features.on('focus') && { label: 'Empezar foco', icon: <Timer size={14} />, onSelect: () => navigate('/focus') },
                { label: 'Cerrar el día', icon: <Moon size={14} />, onSelect: () => navigate('/shutdown') },
                features.on('review') && { label: 'Revisión semanal', icon: <RefreshCcw size={14} />, onSelect: () => navigate('/review') },
              ]}
            />
          </>
        }
      />

      <div
        className={cx(
          'grid gap-x-8 gap-y-6',
          // Sin anillos, la columna lateral empieza arriba del todo
          cards.visible.includes('rings')
            ? '[grid-template-areas:"rings"_"tasks"_"side"] @[1000px]:grid-cols-[minmax(0,1fr)_340px] @[1000px]:grid-rows-[auto_1fr] @[1000px]:[grid-template-areas:"tasks_rings"_"tasks_side"]'
            : '[grid-template-areas:"tasks"_"side"] @[1000px]:grid-cols-[minmax(0,1fr)_340px] @[1000px]:[grid-template-areas:"tasks_side"] @[1000px]:items-start',
        )}
      >
        {cards.visible.includes('rings') && (
          <div className="[grid-area:rings]">
            <DayRings
              rings={[
                { label: 'Tareas de hoy', done: done.length, total, color: 'var(--c-blue)' },
                ...(features.on('habits') ? [{ label: 'Hábitos', done: habitsDone, total: scheduledHabits.length, color: 'var(--c-green)' }] : []),
                { label: 'Esta semana', done: doneWeek, total: doneWeek + weekOpen, color: 'var(--c-text)' },
              ]}
              footer={<GoalFooter />}
            />
          </div>
        )}

        <div className="min-w-0 [grid-area:tasks]">
          <NowCard tasks={todays} events={todayEvents} />
          <AnimatePresence>
            {suggestion === 'features' && (
              <motion.section
                aria-label="Haz LUNO a tu medida"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={softSpring}
                className="glass mb-4 overflow-hidden rounded-[18px] px-4 py-3.5"
              >
                <p className="text-[15px] font-semibold">Haz LUNO a tu medida</p>
                <p className="mt-0.5 text-[14px] leading-snug text-muted">
                  Apaga lo que no uses (Menú, Gastos, Cosas…) y la barra lateral, ⌘K y Hoy se quedan solo con lo tuyo. Tus datos no se borran.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      void setSetting('featuresIntro', true)
                      ui.features()
                    }}
                  >
                    Elegir funciones
                  </Button>
                  <Button size="sm" onClick={() => void setSetting('featuresIntro', true)}>
                    Ahora no
                  </Button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {suggestion === 'plan' && (
              <motion.a
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={softSpring}
                href={href('/plan')}
                className="glass mb-4 flex items-center gap-3 rounded-[18px] px-4 py-3 text-[14px] transition-transform active:scale-[0.99]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-fill text-white">
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
            {suggestion === 'shutdown' && (
              <motion.a
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={softSpring}
                href={href('/shutdown')}
                className="glass mb-4 flex items-center gap-3 rounded-[18px] px-4 py-3 text-[14px] transition-transform active:scale-[0.99]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-fill text-white">
                  <Moon size={16} strokeWidth={2.4} />
                </span>
                <span className="flex-1">
                  <b className="font-semibold">Cierra el día</b>
                  <span className="block text-[13px] text-muted">
                    {[done.length ? `${done.length} ${done.length === 1 ? 'hecha' : 'hechas'}` : '', pending ? `${pending} por decidir` : ''].filter(Boolean).join(' · ')} · 2 minutos
                  </span>
                </span>
                <ArrowRight size={17} className="text-muted" />
              </motion.a>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {suggestion === 'review' && (
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

          {important.length > 0 ? (
            <ImportantSection tasks={important} onPick={() => setPicking(true)} />
          ) : (
            suggestion === 'important' && <ImportantPrompt onPick={() => setPicking(true)} />
          )}

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
              <Suspense fallback={<div className="h-[260px]" />}>
                <DayComplete count={done.length} celebrate={justFinished} />
              </Suspense>
            </Group>
          ) : (
            <>
              {timedGroups.map((g) => (
                <Section key={g.id} title={g.title} count={g.tasks.length}>
                  <TaskList tasks={g.tasks} hideDate />
                </Section>
              ))}
              <Section
                title={timedGroups.length ? 'Sin hora' : 'Hoy'}
                count={untimed.length}
                action={untimed.length > 1 ? <OrderToggle listKey="today" tasks={untimed} /> : undefined}
              >
                <TaskList tasks={untimed} hideDate orderKey="today" add={{ defaults: { dueDate: t } }} />
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
                <span className="font-num text-[15px] text-muted">{done.length}</span>
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
          {cards.visible.map((id) => (
            <Suspense key={id} fallback={null}>
              {sideCard(id)}
            </Suspense>
          ))}
          <button type="button" onClick={() => setCustomizing(true)} className="flex w-full items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-semibold text-muted transition-colors hover:text-fg">
            <SlidersHorizontal size={13} /> Personalizar Hoy
          </button>
        </aside>
      </div>
      <TodayCardsEditor open={customizing} onClose={() => setCustomizing(false)} />
      {picking && (
        <Suspense fallback={null}>
          <ImportantPicker open day={t} onClose={() => setPicking(false)} />
        </Suspense>
      )}
    </Page>
  )
}
