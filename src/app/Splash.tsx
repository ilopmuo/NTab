import { useEffect, useState } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { MARK } from '@/lib/brand'
import { LunoWordmark } from '@/components/Brand'

let shown = false

/** Arranque: la órbita gira hasta su sitio, la luna se posa y aparece «LUNO» */
export function Splash({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(!shown)
  useEffect(() => {
    if (!visible || !ready) return
    const t = setTimeout(() => {
      shown = true
      setVisible(false)
    }, 650)
    return () => clearTimeout(t)
  }, [ready, visible])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          data-splash
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg text-fg"
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
        >
          <motion.svg
            width={64}
            height={64}
            viewBox={`0 0 ${MARK.size} ${MARK.size}`}
            aria-hidden
            initial={{ scale: 0.7, opacity: 0, rotate: -120 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.25, opacity: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ type: 'spring', stiffness: 170, damping: 22 }}
          >
            <path d={MARK.ring} fill="none" stroke="currentColor" strokeWidth={MARK.ringWidth} />
            <motion.circle
              {...MARK.moon}
              fill="var(--c-blue)"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.22, type: 'spring', stiffness: 420, damping: 16 }}
            />
          </motion.svg>
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.18, type: 'spring', stiffness: 300, damping: 28 }}
            className="mt-6"
          >
            <LunoWordmark height={15} title="LUNO" />
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
