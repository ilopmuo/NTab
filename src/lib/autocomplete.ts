import { normalize } from './text'

export type SuggestKind = 'tag' | 'project' | 'area' | 'person'

export interface Suggestion {
  kind: SuggestKind
  /** lo que se ve */
  label: string
  /** lo que se escribe en lugar de la palabra a medias («#salud », «+Web nueva ») */
  insert: string
  /** icono del área */
  icon?: string
}

export interface SuggestSource {
  tags: string[]
  projects: { name: string; status?: string }[]
  areas: { name: string; icon?: string }[]
  people: { name: string }[]
}

export interface SuggestResult {
  /** trozo del texto que se sustituye */
  start: number
  end: number
  items: Suggestion[]
}

const WORD = /[\p{L}\p{N}_-]/u
/** Lo que el analizador lee tras «+» cuando son varias palabras */
const PLAIN_NAME = /^[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+)*$/u

/**
 * Sugerencias para la palabra que se está escribiendo si empieza por `#`
 * (etiquetas), `+` (proyectos y áreas) o `@` (personas).
 * @param caret posición del cursor
 */
export function suggest(value: string, caret: number, src: SuggestSource, limit = 6): SuggestResult | undefined {
  const m = value.slice(0, caret).match(/(?:^|[\s,;(])([#+@])([\p{L}\p{N}_-]*)$/u)
  if (!m) return undefined
  const sym = m[1] as '#' | '+' | '@'
  const typed = m[2]
  const start = caret - typed.length - 1
  let end = caret
  while (end < value.length && WORD.test(value[end])) end++
  const q = normalize(typed)

  const candidates: Suggestion[] =
    sym === '#'
      ? src.tags.map((t) => ({ kind: 'tag', label: t, insert: `#${t}` }))
      : sym === '+'
        ? [
            ...src.projects.filter((p) => p.status !== 'done').map((p) => ({ kind: 'project' as const, label: p.name, insert: `+${plusName(p.name)}` })),
            ...src.areas.map((a) => ({ kind: 'area' as const, label: a.name, insert: `+${plusName(a.name)}`, icon: a.icon })),
          ]
        : src.people.map((p) => ({ kind: 'person', label: p.name, insert: `@${p.name.trim().split(/\s+/)[0]}` }))

  // Primero las que empiezan por lo escrito (o alguna de sus palabras), luego las que lo contienen
  const rank = (s: Suggestion) => {
    const n = normalize(s.label)
    if (!q || n.startsWith(q)) return 0
    if (n.split(/[\s_-]+/).some((w) => w.startsWith(q))) return 1
    if (q.length >= 3 && n.replace(/[\s_-]/g, '').includes(q)) return 2
    return -1
  }
  const items = candidates
    .map((s) => ({ s, r: rank(s) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.s)
    .slice(0, limit)
  // Ya está escrita entera y no hay otra: nada que sugerir
  if (!items.length || (items.length === 1 && normalize(items[0].insert) === normalize(sym + typed))) return undefined
  return { start, end, items }
}

/** Nombre que entiende el analizador tras «+»: entero si son palabras normales; si no, la primera */
function plusName(name: string) {
  const clean = name.trim()
  return PLAIN_NAME.test(clean) ? clean : (clean.match(/^[\p{L}\p{N}_-]+/u)?.[0] ?? clean)
}

/** Sustituye la palabra a medias por la sugerencia; devuelve el texto y dónde queda el cursor */
export function applySuggestion(value: string, r: Pick<SuggestResult, 'start' | 'end'>, s: Suggestion) {
  const after = value.slice(r.end)
  const text = `${value.slice(0, r.start)}${s.insert}${after.startsWith(' ') ? '' : ' '}${after}`
  return { text, caret: r.start + s.insert.length + 1 }
}
