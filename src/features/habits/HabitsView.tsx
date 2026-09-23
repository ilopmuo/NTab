import { useState } from 'react'
import { Check, Flame, Plus, Sparkles } from 'lucide-react'
import type { Habit } from '@/db/types'
import { createHabit, toggleHabit } from '@/db/actions'
import { addDaysYmd, fmt, fromYmd, weekStart, WEEKDAYS_SHORT } from '@/lib/dates'
import { completionRate, isScheduled, streak } from '@/lib/habits'
import { setUI, useUI } from '@/app/store'
import { Icon } from '@/components/icons'
import { Button, Card, Empty, PageHeader, cx } from '@/components/ui'
import { Page } from '../Page'
import { HabitForm } from './HabitForm'
import { useHabits } from './useHabits'

const PRESETS = [
  { name: 'Beber 2 L de agua', icon: 'droplet', color: '#64D2FF' },
  { name: 'Hacer ejercicio', icon: 'dumbbell', color: '#C5F82A', days: [1, 3, 5] },
  { name: 'Leer 20 minutos', icon: 'book', color: '#FF9F0A' },
  { name: 'Meditar', icon: 'brain', color: '#BF5AF2' },
  { name: 'Caminar 8.000 pasos', icon: 'footprints', color: '#30D158' },
  { name: 'Dormir antes de las 00:00', icon: 'moon', color: '#2F7BFF' },
]

const WEEKS = 18

export function HabitsView() {
  const { habits, byHabit, today } = useHabits(WEEKS * 7 + 7)
  const creating = useUI((s) => s.creating === 'habit')
  const [editing, setEditing] = useState<Habit | undefined>()
  if (!habits) return null

  const last7 = Array.from({ length: 7 }, (_, i) => addDaysYmd(today, i - 6))
  const scheduledToday = habits.filter((h) => isScheduled(h, today))
  const doneToday = scheduledToday.filter((h) => byHabit.get(h.id)?.has(today)).length

  return (
    <Page wide>
      <PageHeader
        icon={<Sparkles size={26} className="text-lime" />}
        title="Hábitos"
        subtitle={
          scheduledToday.length
            ? `Hoy: ${doneToday} de ${scheduledToday.length} hechos.`
            : 'Pequeñas acciones, repetidas cada día, lo cambian todo.'
        }
        actions={
          <Button variant="primary" onClick={() => setUI({ creating: 'habit' })}>
            <Plus size={15} /> Nuevo
          </Button>
        }
      />

      {habits.length === 0 && (
        <Empty icon={<Sparkles size={22} />} title="Aún no tienes hábitos" hint="Empieza con uno pequeño. Aquí tienes ideas:">
          <div className="flex max-w-lg flex-wrap justify-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => createHabit(p)}
                className="flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-[13px] transition-colors hover:border-accent hover:text-accent"
              >
                <Icon name={p.icon} size={14} style={{ color: p.color }} /> {p.name}
              </button>
            ))}
          </div>
        </Empty>
      )}

      <div className="space-y-3">
        {habits.map((h) => {
          const done = byHabit.get(h.id) ?? new Set<string>()
          const s = streak(h, done, today)
          const rate = completionRate(h, done, today, 30)
          return (
            <Card key={h.id} className="flex flex-col gap-4 p-4 @[900px]:flex-row @[900px]:items-center">
              <button type="button" onClick={() => setEditing(h)} className="flex min-w-0 items-center gap-3 text-left @[900px]:w-64">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${h.color}1f`, color: h.color }}>
                  <Icon name={h.icon} size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-medium">{h.name}</span>
                  <span className="flex items-center gap-2 text-[12px] text-muted">
                    <span className={cx('inline-flex items-center gap-0.5', s > 0 && 'text-warn')}>
                      <Flame size={12} /> {s} {s === 1 ? 'día' : 'días'}
                    </span>
                    · {Math.round(rate * 100)}% (30 d)
                  </span>
                </span>
              </button>

              <div className="flex gap-1.5">
                {last7.map((d) => {
                  const scheduled = isScheduled(h, d)
                  const on = done.has(d)
                  const isToday = d === today
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleHabit(h.id, d)}
                      title={fmt(d, "EEEE d 'de' MMMM")}
                      className="flex flex-col items-center gap-1"
                    >
                      <span className={cx('text-[10.5px]', isToday ? 'font-semibold text-accent' : 'text-faint')}>
                        {WEEKDAYS_SHORT[fromYmd(d).getDay()]}
                      </span>
                      <span
                        className={cx(
                          'flex h-8 w-8 items-center justify-center rounded-full border transition-all',
                          on ? 'animate-check border-transparent' : scheduled ? 'border-line-strong hover:border-muted' : 'border-dashed border-line opacity-50',
                        )}
                        style={on ? { background: h.color, color: '#000' } : undefined}
                      >
                        {on && <Check size={15} strokeWidth={3} />}
                      </span>
                    </button>
                  )
                })}
              </div>

              <Heatmap habit={h} done={done} today={today} />
            </Card>
          )
        })}
      </div>

      {habits.length > 0 && habits.length < 5 && (
        <div className="mt-8">
          <p className="mb-2 px-1 text-[12px] font-semibold tracking-wider text-faint uppercase">Ideas</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.filter((p) => !habits.some((h) => h.name === p.name)).map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => createHabit(p)}
                className="flex h-8 items-center gap-2 rounded-full border border-dashed border-line-strong px-3 text-[12.5px] text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <Plus size={13} /> {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <HabitForm open={creating} onClose={() => setUI({ creating: null })} />
      <HabitForm habit={editing} open={!!editing} onClose={() => setEditing(undefined)} />
    </Page>
  )
}

function Heatmap({ habit, done, today }: { habit: Habit; done: Set<string>; today: string }) {
  const start = addDaysYmd(weekStart(today), -(WEEKS - 1) * 7)
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => addDaysYmd(start, w * 7 + d)))
  return (
    <div className="hidden flex-1 justify-end gap-[3px] @[900px]:flex">
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {week.map((d) => {
            const future = d > today
            const on = done.has(d)
            const sched = isScheduled(habit, d)
            return (
              <span
                key={d}
                title={fmt(d, 'd MMM')}
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{
                  background: future ? 'transparent' : on ? habit.color : sched ? 'var(--c-hover)' : 'transparent',
                  outline: !future && !on && sched ? '1px solid var(--c-border)' : undefined,
                  outlineOffset: -1,
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
