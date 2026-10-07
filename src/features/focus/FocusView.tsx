import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { m as motion } from 'motion/react'
import { Flame, Frown, Meh, Play, Smile, Star, Timer } from 'lucide-react'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { useLookup, useTask } from '@/db/hooks'
import type { FocusLog, Task } from '@/db/types'
import { addDaysYmd, capitalize, dateLabel, fmt, today } from '@/lib/dates'
import { formatMinutes } from '@/lib/stats'
import { bestWindow, focusStreak, groupMinutes, lastDays, minutesByDay, minutesByHour, windowLabel, type FocusGoal } from '@/lib/focusStats'
import { SectionIcon, section } from '@/app/sections'
import { Button, Card, Empty, PageHeader, ProgressBar, ProgressRing, Section, cx } from '@/components/ui'
import { Segmented } from '@/components/form'
import { Page } from '../Page'
import { DURATIONS, focus, useFocus } from './focus'
import { unlockAudio } from './noise'

const GOALS = [0, 60, 120, 180, 240]
const FACES = { 1: Frown, 2: Meh, 3: Smile } as const
const clockOf = (ms: number) => {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}
const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5)

/**
 * Foco: empezar una sesión (con una tarea o con lo que quieras hacer), el
 * objetivo del día con su racha (Forest), los últimos 14 días, tus mejores
 * horas (Rize) y en qué se va el tiempo (Toggl).
 */
export function FocusView() {
  const t = today()
  const logs = useLiveQuery(() => db.focusLogs.where('date').aboveOrEqual(addDaysYmd(t, -400)).toArray(), [t]) ?? []
  const goal = useLiveQuery(() => db.settings.get('focusGoal').then((r) => ((r?.value as FocusGoal | null | undefined)?.minutes ? (r!.value as FocusGoal) : null)), [])
  const todays = useLiveQuery(() => db.tasks.where('dueDate').belowOrEqual(t).filter((x) => !x.done).toArray(), [t]) ?? []
  const recentIds = useMemo(() => [...new Set(logs.filter((l) => l.date >= addDaysYmd(t, -29) && l.taskId).map((l) => l.taskId!))], [logs, t])
  const logTasks = useLiveQuery(() => db.tasks.bulkGet(recentIds), [recentIds.join()]) ?? []
  const { project, area } = useLookup()

  const byDay = minutesByDay(logs)
  const todayMin = byDay.get(t) ?? 0
  const pomodoros = logs.filter((l) => l.date === t && l.pomodoro).length
  const streak = focusStreak(byDay, goal?.minutes ?? 0, t)
  const month = logs.filter((l) => l.date >= addDaysYmd(t, -29))
  const byHour = minutesByHour(logs.filter((l) => l.date >= addDaysYmd(t, -59)), clockOf)
  const best = bestWindow(byHour)
  const taskOf = new Map(logTasks.filter((x): x is Task => !!x).map((x) => [x.id, x]))
  // Por proyecto (o área); lo suelto, por lo que se hizo
  const byWhat = groupMinutes(month, (l) => {
    const task = l.taskId ? taskOf.get(l.taskId) : undefined
    return project(task?.projectId)?.name ?? area(task?.areaId)?.name ?? (l.title || 'Foco libre')
  })
  const recent = [...logs].sort((a, b) => b.endedAt - a.endedAt).slice(0, 8)
  const suggestions = [...todays].sort((a, b) => Number(b.important === t) - Number(a.important === t) || b.priority - a.priority).slice(0, 6)

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('focus')} size={40} />}
        title="Foco"
        subtitle={todayMin ? `Hoy, ${formatMinutes(todayMin)}${pomodoros ? ` · ${pomodoros} ${pomodoros === 1 ? 'pomodoro' : 'pomodoros'}` : ''}` : 'Una cosa cada vez, con descansos.'}
      />
      <div className="grid gap-x-8 gap-y-2 @[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Start suggestions={suggestions} />
          <TodayCard minutes={todayMin} pomodoros={pomodoros} goal={goal ?? null} streak={streak} />
          <Days days={lastDays(byDay, t, 14)} goal={goal?.minutes ?? 0} today={t} />
        </div>
        <div>
          {logs.length === 0 ? (
            <Empty icon={<Timer size={22} />} title="Aún no hay sesiones" hint="Cada foco que hagas se apunta aquí: cuánto, en qué y a qué horas te concentras mejor." />
          ) : (
            <>
              <Hours byHour={byHour} best={best} />
              {byWhat.length > 0 && (
                <Section title="En qué, últimos 30 días">
                  <Card className="space-y-3 p-4">
                    {byWhat.slice(0, 6).map((w) => (
                      <div key={w.key}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]">
                          <span className="truncate font-medium">{w.key}</span>
                          <span className="font-num shrink-0 text-muted">{formatMinutes(w.minutes)}</span>
                        </div>
                        <ProgressBar value={w.minutes / byWhat[0].minutes} />
                      </div>
                    ))}
                  </Card>
                </Section>
              )}
              <Section title="Últimas sesiones">
                <Card className="overflow-hidden">
                  {recent.map((l) => (
                    <SessionRow key={l.id} log={l} />
                  ))}
                </Card>
              </Section>
            </>
          )}
        </div>
      </div>
    </Page>
  )
}

/** Empezar: una tarea de hoy o lo que quieras hacer (foco libre) */
function Start({ suggestions }: { suggestions: Task[] }) {
  const s = useFocus()
  const [text, setText] = useState('')
  const [minutes, setMinutes] = useState(25)
  const task = useTask(s?.taskId)
  if (s)
    return (
      <Card className="mb-6 flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-fill text-white">
          <Timer size={18} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-muted">En marcha</p>
          <p className="truncate text-[16px] font-semibold">{task?.title ?? s.intention ?? 'Foco libre'}</p>
        </div>
        <Button variant="primary" onClick={() => focus.minimize(false)}>
          Volver
        </Button>
      </Card>
    )
  const go = (start: () => void) => {
    unlockAudio()
    start()
    focus.start()
  }
  return (
    <Card className="mb-6 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          go(() => focus.openFree(text, minutes))
        }}
      >
        <label htmlFor="focus-intention" className="mb-2 block text-[15px] font-semibold">
          ¿En qué te vas a concentrar?
        </label>
        <div className="flex gap-2">
          <input
            id="focus-intention"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribir el informe, estudiar el tema 3…"
            className="min-w-0 flex-1 rounded-[12px] bg-fill px-3.5 py-2.5 text-[15px] outline-none placeholder:text-faint focus:ring-2 focus:ring-blue"
          />
          <Button type="submit" variant="primary">
            <Play size={15} /> Empezar
          </Button>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmented value={minutes} onChange={setMinutes} options={DURATIONS.map((m) => ({ value: m, label: `${m} min` }))} />
        <span className="text-[12.5px] text-muted">y descanso de 5 (15 cada cuatro)</span>
      </div>
      {suggestions.length > 0 && (
        <>
          <p className="mt-4 mb-2 text-[13px] font-semibold text-muted">O con una tarea de hoy</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => go(() => focus.open(x.id, minutes))}
                className="flex max-w-full items-center gap-1.5 rounded-full bg-fill px-3 py-1.5 text-[14px] font-medium transition-colors hover:bg-accent-soft"
              >
                {x.important === today() && <Star size={12} className="shrink-0 fill-current text-blue" />}
                <span className="truncate">{x.title}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

/** Hoy frente al objetivo y la racha (como Forest) */
function TodayCard({ minutes, pomodoros, goal, streak }: { minutes: number; pomodoros: number; goal: FocusGoal | null; streak: { current: number; best: number } }) {
  return (
    <Card className="mb-6 p-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={goal ? minutes / goal.minutes : minutes ? 1 : 0} size={64} stroke={7} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-muted">Hoy</p>
          <p className="font-num text-[28px] leading-tight font-bold tracking-tight">{formatMinutes(minutes)}</p>
          <p className="text-[13px] text-muted">
            {goal ? (minutes >= goal.minutes ? '¡Objetivo cumplido!' : `de ${formatMinutes(goal.minutes)}`) : 'sin objetivo'} · {pomodoros} {pomodoros === 1 ? 'pomodoro' : 'pomodoros'}
          </p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-[13px] font-semibold text-muted">
            <Flame size={13} /> Racha
          </p>
          <p className="font-num text-[22px] font-bold">{streak.current ? `${streak.current} ${streak.current === 1 ? 'día' : 'días'}` : '—'}</p>
          {streak.best > streak.current && <p className="text-[12px] text-muted">Mejor: {streak.best}</p>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="text-[13px] font-medium text-muted">Objetivo diario</span>
        <Segmented
          value={goal?.minutes ?? 0}
          onChange={(m) => void setSetting('focusGoal', m ? ({ minutes: m } satisfies FocusGoal) : null)}
          options={GOALS.map((m) => ({ value: m, label: m ? `${m / 60} h` : 'No' }))}
        />
      </div>
    </Card>
  )
}

/** Los últimos 14 días, con la línea del objetivo */
function Days({ days, goal, today: t }: { days: { date: string; minutes: number }[]; goal: number; today: string }) {
  const max = Math.max(goal, 30, ...days.map((d) => d.minutes))
  return (
    <Section
      title="Últimos 14 días"
      action={
        goal > 0 && (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
            <span aria-hidden className="w-4 border-t border-dashed border-line-strong" /> objetivo, {formatMinutes(goal)}
          </span>
        )
      }
    >
      <Card className="p-4">
        <div className="relative grid h-32 items-end gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {goal > 0 && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: `${(goal / max) * 100}%` }} />
          )}
          {days.map((d, i) => (
            <div key={d.date} className="flex h-full flex-col justify-end" title={`${capitalize(fmt(d.date, "EEEE d 'de' MMMM"))}: ${formatMinutes(d.minutes)}`}>
              <motion.span
                className={cx('w-full rounded-[6px]', d.date === t ? 'bg-green' : goal && d.minutes >= goal ? 'bg-blue' : 'bg-blue/55')}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(d.minutes ? 6 : 2, (d.minutes / max) * 100)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 18, delay: i * 0.025 }}
                style={{ opacity: d.minutes ? 1 : 0.25 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid gap-1.5 text-center text-[11px] font-semibold text-muted" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {days.map((d) => (
            <span key={d.date} className={cx(d.date === t && 'text-fg')}>
              {d.date === t ? 'Hoy' : capitalize(fmt(d.date, 'EEEEE'))}
            </span>
          ))}
        </div>
        <p className="sr-only">{days.map((d) => `${dateLabel(d.date)}: ${formatMinutes(d.minutes)}`).join('; ')}</p>
      </Card>
    </Section>
  )
}

/** A qué horas te concentras (últimos 60 días) y tu mejor franja (como Rize) */
function Hours({ byHour, best }: { byHour: number[]; best: { from: number; to: number } | null }) {
  const max = Math.max(1, ...byHour)
  return (
    <Section title="Tus mejores horas">
      <Card className="p-4">
        <p className="mb-3 text-[15px]">
          {best ? (
            <>
              Te concentras mejor <b className="font-semibold">{windowLabel(best)}</b>. Guarda esas horas para lo importante.
            </>
          ) : (
            <span className="text-muted">Con unas cuantas sesiones más verás aquí a qué horas te concentras mejor.</span>
          )}
        </p>
        <div aria-hidden className="flex h-16 items-end gap-[3px]">
          {byHour.map((m, h) => (
            <span
              key={h}
              className={cx('flex-1 rounded-[3px]', best && h >= best.from && h < best.to ? 'bg-blue' : 'bg-fill-2')}
              style={{ height: `${Math.max(4, (m / max) * 100)}%` }}
              title={`${h}:00 · ${formatMinutes(m)}`}
            />
          ))}
        </div>
        <div aria-hidden className="mt-1 flex justify-between text-[10.5px] font-semibold text-muted">
          <span>0 h</span>
          <span>6 h</span>
          <span>12 h</span>
          <span>18 h</span>
          <span>24 h</span>
        </div>
      </Card>
    </Section>
  )
}

function SessionRow({ log }: { log: FocusLog }) {
  const Face = log.rating ? FACES[log.rating] : null
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fill text-muted">{Face ? <Face size={16} strokeWidth={2.2} /> : <Timer size={15} strokeWidth={2.3} />}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium">{log.title || 'Foco libre'}</p>
        <p className="text-[12.5px] text-muted">
          {dateLabel(log.date)} · {hhmm(log.endedAt - log.minutes * 60_000)}–{hhmm(log.endedAt)}
          {log.pomodoro ? ' · pomodoro' : ''}
          {log.distractions ? ` · ${log.distractions} para luego` : ''}
        </p>
      </div>
      <span className="font-num shrink-0 text-[14px] font-semibold">{formatMinutes(log.minutes)}</span>
    </div>
  )
}
