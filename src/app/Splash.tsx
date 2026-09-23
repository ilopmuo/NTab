import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

let shown = false

/** Arranque: el icono aparece con un muelle y se funde cuando la app está lista */
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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg"
          exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
        >
          <motion.img
            src="./icon.svg"
            alt=""
            className="h-20 w-20 rounded-[22px]"
            initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 1.6, opacity: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          />
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 26 }}
            className="mt-4 text-[20px] font-bold tracking-tight"
          >
            NTab
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
