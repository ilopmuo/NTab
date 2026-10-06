import { useEffect, useRef } from 'react'
import { m as motion } from 'motion/react'
import { cx, spring } from '@/components/ui'
import { href, useRoute } from './router'
import { hubOf, section, sectionOfRoute } from './sections'
import { hubTabs, rememberTab } from './hubs'
import { useFeatures } from './features'

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
  // La pestaña activa, siempre a la vista (en el móvil la fila se desliza).
  // Entre llaves: Chrome ya devuelve una Promise de scrollIntoView y React la
  // tomaría por la limpieza del efecto; al salir de la pantalla la llamaba
  // («… is not a function») y la ventana entera se quedaba en blanco
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    nav.current?.querySelector('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current])
  if (!h || (parts.length > 1 && !anyDepth) || tabs.length < 2) return null
  return (
    <nav ref={nav} aria-label={h.label} className={cx('no-scrollbar -mx-1 mb-4 flex gap-0.5 overflow-x-auto px-1 after:block after:w-3 after:shrink-0 after:content-[\'\']', className)}>
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
