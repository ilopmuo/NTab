// Edge Function: lee una receta de una página web (schema.org/Recipe).
// POST { url } con la sesión del usuario; con { url, solo: 'titulo' }, solo el
// título de la página (los enlaces que se apuntan en la captura). El navegador
// no puede leer otras webs directamente (CORS), así que la lee el servidor.
// Solo páginas públicas, con tiempo y tamaño limitados (ver _shared/fetchPage.ts).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseRecipeHtml } from '../_shared/recipe.ts'
import { publicHttpUrl } from '../_shared/safeUrl.ts'
import { download, fetchTitle } from '../_shared/fetchPage.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'Inicia sesión para importar recetas de una web.' }, 401)

  let body: { url?: string; solo?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* sin cuerpo */
  }
  const url = publicHttpUrl(String(body.url ?? ''))
  if (!url) return json({ error: 'Pega la dirección completa de la receta (https://…).' }, 400)
  if (body.solo === 'titulo') return json({ title: (await fetchTitle(url.href)) ?? null })
  try {
    const page = await download(url)
    const recipe = parseRecipeHtml(page.html, page.url)
    if (!recipe) return json({ error: 'No encuentro una receta en esa página. Prueba a copiar el texto y pegarlo.' }, 422)
    return json({ recipe })
  } catch (e) {
    const timeout = e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')
    return json({ error: timeout ? 'La página tarda demasiado en responder.' : e instanceof Error ? e.message : 'No se pudo leer la página.' }, 502)
  }
})
