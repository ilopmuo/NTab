import { useSyncExternalStore } from 'react'
import { isAccent, type Accent } from '@/lib/accents'

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
  if (before === after || !doc.startViewTransition || reducedMotion()) return commit()
  const { x, y } = lastPointer ?? { x: innerWidth / 2, y: 0 }
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  document.documentElement.classList.add('theme-transition', 'vt-whole')
  const vt = doc.startViewTransition(commit)
  vt.ready
    .then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 520, easing: 'cubic-bezier(0.3, 0.6, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      ).finished,
    )
    .catch(() => {})
    .finally(() => document.documentElement.classList.remove('theme-transition', 'vt-whole'))
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

// ── Color de acento ───────────────────────────────────────────
// Como el tema, se guarda en cada dispositivo y se aplica antes de pintar (index.html)
const ACCENT_KEY = 'ntab-accent'
const accentListeners = new Set<() => void>()

function readAccent(): Accent {
  try {
    const v = localStorage.getItem(ACCENT_KEY)
    return isAccent(v) ? v : 'blue'
  } catch {
    return 'blue'
  }
}

function applyAccent(a: Accent) {
  if (a === 'blue') delete document.documentElement.dataset.accent
  else document.documentElement.dataset.accent = a
}

let accent = readAccent()
applyAccent(accent)

/** Cambia el acento con un fundido suave (donde hay View Transitions) */
export function setAccent(a: Accent) {
  const commit = () => {
    accent = a
    try {
      localStorage.setItem(ACCENT_KEY, a)
    } catch {
      /* sin almacenamiento: solo en memoria */
    }
    applyAccent(a)
    accentListeners.forEach((l) => l())
  }
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (a === accent || !doc.startViewTransition || reducedMotion()) return commit()
  document.documentElement.classList.add('vt-whole')
  const vt = doc.startViewTransition(commit) as { finished?: Promise<void> } | undefined
  void (vt?.finished ?? Promise.resolve()).catch(() => {}).finally(() => document.documentElement.classList.remove('vt-whole'))
}

export function useAccent(): Accent {
  return useSyncExternalStore(
    (l) => {
      accentListeners.add(l)
      return () => accentListeners.delete(l)
    },
    () => accent,
  )
}

// ── Más contraste y menos movimiento ──────────────────────────
// «Automático» sigue al sistema (prefers-contrast / prefers-reduced-motion);
// «Sí» lo fuerza en este dispositivo. Se aplica antes de pintar (index.html).
export type A11yPref = 'system' | 'on'
const CONTRAST_KEY = 'ntab-contrast'
const MOTION_KEY = 'ntab-motion'
const a11yListeners = new Set<() => void>()

function readPref(key: string): A11yPref {
  try {
    return localStorage.getItem(key) === 'on' ? 'on' : 'system'
  } catch {
    return 'system'
  }
}

let contrastPref = readPref(CONTRAST_KEY)
let motionPref = readPref(MOTION_KEY)

function applyA11y() {
  const html = document.documentElement
  const more = contrastPref === 'on' || matchMedia('(prefers-contrast: more)').matches
  const reduce = motionPref === 'on' || matchMedia('(prefers-reduced-motion: reduce)').matches
  if (more) html.dataset.contrast = 'more'
  else delete html.dataset.contrast
  if (reduce) html.dataset.motion = 'reduce'
  else delete html.dataset.motion
}
applyA11y()
matchMedia('(prefers-contrast: more)').addEventListener('change', applyA11y)
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => (applyA11y(), a11yListeners.forEach((l) => l())))

/** ¿Hay que evitar animaciones? (el sistema lo pide o se ha elegido en Ajustes) */
export const reducedMotion = () => document.documentElement.dataset.motion === 'reduce'

export function setContrastPref(p: A11yPref) {
  contrastPref = p
  try {
    localStorage.setItem(CONTRAST_KEY, p)
  } catch {
    /* solo en memoria */
  }
  applyA11y()
  a11yListeners.forEach((l) => l())
}

export function setMotionPref(p: A11yPref) {
  motionPref = p
  try {
    localStorage.setItem(MOTION_KEY, p)
  } catch {
    /* solo en memoria */
  }
  applyA11y()
  a11yListeners.forEach((l) => l())
}

export function useA11yPrefs() {
  return useSyncExternalStore(
    (l) => {
      a11yListeners.add(l)
      return () => a11yListeners.delete(l)
    },
    () => `${contrastPref}|${motionPref}|${reducedMotion()}`,
  )
}

export const a11yPrefs = () => ({ contrast: contrastPref, motion: motionPref, reduce: reducedMotion() })
