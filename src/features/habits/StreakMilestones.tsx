import { useEffect, useRef, useState } from 'react'
import { m as motion } from 'motion/react'
import { Flame } from 'lucide-react'
import type { Habit } from '@/db/types'
import { perWeekOf, streak } from '@/lib/habits'
import { haptic } from '@/lib/haptics'
import { milestoneKey, reachedMilestone, type Milestone } from '@/lib/milestones'
import { Confetti } from '@/components/Celebrate'
import { Icon } from '@/components/icons'
import { Button, CountUp, bouncy, softSpring } from '@/components/ui'
import { Modal } from '@/components/Modal'
import { useHabits } from './useHabits'

const KEY = 'ntab-milestones'
const seen = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}
const remember = (k: string) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen().slice(-50), k]))
  } catch {
    /* sin almacenamiento: se celebra igual */
  }
}

/**
 * Vigila las rachas mientras estás en Hoy o en Hábitos: si al marcar un hábito
 * su racha llega a un hito (7, 30, 100 o 365 días; 4, 12, 26 o 52 semanas), lo
 * celebra con una tarjeta, la cifra que sube y confeti.
 */
export function StreakMilestones() {
  // Un año y pico de registros: para poder llegar al hito de 365 días
  const { habits, byHabit, loaded, today } = useHabits(400)
  const prev = useRef<Map<string, number> | null>(null)
  const [shown, setShown] = useState<{ habit: Habit; m: Milestone } | null>(null)

  useEffect(() => {
    if (!loaded || !habits) return
    const now = new Map(habits.map((h) => [h.id, streak(h, byHabit.get(h.id) ?? new Set(), today)]))
    // La primera vez solo se apunta cómo están (no se celebra al abrir la pantalla)
    if (prev.current) {
      for (const h of habits) {
        const m = reachedMilestone(prev.current.get(h.id) ?? 0, now.get(h.id) ?? 0, !!perWeekOf(h))
        const k = m && milestoneKey(h.id, m.n, today)
        if (m && k && !seen().includes(k)) {
          remember(k)
          haptic('success')
          setShown({ habit: h, m })
          break
        }
      }
    }
    prev.current = now
  }, [loaded, habits, byHabit, today])

  return (
    <Modal open={!!shown} onClose={() => setShown(null)} position="center">
      {shown && <Celebration habit={shown.habit} m={shown.m} onClose={() => setShown(null)} />}
    </Modal>
  )
}

function Celebration({ habit, m, onClose }: { habit: Habit; m: Milestone; onClose: () => void }) {
  const [party, setParty] = useState(true)
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center px-6 pt-9 pb-6 text-center" role="status">
      {/* El anillo se cierra en lima y, dentro, la cifra sube hasta el hito */}
      <div className="relative mb-5 h-[132px] w-[132px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--c-fill)" strokeWidth="9" />
          <motion.circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="var(--c-green)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ type: 'spring', stiffness: 40, damping: 14, delay: 0.15 }}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <CountUp value={m.n} className="font-num text-[44px] leading-none font-bold tracking-tight" />
          <span className="mt-1 text-[12px] font-semibold text-muted">{m.weekly ? 'semanas' : 'días'}</span>
        </span>
        <motion.span
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...bouncy, delay: 0.7 }}
          className="absolute -top-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full bg-green text-on-green shadow-[var(--c-shadow)]"
          aria-hidden
        >
          <Flame size={20} strokeWidth={2.6} />
        </motion.span>
      </div>
      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: 0.45 }} className="text-[22px] font-bold tracking-tight">
        {m.title}
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...softSpring, delay: 0.55 }}
        className="mt-1.5 flex items-center justify-center gap-1.5 text-[15px] font-semibold"
      >
        <Icon name={habit.icon} size={16} /> {habit.name}
      </motion.p>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-1 max-w-xs text-[14px] leading-snug text-muted">
        {m.hint}
      </motion.p>
      <Button variant="primary" className="mt-6 w-full max-w-60" onClick={onClose} autoFocus>
        Seguir
      </Button>
      {party && <Confetti onDone={() => setParty(false)} />}
    </div>
  )
}
