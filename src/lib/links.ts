export { decodeEntities, findUrl, hostOf, linkTask, pageTitle, prettyUrl } from '../../supabase/functions/_shared/links.ts'
import { getSupabase } from '@/sync/client'

/** El título de una página (lo lee el servidor; hace falta cuenta). Sin él a tiempo, nada */
export async function fetchLinkTitle(url: string, signedIn: boolean): Promise<string | undefined> {
  if (!signedIn) return undefined
  try {
    const call = (await getSupabase()).functions.invoke<{ title?: string | null }>('recipe', { body: { url, solo: 'titulo' } })
    const r = await Promise.race([call, new Promise<null>((ok) => setTimeout(() => ok(null), 6000))])
    return r?.data?.title ?? undefined
  } catch {
    return undefined
  }
}
