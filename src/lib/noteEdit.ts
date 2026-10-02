/** Edición del texto de una nota desde la barra de formato y el teclado (como en Notas de Apple) */
export interface Edit {
  value: string
  start: number
  end: number
}

const LIST = /^(\s*)([-*] \[[ xX]\] |[-*•] |(\d+)([.)]) )/
const ANY_PREFIX = /^(\s*)(?:[-*]\s*\[[ xX]\]\s?|[-*•]\s+|\d+[.)]\s+|#{1,3}\s+)?/

const lineBounds = (value: string, pos: number) => {
  const start = value.lastIndexOf('\n', pos - 1) + 1
  const nl = value.indexOf('\n', pos)
  return { start, end: nl === -1 ? value.length : nl }
}

/**
 * Intro en una lista: la siguiente línea sigue la lista («- [ ] », «- »,
 * «2. »). Intro en una línea de lista vacía, la termina. Fuera de una lista,
 * undefined (Intro normal).
 */
export function continueList(value: string, caret: number): Edit | undefined {
  const { start, end } = lineBounds(value, caret)
  const line = value.slice(start, end)
  const m = line.match(LIST)
  if (!m || caret < start + m[0].length) return undefined
  // Línea vacía: se acaba la lista
  if (!line.slice(m[0].length).trim()) {
    const v = value.slice(0, start) + value.slice(start + m[0].length)
    return { value: v, start, end: start }
  }
  const next = m[3] ? `${Number(m[3]) + 1}${m[4]} ` : m[2].startsWith('- [') || m[2].startsWith('* [') ? '- [ ] ' : m[2]
  const insert = `\n${m[1]}${next}`
  const at = caret + insert.length
  return { value: value.slice(0, caret) + insert + value.slice(caret), start: at, end: at }
}

/**
 * Pone o quita una marca al principio de la línea (casilla, lista o título).
 * Si la línea ya tiene otra marca, la cambia por esta.
 */
export function toggleLinePrefix(value: string, selStart: number, prefix: '- [ ] ' | '- ' | '## '): Edit {
  const { start, end } = lineBounds(value, selStart)
  const line = value.slice(start, end)
  const m = line.match(ANY_PREFIX)!
  const current = line.slice(m[1].length, m[0].length)
  const isSame = prefix === '- [ ] ' ? /^[-*]\s*\[[ xX]\]/.test(current) : prefix === '## ' ? /^#{1,3}\s/.test(current) : /^[-*•]\s+$/.test(current)
  const rest = line.slice(m[0].length)
  const nextLine = isSame ? m[1] + rest : m[1] + prefix + rest
  const caret = start + nextLine.length
  return { value: value.slice(0, start) + nextLine + value.slice(end), start: caret, end: caret }
}

/** Rodea lo seleccionado con una marca (**negrita**); sin selección, deja el cursor en medio */
export function wrapSelection(value: string, start: number, end: number, mark = '**'): Edit {
  const sel = value.slice(start, end)
  // Ya lo estaba: se quita
  if (value.slice(start - mark.length, start) === mark && value.slice(end, end + mark.length) === mark) {
    const v = value.slice(0, start - mark.length) + sel + value.slice(end + mark.length)
    return { value: v, start: start - mark.length, end: end - mark.length }
  }
  const v = value.slice(0, start) + mark + sel + mark + value.slice(end)
  return { value: v, start: start + mark.length, end: end + mark.length }
}
