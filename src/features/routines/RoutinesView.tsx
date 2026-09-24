import { useState } from 'react'
import { motion } from 'motion/react'
import { Bell, Check, Flame, ListChecks, Pencil, Play, Plus } from 'lucide-react'
import type { Routine } from '@/db/types'
import { createRoutine, toggleRoutineStep } from '@/db/actions'
import { WEEK_ORDER, WEEKDAYS_SHORT } from '@/lib/dates'
import { ROUTINE_PRESETS, routineProgress, routineStreak, routineToday } from '@/lib/routines'
import { uid } from '@/lib/id'
import { haptic } from '@/lib/haptics'
import { SectionIcon, section } from '@/app/sections'
import { setUI, useUI } from '@/app/store'
import { Icon } from '@/components/icons'
import { Button, Empty, Group, IconButton, PageHeader, ProgressRing, bouncy, cx, spring } from '@/components/ui'
import { Page } from '../Page'
import { RoutineForm } from './RoutineForm'
import { runner, useRoutines } from './useRoutines'

function daysLabel(days: number[]) {
  if (days.length === 7) return 'Todos los días'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'De lunes a viernes'
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Fines de semana'
  return WEEK_ORDER.filter((d) => days.includes(d))
    .map((d) => WEEKDAYS_SHORT[d])
    .join(' ')
}

export function RoutinesView() {
  const { routines, byRoutine, completed, today } = useRoutines(90)
  const creating = useUI((s) => s.creating === 'routine')
  const [editing, setEditing] = useState<Routine | undefined>()
  if (!routines) return null

  const presets = (
    <div className="flex flex-wrap justify-center gap-2">
      {ROUTINE_PRESETS.filter((p) => !routines.some((r) => r.name === p.name)).map((p, i) => (
        <motion.button
          key={p.name}
          type="button"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: i * 0.04 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => createRoutine({ name: p.name, icon: p.icon, time: p.time, days: p.days, steps: p.steps.map((title) => ({ id: uid(), title })) })}
          className="glass flex h-10 items-center gap-2 rounded-full pr-4 pl-1.5 text-[14px] font-medium"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fill text-fg">
            <Icon name={p.icon} size={14} strokeWidth={2.4} />
          </span>
          {p.name}
        </motion.button>
      ))}
    </div>
  )

  const todays = routines.filter((r) => routineToday(r, today))
  const doneToday = todays.filter((r) => routineProgress(r, byRoutine.get(r.id)?.get(today)).complete).length

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('routines')} size={40} />}
        title="Rutinas"
        subtitle={todays.length ? `Hoy llevas ${doneToday} de ${todays.length}.` : 'Listas de pasos para no dejarte nada: al salir de casa, al acostarte…'}
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'routine' })}>
            <Plus size={16} strokeWidth={2.6} /> Nueva
          </Button>
        }
      />

      {routines.length === 0 ? (
        <Group className="mb-6">
          <Empty
            icon={<ListChecks size={28} strokeWidth={2.2} />}
            color="var(--c-blue)"
            title="Aún no tienes rutinas"
            hint="Una rutina es una lista corta que haces siempre igual. NTab te avisa a su hora y te guía paso a paso. Toca una idea:"
          >
            {presets}
          </Empty>
        </Group>
      ) : (
        <div className="grid gap-4 @[760px]:grid-cols-2">
          {routines.map((r, i) => {
            const run = byRoutine.get(r.id)?.get(today)
            const p = routineProgress(r, run)
            const on = routineToday(r, today)
            const s = routineStreak(r, completed.get(r.id) ?? new Set(), today)
            const done = new Set(run?.done ?? [])
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: Math.min(i, 8) * 0.04 }}
                className={cx('glass rounded-[20px] p-4', !on && 'opacity-70')}
              >
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <ProgressRing value={p.total ? p.done / p.total : 0} size={48} stroke={5} color="var(--c-green)" track="var(--c-fill)" />
                    <span className={cx('absolute inset-0 flex items-center justify-center', p.complete ? 'text-fg' : 'text-muted')}>
                      {p.complete ? <Check size={20} strokeWidth={3} /> : <Icon name={r.icon} size={18} />}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-semibold">{r.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                      <span>{on ? (p.complete ? 'Hecha hoy' : `${p.done} de ${p.total} hoy`) : 'Hoy no toca'}</span>
                      {r.time && (
                        <span className="inline-flex items-center gap-1">
                          <Bell size={11} strokeWidth={2.4} /> {r.time}
                        </span>
                      )}
                      <span>{daysLabel(r.days)}</span>
                      {s > 0 && (
                        <span className="font-num inline-flex items-center gap-0.5 font-bold text-fg">
                          <Flame size={12} strokeWidth={2.6} /> {s}
                        </span>
                      )}
                    </p>
                  </div>
                  <IconButton label={`Editar ${r.name}`} onClick={() => setEditing(r)}>
                    <Pencil size={15} />
                  </IconButton>
                </div>
                <ul className="mt-3 space-y-0.5">
                  {r.steps.map((st) => {
                    const ok = done.has(st.id)
                    return (
                      <li key={st.id}>
                        <button
                          type="button"
                          onClick={() => {
                            haptic()
                            void toggleRoutineStep(r, today, st.id)
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-hover"
                        >
                          <span className={cx('relative flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border-[1.6px]', ok ? 'border-green' : 'border-faint')}>
                            <motion.span className="absolute inset-[-1.6px] rounded-full bg-green" initial={false} animate={{ scale: ok ? 1 : 0 }} transition={bouncy} />
                            {ok && <Check size={12} strokeWidth={3.2} className="relative text-on-green" />}
                          </span>
                          <span className={cx('text-[15px] transition-colors', ok ? 'text-faint line-through' : 'text-fg')}>{st.title}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {!p.complete && p.total > 0 && (
                  <Button variant="tinted" className="mt-3 w-full" onClick={() => runner.open(r.id)}>
                    <Play size={14} strokeWidth={2.6} /> {p.done ? 'Seguir paso a paso' : 'Empezar paso a paso'}
                  </Button>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {routines.length > 0 && routines.length < 5 && ROUTINE_PRESETS.some((p) => !routines.some((r) => r.name === p.name)) && (
        <div className="mt-8">
          <p className="mb-3 px-1 text-[17px] font-bold text-muted">Ideas</p>
          <div className="[&>div]:justify-start">{presets}</div>
        </div>
      )}

      <RoutineForm open={creating} onClose={() => setUI({ creating: null })} />
      <RoutineForm routine={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}
