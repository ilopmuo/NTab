import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m as motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'motion/react'
import { X } from 'lucide-react'
import { IconButton, cx, spring, useIsMobile } from './ui'

// Las hojas y los diálogos, aparte de ui.tsx: no hacen falta para arrancar

/**
 * En ordenador: panel flotante con muelle. En móvil: hoja que sube desde abajo
 * y se cierra arrastrándola hacia abajo, como en iOS.
 */
export function Modal({
  open,
  onClose,
  children,
  className,
  position = 'top',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  position?: 'top' | 'center'
}) {
  const mobile = useIsMobile()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Al cerrarse, quitar el foco de sus campos: si no, durante la animación de
  // salida las teclas (y los atajos como N) irían a un campo que ya no se ve.
  useEffect(() => {
    if (open) return
    const el = document.activeElement as HTMLElement | null
    if (el?.closest('[role=dialog]')) el.blur()
  }, [open])
  // Cada apertura monta un contenido nuevo (aunque la anterior aún se esté cerrando)
  const session = useRef(0)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) session.current++
  wasOpen.current = open
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key={`modal-${session.current}`}
          // En lo que se ve de verdad (ver lib/viewport.ts): con el teclado del móvil
          // abierto, la hoja o el diálogo quedan justo encima, sin saltos
          className={cx(
            'fixed inset-x-0 z-50 flex justify-center transition-[top,height] duration-200 ease-out',
            mobile ? 'items-end' : position === 'top' ? 'items-start px-4 pt-[min(14vh,10%)] pb-4' : 'items-center p-4',
          )}
          style={{ top: 'var(--vv-top, 0px)', height: 'var(--vv-height, 100%)' }}
        >
          <motion.div
            className="absolute inset-0 bg-scrim backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onMouseDown={onClose}
          />
          {mobile ? (
            <Sheet onClose={onClose} className={className}>
              {children}
            </Sheet>
          ) : (
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.15 } }}
              transition={spring}
              // Nunca más alto que la pantalla (p. ej. una tablet en horizontal): lo que no
              // cabe se desplaza dentro. En columna flexible (también el <form> de los
              // formularios), la zona que tiene su propio scroll se encoge antes y la
              // cabecera y los botones de abajo siguen a la vista.
              className={cx(
                'glass-thick relative flex max-h-full w-full max-w-lg flex-col overflow-x-hidden overflow-y-auto overscroll-contain rounded-[22px]',
                '[&>form]:flex [&>form]:min-h-0 [&>form]:flex-col',
                className,
              )}
            >
              {children}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** ¿Hay algo desplazado por encima del dedo (una lista dentro de la hoja) entre el toque y la hoja? */
function scrolledAbove(target: EventTarget | null, sheet: HTMLElement) {
  for (let el = target as HTMLElement | null; el && el !== sheet; el = el.parentElement) {
    if (el.scrollTop > 0) return true
    if (el.matches('input[type=range], [data-no-sheet-drag]')) return true
  }
  return false
}

function Sheet({ children, onClose, className }: { children: ReactNode; onClose: () => void; className?: string }) {
  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, 300], [1, 0.6])
  const controls = useDragControls()
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose()
  }
  // Como en iOS: arriba del todo, tirar hacia abajo desde cualquier parte de la
  // hoja (no solo del asa) la baja con el dedo, y al soltar se cierra o vuelve
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; y: number } | null = null
    let dragging = false
    let last = { y: 0, t: 0 }
    let speed = 0
    const onStart = (e: TouchEvent) => {
      dragging = false
      const t = e.touches[0]
      start = e.touches.length === 1 && el.scrollTop <= 0 && !scrolledAbove(e.target, el) ? { x: t.clientX, y: t.clientY } : null
    }
    const onMove = (e: TouchEvent) => {
      if (!start) return
      const t = e.touches[0]
      const dy = t.clientY - start.y
      if (!dragging) {
        const dx = t.clientX - start.x
        // Hacia arriba o de lado es desplazarse por la hoja, como siempre
        if (dy < -4 || Math.abs(dx) > Math.abs(dy)) return void (start = null)
        if (dy < 8) return
        dragging = true
        last = { y: t.clientY, t: e.timeStamp }
      }
      e.preventDefault()
      speed = (t.clientY - last.y) / Math.max(1, e.timeStamp - last.t)
      last = { y: t.clientY, t: e.timeStamp }
      y.set(Math.max(0, dy - 8))
    }
    const onEnd = () => {
      if (dragging) {
        if (y.get() > 120 || speed > 0.6) closeRef.current()
        // Si no, vuelve a su sitio con un muelle (lo pesado de Motion ya está cargado al tener la hoja abierta)
        else void import('@/lib/motionFeatures').then((m) => m.animate(y, 0, { type: 'spring', stiffness: 420, damping: 40 }))
      }
      start = null
      dragging = false
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [y])
  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%', transition: { duration: 0.25, ease: [0.4, 0, 1, 1] } }}
      transition={{ type: 'spring', stiffness: 420, damping: 40 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.05, bottom: 0.9 }}
      dragControls={controls}
      dragListener={false}
      onDragEnd={onDragEnd}
      style={{ y, opacity, background: 'color-mix(in srgb, var(--c-elevated) 96%, transparent)' }}
      className={cx(
        'glass-thick relative max-h-[calc(100%-max(env(safe-area-inset-top),16px))] w-full overflow-y-auto overscroll-contain rounded-t-[28px] pb-[max(env(safe-area-inset-bottom),12px)]',
        className,
        '!max-w-none',
      )}
    >
      <div
        onPointerDown={(e) => controls.start(e)}
        className="sticky top-0 z-10 flex cursor-grab touch-none justify-center pt-2 pb-2"
      >
        <span className="h-[5px] w-9 rounded-full bg-line-strong" />
      </div>
      {children}
    </motion.div>
  )
}

export function ModalHeader({ title, onClose, left }: { title: string; onClose: () => void; left?: ReactNode }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3">
      <div>{left}</div>
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <div className="flex justify-end">
        <IconButton label="Cerrar" filled onClick={onClose} className="h-8 w-8">
          <X size={15} strokeWidth={2.5} />
        </IconButton>
      </div>
    </div>
  )
}
