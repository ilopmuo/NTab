import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * El cliente de Supabase es la dependencia más pesada de la app: se carga
 * aparte, en cuanto arranca, sin retrasar el primer pintado. La app trabaja
 * contra IndexedDB y solo lo necesita para la cuenta y la sincronización.
 */
let mod: Promise<typeof import('./supabase')> | null = null
export function loadSupabase() {
  mod ??= import('./supabase')
  return mod
}

export async function getSupabase(): Promise<SupabaseClient> {
  return (await loadSupabase()).supabase
}
