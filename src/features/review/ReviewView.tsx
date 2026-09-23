import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, ArrowRight, Brain, Cake, CalendarRange, Check, Folder, Inbox, PartyPopper, RefreshCcw, Sparkles } from 'lucide-react'
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
import { Button, Card, Textarea, cx } from '@/components/ui'
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
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  const next = async () => {
    if (step === STEPS.length - 2) {
      await setSetting('lastReview', Date.now())
    }
    setStep((v) => Math.min(v + 1, STEPS.length - 1))
    window.scrollTo({ top: 0 })
  }

  return (
    <Page>
      <div className="mb-8 flex items-center gap-3">
        <RefreshCcw size={22} className="text-accent" />
        <span className="text-[13px] font-medium text-muted">Revisión semanal</span>
        <span className="ml-auto text-[12px] text-faint tabular-nums">
          {Math.min(step + 1, STEPS.length - 1)} / {STEPS.length - 1}
        </span>
      </div>
      <div className="mb-10 flex gap-1">
        {STEPS.slice(0, -1).map((x, i) => (
          <button
            key={x.key}
            type="button"
            aria-label={x.title}
            onClick={() => setStep(i)}
            className={cx('h-1 flex-1 rounded-full transition-colors', i < step || last ? 'bg-lime' : i === step ? 'bg-accent' : 'bg-line')}
          />
        ))}
      </div>

      <header className="mb-8 animate-fade-in" key={s.key}>
        <s.icon size={28} className={last ? 'text-lime' : 'text-accent'} />
        <h1 className="mt-3 text-[30px] font-bold tracking-[-0.025em]">{s.title}</h1>
        {s.hint && <p className="mt-1 text-[14px] text-muted">{s.hint}</p>}
      </header>

      <div className="min-h-60 animate-fade-in" key={`c-${s.key}`}>
        {s.key === 'dump' && <DumpStep />}
        {s.key === 'inbox' && <InboxStep />}
        {s.key === 'overdue' && <OverdueStep />}
        {s.key === 'projects' && <ProjectsStep />}
        {s.key === 'week' && <WeekStep />}
        {s.key === 'habits' && <HabitsStep />}
        {s.key === 'done' && <DoneStep />}
      </div>

      <div className="mt-10 flex items-center border-t border-line pt-5">
        {step > 0 && !last && (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ArrowLeft size={15} /> Atrás
          </Button>
        )}
        <div className="flex-1" />
        {last ? (
          <Button variant="primary" onClick={() => navigate('/today')}>
            Ir a Hoy <ArrowRight size={15} />
          </Button>
        ) : (
          <Button variant="primary" onClick={next}>
            {step === STEPS.length - 2 ? 'Terminar revisión' : 'Siguiente'} <ArrowRight size={15} />
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
        className="min-h-48 rounded-2xl border border-line bg-surface p-4 text-[15px] leading-7"
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
        <a href={href('/projects')} className="text-accent hover:underline">
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
          <Card key={p.id} className={cx('p-4', !open.length && 'border-warn/40')}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
              <a href={href(`/project/${p.id}`)} className="flex-1 text-[14.5px] font-medium hover:text-accent">
                {p.name}
              </a>
              {a && <Icon name={a.icon} size={13} style={{ color: a.color }} />}
              <span className={cx('text-[12px]', open.length ? 'text-muted' : 'font-medium text-warn')}>
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
              <Cake size={14} className="text-warn" /> Cumpleaños de <a className="font-medium hover:text-accent" href={href(`/people/${b.person.id}`)}>{b.person.name}</a>
              <span className="text-muted">· {dateLabel(b.date)}</span>
            </p>
          ))}
          {contact.map((c) => (
            <p key={c.person.id} className="flex items-center gap-2 text-[13.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-danger" /> Hablar con{' '}
              <a className="font-medium hover:text-accent" href={href(`/people/${c.person.id}`)}>{c.person.name}</a>
            </p>
          ))}
        </Card>
      )}
      {week.length ? <TaskList tasks={week} /> : <p className="text-[14px] text-muted">Semana tranquila. Buen momento para avanzar en proyectos.</p>}
      <InlineAdd defaults={{ dueDate: addDaysYmd(t, 1) }} placeholder="Planificar algo para esta semana" />
    </div>
  )
}

function HabitsStep() {
  const { habits, byHabit, today: t } = useHabits(14)
  const doneTasks = useLiveQuery(() => db.tasks.where('completedAt').above(Date.now() - 7 * 864e5).count(), []) ?? 0
  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4 p-4">
        <span className="text-[34px] font-bold tabular-nums text-lime">{doneTasks}</span>
        <span className="text-[14px] text-muted">tareas completadas en los últimos 7 días</span>
      </Card>
      {(habits ?? []).map((h) => {
        const rate = completionRate(h, byHabit.get(h.id) ?? new Set(), t, 7)
        return (
          <div key={h.id} className="flex items-center gap-3">
            <Icon name={h.icon} size={16} style={{ color: h.color }} />
            <span className="w-44 truncate text-[13.5px]">{h.name}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full" style={{ width: `${rate * 100}%`, background: h.color }} />
            </div>
            <span className="w-10 text-right text-[12px] text-muted tabular-nums">{Math.round(rate * 100)}%</span>
          </div>
        )
      })}
      {habits?.length === 0 && (
        <p className="text-[14px] text-muted">
          Aún no sigues ningún hábito.{' '}
          <a href={href('/habits')} className="text-accent hover:underline">
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
    <div className={cx('flex items-center gap-3 rounded-2xl bg-lime-soft px-5 text-lime', big ? 'py-8 text-[16px]' : 'py-4 text-[14px]')}>
      <Check size={big ? 22 : 18} strokeWidth={2.5} />
      <span className="font-medium">{text}</span>
    </div>
  )
}
