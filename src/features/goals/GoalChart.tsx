import { m as motion } from 'motion/react'
import type { Goal } from '@/db/types'
import { addDaysYmd, dateLabel, diffDays, today } from '@/lib/dates'
import { goalChange } from '@/lib/goals'

const W = 280
const H = 64
const PAD = 4

/**
 * Evolución de un objetivo con cifra (como en Strides): su historial y, si
 * tiene fecha, la línea del ritmo que haría falta para llegar a tiempo.
 */
export function GoalChart({ goal }: { goal: Goal }) {
  const log = goal.log ?? []
  if (log.length < 2 || !goal.target) return null
  const t = today()
  const first = log[0].date
  const last = goal.deadline && goal.deadline > t ? goal.deadline : t
  const span = Math.max(1, diffDays(last, first))
  const top = Math.max(goal.target, ...log.map((p) => p.value))
  const x = (date: string) => PAD + (diffDays(date, first) / span) * (W - PAD * 2)
  const y = (v: number) => H - PAD - (v / top) * (H - PAD * 2)
  const points = log.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
  // Escalones: la cifra se mantiene hasta el día que cambia; y llega hasta hoy
  const steps = log.flatMap((p, i) => (i ? [`${x(p.date).toFixed(1)},${y(log[i - 1].value).toFixed(1)}`, points[i]] : [points[i]]))
  steps.push(`${x(t).toFixed(1)},${y(log[log.length - 1].value).toFixed(1)}`)
  const line = `M${steps.join('L')}`
  const area = `${line}L${x(t).toFixed(1)},${H - PAD}L${PAD},${H - PAD}Z`
  const week = goalChange(log, addDaysYmd(t, -7)) ?? 0
  const unit = goal.unit ? ` ${goal.unit}` : ''
  const now = log[log.length - 1].value
  const summary = `Empezó en ${log[0].value.toLocaleString('es-ES')}${unit} ${dateLabel(first).toLowerCase()} y va por ${now.toLocaleString('es-ES')}${unit}.`

  return (
    <figure className="rounded-[14px] bg-fill-2 px-3 pt-2.5 pb-2">
      <figcaption className="mb-1 flex items-baseline gap-2 text-[12px] text-muted">
        <span className="font-semibold text-fg">Evolución</span>
        <span className="flex-1" />
        {week !== 0 && (
          <span className="font-num font-semibold text-fg">
            {week > 0 ? '+' : ''}
            {week.toLocaleString('es-ES')}
            {unit} esta semana
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-16 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label={summary}>
        <defs>
          <linearGradient id={`goal-fill-${goal.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--c-blue)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--c-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* La meta y, si hay fecha, el ritmo para llegar */}
        <line x1={PAD} x2={W - PAD} y1={y(goal.target)} y2={y(goal.target)} stroke="var(--c-border-strong)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        {goal.deadline && goal.deadline > first && (
          <line x1={PAD} y1={y(log[0].value)} x2={x(goal.deadline)} y2={y(goal.target)} stroke="var(--c-muted)" strokeWidth="1.2" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        )}
        <motion.path d={area} fill={`url(#goal-fill-${goal.id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }} />
        <motion.path
          d={line}
          fill="none"
          stroke="var(--c-blue)"
          strokeWidth="2.2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: [0.3, 0.8, 0.3, 1] }}
        />
      </svg>
      <p className="mt-0.5 flex justify-between text-[11px] text-muted" aria-hidden>
        <span>{dateLabel(first)}</span>
        <span>{goal.deadline && goal.deadline > t ? dateLabel(goal.deadline) : 'Hoy'}</span>
      </p>
    </figure>
  )
}
