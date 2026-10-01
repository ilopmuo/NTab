import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

function current() {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/today'
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
if (typeof window !== 'undefined') window.addEventListener('hashchange', notify)

export function useRoute(): { path: string; parts: string[] } {
  const path = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    current,
  )
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent) }
}

// ── Transiciones entre pantallas ──────────────────────────────
// Donde hay View Transitions (Chrome, Edge, Safari 18), cambiar de pantalla
// funde una en otra y los elementos con el mismo `view-transition-name` viajan
// de su sitio al nuevo (el título de la tarjeta de un proyecto pasa a ser el
// título de su página). Sin ellas, o con «Reducir movimiento», la entrada de
// siempre (Motion).
let transitioning = false

/** ¿Se está pintando la pantalla nueva dentro de una View Transition? (para no animarla dos veces) */
export const inViewTransition = () => transitioning

type Doc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }

const canTransition = () =>
  typeof document !== 'undefined' && !!(document as Doc).startViewTransition && document.documentElement.dataset.motion !== 'reduce'

export function navigate(path: string) {
  const target = `#${path}`
  if (window.location.hash === target) return
  if (!canTransition()) {
    window.location.hash = path
    return
  }
  transitioning = true
  const vt = (document as Doc).startViewTransition!(() => {
    // pushState no lanza «hashchange»: se avisa a mano y React pinta ya, dentro de la transición
    history.pushState(null, '', target)
    flushSync(notify)
  })
  // Si el navegador la salta (p. ej. otra navegación encima), no es un error
  const vtx = vt as unknown as { ready?: Promise<void>; updateCallbackDone?: Promise<void> }
  vtx.ready?.catch(() => {})
  vtx.updateCallbackDone?.catch(() => {})
  vt.finished.catch(() => {}).finally(() => (transitioning = false))
}

export function href(path: string) {
  return `#${path}`
}

/** Nombre de View Transition válido (identificador CSS) a partir de cualquier texto */
export function vtName(prefix: string, id: string) {
  return `${prefix}-${[...id].map((c) => (/[a-zA-Z0-9_-]/.test(c) ? c : `_${c.codePointAt(0)!.toString(36)}`)).join('')}`
}

/**
 * Los enlaces internos («#/…») pasan por `navigate`, para que tengan transición.
 * Un enlace con ⌘/Ctrl/Mayús, en otra pestaña o cuyo clic ya se gestionó, va como siempre.
 */
export function interceptLinks() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('a')
    const to = a?.getAttribute('href')
    if (!a || !to?.startsWith('#/') || (a.target && a.target !== '_self')) return
    e.preventDefault()
    navigate(to.slice(1))
  })
}
