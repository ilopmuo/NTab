/**
 * Gastos: entender «12,50 café», «súper 63», «ayer 20 cena» y ponerle una
 * categoría. Sin dependencias: lo usan la app y el conector de Claude.
 */
export interface Category {
  id: string
  label: string
  icon: string
}

export const CATEGORIES: Category[] = [
  { id: 'super', label: 'Supermercado', icon: 'cart' },
  { id: 'comer', label: 'Comer fuera', icon: 'coffee' },
  { id: 'transporte', label: 'Transporte', icon: 'car' },
  { id: 'casa', label: 'Casa', icon: 'home' },
  { id: 'ocio', label: 'Ocio', icon: 'music' },
  { id: 'salud', label: 'Salud', icon: 'heart' },
  { id: 'ropa', label: 'Ropa', icon: 'star' },
  { id: 'regalos', label: 'Regalos', icon: 'gift' },
  { id: 'viajes', label: 'Viajes', icon: 'plane' },
  { id: 'educacion', label: 'Educación', icon: 'graduation' },
  { id: 'cuidado', label: 'Cuidado personal', icon: 'sparkles' },
  { id: 'mascotas', label: 'Mascotas', icon: 'dog' },
  { id: 'seguros', label: 'Seguros e impuestos', icon: 'briefcase' },
  { id: 'otros', label: 'Otros', icon: 'circle' },
]

const RULES: [string, string[]][] = [
  ['super', ['super', 'supermercado', 'mercadona', 'carrefour', 'lidl', 'aldi', 'alcampo', 'eroski', 'dia', 'hipercor', 'compra', 'fruteria', 'carniceria', 'pescaderia', 'panaderia', 'mercado']],
  ['comer', ['cafe', 'bar', 'restaurante', 'cena', 'comida', 'almuerzo', 'desayuno', 'menu', 'pizza', 'burger', 'hamburguesa', 'kebab', 'sushi', 'cerveza', 'cana', 'copa', 'vermut', 'tapas', 'glovo', 'just eat', 'uber eats', 'takeaway', 'helado', 'churros']],
  ['viajes', ['viaje', 'hotel', 'airbnb', 'booking', 'hostal', 'avion', 'vuelo', 'ryanair', 'vueling', 'iberia', 'easyjet', 'equipaje', 'crucero']],
  ['transporte', ['gasolina', 'diesel', 'gasoil', 'parking', 'aparcamiento', 'taxi', 'uber', 'cabify', 'bolt', 'metro', 'bus', 'autobus', 'tren', 'renfe', 'ave', 'peaje', 'abono', 'bici', 'itv', 'taller', 'coche']],
  ['casa', ['alquiler', 'hipoteca', 'luz', 'agua', 'gas', 'internet', 'fibra', 'movil', 'comunidad', 'ikea', 'leroy', 'ferreteria', 'reparacion', 'fontanero', 'electricista', 'muebles', 'limpieza']],
  ['ocio', ['cine', 'teatro', 'concierto', 'libro', 'libreria', 'juego', 'videojuego', 'netflix', 'spotify', 'hbo', 'disney', 'museo', 'entradas', 'entrada', 'excursion', 'fiesta', 'discoteca']],
  ['salud', ['farmacia', 'medico', 'dentista', 'gimnasio', 'gym', 'fisio', 'fisioterapeuta', 'optica', 'gafas', 'psicologo', 'analisis', 'seguro medico']],
  ['ropa', ['ropa', 'zapatos', 'zapatillas', 'zara', 'primark', 'camiseta', 'pantalon', 'vestido', 'abrigo', 'chaqueta', 'calcetines', 'decathlon']],
  ['regalos', ['regalo', 'cumple', 'cumpleanos', 'boda', 'detalle', 'flores']],
  ['educacion', ['colegio', 'academia', 'curso', 'clases', 'matricula', 'universidad', 'master', 'idiomas', 'guarderia', 'material escolar', 'libros de texto', 'udemy']],
  ['cuidado', ['peluqueria', 'peluquero', 'barbero', 'barberia', 'estetica', 'manicura', 'depilacion', 'cosmetica', 'maquillaje', 'perfume', 'colonia', 'champu']],
  ['mascotas', ['veterinario', 'pienso', 'perro', 'gato', 'mascota', 'arena gato', 'tiendanimal', 'kiwoko']],
  ['seguros', ['seguro', 'ibi', 'impuesto', 'hacienda', 'irpf', 'multa', 'tasa', 'basuras', 'autonomo', 'cuota autonomos', 'gestoria']],
]

export function fold(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Categorías aprendidas (como Copilot): al cambiar la categoría de un gasto se
 * guarda «concepto → categoría» y los siguientes con ese concepto (o que lo
 * contengan: «mercadona» vale para «Mercadona grande») van ahí.
 */
export type ExpenseRules = Record<string, string>

/** La clave de una regla: el concepto sin mayúsculas, tildes ni símbolos */
export const ruleKey = (note: string) => fold(note)

function learned(note: string, rules?: ExpenseRules): string | undefined {
  if (!rules) return undefined
  const key = ruleKey(note)
  if (!key) return undefined
  if (rules[key]) return rules[key]
  const text = ` ${key} `
  let best: [string, string] | undefined
  for (const [k, cat] of Object.entries(rules)) if (k.length >= 3 && text.includes(` ${k} `) && (!best || k.length > best[0].length)) best = [k, cat]
  return best?.[1]
}

/** La primera categoría cuyas palabras salen en el concepto (las cortas, enteras; las largas, al principio de una palabra) */
export function matchRules(note: string, rules: [string, string[]][]): string | undefined {
  const text = ` ${fold(note)} `
  const words = text.trim().split(' ')
  for (const [cat, list] of rules) {
    for (const w of list) {
      if (w.includes(' ') ? text.includes(` ${w} `) : w.length <= 3 ? words.includes(w) : words.some((x) => x.startsWith(w))) return cat
    }
  }
  return undefined
}

export function categoryFor(note: string, rules?: ExpenseRules): string {
  return classifyNote(note, rules).category
}

/**
 * La categoría y si se sabe de verdad: por lo que enseñaste a la app o por una
 * palabra conocida. Si no («AMZN Mktp», «Bizum Laura»), va a Otros sin estar
 * seguro: el gasto queda sin clasificar y LUNO pregunta.
 */
export function classifyNote(note: string, rules?: ExpenseRules): { category: string; sure: boolean } {
  const mine = learned(note, rules)
  if (mine && CATEGORIES.some((c) => c.id === mine)) return { category: mine, sure: true }
  const hit = matchRules(note, RULES)
  return hit ? { category: hit, sure: true } : { category: 'otros', sure: false }
}

/**
 * Las categorías más probables para un gasto que no se sabe (para preguntar
 * con dos o tres botones): las de los gastos con palabras en común y, si no,
 * las que más usas.
 */
export function guessCategories(note: string, history: { note?: string; category: string; date: string; unclassified?: boolean }[], n = 3): string[] {
  const words = new Set(fold(note).split(' ').filter((w) => w.length >= 3))
  const score = new Map<string, number>()
  const add = (id: string, v: number) => id !== 'otros' && score.set(id, (score.get(id) ?? 0) + v)
  for (const e of history) {
    if (e.unclassified) continue
    const common = fold(e.note ?? '').split(' ').filter((w) => words.has(w)).length
    if (common) add(e.category, common * 5)
    add(e.category, 0.05)
  }
  const out = [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  for (const id of ['super', 'comer', 'ocio', 'casa', 'transporte']) if (!out.includes(id)) out.push(id)
  return out.slice(0, n)
}

export interface ParsedExpense {
  amount: number
  note: string
  category: string
  /** días atrás: 0 hoy, 1 ayer, 2 anteayer */
  daysAgo: number
  /** etiquetas con #, para juntar gastos de un viaje o un plan («#roma») */
  tags?: string[]
  /** no se sabe de qué es: se apunta en Otros y se pregunta */
  unsure?: true
}

const TAG = /(^|\s)#([\p{L}\d][\p{L}\d_-]*)/gu

/** «#Roma» → «roma» */
export const normTag = (t: string) => t.replace(/^#/, '').trim().toLowerCase()

const NUM_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300,
  trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
  seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900,
  novecientas: 900, mil: 1000,
}
const CURRENCY_WORD = /^(?:euros?|€|eur|pavos?)$/

/** «treinta y cinco» desde la palabra `i`: el número y dónde acaba */
function readWords(words: string[], i: number) {
  let total = 0
  let cur = 0
  let j = i
  for (; j < words.length; j++) {
    const k = fold(words[j])
    // «treinta y cinco»: la «y» solo une decenas y unidades
    if (k === 'y' && j > i && (NUM_WORDS[fold(words[j + 1] ?? '')] ?? 10) < 10) continue
    const v = NUM_WORDS[k]
    if (v === undefined) break
    if (v === 1000) {
      total += (cur || 1) * 1000
      cur = 0
    } else cur += v
  }
  return j > i ? { value: total + cur, end: j } : undefined
}

/**
 * Importes dichos con palabras (lo que a veces escribe el dictado):
 * «quince euros» → «15 €», «doce con cincuenta» → «12,50 €», «veinte euros y
 * medio» → «20,50 €». Solo si el texto no lleva ya cifras.
 */
export function spokenAmount(text: string): string {
  if (/\d/.test(text)) return text
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const run = readWords(words, i)
    if (!run) continue
    let k = run.end
    const currency = CURRENCY_WORD.test(fold(words[k] ?? '') || (words[k] ?? ''))
    if (currency) k++
    let cents = 0
    if (fold(words[k] ?? '') === 'con') {
      const c = readWords(words, k + 1)
      if (c && c.value < 100) {
        cents = c.value
        k = c.end
        if (/^centimos?$/.test(fold(words[k] ?? ''))) k++
      }
    } else if (fold(words[k] ?? '') === 'y' && fold(words[k + 1] ?? '') === 'medio') {
      cents = 50
      k += 2
    }
    // «un», «una» sueltos no son un importe («una cena»); al principio o al final del texto, sí
    const edge = i === 0 || run.end === words.length
    if ((run.value === 1 && !currency && !cents) || (!currency && !cents && !edge)) {
      i = run.end - 1
      continue
    }
    const amount = cents ? `${run.value},${String(cents).padStart(2, '0')}` : String(run.value)
    return [...words.slice(0, i), `${amount} €`, ...words.slice(k)].join(' ')
  }
  return text
}

/** «12,50 café» · «café 2,30» · «63€ súper» · «ayer 20 cena» · «1.250 alquiler» · «30 cena #roma» · «quince euros en el súper» */
export function parseExpense(input: string, rules?: ExpenseRules): ParsedExpense | null {
  const tags: string[] = []
  let s = ` ${spokenAmount(input.trim().replace(TAG, (_, pre: string, t: string) => (tags.includes(normTag(t)) || tags.push(normTag(t)), pre)))} `
  let daysAgo = 0
  s = s.replace(/\s(anteayer|antes de ayer)\s/i, () => ((daysAgo = 2), ' ')).replace(/\sayer\s/i, () => ((daysAgo = daysAgo || 1), ' ')).replace(/\shoy\s/i, ' ')
  // Importe: 12 · 12,5 · 12,50 · 12.50 · 1.250 · 1.250,50, con € o «euros» opcional
  const m = s.match(/(?:^|\s)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?|pavos?)?(?=\s|$)/i)
  if (!m) return null
  let raw = m[1]
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.')
  else raw = raw.replace(',', '.')
  const amount = Math.round(parseFloat(raw) * 100) / 100
  if (!(amount > 0)) return null
  // «de 15 euros en el súper» → «súper»: fuera las preposiciones y el artículo que quedan sueltos
  let note = (s.slice(0, m.index) + ' ' + s.slice((m.index ?? 0) + m[0].length))
    .replace(/\s+(en|de|del|por|para)\s*$/i, '')
    .replace(/^\s*(?:(?:en|de|del|por|para)\s+)+(?:(?:el|la|los|las)\s+(?=\S))?/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  note = note ? note.charAt(0).toUpperCase() + note.slice(1) : 'Gasto'
  const c = classifyNote(note, rules)
  return { amount, note, category: c.category, daysAgo, ...(tags.length ? { tags } : {}), ...(c.sure ? {} : { unsure: true as const }) }
}

export function money(n: number, currency = 'EUR') {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency, minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${n.toFixed(2)} €`
  }
}

/** Resumen de un mes (YYYY-MM): total, por categoría y proyección a fin de mes */
export function monthSummary(expenses: { amount: number; category: string; date: string }[], month: string, today: string) {
  const list = expenses.filter((e) => e.date.startsWith(month))
  const total = Math.round(list.reduce((s, e) => s + e.amount, 0) * 100) / 100
  const byCategory = new Map<string, number>()
  for (const e of list) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount)
  const [y, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()
  const current = today.startsWith(month)
  const day = current ? Number(today.slice(8, 10)) : daysInMonth
  const projection = current && day > 0 ? Math.round((total / day) * daysInMonth) : total
  return {
    total,
    count: list.length,
    byCategory: [...byCategory.entries()].map(([id, amount]) => ({ id, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount),
    projection,
  }
}

// ── Presupuestos, frecuentes, búsqueda y tendencia ──────────────

const round2 = (n: number) => Math.round(n * 100) / 100

/** Ajuste `budget`: límite del mes y, si se quiere, de cada categoría (como YNAB o Monarch) */
export interface Budget {
  monthly?: number
  /** id de categoría → € al mes */
  categories?: Record<string, number>
}

type Spent = { amount: number; category: string; date: string; note?: string; tags?: string[] }

/** Cómo va cada categoría con límite, de la más apurada a la más holgada */
export function categoryBudgets(byCategory: { id: string; amount: number }[], budget: Budget | undefined) {
  return Object.entries(budget?.categories ?? {})
    .filter(([id, limit]) => limit > 0 && CATEGORIES.some((c) => c.id === id))
    .map(([id, limit]) => {
      const spent = byCategory.find((c) => c.id === id)?.amount ?? 0
      return { id, limit, spent, left: round2(limit - spent), pct: spent / limit }
    })
    .sort((a, b) => b.pct - a.pct)
}

/** Al apuntar: ¿con este gasto se llega al 80 % del límite, o se pasa? */
export function budgetAlert(before: number, amount: number, limit: number | undefined): 'over' | 'near' | undefined {
  if (!limit || !(limit > 0)) return undefined
  const after = before + amount
  if (before < limit && after >= limit) return 'over'
  if (before < limit * 0.8 && after >= limit * 0.8) return 'near'
  return undefined
}

function daysBefore(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Lo que apuntas a menudo (como las plantillas de Wallet): el mismo concepto
 * con el mismo importe, al menos dos veces en los últimos 90 días.
 */
export function frequentExpenses(list: Spent[], today: string, n = 4) {
  const since = daysBefore(today, 90)
  const groups = new Map<string, { note: string; amount: number; category: string; tags?: string[]; count: number; last: string }>()
  for (const e of list) {
    if (e.date < since || e.date > today || !e.note) continue
    const key = `${fold(e.note)}|${e.amount}`
    const g = groups.get(key)
    if (!g) groups.set(key, { note: e.note, amount: e.amount, category: e.category, tags: e.tags, count: 1, last: e.date })
    else {
      g.count++
      // Con la categoría y las etiquetas de la última vez
      if (e.date >= g.last) Object.assign(g, { last: e.date, category: e.category, tags: e.tags, note: e.note })
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, n)
}

/** Busca en todos los meses por concepto o categoría («merca», «comer») y por #etiqueta */
export function searchExpenses<T extends Spent>(list: T[], query: string): { items: T[]; total: number } {
  const tags = [...query.matchAll(/#([\p{L}\d][\p{L}\d_-]*)/gu)].map((m) => normTag(m[1]))
  const words = fold(query.replace(/#[\p{L}\d_-]+/gu, ' '))
  if (!tags.length && !words) return { items: [], total: 0 }
  const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? ''
  const items = list.filter((e) => tags.every((t) => e.tags?.includes(t)) && (!words || fold(`${e.note ?? ''} ${label(e.category)}`).includes(words)))
  return { items, total: round2(items.reduce((s, e) => s + e.amount, 0)) }
}

/** Cada etiqueta, con su total y sus fechas (para «#roma: 245 €, del 3 al 7 de mayo») */
export function tagTotals(list: Spent[]) {
  const map = new Map<string, { tag: string; total: number; count: number; from: string; to: string }>()
  for (const e of list)
    for (const tag of e.tags ?? []) {
      const t = map.get(tag) ?? { tag, total: 0, count: 0, from: e.date, to: e.date }
      t.total = round2(t.total + e.amount)
      t.count++
      if (e.date < t.from) t.from = e.date
      if (e.date > t.to) t.to = e.date
      map.set(tag, t)
    }
  return [...map.values()].sort((a, b) => b.to.localeCompare(a.to) || b.total - a.total)
}

/** Total de cada uno de los últimos `n` meses hasta `month` (YYYY-MM), del más antiguo al último */
export function monthlyTotals(list: Spent[], month: string, n = 6) {
  const [y, m] = month.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1))
    const key = d.toISOString().slice(0, 7)
    return { month: key, total: round2(list.reduce((s, e) => (e.date.startsWith(key) ? s + e.amount : s), 0)) }
  })
}
