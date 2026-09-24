import { useEffect, useState } from 'react'
import { supabase } from '@/sync/supabase'
import { useSync } from '@/sync/service'
import { toast } from '@/app/store'

/**
 * Enlace privado por usuario (tablas calendar_feeds y mcp_connectors): una fila
 * con un token secreto que el servidor genera. Crearlo, copiarlo y cambiarlo.
 */
export function useSecretLink(table: 'calendar_feeds' | 'mcp_connectors' | 'capture_keys', extra: () => Record<string, unknown>) {
  const sync = useSync()
  const userId = sync.user?.id
  // undefined = cargando; null = aún no existe
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId) return
    void supabase
      .from(table)
      .select('token')
      .maybeSingle()
      .then(({ data, error }) => setToken(error ? null : ((data as { token: string } | null)?.token ?? null)))
  }, [table, userId])

  const create = async () => {
    if (!userId) return
    setBusy(true)
    const { data, error } = await supabase
      .from(table)
      .upsert({ user_id: userId, ...extra() }, { onConflict: 'user_id' })
      .select('token')
      .single()
    setBusy(false)
    if (error) return void toast(`No se pudo crear el enlace: ${error.message}`)
    setToken((data as { token: string }).token)
  }

  const regenerate = async (confirmText: string) => {
    if (!userId || !window.confirm(confirmText)) return
    setBusy(true)
    await supabase.from(table).delete().eq('user_id', userId)
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
