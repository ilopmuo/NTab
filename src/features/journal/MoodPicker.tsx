import { motion } from 'motion/react'
import { Annoyed, Frown, Laugh, Meh, Smile } from 'lucide-react'
import { MOODS } from '@/lib/journal'
import { haptic } from '@/lib/haptics'
import { bouncy, cx } from '@/components/ui'

const ICON = { 1: Frown, 2: Annoyed, 3: Meh, 4: Smile, 5: Laugh } as const

/** Color de cada ánimo: grises para lo malo, azul para bien, lima para muy bien */
export const moodColor = (m?: number) => (m === 5 ? 'var(--c-green)' : m === 4 ? 'var(--c-blue)' : m ? 'var(--c-text)' : 'var(--c-fill)')

export function MoodIcon({ mood, size = 18 }: { mood: number; size?: number }) {
  const I = ICON[mood as keyof typeof ICON] ?? Meh
  return <I size={size} strokeWidth={2.2} />
}

/** Cinco caras de muy mal a muy bien */
export function MoodPicker({ value, onChange, size = 'lg' }: { value?: number; onChange: (m: number) => void; size?: 'sm' | 'lg' }) {
  const big = size === 'lg'
  return (
    <div role="radiogroup" aria-label="¿Qué tal el día?" className="flex items-end justify-between gap-1.5">
      {MOODS.map((m) => {
        const on = value === m.value
        return (
          <motion.button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={m.label}
            whileTap={{ scale: 0.85 }}
            onClick={() => {
              haptic()
              onChange(m.value)
            }}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <motion.span
              animate={{ scale: on ? 1.12 : 1 }}
              transition={bouncy}
              className={cx('flex items-center justify-center rounded-full transition-colors', big ? 'h-14 w-14' : 'h-10 w-10', on ? '' : 'bg-fill text-muted')}
              style={on ? { background: moodColor(m.value), color: m.value === 5 ? 'var(--c-on-green)' : m.value === 4 ? '#fff' : 'var(--c-bg)' } : undefined}
            >
              <MoodIcon mood={m.value} size={big ? 26 : 19} />
            </motion.span>
            {big && <span className={cx('text-[12px] font-semibold', on ? 'text-fg' : 'text-muted')}>{m.label}</span>}
          </motion.button>
        )
      })}
    </div>
  )
}
