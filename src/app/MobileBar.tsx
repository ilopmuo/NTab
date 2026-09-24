import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Menu, Plus } from 'lucide-react'
import { RollingNumber, cx, spring } from '@/components/ui'
import { useNavCounts } from './counts'
import { href, useRoute } from './router'
import { section, tint } from './sections'
import { ui } from './store'

const TABS = ['today', 'upcoming', 'calendar', 'habits'].map(section)

/** Al bajar por una pantalla la barra se encoge (sin textos); al subir, vuelve */
function useMinimized(path: string) {
  const [mini, setMini] = useState(false)
  useEffect(() => {
    setMini(false)
    const el = document.getElementById('main')
    if (!el) return
    let last = el.scrollTop
    const onScroll = () => {
      const y = el.scrollTop
      const d = y - last
      if (y < 60) setMini(false)
      else if (d > 8) setMini(true)
      else if (d < -8) setMini(false)
      if (Math.abs(d) > 8) last = y
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [path])
  return mini
}

const barSpring = { type: 'spring', stiffness: 420, damping: 34 } as const

/** Barra de pestañas flotante de iOS 26: cápsula de cristal + botón de crear aparte */
export function MobileBar() {
  const { path } = useRoute()
  const mini = useMinimized(path)
  const c = useNavCounts()
  const badge: Record<string, number> = { today: c.today, habits: c.habitsLeft }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end gap-2.5 px-3 pb-[max(env(safe-area-inset-bottom),10px)] lg:hidden">
      <motion.nav initial={false} animate={{ height: mini ? 50 : 62 }} transition={barSpring} className="glass-thick pointer-events-auto flex flex-1 items-center rounded-full px-1.5">
        {TABS.map((t) => {
          const on = path === t.path || path.startsWith(t.path + '/')
          return (
            <a
              key={t.id}
              href={href(t.path)}
              className={cx('relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full transition-[height] duration-300 active:scale-95', mini ? 'h-[40px]' : 'h-[52px]')}
              style={{ color: on ? tint(t.tint) : 'var(--c-text)' }}
            >
              {on && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-0 rounded-full bg-fill" />}
              <span className="relative">
                {t.icon === 'today' ? (
                  <span
                    className={cx('font-num flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border-[1.8px] text-[11px] font-bold', on ? '' : 'opacity-90')}
                    style={{ borderColor: 'currentColor' }}
                  >
                    {new Date().getDate()}
                  </span>
                ) : (
                  <t.icon size={22} strokeWidth={on ? 2.3 : 1.9} />
                )}
                {!!badge[t.id] && (
                  <span
                    className="font-num absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                    style={{ background: tint('blue') }}
                  >
                    <RollingNumber value={badge[t.id]} />
                  </span>
                )}
              </span>
              <Label mini={mini}>{t.short}</Label>
            </a>
          )
        })}
        <button
          type="button"
          onClick={() => ui.sidebar(true)}
          className={cx('relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-fg transition-[height] duration-300 active:scale-95', mini ? 'h-[40px]' : 'h-[52px]')}
        >
          <Menu size={22} strokeWidth={1.9} />
          <Label mini={mini}>Más</Label>
        </button>
      </motion.nav>
      <motion.button
        type="button"
        aria-label="Nueva tarea"
        whileTap={{ scale: 0.88 }}
        initial={false}
        animate={{ width: mini ? 50 : 62, height: mini ? 50 : 62 }}
        transition={barSpring}
        onClick={() => ui.quickAdd()}
        className="pointer-events-auto flex shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_30px_-8px_var(--c-blue)]"
      >
        <Plus size={28} strokeWidth={2.5} />
      </motion.button>
    </div>
  )
}

function Label({ mini, children }: { mini: boolean; children: React.ReactNode }) {
  return (
    <motion.span
      initial={false}
      animate={{ opacity: mini ? 0 : 1, height: mini ? 0 : 'auto', scale: mini ? 0.8 : 1 }}
      transition={barSpring}
      className="relative overflow-hidden text-[10px] font-semibold"
    >
      {children}
    </motion.span>
  )
}
