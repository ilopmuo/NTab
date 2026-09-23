import { AnimatePresence, motion } from 'motion/react'
import { KeyRound } from 'lucide-react'
import { softSpring } from '@/components/ui'
import { openAuth, useSync } from './service'

/** Aviso discreto cuando la sesión se ha perdido pero el dispositivo ya tenía cuenta */
export function ReauthBanner() {
  const s = useSync()
  const show = s.state === 'signed-out' && !!s.knownEmail && !s.localOnly
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={softSpring}
          className="mx-auto w-full max-w-3xl px-4 pt-[max(env(safe-area-inset-top),12px)] sm:px-6 lg:px-10"
        >
          <button
            type="button"
            onClick={openAuth}
            className="glass flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-transform active:scale-[0.99]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange text-white">
              <KeyRound size={16} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[15px] font-semibold">Vuelve a entrar para sincronizar</b>
              <span className="block truncate text-[13px] text-muted">Tus datos están a salvo en este dispositivo · {s.knownEmail}</span>
            </span>
            <span className="text-[14px] font-semibold text-blue">Entrar</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
