// Edge Function: lee una receta de una página web (schema.org/Recipe).
// POST { url } con la sesión del usuario. El navegador no puede leer otras
// webs directamente (CORS), así que la lee el servidor. Solo páginas públicas
// (ver _shared/safeUrl.ts), con tiempo y tamaño limitados.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { parseRecipeHtml } from '../_shared/recipe.ts'
import { isPrivateIp, publicHttpUrl } from '../_shared/safeUrl.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const MAX_BYTES = 3 * 1024 * 1024

/** ¿El nombre apunta a la red interna? (si este entorno deja preguntar al DNS) */
async function resolvesPrivate(host: string) {
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false
  try {
    const ips = [...(await Deno.resolveDns(host, 'A').catch(() => [])), ...(await Deno.resolveDns(host, 'AAAA').catch(() => []))]
    return ips.some((ip) => isPrivateIp(ip))
  } catch {
    return false
  }
}

/** Descarga siguiendo como mucho 3 redirecciones, comprobando cada una */
async function download(start: URL): Promise<{ html: string; url: string }> {
  let url = start
  for (let hop = 0; hop < 4; hop++) {
    if (await resolvesPrivate(url.hostname)) throw new Error('Esa dirección no es pública.')
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LUNO/1.0; +https://github.com/ilopmuo/NTab)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'es-ES,es;q=0.9' },
    })
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      const target = next ? publicHttpUrl(new URL(next, url).href) : undefined
      if (!target) throw new Error('La página redirige a una dirección que no se puede leer.')
      url = target
      continue
    }
    if (!res.ok) throw new Error(`La página respondió con un error (${res.status}).`)
    const reader = res.body?.getReader()
    if (!reader) throw new Error('La página está vacía.')
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_BYTES) {
        await reader.cancel()
        break
      }
      chunks.push(value)
    }
    const all = new Uint8Array(size > MAX_BYTES ? MAX_BYTES : size)
    let at = 0
    for (const c of chunks) {
      all.set(c.subarray(0, Math.min(c.length, all.length - at)), at)
      at += c.length
      if (at >= all.length) break
    }
    return { html: new TextDecoder().decode(all), url: url.href }
  }
  throw new Error('Demasiadas redirecciones.')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'Inicia sesión para importar recetas de una web.' }, 401)

  let body: { url?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* sin cuerpo */
  }
  const url = publicHttpUrl(String(body.url ?? ''))
  if (!url) return json({ error: 'Pega la dirección completa de la receta (https://…).' }, 400)
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
