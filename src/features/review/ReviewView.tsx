import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, ArrowRight, Brain, Cake, CalendarRange, Check, Folder, Inbox, PartyPopper, Sparkles } from 'lucide-react'
import { db } from '@/db/db'
import { createTask, setSetting, updateTask } from '@/db/actions'
import { useLookup, useOpenTasks } from '@/db/hooks'
import { addDaysYmd, dateLabel, today } from '@/lib/dates'
import { completionRate } from '@/lib/habits'
import { dueForContact, upcomingBirthdays } from '@/lib/people'
import { isInbox } from '@/lib/tasks'
import { href, navigate } from '@/app/router'
import { toast } from '@/app/store'
import { Icon } from '@/components/icons'
import { InlineAdd, TaskList } from '@/components/TaskList'
import { Button, Card, Textarea, bouncy, cx, spring } from '@/components/ui'
import { AnimatePresence, motion } from 'motion/react'
import { SectionIcon, section } from '@/app/sections'
import { useHabits } from '../habits/useHabits'
import { Page } from '../Page'

const STEPS = [
  { key: 'dump', title: 'Vacía tu cabeza', icon: Brain, hint: 'Escribe todo lo que te ronda: una cosa por línea. Irá a la Bandeja.' },
  { key: 'inbox', title: 'Procesa la bandeja', icon: Inbox, hint: 'Para cada cosa: ponle fecha, muévela a un proyecto o bórrala.' },
  { key: 'overdue', title: 'Lo atrasado', icon: AlertTriangle, hint: 'Sé honesto: ¿lo vas a hacer? Reprograma o elimina.' },
  { key: 'projects', title: 'Tus proyectos', icon: Folder, hint: 'Cada proyecto activo necesita al menos un siguiente paso claro.' },
  { key: 'week', title: 'La semana que viene', icon: CalendarRange, hint: 'Echa un vistazo a lo que viene y prepárate.' },
  { key: 'habits', title: 'Tus hábitos', icon: Sparkles, hint: 'Cómo ha ido la semana.' },
  { key: 'done', title: '¡Listo!', icon: PartyPopper, hint: '' },
] as const

export function ReviewView() {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const go = (i: number) => {
    setDir(i >= step ? 1 : -1)
    setStep(i)
    document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  const next = async () => {
    if (step === STEPS.length - 2) {
      await setSetting('lastReview', Date.now())
    }
    go(Math.min(step + 1, STEPS.length - 1))
  }

  return (
    <Page>
      <div className="mb-6 flex items-center gap-3">
        <SectionIcon def={section('review')} size={30} />
        <span className="text-[15px] font-semibold">Revisión semanal</span>
        <span className="font-num ml-auto text-[14px] font-semibold text-muted">
          {Math.min(step + 1, STEPS.length - 1)} de {STEPS.length - 1}
        </span>
      </div>
      <div className="mb-10 flex gap-1.5">
        {STEPS.slice(0, -1).map((x, i) => (
          <button key={x.key} type="button" aria-label={x.title} onClick={() => go(i)} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-fill">
            <motion.span
              className="absolute inset-0 origin-left rounded-full"
              style={{ background: i < step || last ? 'var(--c-green)' : 'var(--c-blue)' }}
              initial={false}
              animate={{ scaleX: i <= step || last ? 1 : 0 }}
              transition={spring}
            />
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={s.key}
          custom={dir}
          initial={{ opacity: 0, x: dir * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -40, transition: { duration: 0.15 } }}
          transition={spring}
        >
          <header className="mb-8">
            <motion.span
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={bouncy}
              className="flex h-14 w-14 items-center justify-center rounded-[16px] text-white"
              style={{ background: last ? 'var(--c-green)' : 'var(--c-fill)', color: last ? 'var(--c-on-green)' : 'var(--c-text)' }}
            >
              <s.icon size={28} strokeWidth={2.2} />
            </motion.span>
            <h1 className="mt-4 text-[32px] font-bold tracking-[-0.025em]">{s.title}</h1>
            {s.hint && <p className="mt-1.5 text-[16px] leading-snug text-muted">{s.hint}</p>}
          </header>

          <div className="min-h-60">
            {s.key === 'dump' && <DumpStep />}
            {s.key === 'inbox' && <InboxStep />}
            {s.key === 'overdue' && <OverdueStep />}
            {s.key === 'projects' && <ProjectsStep />}
            {s.key === 'week' && <WeekStep />}
            {s.key === 'habits' && <HabitsStep />}
            {s.key === 'done' && <DoneStep />}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-10 flex items-center gap-3">
        {step > 0 && !last && (
          <Button onClick={() => go(step - 1)}>
            <ArrowLeft size={16} strokeWidth={2.4} /> Atrás
          </Button>
        )}
        <div className="flex-1" />
        {last ? (
          <Button variant="primary" size="lg" onClick={() => navigate('/today')}>
            Ir a Hoy <ArrowRight size={17} strokeWidth={2.4} />
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={next}>
            {step === STEPS.length - 2 ? 'Terminar revisión' : 'Siguiente'} <ArrowRight size={17} strokeWidth={2.4} />
          </Button>
        )}
      </div>
    </Page>
  )
}

function DumpStep() {
  const [text, setText] = useState('')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <div>
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={'Renovar el DNI\nLlamar al fontanero\nIdea: aprender a cocinar sushi\n…'}
        className="glass min-h-48 rounded-[20px] p-4 text-[16px] leading-7"
      />
      <div className="mt-3 flex justify-end">
        <Button
          variant="secondary"
          disabled={!lines.length}
          onClick={async () => {
            for (const title of lines) await createTask({ title })
            setText('')
            toast(`${lines.length} ${lines.length === 1 ? 'cosa enviada' : 'cosas enviadas'} a la Bandeja`)
          }}
        >
          <Inbox size={15} /> Enviar {lines.length || ''} a la Bandeja
        </Button>
      </div>
    </div>
  )
}

function InboxStep() {
  const tasks = useOpenTasks() ?? []
  const inbox = tasks.filter(isInbox)
  if (!inbox.length) return <Done text="La bandeja está vacía. ¡Perfecto!" />
  return (
    <div>
      <p className="mb-3 text-[13px] text-muted">
        Quedan <b className="text-fg">{inbox.length}</b>. Haz clic en cada una para asignarla.
      </p>
      <TaskList tasks={inbox} />
    </div>
  )
}

function OverdueStep() {
  const tasks = useOpenTasks() ?? []
  const t = today()
  const overdue = tasks.filter((x) => x.dueDate && x.dueDate < t)
  if (!overdue.length) return <Done text="Nada atrasado. Vas al día." />
  const moveAll = (dueDate: string | undefined) => overdue.forEach((x) => updateTask(x.id, { dueDate }))
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => moveAll(t)}>
          Todo a hoy
        </Button>
        <Button size="sm" onClick={() => moveAll(addDaysYmd(t, 1))}>
          Todo a mañana
        </Button>
        <Button size="sm" onClick={() => moveAll(addDaysYmd(t, 7))}>
          Todo a la semana que viene
        </Button>
        <Button size="sm" variant="ghost" onClick={() => moveAll(undefined)}>
          Quitar fechas
        </Button>
      </div>
      <TaskList tasks={overdue} />
    </div>
  )
}

function ProjectsStep() {
  const { projects, area } = useLookup()
  const tasks = useOpenTasks() ?? []
  const active = projects.filter((p) => p.status === 'active')
  if (!active.length)
    return (
      <p className="text-[14px] text-muted">
        No tienes proyectos activos.{' '}
        <a href={href('/projects')} className="font-semibold text-blue hover:underline">
          Crear uno
        </a>
      </p>
    )
  return (
    <div className="space-y-3">
      {active.map((p) => {
        const open = tasks.filter((x) => x.projectId === p.id)
        const a = area(p.areaId)
        return (
          <Card key={p.id} className={cx('p-4', !open.length && 'ring-2 ring-orange/50')}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-faint" />
              <a href={href(`/project/${p.id}`)} className="flex-1 text-[16px] font-semibold">
                {p.name}
              </a>
              {a && <Icon name={a.icon} size={13} className="text-muted" />}
              <span className={cx('text-[13px] font-semibold', open.length ? 'text-muted' : 'text-orange')}>
                {open.length ? `${open.length} pendientes` : 'Sin siguiente paso'}
              </span>
            </div>
            {!open.length && (
              <div className="mt-2">
                <InlineAdd defaults={{ projectId: p.id, areaId: p.areaId }} placeholder="Añadir siguiente paso" />
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function WeekStep() {
  const tasks = useOpenTasks() ?? []
  const people = useLiveQuery(() => db.people.toArray(), []) ?? []
  const t = today()
  const week = tasks.filter((x) => x.dueDate && x.dueDate >= t && x.dueDate <= addDaysYmd(t, 7))
  const contact = dueForContact(people, t)
  const bdays = upcomingBirthdays(people, t, 10)
  return (
    <div className="space-y-6">
      {(bdays.length > 0 || contact.length > 0) && (
        <Card className="space-y-2 p-4">
          {bdays.map((b) => (
            <p key={b.person.id} className="flex items-center gap-2 text-[13.5px]">
              <Cake size={15} className="text-pink" strokeWidth={2.4} /> Cumpleaños de <a className="font-semibold text-purple" href={href(`/people/${b.person.id}`)}>{b.person.name}</a>
              <span className="text-muted">· {dateLabel(b.date)}</span>
            </p>
          ))}
          {contact.map((c) => (
            <p key={c.person.id} className="flex items-center gap-2 text-[13.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Hablar con{' '}
              <a className="font-semibold text-purple" href={href(`/people/${c.person.id}`)}>{c.person.name}</a>
            </p>
          ))}
        </Card>
      )}
      {!week.length && <p className="px-1 text-[15px] text-muted">Semana tranquila. Buen momento para avanzar en proyectos.</p>}
      <TaskList tasks={week} add={{ defaults: { dueDate: addDaysYmd(t, 1) }, placeholder: 'Planificar algo para esta semana', color: 'var(--c-orange)' }} />
    </div>
  )
}

function HabitsStep() {
  const { habits, byHabit, today: t } = useHabits(14)
  const doneTasks = useLiveQuery(() => db.tasks.where('completedAt').above(Date.now() - 7 * 864e5).count(), []) ?? 0
  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4 p-4">
        <span className="font-num text-[40px] font-bold">{doneTasks}</span>
        <span className="text-[14px] text-muted">tareas completadas en los últimos 7 días</span>
      </Card>
      {(habits ?? []).map((h) => {
        const rate = completionRate(h, byHabit.get(h.id) ?? new Set(), t, 7)
        return (
          <div key={h.id} className="flex items-center gap-3">
            <Icon name={h.icon} size={16} className="text-muted" />
            <span className="w-44 truncate text-[13.5px]">{h.name}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${rate * 100}%`, background: 'var(--c-green)' }} />
            </div>
            <span className="w-10 text-right text-[12px] text-muted tabular-nums">{Math.round(rate * 100)}%</span>
          </div>
        )
      })}
      {habits?.length === 0 && (
        <p className="text-[14px] text-muted">
          Aún no sigues ningún hábito.{' '}
          <a href={href('/habits')} className="font-semibold text-blue hover:underline">
            Crea el primero
          </a>
        </p>
      )}
    </div>
  )
}

function DoneStep() {
  const tips = useMemo(
    () => [
      'Tu sistema está al día. Ahora puedes olvidarte y confiar en él.',
      'Mente despejada, semana en orden. ¡A por ella!',
      'Revisión completada. Nos vemos la semana que viene.',
    ],
    [],
  )
  return <Done text={tips[new Date().getDate() % tips.length]} big />
}

function Done({ text, big }: { text: string; big?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={bouncy}
      className={cx('glass flex items-center gap-3 rounded-[20px] px-5', big ? 'py-8 text-[18px]' : 'py-4 text-[15px]')}
    >
      <Check size={big ? 22 : 18} strokeWidth={2.5} />
      <span className="font-medium">{text}</span>
    </motion.div>
  )
}
