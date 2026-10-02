/**
 * El piso compartido en la base de datos: lo usan la Edge Function `casa` (la
 * app y los compañeros) y el conector de Claude.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { applyOps, stale, type HouseItem, type HouseOp } from './house.ts'

export interface HouseRow {
  id: string
  owner: string
  name: string
  token: string
}

export async function findHouse(admin: SupabaseClient, token: string): Promise<HouseRow | null> {
  const { data, error } = await admin.from('households').select('id,owner,name,token').eq('token', token).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as HouseRow | null) ?? null
}

export async function houseItems(admin: SupabaseClient, house: string): Promise<HouseItem[]> {
  const { data, error } = await admin.from('household_items').select('id,kind,data').eq('household_id', house).limit(5000)
  if (error) throw new Error(error.message)
  return (data ?? []) as HouseItem[]
}

/** Aplica cambios (y, de paso, quita lo viejo) y devuelve el piso como queda */
export async function applyHouseOps(admin: SupabaseClient, h: HouseRow, ops: HouseOp[]): Promise<{ name: string; items: HouseItem[] }> {
  const items = await houseItems(admin, h.id)
  const old = stale(items, Date.now()).map((id): HouseOp => ({ op: 'del', id }))
  const result = applyOps(items, [...old, ...ops])
  const now = new Date().toISOString()
  const changed = result.items.filter((i) => result.changed.has(i.id))
  if (changed.length) {
    const { error } = await admin
      .from('household_items')
      .upsert(changed.map((i) => ({ household_id: h.id, id: i.id, kind: i.kind, data: i.data, updated_at: now })), { onConflict: 'household_id,id' })
    if (error) throw new Error(error.message)
  }
  if (result.deleted.size) {
    const { error } = await admin.from('household_items').delete().eq('household_id', h.id).in('id', [...result.deleted])
    if (error) throw new Error(error.message)
  }
  let name = h.name
  if (result.name && result.name !== h.name) {
    await admin.from('households').update({ name: result.name }).eq('id', h.id)
    name = result.name
  }
  return { name, items: result.items }
}
