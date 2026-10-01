import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Flame, Plus } from 'lucide-react'
import { toggleHabit } from '@/db/actions'
import { isCounted, isDue, progressLabel, streak, targetOf } from '@/lib/habits'
import { href } from '@/app/router'
import { Icon } from '@/components/icons'
import { Card, RollingNumber, bouncy, cx } from '@/components/ui'
import type { Habit } from '@/db/types'
import { useHabits } from './useHabits'
import { bumpHabit } from './bump'
import { haptic } from '@/lib/haptics'

/** Hábitos de hoy como interruptores de la app Casa: se encienden al tocarlos */
export function HabitStrip() {
  const { habits, byHabit, counts, today } = useHabits(60)
  if (!habits) return null
  const todays = habits.filter((h) => isDue(h, byHabit.get(h.id) ?? new Set(), today))
  const doneCount = todays.filter((h) => byHabit.get(h.id)?.has(today)).length

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Flame size={16} className="text-fg" strokeWidth={2.4} />
        <h2 className="text-[15px] font-bold">Hábitos</h2>
        {todays.length > 0 && (
          <span className="font-num text-[14px] font-semibold text-muted">
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
            return (
              <HabitTile
                key={h.id}
                habit={h}
                done={set.has(today)}
                streak={streak(h, set, today)}
                progress={progressLabel(h, counts.get(h.id), set, today)}
                pct={isCounted(h) ? Math.min(1, (counts.get(h.id)?.get(today) ?? 0) / targetOf(h)) : 0}
                today={today}
              />
            )
          })}
        </div>
      )}
    </Card>
  )
}

/**
 * Un hábito de hoy. Al marcarlo, el verde se extiende desde donde lo tocas; la
 * racha rueda al subir y, en los de cantidad, cada toque suelta un «+1».
 */
function HabitTile({ habit: h, done, streak: s, progress, pct, today }: { habit: Habit; done: boolean; streak: number; progress: string | null | undefined; pct: number; today: string }) {
  const counted = isCounted(h)
  const tap = useRef({ x: 50, y: 50 })
  const [plus, setPlus] = useState<{ id: number; x: number; y: number }[]>([])
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      aria-label={counted ? `Sumar uno a ${h.name}` : undefined}
      aria-pressed={counted ? undefined : done}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        tap.current = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
      }}
      onClick={() => {
        if (counted) {
          const id = Date.now()
          setPlus((p) => [...p, { id, ...tap.current }])
          setTimeout(() => setPlus((p) => p.filter((x) => x.id !== id)), 900)
          return void bumpHabit(h, today)
        }
        haptic()
        void toggleHabit(h.id, today)
      }}
      className={cx('relative flex flex-col items-start gap-2 overflow-hidden rounded-[14px] bg-fill-2 p-2.5 text-left', done && 'text-black')}
    >
      {/* El verde de «hecho»: crece en círculo desde el toque */}
      <AnimatePresence initial={false}>
        {done && (
          <motion.span
            key="fill"
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'var(--c-green)' }}
            initial={{ clipPath: `circle(0% at ${tap.current.x}% ${tap.current.y}%)` }}
            animate={{ clipPath: `circle(150% at ${tap.current.x}% ${tap.current.y}%)` }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.45, ease: [0.3, 0.7, 0.2, 1] }}
          />
        )}
      </AnimatePresence>
      <div className="relative flex w-full items-center justify-between">
        <motion.span
          animate={done ? { scale: [1, 1.25, 1] } : { scale: 1 }}
          transition={bouncy}
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={done ? { background: 'rgb(0 0 0 / 0.12)', color: 'var(--c-on-green)' } : { background: 'var(--c-fill)', color: 'var(--c-text)' }}
        >
          {done ? <Check size={17} strokeWidth={3} /> : <Icon name={h.icon} size={16} strokeWidth={2.3} />}
        </motion.span>
        {s > 0 && (
          <span className={cx('font-num flex items-center gap-0.5 text-[12px] font-bold', done ? 'text-black/70' : 'text-muted')} aria-label={`Racha de ${s}`}>
            <motion.span key={s} initial={{ scale: 1 }} animate={{ scale: [1, 1.4, 1], rotate: [0, -12, 0] }} transition={{ duration: 0.5 }} className="flex">
              <Flame size={12} strokeWidth={2.6} />
            </motion.span>
            <RollingNumber value={s} />
          </span>
        )}
      </div>
      <span className={cx('relative line-clamp-2 text-[13px] leading-tight font-semibold', done ? 'text-black/85' : 'text-fg')}>{h.name}</span>
      {progress && <span className={cx('font-num relative -mt-1 text-[12px] font-semibold', done ? 'text-black/60' : 'text-muted')}>{progress}</span>}
      {counted && !done && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-fill">
          <motion.span className="block h-full bg-green" initial={false} animate={{ width: `${pct * 100}%` }} transition={bouncy} />
        </span>
      )}
      {/* «+1» que sube y se desvanece desde el toque */}
      <AnimatePresence>
        {plus.map((p) => (
          <motion.span
            key={p.id}
            aria-hidden
            className="font-num pointer-events-none absolute text-[15px] font-bold text-fg"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            initial={{ opacity: 0, y: 0, x: '-50%', scale: 0.6 }}
            animate={{ opacity: [0, 1, 0], y: -34, scale: 1 }}
            transition={{ duration: 0.85, ease: 'easeOut' }}
          >
            +1
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.button>
  )
}
