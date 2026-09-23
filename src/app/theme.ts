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

export function setTheme(p: ThemePref) {
  pref = p
  try {
    localStorage.setItem(KEY, p)
  } catch {
    /* sin almacenamiento: solo en memoria */
  }
  apply(p)
  listeners.forEach((l) => l())
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
