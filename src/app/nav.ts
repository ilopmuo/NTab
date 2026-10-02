import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { resolveNav, type NavPrefs } from '@/lib/nav'
import { HUBS } from './sections'
import { hubTabs } from './hubs'
import { useFeatures } from './features'

/**
 * Espacios de la barra lateral y pestañas del móvil según el ajuste `nav`,
 * sin los que tienen todas sus funciones apagadas.
 */
export function useNav() {
  // Mientras se lee (un instante) se usa la navegación por defecto
  const prefs = useLiveQuery(() => db.settings.get('nav').then((r) => (r?.value as NavPrefs | undefined) ?? null), [])
  const { flags, section } = useFeatures()
  const nav = useMemo(() => resolveNav(prefs, HUBS.filter((h) => hubTabs(h, section).length).map((h) => h.id)), [prefs, flags])
  return { ...nav, prefs }
}

/**
 * Guarda la navegación. Los espacios apagados no salen en el editor: se
 * conserva su sitio para cuando se vuelvan a encender.
 */
export function saveNav(prefs: NavPrefs | null, previous?: NavPrefs | null) {
  if (!prefs) return db.settings.delete('nav')
  const keep = (previous?.order ?? []).filter((id) => !prefs.order?.includes(id))
  const place = { ...previous?.place, ...prefs.place }
  return setSetting('nav', { ...prefs, order: [...(prefs.order ?? []), ...keep], place })
}
