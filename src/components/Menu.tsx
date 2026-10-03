import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, m as motion } from 'motion/react'
import { cx, spring } from './ui'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
}

/**
 * Botón con un menú desplegable (acciones secundarias). Accesible: se abre con
 * clic, Intro o ↓, se recorre con ↑/↓ y se cierra con Esc o al tocar fuera.
 */
export function Menu({
  label,
  trigger,
  items,
  align = 'end',
  className,
}: {
  /** nombre del botón para lectores de pantalla */
  label: string
  /** contenido del botón (icono o texto) */
  trigger: ReactNode
  items: (MenuItem | false | null | undefined)[]
  align?: 'start' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // Hacia dónde se abre: el lado pedido, salvo que no quepa en la pantalla (en el móvil los botones bajan a la izquierda)
  const [side, setSide] = useState(align)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const visible = items.filter((x): x is MenuItem => !!x)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', away)
    // Al abrir, el foco va a la primera opción
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus())
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length
      els[next]?.focus()
    } else if (e.key === 'Tab') close(false)
  }

  return (
    <div ref={root} className={cx('relative', className)}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          const r = root.current?.getBoundingClientRect()
          const width = 224
          if (r) setSide(align === 'end' ? (r.right - width < 8 ? 'start' : 'end') : r.left + width > window.innerWidth - 8 ? 'end' : 'start')
          setOpen((v) => !v)
        }}
        onKeyDown={(e) => e.key === 'ArrowDown' && (e.preventDefault(), setOpen(true))}
        className="flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-full bg-fill px-2 text-[13px] font-semibold text-fg transition-colors hover:bg-press"
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={list}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onKey}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12 } }}
            transition={spring}
            className={cx(
              'glass-thick absolute top-full z-40 mt-1.5 min-w-52 overflow-hidden rounded-[14px] p-1 shadow-[var(--c-shadow-lg)]',
              side === 'end' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            )}
          >
            {visible.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close(false)
                  it.onSelect()
                }}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[14px] font-medium outline-none hover:bg-hover focus:bg-hover',
                  it.danger ? 'text-danger' : 'text-fg',
                )}
              >
                {it.icon && <span className="flex w-4 shrink-0 justify-center text-muted">{it.icon}</span>}
                {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
