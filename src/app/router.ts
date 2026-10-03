import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

function current() {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/today'
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

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

// ── Hacia dentro y hacia fuera (como la pila de navegación de iOS) ──
// Entrar en algo (un proyecto, una persona, una etiqueta) desliza la pantalla
// nueva desde la derecha sobre la anterior; volver la retira hacia la
// derecha. Entre pantallas del mismo nivel (las pestañas), un fundido.
const DEPTH: Record<string, number> = { area: 2, people: 2, tag: 2, list: 2, notes: 2, project: 3 }
/** Páginas sin id que viven dentro de un lugar (Algún día, en Listas; Objetivos, en Proyectos…) */
const INSIDE = new Set(['someday', 'waiting', 'logbook', 'matrix', 'goals', 'templates', 'plan', 'focus', 'shutdown', 'review'])

/** Cuánto «dentro» está una pantalla: 1 las de la barra; 2 o 3 lo que se abre desde ellas */
export function depthOf(path: string) {
  const [s, id] = path.split('/').filter(Boolean)
  if (!id) return INSIDE.has(s) ? 2 : 1
  // En el ordenador, Notas es lista y nota a la vez: abrir una no es entrar en otra pantalla
  if (s === 'notes' && typeof matchMedia !== 'undefined' && matchMedia('(min-width: 768px)').matches) return 1
  return DEPTH[s] ?? 1
}

export type NavDirection = 'push' | 'pop' | 'fade'
export function directionOf(from: string, to: string): NavDirection {
  const a = depthOf(from)
  const b = depthOf(to)
  return b > a ? 'push' : b < a ? 'pop' : 'fade'
}

let vtRun = 0
/** Cambia de pantalla dentro de una View Transition con su dirección (ver index.css) */
function transition(dir: NavDirection, update: () => void) {
  const run = ++vtRun
  const root = document.documentElement
  root.dataset.nav = dir
  transitioning = true
  const vt = (document as Doc).startViewTransition!(update)
  // Si el navegador la salta (p. ej. otra navegación encima), no es un error
  const vtx = vt as unknown as { ready?: Promise<void>; updateCallbackDone?: Promise<void> }
  vtx.ready?.catch(() => {})
  vtx.updateCallbackDone?.catch(() => {})
  vt.finished
    .catch(() => {})
    .finally(() => {
      if (run !== vtRun) return
      transitioning = false
      delete root.dataset.nav
    })
}

// ── Lo visitado en esta sesión, para saber adónde lleva «atrás» ──
// Cada entrada del historial lleva su posición; así se sabe qué hay detrás.
const visited = new Map<number, string>()
let position = 0
if (typeof window !== 'undefined') {
  position = (history.state as { i?: number } | null)?.i ?? 0
  visited.set(position, current())
  if ((history.state as { i?: number } | null)?.i === undefined) history.replaceState({ ...(history.state ?? {}), i: position }, '')
}
const forgetAfter = (i: number) => [...visited.keys()].forEach((k) => k > i && visited.delete(k))

/** La pantalla de la que se viene (si se llegó a esta desde otra de la app) */
export function previousPath(): string | undefined {
  return visited.get(position - 1)
}

/** Lo siguiente que llegue por el historial se pinta sin transición (lo anima otro: el gesto de volver) */
let instantNext = false

if (typeof window !== 'undefined')
  window.addEventListener('hashchange', () => {
    // Atrás, adelante o un cambio de la dirección a mano: se apunta dónde estamos
    const i = (history.state as { i?: number } | null)?.i
    // Una entrada nueva (un enlace sin pasar por `navigate`, la dirección a mano):
    // se pinta ya, sin transición. Ir atrás o adelante: con su animación.
    const fresh = i === undefined
    if (fresh) {
      position++
      forgetAfter(position - 1)
      history.replaceState({ ...(history.state ?? {}), i: position }, '')
    } else position = i
    const to = current()
    visited.set(position, to)
    if (instantNext) {
      instantNext = false
      transitioning = true
      flushSync(notify)
      transitioning = false
      return
    }
    if (fresh || !canTransition() || to === shownPath) return notify()
    transition(directionOf(shownPath, to), () => flushSync(notify))
  })

// ── Cada pantalla recuerda dónde la dejaste (como en iOS) ─────
// Al ir a otra se guarda la posición; al volver atrás (botón, gesto o
// historial) se recupera. Ir a una pantalla de nuevo la abre arriba.
const scrolls = new Map<string, number>()
let shownPath = typeof window !== 'undefined' ? current() : '/today'
let fromHistory = false
const saveScroll = () => {
  const main = document.getElementById('main')
  if (main) scrolls.set(shownPath, main.scrollTop)
}
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => {
    saveScroll()
    fromHistory = true
  })

/** Tras pintar una pantalla: arriba, o donde estaba si se vuelve atrás */
export function placeScroll(path: string) {
  const main = document.getElementById('main')
  const back = fromHistory
  fromHistory = false
  shownPath = path
  if (!main) return
  const y = back ? (scrolls.get(path) ?? 0) : 0
  main.scrollTo({ top: y })
  if (!y) return
  // Lo de abajo llega un momento después (datos, listas por tramos): se insiste un poco
  const start = performance.now()
  const again = () => {
    if (Math.abs(main.scrollTop - y) <= 2 || performance.now() - start > 900 || shownPath !== path) return
    main.scrollTop = y
    requestAnimationFrame(again)
  }
  requestAnimationFrame(again)
}

export function navigate(path: string, dir?: NavDirection | 'none') {
  const target = `#${path}`
  if (window.location.hash === target) return
  saveScroll()
  fromHistory = false
  const push = () => {
    position++
    forgetAfter(position - 1)
    visited.set(position, path)
    // pushState no lanza «hashchange»: se avisa a mano y React pinta ya, dentro de la transición
    history.pushState({ i: position }, '', target)
  }
  if (dir === 'none') {
    push()
    // Ya animado por el gesto: la pantalla nueva aparece tal cual, sin su entrada
    transitioning = true
    flushSync(notify)
    transitioning = false
    return
  }
  if (!canTransition()) {
    push()
    notify()
    return
  }
  const from = shownPath
  transition(dir ?? directionOf(from, path), () => {
    push()
    flushSync(notify)
  })
}

/**
 * Volver: a la pantalla de la que se vino (como el botón de atrás de iOS) o,
 * si se abrió directamente (un enlace, un aviso), a la de arriba.
 * `instant`: sin transición, porque ya la ha hecho el gesto de deslizar.
 */
export function goBack(parent: string, instant = false) {
  if (previousPath() !== undefined) {
    instantNext = instant
    history.back()
  } else navigate(parent, instant ? 'none' : 'pop')
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
