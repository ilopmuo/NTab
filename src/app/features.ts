import { useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { cardOn, featureOn, sectionOn, type FeatureFlags } from '@/lib/features'

// Qué funciones están encendidas: lo consultan la barra lateral, ⌘K, los
// atajos y Hoy, así que se mantiene en memoria (y al día con la sincronización).
let flags: FeatureFlags = {}
const listeners = new Set<() => void>()
let started = false

function start() {
  if (started) return
  started = true
  liveQuery(() => db.settings.get('features')).subscribe({
    next: (r) => {
      flags = (r?.value as FeatureFlags | undefined) ?? {}
      listeners.forEach((l) => l())
    },
    error: (e) => console.error('[features]', e),
  })
}

export function useFeatures() {
  start()
  const f = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    () => flags,
  )
  return {
    flags: f,
    on: (id: string) => featureOn(f, id),
    section: (id: string) => sectionOn(f, id),
    card: (id: string) => cardOn(f, id),
  }
}

/** Para código fuera de React (atajos de teclado) */
export function sectionEnabled(id: string) {
  start()
  return sectionOn(flags, id)
}

export async function setFeature(id: string, on: boolean) {
  const current = ((await db.settings.get('features'))?.value as FeatureFlags | undefined) ?? {}
  const next = { ...current }
  if (on) delete next[id]
  else next[id] = false
  await setSetting('features', next)
}
