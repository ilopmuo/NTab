/**
 * Una lista pegada (de Notas, un correo, Markdown…) en líneas: sin viñetas,
 * números ni casillas, con su sangría (para subtareas) y si ya estaba hecha.
 */
export interface ListLine {
  text: string
  /** marcada como hecha («- [x] …», «✓ …») */
  done: boolean
  /** sangría: 0 arriba del todo, 1 dentro de la anterior… */
  depth: number
}

const MARK = /^(?:[-*+•·◦▪–—]\s+)?(?:\[( |x|X)\]\s*|([☐□])\s*|([☑✓✔✅])\s*|\d{1,3}[.)]\s+)?/

export function listLines(text: string): ListLine[] {
  const out: ListLine[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue
    const indent = raw.match(/^[\t ]*/)![0].replace(/\t/g, '  ').length
    const body = raw.trim()
    const m = body.match(MARK)!
    // «- texto» y «* texto» son viñetas; un guion pegado («-5 €») no
    const bullet = /^[-*+•·◦▪–—]\s/.test(body) || /^[•·◦▪]/.test(body)
    const text = (m[0] && (bullet || m[1] !== undefined || m[2] || m[3] || /^\d/.test(m[0])) ? body.slice(m[0].length) : body).replace(/^[•·◦▪]\s*/, '').trim()
    if (!text) continue
    out.push({ text, done: m[1] === 'x' || m[1] === 'X' || !!m[3], depth: Math.min(5, Math.floor(indent / 2)) })
  }
  return out
}
