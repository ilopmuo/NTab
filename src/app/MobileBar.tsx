import { useEffect, useState } from 'react'
import { m as motion } from 'motion/react'
import { LayoutGrid, Plus } from 'lucide-react'
import { RollingNumber, cx, spring } from '@/components/ui'
import { useNavCounts } from './counts'
import { useNav } from './nav'
import { href, useRoute } from './router'
import { hub, tint } from './sections'
import { hubPath, inHub } from './hubs'
import { useFeatures } from './features'
import { ui } from './store'

/** Al bajar por una pantalla la barra se encoge (sin textos); al subir, vuelve */
function useMinimized(path: string) {
  const [mini, setMini] = useState(false)
  useEffect(() => {
    setMini(false)
    const el = document.getElementById('main')
    if (!el) return
    let last = el.scrollTop
    let height = el.scrollHeight
    let frame = 0
    // Una lectura por fotograma (leer el scroll en cada evento obliga a maquetar a mitad de scroll)
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        // Dentro de los límites: el rebote del iPhone al llegar arriba o abajo no cuenta
        const y = Math.min(Math.max(el.scrollTop, 0), el.scrollHeight - el.clientHeight)
        // Si la pantalla ha cambiado de alto (una tarea hecha que se pliega, lo que
        // llega después), el scroll se mueve solo: no es que hayas bajado o subido
        if (el.scrollHeight !== height) {
          height = el.scrollHeight
          last = y
          return
        }
        const d = y - last
        if (y < 60) setMini(false)
        else if (d > 8) setMini(true)
        else if (d < -8) setMini(false)
        if (Math.abs(d) > 8) last = y
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [path])
  return mini
}

const barSpring = { type: 'spring', stiffness: 420, damping: 34 } as const

/**
 * Barra de pestañas flotante de iOS 26: cápsula de cristal + botón de crear
 * aparte. Al bajar por una pantalla se recoge en un círculo con la pestaña en
 * la que estás; al subir (o al tocarlo) vuelve entera.
 */
export function MobileBar() {
  const { path } = useRoute()
  const mini = useMinimized(path)
  const c = useNavCounts()
  const features = useFeatures()
  const tabs = useNav().tabs.map(hub)
  const moreOn = path === '/more' || !tabs.some((t) => inHub(t, path))
  const badge: Record<string, number> = { today: c.today, habits: c.habitsLeft, inbox: c.inbox, home: c.shopping, people: c.peopleDue }
  const items = [
    ...tabs.map((t) => ({ id: t.id, path: hubPath(t, features.section), label: t.short, on: inHub(t, path), color: tint(t.tint), icon: t.icon })),
    { id: 'more', path: '/more', label: 'Más', on: moreOn, color: 'var(--c-blue)', icon: LayoutGrid },
  ]
  return (
    <>
    <div
      data-mobile-bar
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-end gap-2.5 px-3 pb-[max(env(safe-area-inset-bottom),10px)] transition-[opacity,translate] duration-200 md:hidden"
      style={{ viewTransitionName: 'tabbar' }}
    >
      <motion.nav
        initial={false}
        animate={{ height: mini ? 50 : 62 }}
        transition={barSpring}
        className={cx('glass-thick pointer-events-auto flex items-center rounded-full', mini ? 'flex-none px-[5px]' : 'flex-1 px-1')}
      >
        {items.map((t) => {
          const hidden = mini && !t.on
          return (
            <motion.a
              key={t.id}
              href={href(t.path)}
              aria-current={t.on ? 'page' : undefined}
              aria-hidden={hidden || undefined}
              tabIndex={hidden ? -1 : undefined}
              initial={false}
              animate={{ opacity: hidden ? 0 : 1, maxWidth: hidden ? 0 : mini ? 40 : 160, minWidth: hidden ? 0 : 40 }}
              transition={barSpring}
              className={cx(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-0.5 transition-[height] duration-300 active:scale-95',
                // Recortar solo al encogerse (si no, las esquinas cortaban «Calendario»)
                mini ? 'h-[40px] overflow-hidden' : 'h-[52px]',
                hidden && 'pointer-events-none',
              )}
              style={{ color: t.on ? t.color : 'var(--c-text)' }}
            >
              {t.on && <motion.span layoutId="tab-pill" layoutDependency={t.on} transition={spring} className="absolute inset-0 rounded-full bg-fill" />}
              {/* Al elegirla, el icono da un saltito (como los SF Symbols) */}
              <motion.span
                className="relative"
                key={t.on ? 'on' : 'off'}
                animate={t.on ? { y: [0, -5, 0], scale: [1, 1.12, 1] } : { y: 0, scale: 1 }}
                transition={{ duration: 0.42, ease: [0.3, 1.4, 0.5, 1] }}
              >
                {t.icon === 'today' ? (
                  <span
                    className={cx('font-num flex h-[22px] w-[22px] items-center justify-center rounded-[6px] border-[1.8px] text-[11px] font-bold', t.on ? '' : 'opacity-90')}
                    style={{ borderColor: 'currentColor' }}
                  >
                    {new Date().getDate()}
                  </span>
                ) : (
                  <t.icon size={22} strokeWidth={t.on ? 2.3 : 1.9} />
                )}
                {!!badge[t.id] && (
                  <span
                    className="font-num absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                    style={{ background: 'var(--c-accent-fill)' }}
                  >
                    <RollingNumber value={badge[t.id]} />
                  </span>
                )}
              </motion.span>
              <Label mini={mini}>{t.label}</Label>
            </motion.a>
          )
        })}
      </motion.nav>
      {mini && <span className="flex-1" />}
      <motion.button
        type="button"
        aria-label="Nueva tarea"
        whileTap={{ scale: 0.88 }}
        initial={false}
        animate={{ width: mini ? 50 : 62, height: mini ? 50 : 62 }}
        transition={barSpring}
        onClick={() => ui.quickAdd()}
        className="pointer-events-auto flex shrink-0 items-center justify-center rounded-full bg-accent-fill text-white shadow-[0_10px_28px_-10px_rgb(0_0_0/0.45)]"
      >
        <Plus size={28} strokeWidth={2.5} />
      </motion.button>
    </div>
      {/* En la tablet (con la barra lateral a la vista), solo el botón de crear, a mano del pulgar */}
      <motion.button
        type="button"
        aria-label="Nueva tarea"
        whileTap={{ scale: 0.88 }}
        onClick={() => ui.quickAdd()}
        data-tablet-add
        className="fixed right-6 bottom-[max(env(safe-area-inset-bottom),24px)] z-30 hidden h-[60px] w-[60px] items-center justify-center rounded-full bg-accent-fill text-white shadow-[0_10px_28px_-10px_rgb(0_0_0/0.45)] md:pointer-coarse:flex"
      >
        <Plus size={28} strokeWidth={2.5} />
      </motion.button>
    </>
  )
}

function Label({ mini, children }: { mini: boolean; children: React.ReactNode }) {
  return (
    <motion.span
      initial={false}
      animate={{ opacity: mini ? 0 : 1, height: mini ? 0 : 'auto', scale: mini ? 0.8 : 1 }}
      transition={barSpring}
      // Sin cortar «Calendario» en un iPhone estrecho
      className="relative overflow-hidden text-[10px] font-semibold tracking-[-0.02em] whitespace-nowrap"
    >
      {children}
    </motion.span>
  )
}
