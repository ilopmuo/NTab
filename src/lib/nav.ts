/**
 * Navegación a tu medida: qué secciones van en la cuadrícula de la barra
 * lateral, cuáles en la lista, cuáles se ocultan (siguen en ⌘K y en los atajos)
 * y qué cuatro pestañas lleva la barra del móvil. Se guarda en el ajuste `nav`.
 */

export type Place = 'tile' | 'list' | 'hidden'

export interface NavPrefs {
  order?: string[]
  place?: Record<string, Place>
  tabs?: string[]
}

/** Siempre al pie de la barra lateral: no se mueven ni se ocultan */
export const FIXED = ['logbook', 'trash', 'settings']
export const DEFAULT_TILES = ['today', 'upcoming', 'inbox', 'calendar', 'habits', 'notes']
export const DEFAULT_LIST = ['shopping', 'menu', 'routines', 'trackers', 'things', 'journal', 'people', 'projects', 'tags', 'lists', 'matrix', 'someday', 'templates', 'goals', 'expenses', 'finance', 'review']
/** De la lista, pero ocultas al empezar (para no saturar la barra): en «N más» de su grupo, en «Más» y en ⌘K */
export const DEFAULT_HIDDEN = ['matrix', 'templates']
export const DEFAULT_TABS = ['today', 'upcoming', 'calendar', 'habits']
export const TAB_COUNT = 4
/** Hoy es la portada: no se puede ocultar */
export const ALWAYS_VISIBLE = ['today']

export interface Nav {
  /** Todas las secciones que se pueden colocar, en su orden */
  order: string[]
  place: Record<string, Place>
  tiles: string[]
  list: string[]
  hidden: string[]
  tabs: string[]
}

/**
 * Aplica las preferencias sobre las secciones que existen. Las secciones nuevas
 * (que aún no estaban cuando se guardó) aparecen en su sitio por defecto.
 * @param sections ids de todas las secciones de la app
 */
export function resolveNav(prefs: NavPrefs | null | undefined, sections: string[]): Nav {
  const known = sections.filter((id) => !FIXED.includes(id))
  const defaults = [...DEFAULT_TILES, ...DEFAULT_LIST]
  const byDefault = [...defaults.filter((id) => known.includes(id)), ...known.filter((id) => !defaults.includes(id))]
  const saved = unique(prefs?.order ?? []).filter((id) => known.includes(id))
  const order = [...saved, ...byDefault.filter((id) => !saved.includes(id))]

  const place: Record<string, Place> = {}
  for (const id of order) {
    let p = prefs?.place?.[id] ?? (DEFAULT_TILES.includes(id) ? 'tile' : DEFAULT_HIDDEN.includes(id) ? 'hidden' : 'list')
    if (p !== 'tile' && p !== 'list' && p !== 'hidden') p = 'list'
    if (p === 'hidden' && ALWAYS_VISIBLE.includes(id)) p = DEFAULT_TILES.includes(id) ? 'tile' : 'list'
    place[id] = p
  }

  const valid = unique(prefs?.tabs ?? []).filter((id) => sections.includes(id))
  const tabs = [...valid, ...DEFAULT_TABS.filter((id) => sections.includes(id) && !valid.includes(id)), ...sections.filter((id) => !valid.includes(id) && !DEFAULT_TABS.includes(id))].slice(0, TAB_COUNT)

  return {
    order,
    place,
    tiles: order.filter((id) => place[id] === 'tile'),
    list: order.filter((id) => place[id] === 'list'),
    hidden: order.filter((id) => place[id] === 'hidden'),
    tabs,
  }
}

/** Pone `id` en la pestaña `slot`; si ya estaba en otra, se intercambian */
export function setTab(tabs: string[], slot: number, id: string): string[] {
  const next = [...tabs]
  const from = next.indexOf(id)
  if (from === slot) return next
  if (from >= 0) next[from] = next[slot]
  next[slot] = id
  return next
}

function unique(ids: string[]) {
  return [...new Set(ids.filter((x) => typeof x === 'string'))]
}
