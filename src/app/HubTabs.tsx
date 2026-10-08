import { useEffect, useLayoutEffect, useRef } from 'react'
import { m as motion } from 'motion/react'
import { cx, spring } from '@/components/ui'
import { href, useRoute } from './router'
import { hubOf, section, sectionOfRoute } from './sections'
import { hubTabs, rememberTab } from './hubs'
import { useFeatures } from './features'

/** Hasta dónde estaba deslizada la fila de cada espacio */
const rowScroll = new Map<string, number>()

/**
 * Las pestañas del espacio en el que estás (Compra · Menú · Cosas), encima del
 * título: para saltar a lo de al lado sin volver a la barra lateral. Solo en la
 * portada de cada sección (no dentro de una nota o de una etiqueta).
 */
export function HubTabs({ className, anyDepth }: { className?: string; /** también dentro (la lista de notas, junto a la nota abierta) */ anyDepth?: boolean }) {
  const { parts } = useRoute()
  const features = useFeatures()
  const current = sectionOfRoute(parts[0])
  useEffect(() => {
    rememberTab(current)
  }, [current])
  const h = hubOf(current)
  const tabs = h ? hubTabs(h, features.section) : []
  // Cada pantalla trae su propia fila de pestañas: se monta donde estaba la
  // anterior (sin pintarse un momento al principio y luego saltar) y, si la
  // activa no se ve entera, la fila se desliza lo justo. Solo en horizontal:
  // scrollIntoView movía también la pantalla hacia arriba o hacia abajo
  const nav = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = nav.current
    if (!el || !h) return
    el.scrollLeft = rowScroll.get(h.id) ?? 0
    const on = el.querySelector<HTMLElement>('[aria-current=page]')
    if (on) {
      const box = el.getBoundingClientRect()
      const r = on.getBoundingClientRect()
      if (r.left < box.left) el.scrollLeft -= box.left - r.left + 8
      else if (r.right > box.right) el.scrollLeft += r.right - box.right + 8
    }
    rowScroll.set(h.id, el.scrollLeft)
  }, [current, h])
  if (!h || (parts.length > 1 && !anyDepth) || tabs.length < 2) return null
  return (
    <nav
      ref={nav}
      aria-label={h.label}
      onScroll={(e) => rowScroll.set(h.id, e.currentTarget.scrollLeft)}
      // Con nombre propio en la transición: al cambiar de pestaña, la fila se queda quieta (ver index.css)
      style={{ viewTransitionName: 'hubtabs' }}
      className={cx('no-scrollbar -mx-1 mb-4 flex gap-0.5 overflow-x-auto px-1 after:block after:w-3 after:shrink-0 after:content-[\'\']', className)}>
      {tabs.map((t) => {
        const on = t.id === current
        return (
          <a
            key={t.id}
            href={href(section(t.id).path)}
            aria-current={on ? 'page' : undefined}
            className={cx('relative shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors', on ? 'text-fg' : 'text-muted hover:text-fg')}
          >
            {on && <motion.span layoutId="hub-tab" layoutDependency={on} transition={spring} className="absolute inset-0 rounded-full bg-fill" />}
            <span className="relative">{t.label}</span>
          </a>
        )
      })}
    </nav>
  )
}
