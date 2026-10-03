/**
 * Enlaces en lo que se apunta (como en Todoist o Things): la tarea se llama
 * como la página y el enlace va a las notas. Sin dependencias: lo usan la app
 * (captura rápida, compartir con LUNO), la captura con Siri y los tests.
 */

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/i

/** El primer enlace del texto y lo que queda sin él */
export function findUrl(text: string): { url: string; rest: string } | undefined {
  const m = URL_RE.exec(text)
  if (!m || m.index === undefined) return undefined
  // Sin la puntuación que lo cierra («mira esto: https://…).»)
  const url = m[0].replace(/[)\].,;:!?»”’]+$/, '')
  const rest = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`
    .replace(/\s+/g, ' ')
    .replace(/[\s:,;–—-]+$/, '')
    .trim()
  return { url, rest }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** «elpais.com · la vivienda en espana» cuando no se sabe el título */
export function prettyUrl(url: string) {
  try {
    const u = new URL(url)
    const last = decodeURIComponent(u.pathname)
      .replace(/\/+$/, '')
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/[-_+]+/g, ' ')
      .trim()
    const host = u.hostname.replace(/^www\./, '')
    // «watch?v=…», «item?id=…»: la ruta no dice nada
    const generic = !last || /^\d+$/.test(last) || (u.search && last.length < 8) || /^(index|default|home|inicio)$/i.test(last)
    return generic ? host : `${host} · ${last.slice(0, 70)}`
  } catch {
    return url
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', iexcl: '¡', iquest: '¿', middot: '·', euro: '€',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', ccedil: 'ç',
}
export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? all
  })
}

/** El título de una página: el de compartir (og:title) o, si no, el de la pestaña */
export function pageTitle(html: string): string | undefined {
  const head = html.slice(0, 300_000)
  const meta = (name: string) => {
    const tag = head.match(new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`, 'i'))?.[0]
    return tag?.match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2]
  }
  const raw = meta('og:title') ?? meta('twitter:title') ?? head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  const clean = raw && decodeEntities(raw).replace(/\s+/g, ' ').trim()
  return clean ? (clean.length > 160 ? `${clean.slice(0, 157).trimEnd()}…` : clean) : undefined
}

/** Lo que se apunta con un enlace: lo escrito (o el título de la página) y el enlace en las notas */
export function linkTask(rest: string, url: string, title?: string) {
  return { title: rest || title || prettyUrl(url), notes: url }
}
