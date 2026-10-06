/**
 * El dinero de un vistazo: ingresos, lo que entra frente a lo que sale cada
 * mes (el «cash flow» de Monarch), la regla 50/30/20, la tabla del año como
 * en una hoja de Excel y los avisos de lo que se sale de lo normal. Sin
 * dependencias: lo usan la app, Siri y el conector de Claude.
 */
import { CATEGORIES, fold, matchRules, parseExpense, type Category } from './expenses.ts'

// ── Ingresos ───────────────────────────────────────────────────

export const INCOME_CATEGORIES: Category[] = [
  { id: 'nomina', label: 'Nómina', icon: 'briefcase' },
  { id: 'extra', label: 'Pagas extra y bonus', icon: 'star' },
  { id: 'trabajos', label: 'Trabajos y facturas', icon: 'pen' },
  { id: 'alquiler', label: 'Alquileres', icon: 'key' },
  { id: 'inversiones', label: 'Intereses y dividendos', icon: 'sparkles' },
  { id: 'devoluciones', label: 'Devoluciones', icon: 'wallet' },
  { id: 'ventas', label: 'Ventas', icon: 'cart' },
  { id: 'ayudas', label: 'Ayudas y prestaciones', icon: 'heart' },
  { id: 'regalos', label: 'Regalos', icon: 'gift' },
  { id: 'otros', label: 'Otros', icon: 'circle' },
]

const INCOME_RULES: [string, string[]][] = [
  ['extra', ['paga extra', 'extra', 'bonus', 'incentivo', 'variable', 'prima', 'finiquito', 'atrasos']],
  ['nomina', ['nomina', 'sueldo', 'salario', 'paga', 'mensualidad']],
  ['alquiler', ['alquiler', 'inquilino', 'arrendamiento']],
  ['trabajos', ['factura', 'freelance', 'cliente', 'honorarios', 'encargo', 'clases particulares', 'colaboracion']],
  ['inversiones', ['intereses', 'interes', 'dividendo', 'cupon', 'rentabilidad', 'plusvalia', 'cashback', 'remuneracion']],
  ['devoluciones', ['devolucion', 'devuelto', 'hacienda', 'renta', 'reembolso', 'reintegro', 'abono']],
  ['ventas', ['venta', 'vendido', 'wallapop', 'vinted', 'milanuncios', 'ebay']],
  ['ayudas', ['paro', 'prestacion', 'pension', 'beca', 'ayuda', 'subsidio', 'sepe', 'ingreso minimo']],
  ['regalos', ['regalo', 'cumple', 'cumpleanos', 'herencia', 'aguinaldo']],
]

export const incomeCat = (id: string) => INCOME_CATEGORIES.find((c) => c.id === id) ?? INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1]

export function incomeCategoryFor(note: string): string {
  return matchRules(note, INCOME_RULES) ?? 'otros'
}

export interface ParsedIncome {
  amount: number
  note: string
  category: string
  daysAgo: number
  tags?: string[]
}

/** «1.850 nómina», «ayer 120 wallapop», «la nómina, 1850»: como un gasto, con categorías de ingreso */
export function parseIncome(input: string): ParsedIncome | null {
  const p = parseExpense(input)
  if (!p) return null
  let note = p.note.replace(/^(?:la|el|los|las|una?)\s+/i, '').replace(/[\s,.;:]+$/, '').trim()
  note = note ? note.charAt(0).toUpperCase() + note.slice(1) : 'Ingreso'
  if (note === 'Gasto') note = 'Ingreso'
  return { amount: p.amount, note, category: incomeCategoryFor(note), daysAgo: p.daysAgo, ...(p.tags ? { tags: p.tags } : {}) }
}

/**
 * «ingreso 1850 nómina», «he cobrado 200 de una factura», «me han pagado 50»,
 * «me ha llegado la nómina», «me han devuelto 30 de Hacienda»
 */
export const INCOME_PREFIX =
  /^\s*(?:(?:(?:mete|meter|apunta|anota|a[nñ]ade|pon|registra)(?:me)?\s+(?:un\s+)?)?ingreso(?:\s+de)?|(?:he|hemos)\s+cobrado|cobr[eé]|me\s+han\s+(?:pagado|ingresado|transferido|devuelto|hecho\s+un\s+bizum\s+de)|me\s+ha\s+(?:llegado|entrado))\s*[:,.-]?\s+/i

/** Si el texto es un ingreso, lo que queda tras el principio («1850 de la nómina») */
export function incomeText(text: string): string | undefined {
  const m = INCOME_PREFIX.exec(text)
  if (!m) return undefined
  const rest = text.slice(m[0].length)
  // «me han devuelto el taladro» no es dinero: sin importe, solo si habla de cobrar
  if (parseIncome(rest) || /ingreso|cobr|llegado|entrado/i.test(m[0])) return rest
  return undefined
}

type Moved = { amount: number; date: string; note?: string; category: string; tags?: string[] }

/**
 * Lo que entra a menudo (la nómina, el alquiler del piso): cada concepto de los
 * últimos 100 días con su último importe, del más repetido al menos.
 */
export function usualIncomes<T extends Moved>(list: T[], today: string, n = 3) {
  const since = shiftDay(today, -100)
  const groups = new Map<string, { note: string; amount: number; category: string; count: number; last: string }>()
  for (const e of list) {
    if (e.date < since || e.date > today || !e.note) continue
    const k = fold(e.note)
    const g = groups.get(k)
    if (!g) groups.set(k, { note: e.note, amount: e.amount, category: e.category, count: 1, last: e.date })
    else {
      g.count++
      if (e.date >= g.last) Object.assign(g, { note: e.note, amount: e.amount, category: e.category, last: e.date })
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, n)
}

/** El último ingreso con ese concepto (para «me ha llegado la nómina» sin importe) */
export function lastIncomeLike<T extends Moved>(list: T[], note: string): T | undefined {
  const k = fold(note)
  if (!k) return undefined
  const hits = list.filter((e) => e.note && (fold(e.note) === k || fold(e.note).includes(k) || k.includes(fold(e.note))))
  return hits.sort((a, b) => b.date.localeCompare(a.date))[0]
}

/**
 * Lo que suele llegar y este mes aún no (la nómina que llegó los dos meses
 * anteriores): para no contar con dinero que no está.
 */
export function pendingIncomes<T extends Moved>(list: T[], month: string) {
  const prev = [shiftMonth(month, -1), shiftMonth(month, -2)]
  const notesIn = (m: string) => new Set(list.filter((e) => e.date.startsWith(m) && e.note).map((e) => fold(e.note!)))
  const now = notesIn(month)
  const [a, b] = prev.map(notesIn)
  const out: { note: string; amount: number; day: number }[] = []
  for (const k of a) {
    if (!b.has(k) || now.has(k)) continue
    const last = list.filter((e) => e.note && fold(e.note) === k && e.date.startsWith(prev[0])).sort((x, y) => y.date.localeCompare(x.date))[0]
    out.push({ note: last.note!, amount: last.amount, day: Number(last.date.slice(8, 10)) })
  }
  return out.sort((x, y) => x.day - y.day)
}

// ── Lo que entra y lo que sale ─────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}
function shiftDay(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const sumIn = (list: { amount: number; date: string }[], month: string) => round2(list.reduce((s, e) => (e.date.startsWith(month) ? s + e.amount : s), 0))

export interface Flow {
  income: number
  /** gastos apuntados */
  spent: number
  /** pagos fijos (lo que cuestan al mes) */
  fixed: number
  /** gastos + fijos */
  out: number
  /** lo que queda: ingresos − gastos − fijos (negativo si se gastó más de lo que entró) */
  saved: number
  /** tasa de ahorro: lo que queda frente a lo que entró (sin ingresos, undefined) */
  rate?: number
}

/** El mes (YYYY-MM): lo que entró, lo que salió y lo que quedó */
export function monthFlow(expenses: { amount: number; date: string }[], incomes: { amount: number; date: string }[], month: string, fixed = 0): Flow {
  const income = sumIn(incomes, month)
  const spent = sumIn(expenses, month)
  const out = round2(spent + fixed)
  const saved = round2(income - out)
  return { income, spent, fixed: round2(fixed), out, saved, ...(income > 0 ? { rate: saved / income } : {}) }
}

/**
 * Media de los últimos `n` meses con datos antes de `month` (sin contarlo):
 * lo que entra y sale en un mes normal, para el fondo de emergencia, la
 * independencia financiera y los avisos.
 */
export function averageFlow(expenses: { amount: number; date: string }[], incomes: { amount: number; date: string }[], month: string, fixed = 0, n = 3) {
  const months: string[] = []
  for (let i = 1; i <= 24 && months.length < n; i++) {
    const m = shiftMonth(month, -i)
    if (expenses.some((e) => e.date.startsWith(m)) || incomes.some((e) => e.date.startsWith(m))) months.push(m)
  }
  if (!months.length) return undefined
  const flows = months.map((m) => monthFlow(expenses, incomes, m, fixed))
  const avg = (k: 'income' | 'spent' | 'out' | 'saved') => round2(flows.reduce((s, f) => s + f[k], 0) / flows.length)
  return { months: months.length, income: avg('income'), spent: avg('spent'), out: avg('out'), saved: avg('saved') }
}

// ── 50/30/20 ───────────────────────────────────────────────────

/** Lo necesario (el 50 %); el resto de categorías es lo que se quiere (el 30 %) */
export const NEEDS = new Set(['super', 'casa', 'transporte', 'salud', 'educacion', 'seguros', 'mascotas'])

/**
 * La regla 50/30/20 de las plantillas de presupuesto: de lo que entra, la
 * mitad para lo necesario, el 30 % para lo que se quiere y el 20 % para
 * ahorrar. `fixedNeeds`: recibos (alquiler, luz…); `fixedWants`: suscripciones.
 */
export function rule503020(byCategory: { id: string; amount: number }[], income: number, fixedNeeds = 0, fixedWants = 0) {
  const needs = round2(byCategory.reduce((s, c) => (NEEDS.has(c.id) ? s + c.amount : s), 0) + fixedNeeds)
  const wants = round2(byCategory.reduce((s, c) => (NEEDS.has(c.id) ? s : s + c.amount), 0) + fixedWants)
  const savings = round2(income - needs - wants)
  const pct = (n: number) => (income > 0 ? n / income : 0)
  return { income, needs, wants, savings, pctNeeds: pct(needs), pctWants: pct(wants), pctSavings: pct(savings) }
}

// ── El año, como en Excel ──────────────────────────────────────

export interface YearRow {
  id: string
  label: string
  values: number[]
  total: number
  /** media de los meses con datos */
  avg: number
}

/**
 * La tabla del año (la hoja de cálculo de toda la vida): ingresos, cada
 * categoría de gasto, los fijos y lo ahorrado, mes a mes, con el total y la
 * media. Los fijos cuentan en los meses que tienen algo apuntado.
 */
export function yearGrid(expenses: { amount: number; date: string; category: string }[], incomes: { amount: number; date: string }[], year: string, fixed = 0, today?: string) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const active = months.map((m) => (!today || m <= today.slice(0, 7)) && (expenses.some((e) => e.date.startsWith(m)) || incomes.some((e) => e.date.startsWith(m))))
  const used = active.filter(Boolean).length
  const row = (id: string, label: string, values: number[]): YearRow => {
    const total = round2(values.reduce((s, v) => s + v, 0))
    return { id, label, values: values.map(round2), total, avg: used ? round2(total / used) : 0 }
  }
  const income = row('income', 'Ingresos', months.map((m) => sumIn(incomes, m)))
  const categories = CATEGORIES.map((c) => row(c.id, c.label, months.map((m) => sumIn(expenses.filter((e) => e.category === c.id), m)))).filter((r) => r.total > 0)
  const fixedRow = row('fixed', 'Pagos fijos', months.map((_, i) => (active[i] ? fixed : 0)))
  const spent = row('out', 'Total gastos', months.map((_, i) => categories.reduce((s, r) => s + r.values[i], 0) + fixedRow.values[i]))
  const saved = row('saved', 'Ahorro', months.map((_, i) => (active[i] ? income.values[i] - spent.values[i] : 0)))
  const rate = income.total > 0 ? saved.total / income.total : undefined
  return { months, active, income, categories, fixed: fixedRow, spent, saved, rate }
}

// ── Lo que se sale de lo normal ────────────────────────────────

/**
 * Categorías en las que este mes ya llevas bastante más que tu media de los
 * 3 meses anteriores (como los avisos de gasto inusual de Copilot o Monarch):
 * al menos un 40 % y 30 € más.
 */
export function unusualSpending(expenses: { amount: number; date: string; category: string }[], month: string) {
  const prev = [1, 2, 3].map((i) => shiftMonth(month, -i)).filter((m) => expenses.some((e) => e.date.startsWith(m)))
  if (prev.length < 2) return []
  const out: { id: string; spent: number; avg: number }[] = []
  for (const c of CATEGORIES) {
    const of = expenses.filter((e) => e.category === c.id)
    const spent = sumIn(of, month)
    const avg = round2(prev.reduce((s, m) => s + sumIn(of, m), 0) / prev.length)
    if (spent >= avg * 1.4 && spent - avg >= 30) out.push({ id: c.id, spent, avg })
  }
  return out.sort((a, b) => b.spent - b.avg - (a.spent - a.avg))
}

/** El mismo gasto apuntado dos veces (mismo día, importe y concepto), como los avisos de cargos duplicados de Fintonic */
export function duplicateExpenses<T extends { id: string; amount: number; date: string; note?: string; createdAt?: number }>(list: T[], month: string) {
  const seen = new Map<string, T>()
  const dup: [T, T][] = []
  for (const e of [...list].filter((x) => x.date.startsWith(month)).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))) {
    const k = `${e.date}|${e.amount}|${fold(e.note ?? '')}`
    const first = seen.get(k)
    // Dos cafés iguales el mismo día son normales: solo lo que pasa de 20 €
    if (first && e.amount >= 20) dup.push([first, e])
    else seen.set(k, e)
  }
  return dup
}

// ── Exportar (para Excel o Numbers) ────────────────────────────

const csvCell = (v: string | number) => {
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
/** Filas a CSV como lo abre Excel en español: punto y coma, coma decimal y BOM para las tildes */
export function toCsv(rows: (string | number)[][]) {
  return `﻿${rows.map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`
}
