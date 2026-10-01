import { useSyncExternalStore } from 'react'

// Grupos plegados de la barra lateral: cosa de cada dispositivo (localStorage)
const KEY = 'ntab-nav-collapsed'
const listeners = new Set<() => void>()

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

let collapsed = read()

export function useCollapsed(id: string): [boolean, () => void] {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => collapsed,
  )
  const toggle = () => {
    collapsed = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    try {
      localStorage.setItem(KEY, JSON.stringify(collapsed))
    } catch {
      /* solo en memoria */
    }
    listeners.forEach((l) => l())
  }
  return [list.includes(id), toggle]
}
