import { useEffect, useState } from 'react'
import { getSupabase } from '@/sync/client'
import { useSync } from '@/sync/service'
import { toast } from '@/app/store'

/**
 * Enlace privado por usuario (tablas calendar_feeds y mcp_connectors): una fila
 * con un token secreto que el servidor genera. Crearlo, copiarlo y cambiarlo.
 */
export function useSecretLink(table: 'calendar_feeds' | 'mcp_connectors', extra: () => Record<string, unknown>) {
  const sync = useSync()
  const userId = sync.user?.id
  // undefined = cargando; null = aún no existe
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  // Otro bloque con el mismo enlace (Claude y Siri) lo ha creado o cambiado
  useEffect(() => {
    const on = (e: Event) => setToken((e as CustomEvent<string>).detail)
    window.addEventListener(`ntab-secret:${table}`, on)
    return () => window.removeEventListener(`ntab-secret:${table}`, on)
  }, [table])

  useEffect(() => {
    if (!userId) return
    void getSupabase().then((supabase) => supabase
      .from(table)
      .select('token')
      .maybeSingle()
      .then(({ data, error }) => setToken(error ? null : ((data as { token: string } | null)?.token ?? null))))
  }, [table, userId])

  const create = async () => {
    if (!userId) return
    setBusy(true)
    const { data, error } = await (await getSupabase())
      .from(table)
      .upsert({ user_id: userId, ...extra() }, { onConflict: 'user_id' })
      .select('token')
      .single()
    setBusy(false)
    if (error) return void toast(`No se pudo crear el enlace: ${error.message}`)
    const next = (data as { token: string }).token
    setToken(next)
    window.dispatchEvent(new CustomEvent(`ntab-secret:${table}`, { detail: next }))
  }

  const regenerate = async (confirmText: string) => {
    if (!userId || !window.confirm(confirmText)) return
    setBusy(true)
    await (await getSupabase()).from(table).delete().eq('user_id', userId)
    setBusy(false)
    await create()
    toast('Enlace cambiado')
  }

  return { signedIn: !!userId, token, busy, create, regenerate }
}

export async function copyText(text: string, done = 'Enlace copiado') {
  try {
    await navigator.clipboard.writeText(text)
    toast(done)
  } catch {
    window.prompt('Copia el enlace:', text)
  }
}

export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone
