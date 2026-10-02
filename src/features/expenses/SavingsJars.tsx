import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { db } from '@/db/db'
import type { Goal } from '@/db/types'
import { setGoalCurrent } from '@/db/actions'
import { fmt } from '@/lib/dates'
import { money } from '@/lib/expenses'
import { isMoneyGoal, monthlyToSave } from '@/lib/goals'
import { haptic } from '@/lib/haptics'
import { toast } from '@/app/store'
import { m as motion } from 'motion/react'
import { Group, Section } from '@/components/ui'

/**
 * Huchas: los objetivos en euros, con lo que toca apartar cada mes para
 * llegar a tiempo (como los objetivos con fecha de YNAB) y «Meter» para ir
 * sumando sin salir de Gastos.
 */
export function SavingsJars() {
  const jars = useLiveQuery(() => db.goals.where('status').equals('active').toArray().then((g) => g.filter(isMoneyGoal).sort((a, b) => a.order - b.order)), [])
  if (!jars?.length) return null
  return (
    <Section title="Huchas" action={<a href="#/goals" className="text-[14px] font-semibold text-blue">Objetivos</a>}>
      <Group>
        {jars.map((g) => (
          <Jar key={g.id} goal={g} />
        ))}
      </Group>
    </Section>
  )
}

function Jar({ goal }: { goal: Goal }) {
  const [adding, setAdding] = useState(false)
  const current = goal.current ?? 0
  const target = goal.target ?? 0
  const save = monthlyToSave(goal)
  const put = async (raw: string) => {
    setAdding(false)
    const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
    if (!(n > 0)) return
    await setGoalCurrent(goal.id, Math.round((current + n) * 100) / 100)
    haptic()
    toast(`${money(n)} a «${goal.title}»`, { label: 'Deshacer', run: () => void setGoalCurrent(goal.id, current) })
  }
  return (
    <div className="px-4 py-3 shadow-[inset_0_-1px_0_var(--c-border)] last:shadow-none">
      <div className="flex items-center gap-3">
        <JarGlass value={target ? current / target : 0} id={goal.id} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{goal.title}</span>
          <span className="block truncate text-[12.5px] text-muted">
            <span className="font-num font-semibold text-fg">{money(current)}</span> de {money(target)}
            {save ? ` · aparta ${money(save)} al mes` : save === 0 ? ' · ¡conseguido!' : ''}
            {goal.deadline && save ? ` hasta ${fmt(goal.deadline, 'MMMM')}` : ''}
          </span>
        </span>
        {adding ? (
          <input
            autoFocus
            inputMode="decimal"
            placeholder="€"
            aria-label={`Cuánto metes en «${goal.title}»`}
            onBlur={(e) => void put(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.currentTarget.value = ''
                setAdding(false)
              }
            }}
            className="font-num h-8 w-20 rounded-full bg-fill px-3 text-right text-[14px] font-semibold"
          />
        ) : (
          <button type="button" onClick={() => setAdding(true)} aria-label={`Meter dinero en «${goal.title}»`} className="flex h-8 items-center gap-1 rounded-full bg-fill px-3 text-[13px] font-semibold transition-colors hover:bg-hover active:scale-95">
            <Plus size={14} strokeWidth={2.6} /> Meter
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * El tarro de la hucha: se llena hasta lo que llevas, con una ola arriba que
 * se mueve despacio (como los botes de Revolut). Lleno del todo, en lima.
 */
function JarGlass({ value, id }: { value: number; id: string }) {
  const v = Math.max(0, Math.min(1, value))
  const full = v >= 1
  const W = 30
  const H = 38
  const inner = H - 6
  const level = 3 + inner * (1 - v)
  const color = full ? 'var(--c-green)' : 'var(--c-blue)'
  const clip = `jar-${id}`
  // Dos crestas por ancho: al desplazarse un ancho entero, la ola vuelve a empezar
  const wave = `M0 3 Q ${W / 4} 0 ${W / 2} 3 T ${W} 3 T ${W * 1.5} 3 T ${W * 2} 3 V ${H} H 0 Z`
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden>
      <defs>
        <clipPath id={clip}>
          <rect x="2" y="3" width={W - 4} height={H - 5} rx="8" />
        </clipPath>
      </defs>
      <rect x="9" y="0.75" width={W - 18} height="3" rx="1.5" fill="var(--c-border-strong)" />
      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="0" width={W} height={H} fill="var(--c-fill-2)" />
        <motion.g initial={{ y: H }} animate={{ y: v > 0 ? level - 3 : H }} transition={{ type: 'spring', stiffness: 70, damping: 15 }}>
          <path d={wave} fill={color} className="jar-wave" opacity="0.9" />
        </motion.g>
      </g>
      <rect x="2" y="3" width={W - 4} height={H - 5} rx="8" fill="none" stroke="var(--c-border-strong)" strokeWidth="1.5" />
    </svg>
  )
}
