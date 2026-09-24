import { AnimatePresence, motion } from 'motion/react'
import { Bell, Check } from 'lucide-react'
import { setUI, useUI } from '@/app/store'
import { spring } from './ui'

/** Aviso tipo cápsula flotante (como los de iOS) */
export function Toast() {
  const t = useUI((s) => s.toast)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[96px] z-[60] flex justify-center px-4 lg:bottom-6">
      <AnimatePresence mode="popLayout">
        {t && (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95, transition: { duration: 0.18 } }}
            transition={spring}
            className="glass-thick pointer-events-auto flex items-center gap-3 rounded-full py-2 pr-2 pl-3 text-[14px] font-medium"
          >
            {t.icon === 'bell' ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white">
                <Bell size={12} strokeWidth={2.8} />
              </span>
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green text-on-green">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
            {t.onClick ? (
              <button
                type="button"
                onClick={() => {
                  t.onClick!()
                  setUI({ toast: null })
                }}
                className="max-w-[46vw] truncate text-left"
              >
                {t.message}
              </button>
            ) : (
              <span className="max-w-[60vw] truncate">{t.message}</span>
            )}
            {t.actions.length ? (
              t.actions.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => {
                    a.run()
                    setUI({ toast: null })
                  }}
                  className={
                    i === 0
                      ? 'shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-[13px] font-bold text-blue transition-transform active:scale-95'
                      : 'shrink-0 rounded-full bg-fill px-3 py-1.5 text-[13px] font-bold text-fg transition-transform active:scale-95'
                  }
                >
                  {a.label}
                </button>
              ))
            ) : (
              <span className="w-1" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
