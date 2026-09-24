import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { haptic } from '@/lib/haptics'
import { bouncy, softSpring } from './ui'

const COLORS = ['var(--c-green)', 'var(--c-green)', 'var(--c-blue)', 'var(--c-text)', 'var(--c-faint)']

/** Lluvia de confeti sobria (lima, azul y grises) que dura un par de segundos */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const reduce = useReducedMotion()
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        drift: (Math.random() - 0.5) * 160,
        delay: Math.random() * 0.35,
        dur: 1.5 + Math.random() * 0.9,
        rot: (Math.random() - 0.5) * 720,
        w: 5 + Math.random() * 5,
        round: Math.random() > 0.6,
        color: COLORS[i % COLORS.length],
      })),
    [],
  )
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 2600)
    return () => clearTimeout(t)
  }, [onDone])
  if (reduce) return null
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block"
          style={{ left: `${p.x}%`, width: p.w, height: p.round ? p.w : p.w * 1.8, borderRadius: p.round ? 999 : 2, background: p.color }}
          initial={{ y: -30, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: p.drift, rotate: p.rot, opacity: [1, 1, 0.9, 0] }}
          transition={{ duration: p.dur, delay: p.delay, ease: [0.25, 0.4, 0.45, 1] }}
        />
      ))}
    </div>,
    document.body,
  )
}

/** Tarjeta de «día completado»: el anillo se cierra y se dibuja el ✓ */
export function DayComplete({ count, celebrate }: { count: number; celebrate: boolean }) {
  const [party, setParty] = useState(celebrate)
  useEffect(() => {
    if (celebrate) {
      setParty(true)
      haptic('success')
    }
  }, [celebrate])
  const r = 34
  const c = 2 * Math.PI * r
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={softSpring} className="flex flex-col items-center px-6 py-12 text-center">
      <div className="relative mb-5 h-[92px] w-[92px]">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--c-fill)" strokeWidth="8" />
          <motion.circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="var(--c-green)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ type: 'spring', stiffness: 50, damping: 14, delay: 0.1 }}
          />
        </svg>
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...bouncy, delay: 0.55 }}
          className="absolute inset-[18px] flex items-center justify-center rounded-full bg-green text-on-green"
        >
          <svg viewBox="0 0 16 16" className="h-7 w-7">
            <motion.path
              d="M3.5 8.4l3 3 6-6.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, delay: 0.75, ease: [0.3, 0.8, 0.3, 1] }}
            />
          </svg>
        </motion.span>
      </div>
      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: 0.5 }} className="text-[20px] font-bold tracking-tight">
        Día completado
      </motion.p>
      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay: 0.6 }} className="mt-1 max-w-xs text-[14px] leading-snug text-muted">
        {count === 1 ? 'Has hecho la tarea de hoy.' : `Has hecho las ${count} tareas de hoy.`} Descansa, mañana más.
      </motion.p>
      {party && <Confetti onDone={() => setParty(false)} />}
    </motion.div>
  )
}
