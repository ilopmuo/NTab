import { useRef, useState } from 'react'
import { animate, useMotionValue, type MotionValue } from 'motion/react'
import { haptic } from '@/lib/haptics'

/**
 * Deslizar una fila con el dedo (solo en pantallas táctiles), como en
 * Recordatorios o Mail: hacia la derecha y hacia la izquierda, cada lado con
 * su acción. El gesto solo empieza si el movimiento es claramente
 * horizontal; si no, el navegador hace scroll como siempre.
 */
export interface SwipeSide {
  run: () => void | Promise<unknown>
}

const START = 10
/** fracción del ancho a partir de la cual, al soltar, se hace la acción */
const COMMIT = 0.3

export type SwipeState = { x: MotionValue<number>; armed: 'left' | 'right' | null }

export function useSwipe({ right, left, disabled }: { right?: SwipeSide; left?: SwipeSide; disabled?: boolean }) {
  const x = useMotionValue(0)
  const [armed, setArmed] = useState<'left' | 'right' | null>(null)
  const swiped = useRef(false)

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (disabled || e.pointerType === 'mouse' || (!right && !left)) return
    if ((e.target as HTMLElement).closest('[role=checkbox], a, input, textarea, select')) return
    const el = e.currentTarget
    const width = el.getBoundingClientRect().width
    const sx = e.clientX
    const sy = e.clientY
    let mode: 'pending' | 'swipe' | 'off' = 'pending'
    let side: 'left' | 'right' | null = null

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (mode === 'pending') {
        if (Math.abs(dy) > START && Math.abs(dy) > Math.abs(dx)) return void (mode = 'off')
        if (Math.abs(dx) < START || Math.abs(dx) < Math.abs(dy) * 1.4) return
        mode = 'swipe'
        swiped.current = true
      }
      if (mode !== 'swipe') return
      // Sin acción hacia ese lado: resistencia
      let v = dx
      if ((v > 0 && !right) || (v < 0 && !left)) v = v * 0.15
      else if (Math.abs(v) > width * 0.75) v = Math.sign(v) * (width * 0.75 + (Math.abs(v) - width * 0.75) * 0.2)
      x.set(v)
      const next = v > width * COMMIT && right ? 'right' : v < -width * COMMIT && left ? 'left' : null
      if (next !== side) {
        side = next
        setArmed(next)
        if (next) haptic()
      }
    }
    const end = async () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cancel)
      if (mode !== 'swipe') return
      setTimeout(() => (swiped.current = false), 60)
      const action = side === 'right' ? right : side === 'left' ? left : undefined
      if (!action) {
        setArmed(null)
        return void animate(x, 0, { type: 'spring', stiffness: 500, damping: 36 })
      }
      await animate(x, side === 'right' ? width : -width, { duration: 0.2, ease: [0.3, 0, 0.2, 1] })
      await action.run()
      // Si la fila sigue en pantalla (p. ej. muestra las hechas), vuelve a su sitio
      setTimeout(() => {
        setArmed(null)
        void animate(x, 0, { type: 'spring', stiffness: 380, damping: 34 })
      }, 380)
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cancel)
      if (mode === 'swipe') {
        swiped.current = false
        setArmed(null)
        void animate(x, 0, { type: 'spring', stiffness: 500, damping: 36 })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', cancel)
  }

  return {
    x,
    armed,
    /** true justo después de deslizar: el clic que sigue no debe abrir la tarea */
    swiped,
    onPointerDown,
  }
}
