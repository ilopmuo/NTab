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
  { id: 'otros', label: 'Otros', icon: 'circle' },
]

const RULES: [string, string[]][] = [
  ['super', ['super', 'supermercado', 'mercadona', 'carrefour', 'lidl', 'aldi', 'alcampo', 'eroski', 'dia', 'hipercor', 'compra', 'fruteria', 'carniceria', 'pescaderia', 'panaderia', 'mercado']],
  ['comer', ['cafe', 'bar', 'restaurante', 'cena', 'comida', 'almuerzo', 'desayuno', 'menu', 'pizza', 'burger', 'hamburguesa', 'kebab', 'sushi', 'cerveza', 'cana', 'copa', 'vermut', 'tapas', 'glovo', 'just eat', 'uber eats', 'takeaway', 'helado', 'churros']],
  ['transporte', ['gasolina', 'diesel', 'gasoil', 'parking', 'aparcamiento', 'taxi', 'uber', 'cabify', 'bolt', 'metro', 'bus', 'autobus', 'tren', 'renfe', 'ave', 'peaje', 'abono', 'bici', 'avion', 'vuelo', 'itv', 'taller', 'coche']],
  ['casa', ['alquiler', 'hipoteca', 'luz', 'agua', 'gas', 'internet', 'fibra', 'movil', 'comunidad', 'ikea', 'leroy', 'ferreteria', 'reparacion', 'fontanero', 'electricista', 'muebles', 'limpieza']],
  ['ocio', ['cine', 'teatro', 'concierto', 'libro', 'libreria', 'juego', 'videojuego', 'netflix', 'spotify', 'hbo', 'disney', 'museo', 'entradas', 'entrada', 'viaje', 'hotel', 'airbnb', 'excursion', 'fiesta', 'discoteca']],
  ['salud', ['farmacia', 'medico', 'dentista', 'gimnasio', 'gym', 'fisio', 'fisioterapeuta', 'optica', 'gafas', 'psicologo', 'analisis', 'seguro medico']],
  ['ropa', ['ropa', 'zapatos', 'zapatillas', 'zara', 'primark', 'camiseta', 'pantalon', 'vestido', 'abrigo', 'chaqueta', 'calcetines', 'decathlon']],
  ['regalos', ['regalo', 'cumple', 'cumpleanos', 'boda', 'detalle', 'flores']],
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

export function categoryFor(note: string): string {
  const text = ` ${fold(note)} `
  const words = text.trim().split(' ')
  for (const [cat, list] of RULES) {
    for (const w of list) {
      if (w.includes(' ') ? text.includes(` ${w} `) : w.length <= 3 ? words.includes(w) : words.some((x) => x.startsWith(w))) return cat
    }
  }
  return 'otros'
}

export interface ParsedExpense {
  amount: number
  note: string
  category: string
  /** días atrás: 0 hoy, 1 ayer, 2 anteayer */
  daysAgo: number
}

/** «12,50 café» · «café 2,30» · «63€ súper» · «ayer 20 cena» · «1.250 alquiler» */
export function parseExpense(input: string): ParsedExpense | null {
  let s = ` ${input.trim()} `
  let daysAgo = 0
  s = s.replace(/\s(anteayer|antes de ayer)\s/i, () => ((daysAgo = 2), ' ')).replace(/\sayer\s/i, () => ((daysAgo = daysAgo || 1), ' ')).replace(/\shoy\s/i, ' ')
  // Importe: 12 · 12,5 · 12,50 · 12.50 · 1.250 · 1.250,50, con € o «euros» opcional
  const m = s.match(/(?:^|\s)(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?)?(?=\s|$)/i)
  if (!m) return null
  let raw = m[1]
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.')
  else raw = raw.replace(',', '.')
  const amount = Math.round(parseFloat(raw) * 100) / 100
  if (!(amount > 0)) return null
  let note = (s.slice(0, m.index) + ' ' + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+(en|de|del|por)\s*$/i, '').replace(/^\s*(en|de|del|por)\s+/i, '').replace(/\s+/g, ' ').trim()
  note = note ? note.charAt(0).toUpperCase() + note.slice(1) : 'Gasto'
  return { amount, note, category: categoryFor(note), daysAgo }
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
