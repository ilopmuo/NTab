/**
 * Traer los movimientos del banco: el CSV o el Excel que descargas de la web
 * del banco (o las filas copiadas de una hoja de cálculo). Encuentra las
 * columnas de fecha, concepto e importe aunque cada banco las llame a su
 * manera, limpia los conceptos («COMPRA TARJ. 5540XXXX1234 MERCADONA» →
 * «Mercadona»), separa gastos, ingresos y traspasos entre tus cuentas y quita
 * lo que ya tenías apuntado.
 */
export interface BankRow {
  date: string
  note: string
  /** siempre en positivo */
  amount: number
  kind: 'expense' | 'income' | 'transfer'
}

// ── Leer el texto ──────────────────────────────────────────────

/** Separa un CSV respetando las comillas («"Compra, en Madrid";-12,50») */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"' && !cur.trim()) quoted = true
    else if (c === sep) {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  out.push(cur.trim())
  return out
}

/** Texto (CSV, TSV o filas pegadas de Excel) → tabla */
export function readTable(text: string): string[][] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const sample = lines.slice(0, 20).join('\n')
  const count = (c: string) => sample.split(c).length - 1
  const sep = count('\t') > 0 ? '\t' : count(';') >= count(',') / 2 && count(';') > 0 ? ';' : ','
  return lines.map((l) => splitLine(l, sep))
}

// ── Fechas e importes ──────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')

/** «03/10/2026», «3-10-26», «2026-10-03», «03.10.2026» o el número de serie de Excel → YYYY-MM-DD */
export function readDate(raw: string): string | undefined {
  const s = raw.trim()
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?!\d)/.exec(s)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return valid(y, +m[2], +m[1])
  }
  // Excel guarda las fechas como días desde el 30/12/1899
  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s))
    if (n > 30000 && n < 80000) return new Date(Date.UTC(1899, 11, 30 + n)).toISOString().slice(0, 10)
  }
  return undefined
}
function valid(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return undefined
  return `${y}-${pad(mo)}-${pad(d)}`
}

/** «-12,50», «−1.234,56 €», «1,234.56», «(12.50)», «12.5» → número con signo */
export function readAmount(raw: string): number | undefined {
  let s = raw.replace(/\s|€|eur|EUR| /g, '').replace(/[−–]/g, '-')
  if (!s) return undefined
  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  if (s.startsWith('-')) {
    sign *= -1
    s = s.slice(1)
  } else if (s.startsWith('+')) s = s.slice(1)
  if (s.endsWith('-')) {
    sign *= -1
    s = s.slice(0, -1)
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return undefined
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (lastComma >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) && s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(sign * n * 100) / 100 : undefined
}

// ── Columnas ───────────────────────────────────────────────────

const H_DATE = /^f(?:echa)?\.?\s*(?:de\s+)?(?:operaci[oó]n|op\.?|contable|valor)?$|date|^fecha/i
const H_VALUE_DATE = /valor/i
const H_NOTE = /concepto|descripci[oó]n|detalle|movimiento|comercio|beneficiario|ordenante|observaciones|referencia|description|payee|merchant|memo|texto/i
const H_AMOUNT = /^importe|cantidad|^amount|^importe\s*\(|^valor$|^euros?$/i
const H_DEBIT = /cargo|debe|d[eé]bito|salida|gasto|withdrawal|debit/i
const H_CREDIT = /abono|haber|cr[eé]dito|entrada|ingreso|deposit|credit/i
const H_BALANCE = /saldo|balance|disponible/i

interface Columns {
  date: number
  notes: number[]
  amount?: number
  debit?: number
  credit?: number
}

function findHeader(table: string[][]): { at: number; cols: Columns } | undefined {
  for (let at = 0; at < Math.min(table.length, 25); at++) {
    const row = table[at].map((c) => c.trim())
    const dates = row.map((c, i) => (H_DATE.test(c) ? i : -1)).filter((i) => i >= 0)
    if (!dates.length) continue
    // Mejor la fecha de la operación que la fecha valor
    const date = dates.find((i) => !H_VALUE_DATE.test(row[i])) ?? dates[0]
    const amount = row.findIndex((c) => H_AMOUNT.test(c) && !H_BALANCE.test(c))
    const debit = row.findIndex((c) => H_DEBIT.test(c) && !H_BALANCE.test(c))
    const credit = row.findIndex((c) => H_CREDIT.test(c) && !H_BALANCE.test(c))
    const notes = row.map((c, i) => (H_NOTE.test(c) && i !== date ? i : -1)).filter((i) => i >= 0)
    if (amount < 0 && (debit < 0 || credit < 0)) continue
    return { at, cols: { date, notes, ...(amount >= 0 ? { amount } : { debit, credit }) } }
  }
  return undefined
}

/** Sin cabecera: la columna con fechas, la numérica con signo y la de texto más largo */
function guessColumns(table: string[][]): Columns | undefined {
  const rows = table.slice(0, 30)
  const width = Math.max(...rows.map((r) => r.length))
  const share = (i: number, ok: (s: string) => boolean) => rows.filter((r) => r[i] && ok(r[i])).length / rows.length
  let date = -1
  for (let i = 0; i < width && date < 0; i++) if (share(i, (s) => !!readDate(s)) >= 0.6) date = i
  if (date < 0) return undefined
  const numeric = Array.from({ length: width }, (_, i) => i).filter((i) => i !== date && share(i, (s) => readAmount(s) !== undefined) >= 0.6)
  if (!numeric.length) return undefined
  // El importe es el que tiene negativos (el saldo suele ir después y siempre en positivo)
  const amount = numeric.find((i) => rows.some((r) => (readAmount(r[i] ?? '') ?? 0) < 0)) ?? numeric[0]
  const text = Array.from({ length: width }, (_, i) => i).filter((i) => i !== date && !numeric.includes(i))
  const len = (i: number) => rows.reduce((s, r) => s + (r[i]?.length ?? 0), 0)
  const note = text.sort((a, b) => len(b) - len(a))[0]
  return { date, notes: note === undefined ? [] : [note], amount }
}

// ── Conceptos ──────────────────────────────────────────────────

const NOISE = [
  /\b(?:compra|pago)\s+(?:con\s+)?(?:tarj(?:eta)?\.?|tj\.?|movil|m[oó]vil|contactless|apple\s*pay|google\s*pay)(?:\s+en)?\b/gi,
  /\b(?:compra|pago)\s+en\b/gi,
  /\btarj(?:eta)?\.?\s*:?\s*[*x\d]+/gi,
  /\b\d{4,}[x*]+\d*\b/gi,
  /[*x]{3,}\d+/gi,
  /\b(?:adeudo|cargo|recibo)(?:\s+(?:de|por|domiciliado|sepa))*\b/gi,
  /\b(?:transferencia|transf\.?)(?:\s+(?:inmediata|sepa|recibida|emitida|a\s+favor\s+de|de|a))*\b/gi,
  /\bref(?:erencia)?\.?\s*:?\s*\w*\d\w*/gi,
  /\b\d{2}[/.-]\d{2}(?:[/.-]\d{2,4})?\b/g,
  /\b\d{6,}\b/g,
]

/** «COMPRA TARJ. 5540XXXXXXXX1234 MERCADONA VALENCIA» → «Mercadona Valencia»; los bizum se quedan como «Bizum Ana» */
export function cleanNote(raw: string): string {
  let s = ` ${raw.replace(/\s+/g, ' ')} `
  for (const r of NOISE) s = s.replace(r, ' ')
  s = s.replace(/\bbizum\s+(?:de|a|enviado\s+a|recibido\s+de)\b/gi, 'Bizum').replace(/[,;:|]+/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^[\s.,;:*#-]+|[\s.,;:*#-]+$/g, '')
  if (!s) return raw.trim() || 'Movimiento'
  // Todo en mayúsculas (como lo escriben los bancos) → «Mercadona Valencia», «Traspaso a cuenta de ahorro»
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    s = s.charAt(0) + s.slice(1).replace(/\b(A|De|Del|La|El|Los|Las|En|Y|Con|Por|Para|Al)\b/g, (w) => w.toLowerCase())
  }
  return s.length > 60 ? `${s.slice(0, 57).trimEnd()}…` : s
}

/** Traspasos entre tus cuentas: ni gasto ni ingreso */
const TRANSFER = /\b(?:traspaso|transferencia\s+(?:entre|a)\s+(?:mis\s+)?cuentas?|transfer\s+(?:to|from)\s+(?:savings|pocket)|hucha|apartado|to\s+pocket|from\s+pocket|cuenta\s+de\s+ahorro|amortizaci[oó]n|liquidaci[oó]n\s+tarjeta|pago\s+tarjeta\s+cr[eé]dito)\b/i

// ── Todo junto ─────────────────────────────────────────────────

/** El texto o la tabla del banco → movimientos (sin las filas que no se entienden) */
export function parseBank(input: string | string[][]): BankRow[] {
  const table = typeof input === 'string' ? readTable(input) : input
  if (!table.length) return []
  const header = findHeader(table)
  const cols = header?.cols ?? guessColumns(table)
  if (!cols) return []
  const out: BankRow[] = []
  for (const r of table.slice(header ? header.at + 1 : 0)) {
    const date = readDate(r[cols.date] ?? '')
    if (!date) continue
    let amount: number | undefined
    if (cols.amount !== undefined) amount = readAmount(r[cols.amount] ?? '')
    else {
      const debit = readAmount(r[cols.debit!] ?? '')
      const credit = readAmount(r[cols.credit!] ?? '')
      amount = credit ? Math.abs(credit) : debit ? -Math.abs(debit) : undefined
    }
    if (!amount) continue
    // La primera columna de concepto que tenga algo (Concepto, Descripción, Movimiento…)
    const raw = cols.notes.map((i) => r[i]?.trim()).find(Boolean) ?? ''
    const note = cleanNote(raw)
    out.push({ date, note, amount: Math.abs(amount), kind: TRANSFER.test(raw) ? 'transfer' : amount < 0 ? 'expense' : 'income' })
  }
  return out
}

/**
 * Lo que ya está apuntado (mismo día e importe, uno por uno) no se vuelve a
 * traer: así se puede importar el mismo extracto dos veces, o uno que se
 * solapa con lo que apuntaste a mano.
 */
export function withoutKnown<T extends BankRow>(rows: T[], known: { date: string; amount: number }[]) {
  const left = new Map<string, number>()
  for (const k of known) left.set(`${k.date}|${k.amount}`, (left.get(`${k.date}|${k.amount}`) ?? 0) + 1)
  const fresh: T[] = []
  const repeated: T[] = []
  for (const r of rows) {
    const k = `${r.date}|${r.amount}`
    const n = left.get(k) ?? 0
    if (n > 0) {
      left.set(k, n - 1)
      repeated.push(r)
    } else fresh.push(r)
  }
  return { fresh, repeated }
}
