import { useSyncExternalStore } from 'react'

export type ThemePref = 'dark' | 'light' | 'system'
const KEY = 'ntab-theme'
const listeners = new Set<() => void>()

function read(): ThemePref {
  try {
    return (localStorage.getItem(KEY) as ThemePref) || 'dark'
  } catch {
    return 'dark'
  }
}

function apply(pref: ThemePref) {
  const resolved = pref === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#000000' : '#f5f5f7')
}

let pref = read()
apply(pref)
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => pref === 'system' && apply(pref))

let lastPointer: { x: number; y: number } | null = null
addEventListener('pointerdown', (e) => (lastPointer = { x: e.clientX, y: e.clientY }), { capture: true, passive: true })

/**
 * Cambia el tema. Donde hay View Transitions, el nuevo tema se revela en un
 * círculo que crece desde donde se ha pulsado.
 */
export function setTheme(p: ThemePref) {
  const commit = () => {
    pref = p
    try {
      localStorage.setItem(KEY, p)
    } catch {
      /* sin almacenamiento: solo en memoria */
    }
    apply(p)
    listeners.forEach((l) => l())
  }
  const before = document.documentElement.dataset.theme
  const after = p === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
  if (before === after || !doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return commit()
  const { x, y } = lastPointer ?? { x: innerWidth / 2, y: 0 }
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  document.documentElement.classList.add('theme-transition')
  const vt = doc.startViewTransition(commit)
  vt.ready
    .then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(0.3, 0.6, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ).finished,
    )
    .catch(() => {})
    .finally(() => document.documentElement.classList.remove('theme-transition'))
}

export function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
}

export function useTheme(): ThemePref {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pref,
  )
}
