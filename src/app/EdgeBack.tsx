import { useEffect, useRef, useState } from 'react'
import { haptic } from '@/lib/haptics'
import { useMediaQuery } from '@/components/ui'
import { goBack, previousPath, useRoute } from './router'
import { parentOf, titleOf } from './titles'

/** Hasta dónde hay que arrastrar (fracción del ancho) para volver al soltar */
const COMMIT = 0.35
/** O lo rápido que va el dedo al soltar (px/ms) */
const FLING = 0.45
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

/**
 * Safari en el iPhone ya vuelve atrás deslizando desde el borde, pero no en
 * la app instalada en la pantalla de inicio: ahí (y en Android) lo hace LUNO.
 */
function edgeGestureAllowed() {
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return !apple || standalone
}

/**
 * Deslizar desde el borde izquierdo para volver, como en iOS: solo con el
 * dedo y dentro de algo (un proyecto, una persona, una nota). La pantalla
 * sigue al dedo con su sombra; debajo asoma la de detrás (su título y un
 * esqueleto), que se aclara según se arrastra. Pasado un tercio, o con un
 * gesto rápido, vuelve; si no, la pantalla regresa a su sitio.
 */
export function EdgeBack() {
  const { path } = useRoute()
  const parent = parentOf(path)
  // Con la barra lateral a la vista (tablet en horizontal) el borde es suyo
  const narrow = useMediaQuery('(max-width: 1023px)')
  const touch = useMediaQuery('(pointer: coarse)')
  const [target, setTarget] = useState<string | null>(null)
  const ghost = useRef<HTMLDivElement>(null)

  // Al llegar a la otra pantalla, el fondo ya no hace falta
  useEffect(() => setTarget(null), [path])

  if (!parent || !narrow || !touch || !edgeGestureAllowed()) return null

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return
    const screen = document.querySelector<HTMLElement>('#main .screen')
    if (!screen) return
    // Con el dedo, el borde se queda el puntero (captura implícita): los
    // movimientos llegan aunque el dedo ya esté lejos del borde
    const w = window.innerWidth
    const sx = e.clientX
    const sy = e.clientY
    let mode: 'pending' | 'drag' | 'off' = 'pending'
    let dx = 0
    let lastX = sx
    let lastT = e.timeStamp
    let speed = 0
    let armed = false

    const place = (x: number, animated = false) => {
      const t = animated ? `transform 0.28s ${EASE}, opacity 0.28s ${EASE}` : 'none'
      screen.style.transition = t
      screen.style.transform = `translate3d(${x}px, 0, 0)`
      const g = ghost.current
      if (g) {
        g.style.transition = t
        // La de detrás se mueve más despacio (como en iOS) y se aclara al acercarse
        g.style.transform = `translate3d(${(x - w) * 0.28}px, 0, 0)`
        g.style.opacity = String(0.45 + (0.55 * x) / w)
      }
    }
    const reset = () => {
      for (const k of ['transition', 'transform', 'boxShadow', 'background', 'position', 'zIndex'] as const) screen.style[k] = ''
    }
    const move = (ev: PointerEvent) => {
      const mx = ev.clientX - sx
      const my = ev.clientY - sy
      if (mode === 'pending') {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return void (mode = 'off')
        if (mx < 8) return
        mode = 'drag'
        // La pantalla, opaca y por encima de la de detrás mientras se arrastra
        screen.style.background = 'var(--c-bg)'
        screen.style.boxShadow = '-10px 0 30px rgb(0 0 0 / 0.22)'
        screen.style.position = 'relative'
        screen.style.zIndex = '1'
        setTarget(previousPath() ?? parent)
      }
      if (mode !== 'drag') return
      dx = Math.max(0, mx)
      const dt = Math.max(1, ev.timeStamp - lastT)
      speed = (ev.clientX - lastX) / dt
      lastX = ev.clientX
      lastT = ev.timeStamp
      place(dx)
      const next = dx > w * COMMIT
      if (next !== armed) {
        armed = next
        if (next) haptic()
      }
    }
    const end = (cancelled: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      if (mode !== 'drag') return
      const go = !cancelled && (dx > w * COMMIT || speed > FLING)
      place(go ? w : 0, true)
      setTimeout(() => {
        if (go) {
          // La transición ya la ha hecho el dedo: la otra pantalla aparece sin la suya
          goBack(parent, true)
          // Si la pantalla no cambia de elemento (p. ej. Notas), se recoloca
          requestAnimationFrame(reset)
        } else {
          reset()
          setTarget(null)
        }
      }, 280)
    }
    const up = () => end(false)
    const cancel = () => end(true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  return (
    <>
      {/* El borde que escucha el gesto: deja el scroll vertical al navegador */}
      <div aria-hidden className="fixed top-0 bottom-24 left-0 z-40 w-4 touch-pan-y" onPointerDown={start} />
      {target && (
        <div ref={ghost} aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ transform: 'translate3d(-28%, 0, 0)', opacity: 0.45 }}>
          <div className="mx-auto w-full max-w-3xl px-4 pt-[max(env(safe-area-inset-top),20px)] sm:px-6">
            <p className="mt-12 mb-8 truncate text-[34px] leading-[1.1] font-bold tracking-[-0.025em]">{titleOf(target)}</p>
            <div className="h-[312px] rounded-[18px]" style={{ background: 'var(--c-material) repeating-linear-gradient(to bottom, transparent 0 51px, var(--c-border) 51px 52px)', boxShadow: 'var(--c-shadow)' }} />
          </div>
        </div>
      )}
    </>
  )
}
