/**
 * Lista de la compra: entender lo que se escribe o se dicta («leche, 2 barras
 * de pan y detergente») y colocar cada cosa en su pasillo. Sin dependencias:
 * lo usan la app (src/lib/shopping.ts) y el conector de Claude.
 */
export interface Aisle {
  id: string
  label: string
}

/** En el orden en que se suele recorrer el súper */
export const AISLES: Aisle[] = [
  { id: 'fruta', label: 'Fruta y verdura' },
  { id: 'panaderia', label: 'Panadería' },
  { id: 'carne', label: 'Carne y pescado' },
  { id: 'lacteos', label: 'Lácteos y huevos' },
  { id: 'despensa', label: 'Despensa' },
  { id: 'congelados', label: 'Congelados' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'limpieza', label: 'Limpieza y hogar' },
  { id: 'higiene', label: 'Higiene y farmacia' },
  { id: 'otros', label: 'Otros' },
]

// Primero las frases concretas: «pasta de dientes» no es pasta, «tomate frito» no es fruta
const RULES: [string, string[]][] = [
  ['higiene', ['panal', 'pasta de dientes', 'papel higienico', 'cepillo de dientes', 'gel de ducha', 'crema solar', 'hilo dental', 'toallitas']],
  ['limpieza', ['papel de cocina', 'bolsas de basura', 'bolsa de basura', 'papel de aluminio', 'papel film', 'pastillas lavavajillas']],
  ['despensa', ['tomate frito', 'tomate triturado', 'gelatina', 'atun', 'frutos secos', 'leche de coco', 'pan rallado', 'caldo']],
  ['congelados', ['congelad', 'helado', 'pizza', 'hielo', 'guisantes']],
  ['fruta', ['manzana', 'platano', 'banana', 'naranja', 'mandarina', 'limon', 'lima', 'fresa', 'uva', 'pera', 'melon', 'sandia', 'kiwi', 'melocoton', 'pina', 'mango', 'cereza', 'arandano', 'aguacate', 'tomate', 'lechuga', 'cebolla', 'patata', 'ajo', 'zanahoria', 'pimiento', 'pepino', 'calabacin', 'berenjena', 'champinon', 'seta', 'espinaca', 'brocoli', 'coliflor', 'puerro', 'apio', 'calabaza', 'judia verde', 'rucula', 'canonigo', 'perejil', 'cilantro', 'albahaca', 'fruta', 'verdura', 'ensalada']],
  ['panaderia', ['pan', 'barra', 'baguette', 'chapata', 'croissant', 'cruasan', 'magdalena', 'bolleria', 'bizcocho', 'tostada', 'panecillo']],
  ['carne', ['pollo', 'pechuga', 'muslo', 'carne', 'ternera', 'cerdo', 'lomo', 'costilla', 'filete', 'hamburguesa', 'salchicha', 'jamon', 'pavo', 'chorizo', 'salchichon', 'fuet', 'bacon', 'beicon', 'embutido', 'pescado', 'salmon', 'merluza', 'bacalao', 'sardina', 'dorada', 'lubina', 'gamba', 'langostino', 'mejillon', 'calamar', 'pulpo']],
  ['lacteos', ['leche', 'yogur', 'queso', 'mantequilla', 'nata', 'huevo', 'kefir', 'requeson', 'batido']],
  ['despensa', ['arroz', 'pasta', 'macarron', 'espagueti', 'fideo', 'lenteja', 'garbanzo', 'alubia', 'harina', 'azucar', 'sal', 'aceite', 'vinagre', 'conserva', 'lata', 'cafe', 'te', 'infusion', 'cacao', 'cereal', 'galleta', 'legumbre', 'especia', 'pimienta', 'oregano', 'miel', 'mermelada', 'chocolate', 'nueces', 'almendra', 'avena', 'quinoa', 'salsa', 'mayonesa', 'ketchup', 'mostaza', 'aceituna', 'patatas fritas', 'snack']],
  ['bebidas', ['agua', 'cerveza', 'vino', 'zumo', 'refresco', 'cola', 'tonica', 'gaseosa', 'cava', 'bebida']],
  ['limpieza', ['detergente', 'lejia', 'suavizante', 'lavavajillas', 'friegasuelos', 'fregasuelos', 'estropajo', 'bayeta', 'limpiacristales', 'amoniaco', 'quitagrasas', 'servilleta', 'bombilla', 'pila', 'vela', 'ambientador', 'insecticida']],
  ['higiene', ['champu', 'gel', 'dentifrico', 'desodorante', 'compresa', 'tampon', 'cuchilla', 'maquinilla', 'crema', 'jabon', 'colonia', 'algodon', 'tirita', 'ibuprofeno', 'paracetamol', 'medicina', 'pañal', 'panal', 'bastoncillo', 'mascarilla']],
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

/** Singular aproximado: limones → limon, tomates → tomate, huevos → huevo */
function singular(w: string) {
  if (w.length > 4 && w.endsWith('es') && 'nlrdzj'.includes(w[w.length - 3])) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1)
  return w
}

/** Clave para reconocer la misma cosa («Plátanos» = «platano») */
export function itemKey(name: string) {
  return fold(name).split(' ').map(singular).join(' ')
}

/**
 * Pasillo de una cosa. `known` = lo aprendido (clave → pasillo). Cada regla
 * vale como comienzo de palabra («tomate» ⇒ «tomates»); las muy cortas («te»,
 * «sal») tienen que ser la palabra entera.
 */
export function aisleFor(name: string, known?: Record<string, string>): string {
  if (known?.[itemKey(name)]) return known[itemKey(name)]
  const text = ` ${fold(name)} `
  const words = text.trim().split(' ')
  for (const [aisle, list] of RULES) {
    for (const rule of list) {
      if (rule.includes(' ') ? text.includes(` ${rule}`) : rule.length <= 3 ? words.includes(rule) : words.some((w) => w.startsWith(rule))) return aisle
    }
  }
  return 'otros'
}

const NUM: Record<string, string> = { un: '1', una: '1', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9', diez: '10', doce: '12', medio: '½', media: '½' }
const UNITS = 'kg|kilos?|g|gr|gramos?|l|litros?|ml|docenas?|paquetes?|packs?|latas?|botes?|botellas?|bolsas?|barras?|cajas?|bandejas?|tarros?|briks?|bricks?|rollos?|unidades?|piezas?|manojos?'

export interface ParsedItem {
  name: string
  qty?: string
}

/** «2 barras de pan», «leche x3», «medio kilo de fresas», «una docena de huevos» */
export function parseItem(raw: string): ParsedItem | null {
  let s = raw.trim().replace(/^[-•*·]\s*/, '')
  if (!s) return null
  let qty: string | undefined
  // «leche x3» / «leche (3)»
  const tail = s.match(/\s*(?:x\s*(\d+)|\((\d+[^)]*)\))$/i)
  if (tail) {
    qty = tail[1] ?? tail[2]
    s = s.slice(0, tail.index).trim()
  }
  const words = Object.keys(NUM).sort((a, b) => b.length - a.length).join('|')
  const head = s.match(new RegExp(`^(\\d+(?:[.,]\\d+)?|(?:${words})(?=\\s))\\s*(?:(${UNITS})(?=\\s))?\\s*(?:de\\s+)?(.+)$`, 'i'))
  if (head && !qty) {
    const n = NUM[head[1].toLowerCase()] ?? head[1]
    const unit = head[2]
    // «un pan» → sin cantidad; «una docena de huevos» → «1 docena»
    if (!(n === '1' && !unit)) qty = unit ? `${n} ${unit.toLowerCase()}` : n
    s = head[3]
  }
  s = s.trim()
  if (!s) return null
  return { name: s.charAt(0).toUpperCase() + s.slice(1), qty }
}

/** Varias cosas de golpe: separadas por comas, «y», punto y coma o líneas */
export function parseItems(text: string): ParsedItem[] {
  return text
    .split(/\n|,|;|\s+y\s+|\s+e\s+(?=[aeiou])/i)
    .map(parseItem)
    .filter((x): x is ParsedItem => !!x)
}
