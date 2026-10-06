import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AnimatePresence } from 'motion/react'
import { ArrowRight, Check, Moon, Star, Sunrise, Telescope } from 'lucide-react'
import { db } from '@/db/db'
import { mutateTasks, saveJournal, setSetting, toggleTask } from '@/db/actions'
import { useOpenTasks } from '@/db/hooks'
import type { Task } from '@/db/types'
import { addDaysYmd, longDateLabel, today } from '@/lib/dates'
import { isStuck, postponedLabel } from '@/lib/day'
import { sortTasks, whenDue } from '@/lib/tasks'
import { eventsByDay, useEvents } from '@/lib/calendarEvents'
import { navigate } from '@/app/router'
import { toast } from '@/app/store'
import { useFeatures } from '@/app/features'
import { Button, Card, Group, PageHeader, Section } from '@/components/ui'
import { MoodPicker } from '@/features/journal/MoodPicker'
import { Page } from '../Page'
import ImportantPicker from '../today/ImportantPicker'
import { Row, type Action } from './PlanRow'

/**
 * Cerrar el día (el «shutdown» de Sunsama): lo que has hecho, qué pasa con lo
 * que queda (sin arrastrarlo sin pensar), qué tal el día y un vistazo a
 * mañana, con lo importante ya elegido. Luego, a desconectar.
 */
export function ShutdownView() {
  const t = today()
  const tomorrow = addDaysYmd(t, 1)
  const open = useOpenTasks()
  const features = useFeatures()
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const doneToday = useLiveQuery(() => db.tasks.where('completedAt').aboveOrEqual(start.getTime()).filter((x) => !!x.done).toArray(), [t])
  const journal = useLiveQuery(() => db.journal.get(t), [t])
  const cal = useEvents(tomorrow, tomorrow)
  const [picking, setPicking] = useState(false)

  const { left, next } = useMemo(() => {
    const list = [...(open ?? [])].sort(sortTasks)
    return {
      left: list.filter((x) => (whenDue(x) ?? '9') <= t || x.important === t),
      next: list.filter((x) => whenDue(x) === tomorrow),
    }
  }, [open, t, tomorrow])
  if (!open || !doneToday) return null

  const meetings = (eventsByDay(cal.events).get(tomorrow) ?? []).sort((a, b) => a.start.localeCompare(b.start))
  const importantTomorrow = next.filter((x) => x.important === tomorrow)

  const move = (patch: (task: Task) => void, label: string) => (x: Task) => {
    void mutateTasks([x.id], patch).then((before) => toast(`${x.title} → ${label}`, { label: 'Deshacer', run: () => void Promise.all(before.map((b) => db.tasks.put(b))) }))
  }
  const toTomorrow: Action = {
    label: 'Mañana',
    primary: true,
    run: move((task) => {
      task.dueDate = tomorrow
      delete task.dueTime
    }, 'mañana'),
  }
  const toSomeday = (primary: boolean): Action => ({
    label: 'Algún día',
    icon: <Telescope size={14} strokeWidth={2.4} />,
    primary,
    run: move((task) => {
      delete task.dueDate
      delete task.dueTime
      delete task.important
      task.someday = true
    }, 'algún día'),
  })
  const markDone: Action = { label: 'Hecha', icon: <Check size={15} strokeWidth={2.8} />, run: (x) => void toggleTask(x) }

  const allToTomorrow = async () => {
    const ids = left.map((x) => x.id)
    const before = await mutateTasks(ids, (task) => {
      task.dueDate = tomorrow
      delete task.dueTime
    })
    toast(`${ids.length} ${ids.length === 1 ? 'tarea' : 'tareas'} a mañana`, { label: 'Deshacer', run: () => void Promise.all(before.map((b) => db.tasks.put(b))) })
  }

  const close = async () => {
    await setSetting('lastShutdown', t)
    toast('Día cerrado. A descansar.')
    navigate('/today')
  }

  return (
    <Page>
      <PageHeader eyebrow={longDateLabel(t)} tint="var(--c-blue)" title="Cierra el día" subtitle="Repasa lo que has hecho, decide qué pasa con lo que queda y desconecta." />

      <Card className="mb-8 p-5">
        <p className="text-[13px] font-semibold text-muted">Hoy has hecho</p>
        <p className="font-num mt-1 text-[34px] leading-none font-bold tracking-tight">
          {doneToday.length} {doneToday.length === 1 ? 'tarea' : 'tareas'}
        </p>
        {doneToday.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {doneToday.slice(0, 8).map((x) => (
              <li key={x.id} className="flex items-center gap-2 text-[14px]">
                <Check size={14} strokeWidth={2.8} className="shrink-0 text-blue" />
                <span className="truncate">{x.title}</span>
              </li>
            ))}
            {doneToday.length > 8 && <li className="text-[13px] text-muted">y {doneToday.length - 8} más</li>}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-muted">Hoy no has completado nada. Pasa: mañana es otro día.</p>
        )}
      </Card>

      <Section
        title="Lo que queda"
        count={left.length}
        action={
          left.length > 1 ? (
            <Button size="sm" variant="ghost" onClick={() => void allToTomorrow()}>
              Todo a mañana
            </Button>
          ) : undefined
        }
      >
        <Group>
          <AnimatePresence initial={false}>
            {left.map((x) => {
              const stuck = isStuck(x) || (x.postponed ?? 0) >= 2
              return (
                <Row
                  key={x.id}
                  task={x}
                  meta={[x.important === t && '★ Importante', x.postponed && `${postponedLabel(x.postponed).toLowerCase()}${stuck ? ': ¿algún día?' : ''}`].filter(Boolean).join(' · ') || undefined}
                  // La que ya se ha pasado varias veces: mejor decidir que arrastrarla otra vez
                  actions={stuck ? [toSomeday(true), { ...toTomorrow, primary: false, icon: <Sunrise size={14} strokeWidth={2.4} /> }, markDone] : [toTomorrow, toSomeday(false), markDone]}
                />
              )
            })}
          </AnimatePresence>
          {!left.length && <p className="px-4 py-3 text-[14px] text-muted">Nada pendiente de hoy. ¡Bien hecho!</p>}
        </Group>
      </Section>

      {features.on('journal') && (
        <Section title="¿Qué tal el día?">
          <Card className="p-4">
            <MoodPicker size="sm" value={journal?.mood} onChange={(mood) => void saveJournal(t, { mood })} />
            <a href="#/journal" className="mt-3 block text-[13.5px] font-semibold text-blue">
              Escribir unas líneas en el diario
            </a>
          </Card>
        </Section>
      )}

      <Section
        title={`Mañana · ${longDateLabel(tomorrow).split(',')[0]}`}
        action={
          <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
            <Star size={14} strokeWidth={2.4} className="text-blue" fill={importantTomorrow.length ? 'currentColor' : 'none'} />{' '}
            {importantTomorrow.length ? `Lo importante (${importantTomorrow.length})` : 'Elegir lo importante'}
          </Button>
        }
      >
        <Card className="p-4 text-[14px]">
          {meetings.length === 0 && next.length === 0 ? (
            <p className="text-muted">Mañana, de momento, despejado.</p>
          ) : (
            <ul className="space-y-1.5">
              {meetings.slice(0, 5).map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="font-num w-12 shrink-0 text-muted">{e.allDay ? 'Todo' : new Date(e.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="min-w-0 truncate">{e.title}</span>
                </li>
              ))}
              {next.slice(0, 8).map((x) => (
                <li key={x.id} className="flex gap-3">
                  <span className="w-12 shrink-0 text-muted">{x.important === tomorrow ? '★' : x.dueTime ?? '·'}</span>
                  <span className="min-w-0 truncate">{x.title}</span>
                </li>
              ))}
              {next.length > 8 && <li className="pl-15 text-[13px] text-muted">y {next.length - 8} tareas más</li>}
            </ul>
          )}
        </Card>
      </Section>

      <ImportantPicker open={picking} day={tomorrow} onClose={() => setPicking(false)} />
      <div className="sticky bottom-[calc(max(env(safe-area-inset-bottom),10px)+80px)] z-10 flex justify-center md:bottom-6">
        <Button variant="primary" size="lg" onClick={() => void close()} className="shadow-[0_10px_28px_-12px_rgb(0_0_0/0.4)]">
          <Moon size={18} strokeWidth={2.4} /> Cerrar el día <ArrowRight size={17} strokeWidth={2.4} />
        </Button>
      </div>
    </Page>
  )
}

