import { motion } from 'motion/react'
import { Check, Flame, Plus } from 'lucide-react'
import { toggleHabit } from '@/db/actions'
import { isScheduled, streak } from '@/lib/habits'
import { href } from '@/app/router'
import { Icon } from '@/components/icons'
import { Card, bouncy, cx } from '@/components/ui'
import { useHabits } from './useHabits'

/** Hábitos de hoy como interruptores de la app Casa: se encienden al tocarlos */
export function HabitStrip() {
  const { habits, byHabit, today } = useHabits(60)
  if (!habits) return null
  const todays = habits.filter((h) => isScheduled(h, today))
  const doneCount = todays.filter((h) => byHabit.get(h.id)?.has(today)).length

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Flame size={16} className="text-green" strokeWidth={2.4} />
        <h3 className="text-[15px] font-bold text-green">Hábitos</h3>
        {todays.length > 0 && (
          <span className="font-num text-[14px] font-semibold text-faint">
            {doneCount}/{todays.length}
          </span>
        )}
        <a href={href('/habits')} className="ml-auto text-[13px] font-semibold text-blue hover:underline">
          {habits.length ? 'Ver todos' : 'Crear'}
        </a>
      </div>
      {todays.length === 0 ? (
        <a href={href('/habits')} className="flex items-center gap-2 rounded-xl bg-fill-2 px-3 py-3 text-[14px] text-muted transition-colors hover:text-fg">
          <Plus size={16} />
          {habits.length ? 'Hoy toca descansar.' : 'Crea rutinas: agua, ejercicio, leer…'}
        </a>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {todays.map((h) => {
            const set = byHabit.get(h.id) ?? new Set<string>()
            const done = set.has(today)
            const s = streak(h, set, today)
            return (
              <motion.button
                key={h.id}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => toggleHabit(h.id, today)}
                className={cx(
                  'relative flex flex-col items-start gap-2 overflow-hidden rounded-[14px] p-2.5 text-left transition-colors duration-300',
                  done ? 'text-black' : 'bg-fill-2',
                )}
                style={done ? { background: `linear-gradient(160deg, color-mix(in srgb, ${h.color} 70%, white), ${h.color})` } : undefined}
              >
                <div className="flex w-full items-center justify-between">
                  <motion.span
                    animate={done ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                    transition={bouncy}
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={done ? { background: 'rgb(255 255 255 / 0.55)', color: '#000' } : { background: `color-mix(in srgb, ${h.color} 20%, transparent)`, color: h.color }}
                  >
                    {done ? <Check size={17} strokeWidth={3} /> : <Icon name={h.icon} size={16} strokeWidth={2.3} />}
                  </motion.span>
                  {s > 0 && (
                    <span className={cx('font-num flex items-center gap-0.5 text-[12px] font-bold', done ? 'text-black/70' : 'text-orange')}>
                      <Flame size={12} strokeWidth={2.6} />
                      {s}
                    </span>
                  )}
                </div>
                <span className={cx('line-clamp-2 text-[13px] leading-tight font-semibold', done ? 'text-black/85' : 'text-fg')}>{h.name}</span>
              </motion.button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
