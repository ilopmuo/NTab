import { useRef } from 'react'
import { m as motion } from 'motion/react'
import { Check } from 'lucide-react'
import { ACCENTS } from '@/lib/accents'
import { setAccent, useAccent } from '@/app/theme'
import { bouncy, cx } from '@/components/ui'

/** Muestras del color de acento; se recorren con las flechas, como un grupo de opciones */
export function AccentPicker() {
  const current = useAccent()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const pick = (i: number) => {
    const a = ACCENTS[(i + ACCENTS.length) % ACCENTS.length]
    setAccent(a.id)
    refs.current[(i + ACCENTS.length) % ACCENTS.length]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Color de acento" className="flex items-center gap-1.5">
      {ACCENTS.map((a, i) => {
        const on = a.id === current
        return (
          <button
            key={a.id}
            ref={(el) => void (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={a.label}
            title={a.label}
            tabIndex={on ? 0 : -1}
            onClick={() => setAccent(a.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                pick(i + 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                pick(i - 1)
              }
            }}
            className={cx(
              'relative flex h-7 w-7 items-center justify-center rounded-full transition-transform active:scale-90',
              on && 'ring-2 ring-offset-2 ring-offset-[var(--c-surface)]',
            )}
            style={{ background: a.swatch, ['--tw-ring-color' as string]: a.swatch }}
          >
            {on && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={bouncy} className="text-white">
                <Check size={14} strokeWidth={3.2} />
              </motion.span>
            )}
          </button>
        )
      })}
    </div>
  )
}
