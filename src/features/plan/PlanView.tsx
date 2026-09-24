import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CalendarCheck, CalendarRange, Check, Inbox, Sun, X } from 'lucide-react'
import { mutateTask, setSetting, toggleTask } from '@/db/actions'
import { useLookup, useOpenTasks } from '@/db/hooks'
import type { Task } from '@/db/types'
import { addDaysYmd, longDateLabel, relativeDays, today } from '@/lib/dates'
import { isInbox, sortTasks } from '@/lib/tasks'
import { dayLoad, durationLabel } from '@/lib/duration'
import { eventMinutes, eventsByDay, useEvents } from '@/lib/calendarEvents'
import { navigate } from '@/app/router'
import { toast, ui } from '@/app/store'
import { Checkbox } from '@/components/TaskItem'
import { Button, Empty, Group, PageHeader, Section, cx, softSpring } from '@/components/ui'
import { Page } from '../Page'
import { LOAD_HINT, LoadBar } from './LoadBar'
import { DayTimeline } from './DayTimeline'

const PRIO = ['', '!', '!!', '!!!']

type Action = { label: string; icon?: React.ReactNode; run: (t: Task) => void; primary?: boolean }

function Row({ task, meta, actions }: { task: Task; meta?: string; actions: Action[] }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      transition={softSpring}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)]">
        <Checkbox checked={false} priority={task.priority} onChange={() => void toggleTask(task)} />
        <button type="button" onClick={() => ui.openTask(task.id)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[15px]">
            {task.priority > 0 && <b className="mr-1 font-bold text-blue">{PRIO[task.priority]}</b>}
            {task.title}
          </span>
          {meta && <span className="block truncate text-[12.5px] text-muted">{meta}</span>}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              aria-label={a.label}
              title={a.label}
              onClick={() => a.run(task)}
              className={cx(
                'flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-semibold transition-transform active:scale-95',
                a.primary ? 'bg-accent text-white' : 'bg-fill text-fg',
                !!a.icon && !a.primary && 'w-8 justify-center px-0',
              )}
            >
              {a.icon ?? a.label}
              {a.icon && a.primary && a.label}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Planificar el día: lo atrasado, la bandeja y lo que viene pronto, con un
 * toque para traerlo a hoy o dejarlo para mañana. Lo abre el resumen de la mañana.
 */
export function PlanView() {
  const open = useOpenTasks()
  const { projects } = useLookup()
  const t = today()
  const tomorrow = addDaysYmd(t, 1)

  const { todays, overdue, inbox, soon } = useMemo(() => {
    const list = [...(open ?? [])].sort(sortTasks)
    return {
      todays: list.filter((x) => x.dueDate === t),
      overdue: list.filter((x) => x.dueDate && x.dueDate < t),
      inbox: list.filter(isInbox),
      soon: list.filter((x) => x.dueDate && x.dueDate > t && x.dueDate <= addDaysYmd(t, 7)),
    }
  }, [open, t])

  const cal = useEvents(t, t)
  const events = eventsByDay(cal.events).get(t) ?? []
  const meetings = events.filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start))
  const allDay = events.filter((e) => e.allDay)

  if (!open) return null

  const where = (x: Task) => projects.find((p) => p.id === x.projectId)?.name
  const move = (date: string | undefined, label: string) => (x: Task) => {
    const prev = { dueDate: x.dueDate, dueTime: x.dueTime }
    void mutateTask(x.id, (task) => {
      if (date) task.dueDate = date
      else delete task.dueDate
      // Al cambiar de día, la hora antigua ya no vale (salvo si se queda en hoy)
      if (date !== t) delete task.dueTime
    })
    toast(`${x.title} → ${label}`, {
      label: 'Deshacer',
      run: () =>
        void mutateTask(x.id, (task) => {
          if (prev.dueDate) task.dueDate = prev.dueDate
          else delete task.dueDate
          if (prev.dueTime) task.dueTime = prev.dueTime
          else delete task.dueTime
        }),
    })
  }
  const toToday: Action = { label: 'Hoy', icon: <Sun size={14} strokeWidth={2.6} />, run: move(t, 'hoy'), primary: true }
  const toTomorrow: Action = { label: 'Mañana', run: move(tomorrow, 'mañana') }
  const noDate: Action = { label: 'Quitar la fecha', icon: <X size={15} strokeWidth={2.6} />, run: move(undefined, 'sin fecha') }

  const finish = async () => {
    await setSetting('lastPlan', t)
    toast(todays.length ? `Día planificado: ${todays.length} ${todays.length === 1 ? 'tarea' : 'tareas'}` : 'Día planificado')
    navigate('/today')
  }

  const nothing = !overdue.length && !inbox.length && !soon.length
  const load = dayLoad(todays, meetings.map(eventMinutes))
  // Sin duraciones ni reuniones, se juzga por el número de tareas
  const level = load.total ? load.level : todays.length === 0 ? 'free' : todays.length <= 5 ? 'ok' : todays.length <= 8 ? 'busy' : 'over'

  return (
    <Page>
      <PageHeader eyebrow={longDateLabel(t)} tint="var(--c-blue)" title="Planifica tu día" subtitle="Elige qué haces hoy. Lo demás, a otro día." />

      <Section
        title="Para hoy"
        count={todays.length}
      >
        {(load.total > 0 || todays.length > 0) && <LoadBar load={load} hint={LOAD_HINT[level]} className="mb-3 px-1" />}
        {allDay.length > 0 && (
          <Group className="mb-3">
            {allDay.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-[15px] text-muted shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
                <CalendarRange size={16} strokeWidth={2.2} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{e.title}</span>
                <span className="text-[12.5px]">todo el día</span>
              </div>
            ))}
          </Group>
        )}
        {/* Las reuniones con hora se ven en «Hora a hora» */}
        <Group>
          <AnimatePresence initial={false}>
            {todays.map((x) => (
              <Row key={x.id} task={x} meta={[x.dueTime, x.estimate && durationLabel(x.estimate), where(x)].filter(Boolean).join(' · ') || undefined} actions={[toTomorrow]} />
            ))}
          </AnimatePresence>
          {!todays.length && <p className="px-4 py-3 text-[14px] text-muted">Trae aquí lo que quieras hacer hoy.</p>}
        </Group>
      </Section>

      {todays.length + meetings.length > 0 && <DayTimeline tasks={todays} events={meetings} />}

      {nothing ? (
        <Group className="mb-8">
          <Empty icon={<CalendarCheck size={28} strokeWidth={2.2} />} color="var(--c-green)" title="Nada pendiente de decidir" hint="Ni atrasadas ni bandeja: todo está en su sitio." />
        </Group>
      ) : (
        <>
          {overdue.length > 0 && (
            <Section title="Atrasadas" count={overdue.length}>
              <Group>
                <AnimatePresence initial={false}>
                  {overdue.map((x) => (
                    <Row key={x.id} task={x} meta={[relativeDays(x.dueDate!, t), where(x)].filter(Boolean).join(' · ')} actions={[toToday, toTomorrow, noDate]} />
                  ))}
                </AnimatePresence>
              </Group>
            </Section>
          )}
          {inbox.length > 0 && (
            <Section title={<span className="flex items-center gap-2"><Inbox size={17} strokeWidth={2.4} /> Bandeja</span>} count={inbox.length}>
              <Group>
                <AnimatePresence initial={false}>
                  {inbox.map((x) => (
                    <Row key={x.id} task={x} actions={[toToday, toTomorrow]} />
                  ))}
                </AnimatePresence>
              </Group>
            </Section>
          )}
          {soon.length > 0 && (
            <Section title="Próximos días" count={soon.length}>
              <Group>
                <AnimatePresence initial={false}>
                  {soon.map((x) => (
                    <Row key={x.id} task={x} meta={[relativeDays(x.dueDate!, t), x.dueTime, where(x)].filter(Boolean).join(' · ')} actions={[toToday]} />
                  ))}
                </AnimatePresence>
              </Group>
            </Section>
          )}
        </>
      )}

      <div className="sticky bottom-[calc(max(env(safe-area-inset-bottom),10px)+80px)] z-10 flex justify-center lg:bottom-6">
        <Button variant="primary" size="lg" onClick={() => void finish()} className="shadow-[0_10px_30px_-10px_var(--c-blue)]">
          <Check size={18} strokeWidth={2.6} /> Listo, a por el día <ArrowRight size={17} strokeWidth={2.4} />
        </Button>
      </div>
    </Page>
  )
}
