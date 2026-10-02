import { hubOf, section, sectionOfRoute, type HubDef } from './sections'

// La última pestaña abierta de cada espacio, en este dispositivo: al volver
// al espacio se abre esa (como las pestañas de una app de iOS)
const KEY = 'ntab-hub-tab'
let last: Record<string, string> = (() => {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>) ?? {}
  } catch {
    return {}
  }
})()

export function rememberTab(sectionId: string) {
  const h = hubOf(sectionId)
  if (!h || h.tabs.length < 2 || last[h.id] === sectionId) return
  last = { ...last, [h.id]: sectionId }
  try {
    localStorage.setItem(KEY, JSON.stringify(last))
  } catch {
    /* sin almacenamiento */
  }
}

/** Las pestañas de un espacio cuyas funciones están encendidas */
export const hubTabs = (h: HubDef, on: (sectionId: string) => boolean) => h.tabs.filter((t) => on(t.id))

/** A dónde lleva un espacio: a su última pestaña o a la primera */
export function hubPath(h: HubDef, on: (sectionId: string) => boolean) {
  const tabs = hubTabs(h, on)
  const t = tabs.find((x) => x.id === last[h.id]) ?? tabs[0] ?? h.tabs[0]
  return section(t.id).path
}

/** ¿La ruta está dentro de este espacio? */
export const inHub = (h: HubDef, path: string) => hubOf(sectionOfRoute(path.split('/').filter(Boolean)[0]))?.id === h.id
