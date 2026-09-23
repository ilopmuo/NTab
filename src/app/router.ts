import { useSyncExternalStore } from 'react'

function current() {
  const h = window.location.hash.replace(/^#/, '')
  return h || '/today'
}

export function useRoute(): { path: string; parts: string[] } {
  const path = useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l)
      return () => window.removeEventListener('hashchange', l)
    },
    current,
  )
  return { path, parts: path.split('/').filter(Boolean).map(decodeURIComponent) }
}

export function navigate(path: string) {
  window.location.hash = path
}

export function href(path: string) {
  return `#${path}`
}
