import { motion } from 'motion/react'
import { Menu, Plus } from 'lucide-react'
import { cx, spring } from '@/components/ui'
import { useNavCounts } from './counts'
import { href, useRoute } from './router'
import { section, tint } from './sections'
import { ui } from './store'

const TABS = ['today', 'upcoming', 'calendar', 'habits'].map(section)

/** Barra de pestañas flotante de iOS 26: cápsula de cristal + botón de crear aparte */
export function MobileBar() {
  const { path } = useRoute()
  const c = useNavCounts()
  const badge: Record<string, number> = { today: c.today, habits: c.habitsLeft }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end gap-2.5 px-3 pb-[max(env(safe-area-inset-bottom),10px)] lg:hidden">
      <nav className="glass-thick pointer-events-auto flex h-[62px] flex-1 items-center rounded-full px-1.5">
        {TABS.map((t) => {
          const on = path === t.path || path.startsWith(t.path + '/')
          return (
            <a
              key={t.id}
              href={href(t.path)}
              className="relative flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full active:scale-95"
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
                    {badge[t.id]}
                  </span>
                )}
              </span>
              <span className="relative text-[10px] font-semibold">{t.short}</span>
            </a>
          )
        })}
        <button
          type="button"
          onClick={() => ui.sidebar(true)}
          className="relative flex h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-fg active:scale-95"
        >
          <Menu size={22} strokeWidth={1.9} />
          <span className="text-[10px] font-semibold">Más</span>
        </button>
      </nav>
      <motion.button
        type="button"
        aria-label="Nueva tarea"
        whileTap={{ scale: 0.88 }}
        onClick={() => ui.quickAdd()}
        className="pointer-events-auto flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_30px_-8px_var(--c-blue)]"
      >
        <Plus size={28} strokeWidth={2.5} />
      </motion.button>
    </div>
  )
}
