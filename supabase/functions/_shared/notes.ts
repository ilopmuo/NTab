/**
 * Notas: listas de comprobación dentro del texto («- [ ] algo» / «- [x] algo»)
 * y bloques para enseñarlas con formato. Sin dependencias: lo usan la app
 * (src/lib/noteFormat.ts) y el conector de Claude.
 */

const CHECK = /^(\s*)[-*]\s*\[( |x|X)\]\s?(.*)$/

/** ¿Esta línea es una casilla? ¿marcada? */
export function checkLine(line: string): { indent: string; done: boolean; text: string } | undefined {
  const m = line.match(CHECK)
  return m ? { indent: m[1], done: m[2] !== ' ', text: m[3] } : undefined
}

/** Cuántas casillas hay y cuántas están marcadas */
export function checklistStats(content: string) {
  let done = 0
  let total = 0
  for (const line of content.split('\n')) {
    const c = checkLine(line)
    if (!c) continue
    total++
    if (c.done) done++
  }
  return { done, total }
}

const setCheck = (line: string, done: boolean) => line.replace(/\[( |x|X)\]/, done ? '[x]' : '[ ]')

/** Marca o desmarca la casilla de la línea `index` */
export function toggleCheck(content: string, index: number): string {
  const lines = content.split('\n')
  const c = checkLine(lines[index] ?? '')
  if (!c) return content
  lines[index] = setCheck(lines[index], !c.done)
  return lines.join('\n')
}

/** Todas marcadas o todas sin marcar («Desmarcar todo», como en Notas de Apple) */
export function setAllChecks(content: string, done: boolean): string {
  return content
    .split('\n')
    .map((l) => (checkLine(l) ? setCheck(l, done) : l))
    .join('\n')
}

/**
 * Las marcadas, al final de su lista (como «Ordenar ítems marcados» de Notas de
 * Apple): dentro de cada bloque seguido de casillas, primero las pendientes y
 * luego las hechas, cada grupo en su orden.
 */
export function sortChecked(content: string): string {
  const lines = content.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; ) {
    if (!checkLine(lines[i])) {
      out.push(lines[i++])
      continue
    }
    const block: string[] = []
    while (i < lines.length && checkLine(lines[i])) block.push(lines[i++])
    out.push(...block.filter((l) => !checkLine(l)!.done), ...block.filter((l) => checkLine(l)!.done))
  }
  return out.join('\n')
}

/**
 * Añade al final de una nota. Con `asList`, cada cosa como casilla
 * («leche, pan» → «- [ ] leche», «- [ ] pan»).
 */
export function appendToNote(content: string, text: string, asList = false): string {
  const items = asList ? text.split(/\n|,|;/).map((s) => s.trim()).filter(Boolean).map((s) => `- [ ] ${s}`) : [text.trim()]
  if (!items.length || !items[0]) return content
  const base = content.replace(/\s+$/, '')
  return base ? `${base}\n${items.join('\n')}` : items.join('\n')
}

/** La nota en Markdown, para compartirla o guardarla fuera (como exporta Bear) */
export const noteMarkdown = (title: string, content: string) => (title.trim() ? `# ${title.trim()}\n\n${content.trim()}\n` : `${content.trim()}\n`)

// ── Bloques para la vista de lectura ───────────────────────────

export type Block =
  | { type: 'h'; level: 1 | 2 | 3; text: string; line: number }
  | { type: 'check'; done: boolean; text: string; line: number; indent: number }
  | { type: 'li'; text: string; line: number; indent: number; n?: number }
  | { type: 'quote'; text: string; line: number }
  | { type: 'code'; text: string; line: number }
  | { type: 'hr'; line: number }
  | { type: 'p'; text: string; line: number }
  | { type: 'blank'; line: number }

/** Markdown sencillo, línea a línea (como Bear): títulos, casillas, listas, citas, código y separadores */
export function noteBlocks(content: string): Block[] {
  const lines = content.split('\n')
  const out: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^```/.test(line.trim())) {
      const start = i
      const body: string[] = []
      for (i++; i < lines.length && !/^```/.test(lines[i].trim()); i++) body.push(lines[i])
      out.push({ type: 'code', text: body.join('\n'), line: start })
      continue
    }
    const c = checkLine(line)
    if (c) {
      out.push({ type: 'check', done: c.done, text: c.text, line: i, indent: Math.floor(c.indent.replace(/\t/g, '  ').length / 2) })
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      out.push({ type: 'h', level: h[1].length as 1 | 2 | 3, text: h[2], line: i })
      continue
    }
    const li = line.match(/^(\s*)(?:[-*•]|(\d+)[.)])\s+(.*)$/)
    if (li) {
      out.push({ type: 'li', text: li[3], line: i, indent: Math.floor(li[1].replace(/\t/g, '  ').length / 2), ...(li[2] ? { n: Number(li[2]) } : {}) })
      continue
    }
    if (/^>\s?/.test(line)) {
      out.push({ type: 'quote', text: line.replace(/^>\s?/, ''), line: i })
      continue
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      out.push({ type: 'hr', line: i })
      continue
    }
    out.push(line.trim() ? { type: 'p', text: line, line: i } : { type: 'blank', line: i })
  }
  return out
}

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold' | 'italic' | 'strike' | 'code'; v: string }
  | { t: 'link'; v: string; href: string }
  | { t: 'wiki'; v: string }
  | { t: 'tag'; v: string }

const INLINE = /(\*\*([^*\n]+)\*\*)|(~~([^~\n]+)~~)|(`([^`\n]+)`)|(\[\[([^[\]\n]+?)\]\])|(\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)]+[^\s).,;:!?])|((?<=^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*))|((?<![\p{L}\d*])[*_]([^*_\n]+)[*_](?![\p{L}\d*]))/gu

/** Formato dentro de una línea: **negrita**, *cursiva*, ~~tachado~~, `código`, enlaces, [[notas]] y #etiquetas */
export function inlineTokens(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push({ t: 'text', v: text.slice(last, m.index) })
    if (m[1]) out.push({ t: 'bold', v: m[2] })
    else if (m[3]) out.push({ t: 'strike', v: m[4] })
    else if (m[5]) out.push({ t: 'code', v: m[6] })
    else if (m[7]) out.push({ t: 'wiki', v: m[8] })
    else if (m[9]) out.push({ t: 'link', v: m[10], href: m[11] })
    else if (m[12]) out.push({ t: 'link', v: m[12], href: m[12] })
    // Como noteTags (src/lib/notes.ts): sin el «/» o «-» del final y en minúsculas
    else if (m[13]) out.push({ t: 'tag', v: m[14].replace(/[/-]+$/, '').toLowerCase() })
    else if (m[15]) out.push({ t: 'italic', v: m[16] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}
