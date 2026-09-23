import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Remote, RemoteRow } from './engine'

// Valores públicos por diseño: la clave "anon" solo permite lo que dejan las
// políticas RLS de la base de datos (cada usuario ve únicamente sus filas).
// Se pueden sobrescribir con VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://dmvvlfouwxyepnmrbnfx.supabase.co'
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnZsZm91d3h5ZXBubXJibmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxOTM1ODAsImV4cCI6MjEwNTc2OTU4MH0.R8a4M8AkSRFLQ865fCGFAJ6Y3iwQYcZvTEUTtV806R0'

export const supabase: SupabaseClient = createClient(URL, ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ntab-auth' },
})

const PAGE = 1000

export class SupabaseRemote implements Remote {
  constructor(private userId: string) {}

  async upsert(rows: RemoteRow[]) {
    const { error } = await supabase.from('records').upsert(
      rows.map((r) => ({ user_id: this.userId, tbl: r.tbl, id: r.id, data: r.data, deleted: r.deleted })),
      { onConflict: 'user_id,tbl,id' },
    )
    if (error) throw error
  }

  async pullSince(since: string | null) {
    const out: RemoteRow[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from('records').select('tbl,id,data,deleted,updated_at').order('updated_at').order('tbl').order('id')
      if (since) q = q.gt('updated_at', since)
      const { data, error } = await q.range(from, from + PAGE - 1)
      if (error) throw error
      out.push(...(data as RemoteRow[]))
      if (data.length < PAGE) return out
    }
  }

  async count() {
    const { count, error } = await supabase.from('records').select('id', { count: 'exact', head: true }).eq('deleted', false)
    if (error) throw error
    // Sin recuento no se puede decidir si la nube está vacía: mejor reintentar que duplicar datos
    if (count == null) throw new Error('No se pudo consultar la nube (recuento vacío)')
    return count
  }
}
