import { Flame } from 'lucide-react'
import { toggleHabit } from '@/db/actions'
import { isScheduled, streak } from '@/lib/habits'
import { href } from '@/app/router'
import { Icon } from '@/components/icons'
import { Card, cx } from '@/components/ui'
import { useHabits } from './useHabits'

/** Tarjeta compacta con los hábitos de hoy (para la vista Hoy) */
export function HabitStrip() {
  const { habits, byHabit, today } = useHabits(60)
  if (!habits) return null
  const todays = habits.filter((h) => isScheduled(h, today))
  const doneCount = todays.filter((h) => byHabit.get(h.id)?.has(today)).length

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center">
        <h3 className="text-[12px] font-semibold tracking-wider text-muted uppercase">Hábitos de hoy</h3>
        {todays.length > 0 && (
          <span className="ml-2 text-[12px] text-faint tabular-nums">
            {doneCount}/{todays.length}
          </span>
        )}
        <a href={href('/habits')} className="ml-auto text-[12px] text-accent hover:underline">
          {habits.length ? 'Ver todos' : 'Crear'}
        </a>
      </div>
      {todays.length === 0 ? (
        <p className="text-[13px] text-faint">{habits.length ? 'Hoy toca descansar.' : 'Construye rutinas: agua, ejercicio, leer…'}</p>
      ) : (
        <div className="space-y-1">
          {todays.map((h) => {
            const set = byHabit.get(h.id) ?? new Set<string>()
            const done = set.has(today)
            const s = streak(h, set, today)
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => toggleHabit(h.id, today)}
                className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-hover"
              >
                <span
                  className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all', done && 'animate-check')}
                  style={{ background: done ? h.color : `${h.color}1f`, color: done ? '#000' : h.color }}
                >
                  <Icon name={h.icon} size={15} />
                </span>
                <span className={cx('flex-1 truncate text-[13.5px]', done && 'text-muted')}>{h.name}</span>
                {s > 0 && (
                  <span className="flex items-center gap-0.5 text-[12px] text-warn tabular-nums">
                    <Flame size={12} /> {s}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
