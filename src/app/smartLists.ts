import { useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { uid } from '@/lib/id'
import type { SmartList } from '@/lib/smartLists'
import { toast } from './store'

// Las listas inteligentes guardadas (ajuste `smartLists`, sincronizado): la
// barra lateral, ⌘K y su pantalla las leen de aquí.
let lists: SmartList[] = []
const listeners = new Set<() => void>()
let started = false

function start() {
  if (started) return
  started = true
  liveQuery(() => db.settings.get('smartLists')).subscribe({
    next: (r) => {
      lists = Array.isArray(r?.value) ? (r!.value as SmartList[]) : []
      listeners.forEach((l) => l())
    },
    error: (e) => console.error('[smartLists]', e),
  })
}

export function useSmartLists(): SmartList[] {
  start()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => lists,
  )
}

const saved = async () => ((await db.settings.get('smartLists'))?.value as SmartList[] | undefined) ?? []

/** Crea (sin id) o cambia una lista; devuelve su id */
export async function saveSmartList(list: Omit<SmartList, 'id'> & { id?: string }) {
  const current = await saved()
  const id = list.id ?? uid()
  const next = { ...list, id } as SmartList
  await setSetting('smartLists', current.some((l) => l.id === id) ? current.map((l) => (l.id === id ? next : l)) : [...current, next])
  return id
}

export async function deleteSmartList(id: string) {
  const current = await saved()
  const gone = current.find((l) => l.id === id)
  await setSetting('smartLists', current.filter((l) => l.id !== id))
  if (gone) toast(`«${gone.name}» borrada. Las tareas siguen donde estaban.`, { label: 'Deshacer', run: () => void setSetting('smartLists', current) })
}
