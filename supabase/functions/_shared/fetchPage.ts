/**
 * Leer una página pública desde el servidor (el navegador no puede: CORS):
 * solo direcciones públicas (ver safeUrl.ts), como mucho 3 redirecciones,
 * 3 MB y 10 segundos. Lo usan las recetas y los enlaces que se apuntan.
 */
import { isPrivateIp, publicHttpUrl } from './safeUrl.ts'
import { pageTitle } from './links.ts'

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
export async function download(start: URL, { maxBytes = MAX_BYTES, timeout = 10_000 } = {}): Promise<{ html: string; url: string }> {
  let url = start
  for (let hop = 0; hop < 4; hop++) {
    if (await resolvesPrivate(url.hostname)) throw new Error('Esa dirección no es pública.')
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
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
      if (size > maxBytes) {
        await reader.cancel()
        break
      }
      chunks.push(value)
    }
    const all = new Uint8Array(size > maxBytes ? maxBytes : size)
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

/** El título de una página pública (o nada si no se puede leer a tiempo) */
export async function fetchTitle(raw: string): Promise<string | undefined> {
  const url = publicHttpUrl(raw)
  if (!url) return undefined
  try {
    // El título está al principio: basta con poco
    const page = await download(url, { maxBytes: 512 * 1024, timeout: 5_000 })
    return pageTitle(page.html)
  } catch {
    return undefined
  }
}
