import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { resolveNav, type NavPrefs } from '@/lib/nav'
import { SECTIONS } from './sections'

const IDS = SECTIONS.map((s) => s.id)

/** Secciones de la barra lateral y pestañas del móvil según el ajuste `nav` */
export function useNav() {
  // Mientras se lee (un instante) se usa la navegación por defecto
  const prefs = useLiveQuery(() => db.settings.get('nav').then((r) => (r?.value as NavPrefs | undefined) ?? null), [])
  return useMemo(() => resolveNav(prefs, IDS), [prefs])
}

export function saveNav(prefs: NavPrefs | null) {
  return prefs ? setSetting('nav', prefs) : db.settings.delete('nav')
}
