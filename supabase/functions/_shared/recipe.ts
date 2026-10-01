/**
 * Recetas: leerlas de una web, escalar las cantidades a otras raciones y
 * encontrar los tiempos de los pasos (para los temporizadores del modo
 * cocina). Sin dependencias: lo usan la app (src/lib/recipes.ts), la Edge
 * Function `recipe` y los tests.
 */

export interface RecipeData {
  name: string
  ingredients: string[]
  steps: string[]
  servings?: number
  /** minutos en total */
  minutes?: number
  source?: string
}

// ── Leer una receta de una página web ───────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', iexcl: '¡', iquest: '¿', ntilde: 'ñ', Ntilde: 'Ñ', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' }

/** Quita etiquetas y entidades HTML, y deja los espacios en su sitio */
export function cleanText(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole
      }
      const vowel = e.match(/^([aeiouAEIOU])(acute|uml|grave)$/)
      if (vowel) return (vowel[2] === 'uml' ? { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü' } : vowel[2] === 'grave' ? { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' } : { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' })[vowel[1].toLowerCase() as 'a'] ?? whole
      return ENTITIES[e] ?? whole
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** «PT1H30M» → 90 */
export function isoMinutes(s: unknown): number | undefined {
  if (typeof s !== 'string') return undefined
  const m = s.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m || !m[0] || m[0] === 'P' || m[0] === 'PT') return undefined
  const n = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return n > 0 ? n : undefined
}

/** «4 raciones», ["4", "4 personas"], 6 → número */
function servingsOf(y: unknown): number | undefined {
  const v = Array.isArray(y) ? y[0] : y
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.match(/\d+/)?.[0]) : NaN
  return Number.isFinite(n) && n > 0 && n < 100 ? n : undefined
}

const isType = (o: Record<string, unknown>, t: string) => {
  const ty = o['@type']
  return ty === t || (Array.isArray(ty) && ty.includes(t))
}

/** Pasos: texto, HowToStep, o HowToSection con sus pasos dentro */
function stepsOf(x: unknown): string[] {
  if (typeof x === 'string') return x.split(/\n+|(?<=\.)\s+(?=\d+[.)]\s)/).map(cleanText).filter(Boolean)
  if (Array.isArray(x)) return x.flatMap(stepsOf)
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    if (o.itemListElement) return stepsOf(o.itemListElement)
    const t = o.text ?? o.name
    return typeof t === 'string' ? [cleanText(t)].filter(Boolean) : []
  }
  return []
}

/** Busca un objeto Recipe en lo que haya dentro de un bloque JSON-LD */
function findRecipe(x: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(x)) {
    for (const it of x) {
      const r = findRecipe(it)
      if (r) return r
    }
    return undefined
  }
  if (!x || typeof x !== 'object') return undefined
  const o = x as Record<string, unknown>
  if (isType(o, 'Recipe')) return o
  return findRecipe(o['@graph']) ?? findRecipe(o.mainEntity)
}

/**
 * La receta de una página web, a partir de sus datos estructurados
 * (schema.org/Recipe, que publican casi todas las webs de recetas). Sin ellos,
 * undefined.
 */
export function parseRecipeHtml(html: string, source?: string): RecipeData | undefined {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let json: unknown
    try {
      json = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    const r = findRecipe(json)
    if (!r) continue
    const name = cleanText(String(r.name ?? ''))
    const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : []).map((i) => cleanText(String(i))).filter(Boolean)
    if (!name && !ingredients.length) continue
    const prep = isoMinutes(r.prepTime)
    const cook = isoMinutes(r.cookTime)
    return {
      name: name || 'Receta',
      ingredients,
      steps: stepsOf(r.recipeInstructions),
      servings: servingsOf(r.recipeYield),
      minutes: isoMinutes(r.totalTime) ?? (prep || cook ? (prep ?? 0) + (cook ?? 0) : undefined),
      source,
    }
  }
  return undefined
}

/**
 * Una receta pegada como texto: la primera línea es el nombre; lo que va tras
 * «Ingredientes» son los ingredientes y lo que va tras «Preparación» (o
 * «Pasos», «Elaboración»…), los pasos.
 */
export function parseRecipeText(text: string): RecipeData | undefined {
  const lines = text.split('\n').map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim())
  const name = lines.find(Boolean)
  if (!name) return undefined
  const ingredients: string[] = []
  const steps: string[] = []
  let servings: number | undefined
  let mode: 'none' | 'ingredients' | 'steps' = 'none'
  for (const l of lines.slice(lines.indexOf(name) + 1)) {
    if (!l) continue
    const head = l.toLowerCase().replace(/[:.]$/, '')
    if (/^ingredientes\b/.test(head)) {
      mode = 'ingredients'
      servings ??= servingsOf(head.match(/\d+/)?.[0])
      continue
    }
    if (/^(preparaci[oó]n|pasos|elaboraci[oó]n|instrucciones|modo de hacerlo|c[oó]mo se hace)\b/.test(head)) {
      mode = 'steps'
      continue
    }
    const forN = head.match(/^(?:para|raciones|personas|comensales)\D{0,12}(\d+)/)
    if (forN && mode === 'none') {
      servings = Number(forN[1])
      continue
    }
    if (mode === 'steps') steps.push(l)
    else ingredients.push(l)
  }
  return { name, ingredients, steps, servings }
}

// ── Escalar las cantidades ──────────────────────────────────────

const VULGAR: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }
const NUM = String.raw`\d+(?:[.,]\d+)?(?:\s+\d+\/\d+|\s*[½¼¾⅓⅔⅛])?|\d+\/\d+|[½¼¾⅓⅔⅛]`

function readNumber(s: string): number {
  const t = s.trim()
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  if (VULGAR[t] !== undefined) return VULGAR[t]
  const mixed = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:(\d+)\/(\d+)|([½¼¾⅓⅔⅛]))?$/)
  if (!mixed) return NaN
  const whole = Number(mixed[1].replace(',', '.'))
  if (mixed[2]) return whole + Number(mixed[2]) / Number(mixed[3])
  if (mixed[4]) return whole + VULGAR[mixed[4]]
  return whole
}

/** 1.5 → «1½», 0.25 → «¼», 2.333 → «2⅓», 250 → «250»; con `decimal`, «1,5» (para kg, g, l…) */
export function formatAmount(n: number, decimal = false): string {
  if (n >= 20) return String(Math.round(n))
  const whole = Math.floor(n)
  const rest = n - whole
  if (!decimal) for (const [sym, v] of Object.entries(VULGAR)) if (Math.abs(rest - v) < 0.02) return `${whole || ''}${sym}`
  const r = Math.round(n * 10) / 10
  return String(r).replace('.', ',')
}

/**
 * Multiplica la cantidad del principio de un ingrediente («200 g de harina»,
 * «1 1/2 tazas», «½ cebolla», «2-3 dientes de ajo»). Lo que no empieza por un
 * número («Sal», «Aceite») se queda igual.
 */
export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1) return line
  const m = line.match(new RegExp(String.raw`^\s*(${NUM})(?:\s*(-|a)\s*(${NUM}))?(?=\s|[a-zA-Záéíóú]|$)`))
  if (!m) return line
  const a = readNumber(m[1])
  if (!Number.isFinite(a)) return line
  const b = m[3] ? readNumber(m[3]) : undefined
  // Con unidades métricas, decimales («1,5 kg»); con lo demás, fracciones («1½ tazas»)
  const metric = /^\s*(?:kg|g|gr|mg|l|ml|cl|dl)\b/i.test(line.slice(m[0].length))
  const scaled = formatAmount(a * factor, metric) + (b !== undefined && Number.isFinite(b) ? `${m[2] === 'a' ? ' a ' : '-'}${formatAmount(b * factor, metric)}` : '')
  return scaled + line.slice(m[0].length)
}

// ── Tiempos en los pasos ────────────────────────────────────────

/** Los tiempos que menciona un paso: «hornea 20 minutos» → 20; «1 hora y 15 min» → 75; «media hora» → 30 */
export function stepTimers(step: string): number[] {
  const out: number[] = []
  const s = step.toLowerCase()
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)(?:\s*(?:-|a)\s*(\d+(?:[.,]\d+)?))?\s*(h|horas?)\b(?:\s*(?:y\s*)?(\d+)\s*(?:min|minutos?)\b)?|(\d+)(?:\s*(?:-|a)\s*(\d+))?\s*(?:min|minutos?)\b|\b(media hora|una hora|un cuarto de hora|hora y media)\b/g)) {
    if (m[3]) {
      // Con un rango («1-2 horas»), lo más largo: se puede parar antes
      const hours = Number((m[2] ?? m[1]).replace(',', '.'))
      out.push(Math.round(hours * 60 + Number(m[4] ?? 0)))
    } else if (m[5]) out.push(Number(m[6] ?? m[5]))
    else if (m[7]) out.push({ 'media hora': 30, 'una hora': 60, 'un cuarto de hora': 15, 'hora y media': 90 }[m[7]]!)
  }
  return out.filter((n) => n > 0 && n <= 24 * 60)
}
