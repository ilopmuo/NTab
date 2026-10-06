import { useEffect, useState } from 'react'
import { m as motion } from 'motion/react'
import { CalendarOff, Check, Flame, MoreHorizontal, Pause, Pencil, Play, Plus, Trophy } from 'lucide-react'
import type { Habit } from '@/db/types'
import { createHabit, pauseHabit, resumeHabit, toggleHabit, toggleHabitDayOff } from '@/db/actions'
import { addDaysYmd, fmt, fromYmd, weekStart, WEEKDAYS_SHORT } from '@/lib/dates'
import { bestStreak, isCounted, isDue, isScheduled, onBreak, openBreak, perWeekOf, progressLabel, streak, streakLabel, strength, targetOf } from '@/lib/habits'
import { bumpHabit } from './bump'
import { SectionIcon, section } from '@/app/sections'
import { setUI, toast, useUI, ui } from '@/app/store'
import { Menu } from '@/components/Menu'
import { Icon } from '@/components/icons'
import { Button, Empty, Group, PageHeader, ProgressRing, bouncy, cx, spring } from '@/components/ui'
import { Page } from '../Page'
import { HabitForm } from './HabitForm'
import { StreakMilestones } from './StreakMilestones'
import { useHabits } from './useHabits'
import { haptic } from '@/lib/haptics'
import { useFeatures } from '@/app/features'
import { TrackersBlock } from '../trackers/TrackersView'

const PRESETS: (Partial<Habit> & { name: string; icon: string })[] = [
  { name: 'Beber agua', icon: 'droplet', color: '#40C8E0', target: 8, unit: 'vasos' },
  { name: 'Hacer ejercicio', icon: 'dumbbell', color: '#30D158', perWeek: 3 },
  { name: 'Leer 20 minutos', icon: 'book', color: '#FF9F0A' },
  { name: 'Meditar', icon: 'brain', color: '#BF5AF2' },
  { name: 'Caminar 8.000 pasos', icon: 'footprints', color: '#FF375F' },
  { name: 'Dormir antes de las 00:00', icon: 'moon', color: '#5E5CE6' },
]

const WEEKS = 18

/**
 * Hábitos: lo de cada día (o N veces por semana) y, debajo, Última vez (lo de
 * vez en cuando y los «Días sin…»). `focus`: abrir ya en Última vez.
 */
export function HabitsView({ focus }: { focus?: 'trackers' }) {
  const { habits, byHabit, counts, today } = useHabits(WEEKS * 7 + 7)
  const creating = useUI((s) => s.creating === 'habit')
  const [editing, setEditing] = useState<Habit | undefined>()
  const { on } = useFeatures()
  // Al venir de un enlace de Última vez, se baja hasta ella (después de que la pantalla se ponga arriba)
  useEffect(() => {
    if (focus !== 'trackers' || !habits) return
    const id = setTimeout(() => document.getElementById('ultima-vez')?.scrollIntoView({ block: 'start' }), 80)
    return () => clearTimeout(id)
  }, [focus, !habits])
  if (!habits) return null
  // Con los hábitos apagados, solo Última vez
  if (!on('habits'))
    return (
      <Page wide>
        <PageHeader icon={<SectionIcon def={section('trackers')} size={40} />} title="Última vez" subtitle="¿Cuándo fue la última vez que…? Apúntalo con un toque y LUNO te avisa cuando toque." />
        <TrackersBlock />
      </Page>
    )

  const last7 = Array.from({ length: 7 }, (_, i) => addDaysYmd(today, i - 6))
  const scheduledToday = habits.filter((h) => isDue(h, byHabit.get(h.id) ?? new Set(), today))
  const doneToday = scheduledToday.filter((h) => byHabit.get(h.id)?.has(today)).length

  const presets = (
    <div className="flex flex-wrap gap-2">
      {PRESETS.filter((p) => !habits.some((h) => h.name === p.name)).map((p, i) => (
        <motion.button
          key={p.name}
          type="button"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: i * 0.04 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => createHabit(p)}
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

  return (
    <Page wide>
      <PageHeader
        icon={<SectionIcon def={section('habits')} size={40} />}
        title="Hábitos"
        subtitle={scheduledToday.length ? `Hoy llevas ${doneToday} de ${scheduledToday.length}.` : 'Pequeñas acciones, repetidas cada día, lo cambian todo.'}
        actions={
          <Button variant="primary" onClick={() => ui.create('habit')} className="">
            <Plus size={16} strokeWidth={2.6} /> Nuevo
          </Button>
        }
      />

      {habits.length === 0 && (
        <Group className="mb-6">
          <Empty icon={<Flame size={28} strokeWidth={2.2} />} color="var(--c-green)" title="Aún no tienes hábitos" hint="Empieza con uno pequeño. Toca una idea para añadirla:">
            <div className="flex max-w-xl justify-center">{presets}</div>
          </Empty>
        </Group>
      )}

      <div className="space-y-3">
        {habits.map((h, idx) => {
          const done = byHabit.get(h.id) ?? new Set<string>()
          const count = counts.get(h.id)
          const s = streak(h, done, today)
          const power = strength(h, count, today)
          const best = bestStreak(h, done, today)
          const progress = progressLabel(h, count, done, today)
          const counted = isCounted(h)
          const paused = openBreak(h)
          const dayOff = !paused && (h.breaks ?? []).some((b) => b.from === today && b.to === today)
          return (
            <motion.div
              key={h.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: idx * 0.04 }}
              className="glass relative flex flex-col gap-4 rounded-[22px] p-4 pr-12 @[900px]:flex-row @[900px]:items-center"
            >
              <HabitMenu habit={h} paused={!!paused} dayOff={dayOff} today={today} onEdit={() => setEditing(h)} />
              <button type="button" onClick={() => setEditing(h)} className="flex min-w-0 items-center gap-3 text-left @[900px]:w-72">
                <div className="relative shrink-0">
                  <ProgressRing value={power} size={52} stroke={5} color={paused ? 'var(--c-muted)' : 'var(--c-green)'} track="var(--c-fill)" delay={0.15 + idx * 0.05} />
                  <span className="absolute inset-0 flex items-center justify-center text-fg">
                    <Icon name={h.icon} size={20} strokeWidth={2.3} />
                  </span>
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold">{h.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                    <span title={`Racha: ${streakLabel(h, s)}`} className={cx('font-num inline-flex items-center gap-0.5 font-bold', s > 0 ? 'text-orange' : 'text-muted')}>
                      <Flame size={13} strokeWidth={2.6} /> {s}
                      {perWeekOf(h) ? ' sem' : ''}
                    </span>
                    {progress && !paused && <span className="font-num font-semibold text-fg/80">{progress}</span>}
                    <span className="font-num" title="Fuerza del hábito: sube cada vez que lo haces y un fallo suelto apenas la baja">
                      Fuerza {Math.round(power * 100)} %
                    </span>
                    {best > s && (
                      <span className="font-num inline-flex items-center gap-0.5" title={`Mejor racha: ${streakLabel(h, best)}`}>
                        <Trophy size={12} strokeWidth={2.4} aria-hidden /> {best}
                      </span>
                    )}
                  </span>
                  {paused && (
                    <span className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-fg">
                      <Pause size={12} strokeWidth={2.8} aria-hidden /> En pausa desde {fmt(paused.from, "d 'de' MMMM")}
                    </span>
                  )}
                  {dayOff && (
                    <span className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-fg">
                      <CalendarOff size={12} strokeWidth={2.6} aria-hidden /> Hoy no toca
                    </span>
                  )}
                </span>
              </button>
              {counted && !paused && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => void bumpHabit(h, today)}
                  aria-label={`Sumar uno a ${h.name}`}
                  className={cx('flex h-10 shrink-0 items-center gap-1.5 self-start rounded-full px-4 text-[15px] font-bold @[900px]:self-center', done.has(today) ? 'bg-green text-on-green' : 'bg-accent-fill text-white')}
                >
                  <Plus size={16} strokeWidth={3} /> 1
                </motion.button>
              )}

              <div className="flex gap-1.5">
                {last7.map((d) => {
                  const scheduled = isScheduled(h, d)
                  const off = onBreak(h, d)
                  const on = done.has(d)
                  const isToday = d === today
                  const n = count?.get(d) ?? 0
                  const partial = counted && !on && n > 0
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => (counted ? void bumpHabit(h, d) : (haptic(), void toggleHabit(h.id, d)))}
                      title={`${fmt(d, "EEEE d 'de' MMMM")}${off ? ' · día libre' : counted ? ` · ${n}/${targetOf(h)}` : ''}`}
                      className="flex flex-col items-center gap-1"
                    >
                      <span className={cx('text-[11px] font-semibold', isToday ? 'text-blue' : 'text-muted')}>{WEEKDAYS_SHORT[fromYmd(d).getDay()]}</span>
                      <motion.span
                        whileTap={{ scale: 0.8 }}
                        className={cx(
                          'relative flex h-9 w-9 items-center justify-center rounded-full',
                          !on && (scheduled ? 'bg-fill' : 'border border-dashed border-line-strong opacity-50'),
                        )}
                        style={partial ? { background: `conic-gradient(var(--c-green) ${n / targetOf(h)}turn, var(--c-fill) 0)` } : undefined}
                      >
                        {partial && <span className="font-num absolute inset-[3px] flex items-center justify-center rounded-full bg-surface text-[12px] font-bold">{n}</span>}
                        <motion.span
                          className="absolute inset-0 rounded-full"
                          style={{ background: 'var(--c-green)' }}
                          initial={false}
                          animate={{ scale: on ? 1 : 0 }}
                          transition={bouncy}
                        />
                        {on && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...bouncy, delay: 0.05 }} className="relative text-on-green">
                            <Check size={17} strokeWidth={3} />
                          </motion.span>
                        )}
                        {!on && !partial && isToday && scheduled && <span className="h-1.5 w-1.5 rounded-full bg-blue" />}
                        {!on && off && <Pause size={12} strokeWidth={2.8} className="text-muted" aria-label="Día libre" />}
                      </motion.span>
                    </button>
                  )
                })}
              </div>

              <Heatmap habit={h} done={done} counts={count} today={today} />
            </motion.div>
          )
        })}
      </div>

      {habits.length > 0 && habits.length < 6 && (
        <div className="mt-8">
          <p className="mb-3 px-1 text-[17px] font-bold text-muted">Ideas</p>
          {presets}
        </div>
      )}

      {habits.length > 0 && <StreakMilestones />}
      {on('trackers') && <TrackersBlock />}
      <HabitForm open={creating} onClose={() => setUI({ creating: null })} />
      <HabitForm habit={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}

/** «…» de un hábito: hoy no toca, pausar o reanudar, editar */
function HabitMenu({ habit, paused, dayOff, today, onEdit }: { habit: Habit; paused: boolean; dayOff: boolean; today: string; onEdit: () => void }) {
  return (
    <div className="absolute top-3 right-3 z-10">
    <Menu
      label={`Opciones de ${habit.name}`}
      trigger={<MoreHorizontal size={16} strokeWidth={2.4} />}
      items={[
        !paused && {
          label: dayOff ? 'Hoy sí toca' : 'Hoy no toca',
          icon: <CalendarOff size={14} />,
          onSelect: () => {
            void toggleHabitDayOff(habit.id, today)
            if (!dayOff) toast(`${habit.name}: día libre. La racha no se rompe`, { label: 'Deshacer', run: () => void toggleHabitDayOff(habit.id, today) })
          },
        },
        paused
          ? { label: 'Reanudar', icon: <Play size={14} />, onSelect: () => void resumeHabit(habit.id).then(() => toast(`${habit.name}, otra vez en marcha`)) }
          : {
              label: 'Pausar (vacaciones, enfermedad…)',
              icon: <Pause size={14} />,
              onSelect: () => {
                void pauseHabit(habit.id)
                toast(`${habit.name}, en pausa: no avisa ni rompe la racha`, { label: 'Deshacer', run: () => void resumeHabit(habit.id) })
              },
            },
        { label: 'Editar', icon: <Pencil size={14} />, onSelect: onEdit },
      ]}
    />
    </div>
  )
}

function Heatmap({ habit, done, counts, today }: { habit: Habit; done: Set<string>; counts?: Map<string, number>; today: string }) {
  const start = addDaysYmd(weekStart(today), -(WEEKS - 1) * 7)
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysYmd(start, w * 7 + d)))
  return (
    <div className="hidden flex-1 justify-end gap-[3px] @[900px]:flex">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {week.map((d) => {
            const future = d > today
            const on = done.has(d)
            const part = !on && (counts?.get(d) ?? 0) > 0
            const sched = isScheduled(habit, d)
            return (
              <span
                key={d}
                title={fmt(d, 'd MMM')}
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{
                  background: future
                    ? 'transparent'
                    : on
                      ? 'var(--c-green)'
                      : part
                        ? 'color-mix(in srgb, var(--c-green) 40%, var(--c-fill))'
                        : sched
                          ? 'var(--c-fill)'
                          : 'var(--c-fill-2)',
                  opacity: future ? 0 : 1,
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
