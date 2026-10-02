import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { setSetting } from '@/db/actions'
import { SUPABASE_URL } from '@/sync/config'
import { getSupabase } from '@/sync/client'
import { applyOps, type HouseItem, type HouseOp } from '@/lib/house'

/**
 * El piso compartido visto desde este dispositivo. Vive en el servidor (los
 * compañeros entran con el enlace, sin cuenta); aquí se guarda una copia para
 * verlo sin conexión, los cambios se ven al momento y se suben después (si no
 * hay conexión, cuando vuelva), y se vuelve a leer cada poco para ver lo de
 * los demás.
 */
export interface HouseSnap {
  token: string
  name: string
  items: HouseItem[]
  /** cambios aún sin subir */
  pending: HouseOp[]
  /** ya se ha leído alguna vez (del servidor o de la copia) */
  ready: boolean
  /** el enlace ya no vale (lo cambiaron o se borró el piso) */
  gone?: boolean
  offline?: boolean
}

/** Ajuste `household` (se sincroniza entre tus dispositivos): tu piso y quién eres en él */
export interface MyHouse {
  token: string
  me: string
}

export const houseUrl = (token: string) => `${SUPABASE_URL}/functions/v1/casa/${token}`
/** El enlace para los compañeros: abre su página en esta misma app */
export const inviteLink = (token: string) => `${location.origin}${location.pathname}#/piso/${token}`

/** La lista del piso dentro de Compra */
export const PISO_LIST = '@piso'

const KEY = (t: string) => `ntab-house:${t}`
const ME = (t: string) => `ntab-house-me:${t}`
const POLL = 15_000

const snaps = new Map<string, HouseSnap>()
const listeners = new Map<string, Set<() => void>>()

function get(token: string): HouseSnap {
  let s = snaps.get(token)
  if (!s) {
    try {
      const c = JSON.parse(localStorage.getItem(KEY(token)) ?? 'null') as Pick<HouseSnap, 'name' | 'items' | 'pending'> | null
      s = { token, name: c?.name ?? '', items: c?.items ?? [], pending: c?.pending ?? [], ready: !!c }
    } catch {
      s = { token, name: '', items: [], pending: [], ready: false }
    }
    snaps.set(token, s)
  }
  return s
}

function set(token: string, next: Partial<HouseSnap>) {
  const s = { ...get(token), ...next }
  snaps.set(token, s)
  try {
    localStorage.setItem(KEY(token), JSON.stringify({ name: s.name, items: s.items, pending: s.pending }))
  } catch {
    /* sin almacenamiento: solo en memoria */
  }
  listeners.get(token)?.forEach((l) => l())
}

const busy = new Set<string>()
const again = new Set<string>()

/** Sube lo pendiente (de 60 en 60) y se queda con lo que diga el servidor; sin nada pendiente, solo lee */
export async function sync(token: string): Promise<void> {
  if (busy.has(token)) return void again.add(token)
  busy.add(token)
  try {
    const ops = get(token).pending.slice(0, 60)
    const res = ops.length
      ? await fetch(houseUrl(token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }) })
      : await fetch(houseUrl(token))
    if (res.status === 404) return set(token, { gone: true, ready: true, offline: false })
    if (!res.ok) {
      // Lo que el servidor no acepta no se reintenta para siempre
      if (res.status < 500 && ops.length) set(token, { pending: get(token).pending.slice(ops.length) })
      return set(token, { offline: false })
    }
    const body = (await res.json()) as { name: string; items: HouseItem[] }
    // Lo que se hizo mientras tanto, encima de lo del servidor
    const rest = get(token).pending.slice(ops.length)
    set(token, { name: body.name, items: rest.length ? applyOps(body.items, rest).items : body.items, pending: rest, ready: true, gone: false, offline: false })
    if (rest.length) again.add(token)
  } catch {
    set(token, { offline: true, ready: get(token).ready })
  } finally {
    busy.delete(token)
    if (again.delete(token)) void sync(token)
  }
}

/** Un cambio: se ve ya y se sube detrás */
export function act(token: string, ops: HouseOp[]) {
  const s = get(token)
  const r = applyOps(s.items, ops)
  set(token, { items: r.items, name: r.name ?? s.name, pending: [...s.pending, ...ops] })
  void sync(token)
}

/** El piso, al día: lo lee al abrirse, cada 15 s mientras se ve y al volver la conexión */
export function useHouse(token: string | undefined): HouseSnap | null {
  const subscribe = useCallback(
    (l: () => void) => {
      if (!token) return () => {}
      const ls = listeners.get(token) ?? new Set()
      listeners.set(token, ls)
      ls.add(l)
      return () => void ls.delete(l)
    },
    [token],
  )
  const snap = useSyncExternalStore(subscribe, () => (token ? get(token) : null))
  useEffect(() => {
    if (!token) return
    void sync(token)
    const tick = () => document.visibilityState === 'visible' && void sync(token)
    const id = setInterval(tick, POLL)
    window.addEventListener('online', tick)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', tick)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [token])
  return snap
}

/** Tu piso (de tu cuenta): undefined mientras se lee, null si no tienes */
export function useMyHouse(): MyHouse | null | undefined {
  return useLiveQuery(() => db.settings.get('household').then((r) => ((r?.value as MyHouse | null | undefined)?.token ? (r!.value as MyHouse) : null)), [])
}

export const saveMyHouse = (h: MyHouse | null) => setSetting('household', h)

/** Quién eres en un piso al que entras con el enlace (en este dispositivo) */
export function guestMe(token: string): string | null {
  try {
    return localStorage.getItem(ME(token))
  } catch {
    return null
  }
}
export function setGuestMe(token: string, id: string) {
  try {
    localStorage.setItem(ME(token), id)
  } catch {
    /* sin almacenamiento */
  }
}

/** Crea el piso con tu cuenta: tú y los nombres de tus compañeros */
export async function createHouse(input: { name: string; me: string; others: string[] }): Promise<MyHouse> {
  const { data, error } = await (await getSupabase()).functions.invoke<{ token?: string; me?: string; name?: string; items?: HouseItem[]; error?: string }>('casa', {
    body: { create: input },
  })
  if (error || !data?.token || !data.me) throw new Error(data?.error ?? 'No se ha podido crear el piso. ¿Tienes conexión?')
  set(data.token, { name: data.name ?? input.name, items: data.items ?? [], pending: [], ready: true })
  const mine = { token: data.token, me: data.me }
  await saveMyHouse(mine)
  return mine
}

/** Enlace nuevo (el anterior deja de valer) o borrar el piso: solo quien lo creó */
export async function houseAdmin(token: string, action: 'rotate' | 'delete'): Promise<string | null> {
  const { data, error } = await (await getSupabase()).functions.invoke<{ token?: string; deleted?: boolean; error?: string }>(`casa/${token}`, { body: { admin: action } })
  if (error || data?.error) throw new Error(data?.error ?? 'No se ha podido. ¿Eres quien creó el piso?')
  if (action === 'rotate' && data?.token) {
    const s = get(token)
    set(data.token, { name: s.name, items: s.items, pending: s.pending, ready: true })
    return data.token
  }
  return null
}
