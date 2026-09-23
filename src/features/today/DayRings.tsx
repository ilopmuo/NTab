import { motion } from 'motion/react'
import { Card, CountUp, ProgressRing } from '@/components/ui'

export interface RingData {
  label: string
  done: number
  total: number
  color: string
}

/** Anillos concéntricos al estilo Fitness */
export function DayRings({ rings }: { rings: RingData[] }) {
  const size = 132
  const stroke = 13
  const gap = 3
  const allDone = rings.every((r) => r.total > 0 && r.done >= r.total)
  return (
    <Card className="@container flex items-center gap-5 p-5">
      <motion.div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        animate={allDone ? { scale: [1, 1.06, 1] } : {}}
        transition={{ duration: 0.6, delay: 1 }}
      >
        {rings.map((r, i) => {
          const s = size - i * 2 * (stroke + gap)
          return (
            <div key={r.label} className="absolute" style={{ inset: i * (stroke + gap) }}>
              <ProgressRing
                size={s}
                stroke={stroke}
                color={r.color}
                value={r.total ? r.done / r.total : 0}
                delay={0.15 + i * 0.12}
                track={`color-mix(in srgb, ${r.color} 20%, transparent)`}
              />
            </div>
          )
        })}
      </motion.div>
      <div className="grid min-w-0 flex-1 gap-2.5 @[520px]:grid-cols-3 @[520px]:gap-4">
        {rings.map((r) => (
          <div key={r.label}>
            <p className="text-[13px] font-semibold text-muted">{r.label}</p>
            <p className="leading-tight font-bold" style={{ color: r.color }}>
              <CountUp value={r.done} className="text-[22px]" />
              <span className="font-num text-[15px] opacity-70">/{r.total}</span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
