import { addDaysYmd, capitalize, fmt, today, ymd } from './dates'
import { normalize } from './text'

/**
 * Grupo de una nota en la lista, como en Notas de Apple: Hoy, Ayer, 7 días,
 * 30 días y, lo anterior, por mes (con el año si no es el actual).
 */
export function noteGroup(updatedAt: number, ref = today()): string {
  const d = ymd(new Date(updatedAt))
  if (d >= ref) return 'Hoy'
  if (d === addDaysYmd(ref, -1)) return 'Ayer'
  if (d > addDaysYmd(ref, -7)) return 'Últimos 7 días'
  if (d > addDaysYmd(ref, -30)) return 'Últimos 30 días'
  return capitalize(fmt(d, d.slice(0, 4) === ref.slice(0, 4) ? 'MMMM' : 'MMMM yyyy'))
}

/** Agrupa una lista ordenada de más reciente a más antigua (las fijadas, aparte y primero) */
export function groupNotes<T extends { pinned?: number | boolean; updatedAt: number }>(notes: T[], ref = today()): { title: string; items: T[] }[] {
  const pinned = notes.filter((n) => n.pinned)
  const groups = new Map<string, T[]>()
  for (const n of notes.filter((x) => !x.pinned)) {
    const title = noteGroup(n.updatedAt, ref)
    groups.set(title, [...(groups.get(title) ?? []), n])
  }
  return [...(pinned.length ? [{ title: 'Fijadas', items: pinned }] : []), ...[...groups].map(([title, items]) => ({ title, items }))]
}

// ── Notas enlazadas y etiquetas (como en Bear y Obsidian) ─────────

const LINK = /\[\[([^[\]\n]+?)\]\]/g
/** #etiqueta pegada a la almohadilla, al principio o tras un espacio («# Título» y «#1» no lo son) */
const TAG = /(?:^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu

const key = (title: string) => normalize(title.trim())

/** Títulos enlazados con [[…]], sin repetir */
export function noteLinks(content: string): string[] {
  const seen = new Map<string, string>()
  for (const m of content.matchAll(LINK)) {
    const t = m[1].trim()
    if (t && !seen.has(key(t))) seen.set(key(t), t)
  }
  return [...seen.values()]
}

/** Etiquetas #así de una nota, en minúsculas y sin repetir */
export function noteTags(content: string): string[] {
  return [...new Set([...content.matchAll(TAG)].map((m) => m[1].replace(/[/-]+$/, '').toLowerCase()))]
}

/** La nota con ese título (sin importar mayúsculas ni acentos) */
export function findNote<T extends { title: string }>(notes: T[], title: string): T | undefined {
  const k = key(title)
  return k ? notes.find((n) => key(n.title) === k) : undefined
}

/** Notas que enlazan a esta, con la línea donde la mencionan */
export function backlinks<T extends { id: string; title: string; content: string }>(notes: T[], note: { id: string; title: string }) {
  const k = key(note.title)
  if (!k) return []
  return notes.flatMap((n) => {
    if (n.id === note.id) return []
    const line = n.content.split('\n').find((l) => [...l.matchAll(LINK)].some((m) => key(m[1]) === k))
    return line ? [{ note: n, line: line.trim() }] : []
  })
}

/** Cambia los [[enlaces]] a `from` por enlaces a `to` (al renombrar una nota) */
export function renameLinks(content: string, from: string, to: string): string {
  const k = key(from)
  const name = to.trim()
  if (!k || !name || key(name) === k) return content
  return content.replace(LINK, (whole, title: string) => (key(title) === k ? `[[${name}]]` : whole))
}

/** Todas las etiquetas de las notas, de la más usada a la menos */
export function allNoteTags(notes: { content: string }[]): string[] {
  const count = new Map<string, number>()
  for (const n of notes) for (const t of noteTags(n.content)) count.set(t, (count.get(t) ?? 0) + 1)
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([t]) => t)
}

/**
 * Si se está escribiendo un enlace («[[Rece|»), los títulos que encajan y el
 * trozo que se sustituye por «[[Título]]».
 */
export function suggestLink(value: string, caret: number, titles: string[], limit = 6) {
  const m = value.slice(0, caret).match(/\[\[([^[\]\n]*)$/)
  if (!m) return undefined
  const typed = m[1]
  const start = caret - typed.length - 2
  const close = value.slice(caret).match(/^[^[\]\n]*\]\]/)
  const end = close ? caret + close[0].length : caret
  const q = key(typed)
  const items = titles
    .filter((t) => t.trim() && (!q || key(t).includes(q)))
    .sort((a, b) => Number(!key(a).startsWith(q)) - Number(!key(b).startsWith(q)))
    .slice(0, limit)
  return items.length ? { start, end, items } : undefined
}
