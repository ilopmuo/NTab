import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, Flame, Plus } from 'lucide-react'
import type { Habit } from '@/db/types'
import { createHabit, toggleHabit } from '@/db/actions'
import { addDaysYmd, fmt, fromYmd, weekStart, WEEKDAYS_SHORT } from '@/lib/dates'
import { completionRate, isCounted, isDue, isScheduled, perWeekOf, progressLabel, streak, streakLabel, targetOf } from '@/lib/habits'
import { bumpHabit } from './bump'
import { SectionIcon, section } from '@/app/sections'
import { setUI, useUI } from '@/app/store'
import { Icon } from '@/components/icons'
import { Button, Empty, Group, PageHeader, ProgressRing, bouncy, cx, spring } from '@/components/ui'
import { Page } from '../Page'
import { HabitForm } from './HabitForm'
import { useHabits } from './useHabits'
import { haptic } from '@/lib/haptics'

const PRESETS: (Partial<Habit> & { name: string; icon: string })[] = [
  { name: 'Beber agua', icon: 'droplet', color: '#40C8E0', target: 8, unit: 'vasos' },
  { name: 'Hacer ejercicio', icon: 'dumbbell', color: '#30D158', perWeek: 3 },
  { name: 'Leer 20 minutos', icon: 'book', color: '#FF9F0A' },
  { name: 'Meditar', icon: 'brain', color: '#BF5AF2' },
  { name: 'Caminar 8.000 pasos', icon: 'footprints', color: '#FF375F' },
  { name: 'Dormir antes de las 00:00', icon: 'moon', color: '#5E5CE6' },
]

const WEEKS = 18

export function HabitsView() {
  const { habits, byHabit, counts, today } = useHabits(WEEKS * 7 + 7)
  const creating = useUI((s) => s.creating === 'habit')
  const [editing, setEditing] = useState<Habit | undefined>()
  if (!habits) return null

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
          <Button variant="primary" onClick={() => setUI({ creating: 'habit' })} className="">
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
          const rate = completionRate(h, done, today, 30)
          const progress = progressLabel(h, count, done, today)
          const counted = isCounted(h)
          return (
            <motion.div
              key={h.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: idx * 0.04 }}
              className="glass flex flex-col gap-4 rounded-[22px] p-4 @[900px]:flex-row @[900px]:items-center"
            >
              <button type="button" onClick={() => setEditing(h)} className="flex min-w-0 items-center gap-3 text-left @[900px]:w-72">
                <div className="relative shrink-0">
                  <ProgressRing value={rate} size={52} stroke={5} color="var(--c-green)" track="var(--c-fill)" delay={0.15 + idx * 0.05} />
                  <span className="absolute inset-0 flex items-center justify-center text-fg">
                    <Icon name={h.icon} size={20} strokeWidth={2.3} />
                  </span>
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold">{h.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                    <span title={`Racha: ${streakLabel(h, s)}`} className={cx('font-num inline-flex items-center gap-0.5 font-bold', s > 0 ? 'text-orange' : 'text-faint')}>
                      <Flame size={13} strokeWidth={2.6} /> {s}
                      {perWeekOf(h) ? ' sem' : ''}
                    </span>
                    {progress && <span className="font-num font-semibold text-fg/80">{progress}</span>}
                    <span className="font-num">{Math.round(rate * 100)}% este mes</span>
                  </span>
                </span>
              </button>
              {counted && (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={() => void bumpHabit(h, today)}
                  aria-label={`Sumar uno a ${h.name}`}
                  className={cx('flex h-10 shrink-0 items-center gap-1.5 self-start rounded-full px-4 text-[15px] font-bold @[900px]:self-center', done.has(today) ? 'bg-green text-on-green' : 'bg-accent text-white')}
                >
                  <Plus size={16} strokeWidth={3} /> 1
                </motion.button>
              )}

              <div className="flex gap-1.5">
                {last7.map((d) => {
                  const scheduled = isScheduled(h, d)
                  const on = done.has(d)
                  const isToday = d === today
                  const n = count?.get(d) ?? 0
                  const partial = counted && !on && n > 0
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => (counted ? void bumpHabit(h, d) : (haptic(), void toggleHabit(h.id, d)))}
                      title={`${fmt(d, "EEEE d 'de' MMMM")}${counted ? ` · ${n}/${targetOf(h)}` : ''}`}
                      className="flex flex-col items-center gap-1"
                    >
                      <span className={cx('text-[11px] font-semibold', isToday ? 'text-blue' : 'text-faint')}>{WEEKDAYS_SHORT[fromYmd(d).getDay()]}</span>
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

      <HabitForm open={creating} onClose={() => setUI({ creating: null })} />
      <HabitForm habit={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
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
