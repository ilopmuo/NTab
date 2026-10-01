import { useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { toast } from './store'

/** Proyectos, áreas y etiquetas fijados arriba de la barra lateral (ajuste `pins`, sincronizado) */
export interface Pin {
  kind: 'project' | 'area' | 'tag'
  id: string
}

let pins: Pin[] = []
const listeners = new Set<() => void>()
let started = false

function start() {
  if (started) return
  started = true
  liveQuery(() => db.settings.get('pins')).subscribe({
    next: (r) => {
      pins = Array.isArray(r?.value) ? (r!.value as Pin[]) : []
      listeners.forEach((l) => l())
    },
    error: (e) => console.error('[pins]', e),
  })
}

export function usePins(): Pin[] {
  start()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => pins,
  )
}

export const isPinned = (list: Pin[], kind: Pin['kind'], id: string) => list.some((p) => p.kind === kind && p.id === id)

export async function togglePin(kind: Pin['kind'], id: string) {
  const current = ((await db.settings.get('pins'))?.value as Pin[] | undefined) ?? []
  const next = isPinned(current, kind, id) ? current.filter((p) => !(p.kind === kind && p.id === id)) : [...current, { kind, id }]
  await setSetting('pins', next)
  return !isPinned(current, kind, id)
}

/** Fija o suelta, con aviso y «Deshacer» */
export async function togglePinWithToast(kind: Pin['kind'], id: string, label: string) {
  const pinned = await togglePin(kind, id)
  toast(pinned ? `${label}, fijado arriba en la barra lateral` : `${label}, ya no está fijado`, { label: 'Deshacer', run: () => void togglePin(kind, id) })
}
