/**
 * El dinero desde Claude y Siri: apuntar ingresos («he cobrado la nómina»),
 * el resumen del mes (lo que entra, sale y queda, 50/30/20), el patrimonio y
 * el saldo de una cuenta o deuda. Misma lógica que la app
 * (../_shared/money.ts y ../_shared/wealth.ts) sobre los registros de la
 * sincronización.
 */
import { addDays, ymdIn } from '../_shared/time.ts'
import { CATEGORIES, fold, guessCategories, money, monthSummary, ruleKey, type Budget } from '../_shared/expenses.ts'
import { spendingAdvice, totalSaving } from '../_shared/advice.ts'
import { INCOME_CATEGORIES, averageFlow, incomeCat, incomeCategoryFor, lastIncomeLike, monthFlow, parseIncome, pendingIncomes, rule503020 } from '../_shared/money.ts'
import { ACCOUNT_KINDS, debtPlan, emergencyFund, financialIndependence, groupOf, investable, isDebt, kindOf, monthsFrom, netWorth, withBalance, type AccountKind, type AccountLike } from '../_shared/wealth.ts'
import { catLabel, expenseRows, findByName, isYmd, relDay, type Env, type Row, type WriteResult } from './ntab.ts'

type Data = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const r2 = (n: number) => Math.round(n * 100) / 100
const pct = (n: number) => `${Math.round(n * 100)} %`

export function incomeRows(rows: Row[]) {
  return rows
    .filter((r) => r.tbl === 'incomes' && typeof r.data.amount === 'number' && isYmd(r.data.date))
    .map((r) => ({ amount: r.data.amount as number, category: str(r.data.category) || 'otros', date: r.data.date as string, note: str(r.data.note) }))
}

const PER_YEAR: Record<string, number> = { week: 52, month: 12, quarter: 4, year: 1 }
/** Lo que cuestan al mes los pagos fijos en euros: recibos (lo necesario) y suscripciones */
export function fixedOf(rows: Row[]) {
  let needs = 0
  let wants = 0
  for (const r of rows) {
    if (r.tbl !== 'subscriptions' || r.data.active === false || (str(r.data.currency) || 'EUR') !== 'EUR') continue
    const m = (num(r.data.amount) * (PER_YEAR[str(r.data.cycle)] ?? 12)) / 12
    if (r.data.kind === 'bill') needs += m
    else wants += m
  }
  return { total: r2(needs + wants), needs: r2(needs), wants: r2(wants) }
}

export function accountRows(rows: Row[]): (AccountLike & Data)[] {
  return rows
    .filter((r) => r.tbl === 'accounts' && typeof r.data.balance === 'number' && !r.data.archived)
    .map((r) => ({ ...r.data, id: r.id, name: str(r.data.name), kind: (str(r.data.kind) || 'bank') as AccountKind, balance: r.data.balance as number }))
}

// ── Apuntar un ingreso ─────────────────────────────────────────

export function addIncomeTool(rows: Row[], args: { texto?: string; importe?: number; concepto?: string; categoria?: string; fecha?: string }, env: Env): WriteResult {
  const today = ymdIn(env.now, env.tz)
  const all = incomeRows(rows)
  let amount: number | undefined
  let note = str(args.concepto).trim()
  let date = isYmd(args.fecha) && args.fecha <= today ? args.fecha : today
  if (args.texto) {
    const p = parseIncome(str(args.texto))
    if (p) {
      amount = p.amount
      note = note || p.note
      if (!isYmd(args.fecha)) date = addDays(today, -p.daysAgo)
    } else note = note || str(args.texto).replace(/^(?:la|el|los|las|una?)\s+/i, '').replace(/[\s,.;:]+$/, '').trim()
  }
  if (typeof args.importe === 'number' && args.importe > 0) amount = r2(args.importe)
  // «Me ha llegado la nómina»: lo mismo que la última vez
  const last = !amount && note ? lastIncomeLike(all, note) : undefined
  if (last) {
    amount = last.amount
    note = last.note
  }
  if (!amount) return { writes: [], report: ['Falta el importe del ingreso.'] }
  note = note ? note.charAt(0).toUpperCase() + note.slice(1) : 'Ingreso'
  const category = INCOME_CATEGORIES.some((c) => c.id === args.categoria) ? args.categoria! : (last?.category ?? incomeCategoryFor(note))
  const id = env.newId()
  const month = date.slice(0, 7)
  const flow = monthFlow(expenseRows(rows), [...all, { amount, date }], month, fixedOf(rows).total)
  return {
    writes: [{ tbl: 'incomes', id, data: { id, amount, note, category, date, createdAt: env.now } }],
    report: [`Apuntado: +${money(amount)} · ${note} (${incomeCat(category).label}, ${relDay(date, today)}${last ? ', lo mismo que la última vez' : ''}). Este mes entran ${money(flow.income)} y salen ${money(flow.out)}: ${flow.saved >= 0 ? `quedan ${money(flow.saved)}` : `faltan ${money(-flow.saved)}`}.`],
  }
}

// ── Ver el dinero ──────────────────────────────────────────────

export function viewFinance(rows: Row[], args: { mes?: string }, env: Env): string {
  const today = ymdIn(env.now, env.tz)
  const month = /^\d{4}-\d{2}$/.test(str(args.mes)) ? str(args.mes) : today.slice(0, 7)
  const expenses = expenseRows(rows)
  const incomes = incomeRows(rows)
  const fixed = fixedOf(rows)
  const flow = monthFlow(expenses, incomes, month, fixed.total)
  const lines = [
    `DINERO DE ${month}: entran ${money(flow.income)}, salen ${money(flow.out)} (${money(flow.spent)} en gastos apuntados y ${money(flow.fixed)} de pagos fijos al mes) y ${flow.saved >= 0 ? `quedan ${money(flow.saved)}` : `faltan ${money(-flow.saved)}`}${flow.rate !== undefined ? ` (tasa de ahorro ${pct(flow.rate)})` : ''}.`,
  ]
  const inMonth = incomes.filter((e) => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date))
  if (inMonth.length) lines.push('Ingresos:', ...inMonth.slice(0, 10).map((e) => `- ${e.date} +${money(e.amount)} ${e.note} (${incomeCat(e.category).label})`))
  const pending = month === today.slice(0, 7) ? pendingIncomes(incomes, month) : []
  if (pending.length) lines.push(`Aún no ha llegado (suele llegar): ${pending.map((p) => `${p.note} ${money(p.amount)} hacia el día ${p.day}`).join(', ')}.`)
  if (flow.income > 0 && !pending.length) {
    const r = rule503020(monthSummary(expenses, month, today).byCategory, flow.income, fixed.needs, fixed.wants)
    lines.push(`50/30/20: lo necesario ${pct(r.pctNeeds)} (${money(Math.round(r.needs))}), caprichos ${pct(r.pctWants)} (${money(Math.round(r.wants))}), queda ${pct(r.pctSavings)}.`)
  }
  const avg = averageFlow(expenses, incomes, today.slice(0, 7), fixed.total)
  if (avg) lines.push(`Un mes normal (media de ${avg.months}): entran ${money(Math.round(avg.income))}, salen ${money(Math.round(avg.out))}.`)
  const tips = adviceOf(rows, env)
  if (tips.length) {
    const save = totalSaving(tips)
    lines.push(`\nCONSEJOS PARA GASTAR MENOS${save >= 10 ? ` (podría ahorrar unos ${money(save)} al mes)` : ''}:`, ...tips.slice(0, 6).map((t) => `- ${t.title}: ${t.body}`))
  }

  const accounts = accountRows(rows)
  if (accounts.length) {
    const nw = netWorth(accounts)
    lines.push(`\nPATRIMONIO NETO: ${money(Math.round(nw.net))} (tiene ${money(Math.round(nw.assets))}, debe ${money(Math.round(nw.debts))}).`)
    lines.push(...accounts.map((a) => `- ${a.name} (${kindOf(a.kind).label}): ${isDebt(a.kind) ? '−' : ''}${money(a.balance)}${isDebt(a.kind) && a.rate !== undefined ? `, ${a.rate} %` : ''}${isDebt(a.kind) && a.payment ? `, cuota ${money(a.payment)}/mes` : ''}`))
    const out = avg?.out ?? 0
    if (out > 0) {
      const fund = emergencyFund(accounts, out)
      lines.push(`Colchón: ${fund.months!.toFixed(1)} meses de gastos con el dinero disponible (${money(Math.round(fund.liquid))}).`)
      const fi = financialIndependence({ annualSpend: out * 12, invested: investable(accounts), monthlySaving: avg && avg.income > 0 ? avg.saved : 0 })
      lines.push(`Independencia financiera (regla del 4 %): necesitaría ${money(Math.round(fi.target))}, lleva el ${pct(fi.progress)}${fi.months !== undefined ? `; a este ritmo, en ${monthsFrom(today, fi.months)}` : ''}.`)
    }
    const debts = accounts.filter((a) => isDebt(a.kind) && a.balance > 0)
    if (debts.length) {
      const plan = debtPlan(debts, 0, 'avalanche')
      if (plan.months !== undefined) lines.push(`Deudas: pagando las cuotas (y pasando lo que se libera a la siguiente), sin deudas en ${monthsFrom(today, plan.months)}, con ${money(Math.round(plan.interest))} de intereses.`)
    }
  }
  return lines.join('\n')
}

/** Los consejos para gastar menos con sus datos (los mismos que la app) */
export function adviceOf(rows: Row[], env: Env) {
  const today = ymdIn(env.now, env.tz)
  const expenses = expenseRows(rows)
  const fixed = fixedOf(rows)
  const avg = averageFlow(expenses, incomeRows(rows), today.slice(0, 7), fixed.total)
  const budget = rows.find((r) => r.tbl === 'settings' && r.id === 'budget')?.data.value as Budget | undefined
  const subs = rows.filter((r) => r.tbl === 'subscriptions').map((r) => ({ name: str(r.data.name), amount: num(r.data.amount), cycle: str(r.data.cycle) || 'month', active: r.data.active !== false, currency: str(r.data.currency) || 'EUR' }))
  return spendingAdvice({ expenses, today, budget, subs, flow: avg && avg.income > 0 ? avg : undefined })
}

// ── Clasificar ─────────────────────────────────────────────────

/**
 * Responder «¿de qué es este gasto?»: por id o por concepto; aprende la
 * categoría para los próximos con ese concepto y la aplica a los que siguen
 * sin clasificar con el mismo (como en la app).
 */
export function classifyExpenseTool(rows: Row[], args: { id?: string; concepto?: string; categoria?: string }, _env: Env): WriteResult {
  const all = rows.filter((r) => r.tbl === 'expenses')
  const pending = all.filter((r) => r.data.unclassified)
  const want = fold(str(args.categoria))
  const category = CATEGORIES.find((c) => c.id === args.categoria || fold(c.label) === want || fold(c.label).startsWith(want))?.id
  if (!category) return { writes: [], report: [`Categoría no válida. Opciones: ${CATEGORIES.map((c) => `${c.id} (${c.label})`).join(', ')}.`] }
  const pick = (list: Row[]) => (args.id ? list.find((r) => r.id === args.id) : args.concepto ? list.find((r) => fold(str(r.data.note)) === fold(str(args.concepto))) ?? list.find((r) => fold(str(r.data.note)).includes(fold(str(args.concepto)))) : list[0])
  const target = pick(pending) ?? pick(all)
  if (!target) return { writes: [], report: [pending.length ? 'No encuentro ese gasto.' : 'No hay gastos sin clasificar.'] }
  const key = ruleKey(str(target.data.note))
  const same = key ? pending.filter((r) => r.id !== target.id && ruleKey(str(r.data.note)) === key) : []
  const clean = (r: Row) => {
    const { unclassified: _, ...data } = r.data
    return { tbl: 'expenses', id: r.id, data: { ...data, category } }
  }
  const rules = (rows.find((r) => r.tbl === 'settings' && r.id === 'expenseRules')?.data.value as Record<string, string> | undefined) ?? {}
  const writes = [clean(target), ...same.map(clean), ...(key ? [{ tbl: 'settings', id: 'expenseRules', data: { key: 'expenseRules', value: { ...rules, [key]: category } } }] : [])]
  const left = pending.length - 1 - same.length
  return {
    writes,
    report: [
      `«${str(target.data.note)}» (${money(num(target.data.amount))}) es de ${catLabel(category)}${same.length ? (same.length === 1 ? ', y otro igual' : `, y ${same.length} más iguales`) : ''}. Los próximos con ese concepto irán ahí.${left > 0 ? ` ${left === 1 ? 'Queda 1' : `Quedan ${left}`} sin clasificar.` : ''}`,
    ],
  }
}

/** Los gastos sin clasificar, para ver_gastos (con las categorías probables) */
export function unclassifiedLines(rows: Row[]): string[] {
  const all = expenseRows(rows)
  const pending = all.filter((e) => e.unclassified).sort((a, b) => b.date.localeCompare(a.date))
  if (!pending.length) return []
  return [
    `SIN CLASIFICAR (${pending.length}; pregúntale de qué son y usa clasificar_gasto):`,
    ...pending.slice(0, 10).map((e) => `- [${e.id}] ${e.date} ${money(e.amount)} ${e.note} (¿${guessCategories(e.note, all, 3).map(catLabel).join(', ')}?)`),
  ]
}

// ── Cuentas ────────────────────────────────────────────────────

const KIND_WORDS: [RegExp, AccountKind][] = [
  [/hipoteca/i, 'mortgage'],
  [/pr[eé]stamo|cr[eé]dito\s+personal/i, 'loan'],
  [/tarjeta/i, 'card'],
  [/deuda|le\s+debo/i, 'debt'],
  [/pensi[oó]n|pensiones|epsv/i, 'pension'],
  [/fondo|indexa|acciones|bolsa|broker|cripto|bitcoin|myinvestor|etf|inversi[oó]n/i, 'investment'],
  [/ahorro|remunerada|dep[oó]sito|hucha|trade\s*republic/i, 'savings'],
  [/efectivo|cartera|met[aá]lico/i, 'cash'],
  [/piso|casa|vivienda|local|terreno|garaje/i, 'property'],
  [/coche|moto|furgoneta|veh[ií]culo/i, 'vehicle'],
]

/** Cuenta nueva o saldo nuevo de una (con su historial) */
export function updateAccount(rows: Row[], args: { nombre?: string; saldo?: number; tipo?: string; interes?: number; cuota?: number; notas?: string }, env: Env): WriteResult {
  const today = ymdIn(env.now, env.tz)
  const name = str(args.nombre).trim()
  if (!name) return { writes: [], report: ['Falta el nombre de la cuenta.'] }
  const list: Data[] = rows.filter((r) => r.tbl === 'accounts').map((r) => ({ ...r.data, id: r.id }))
  const old = findByName(list, name)
  const kind = (ACCOUNT_KINDS.some((k) => k.id === args.tipo) ? args.tipo : (old?.kind ?? KIND_WORDS.find(([re]) => re.test(name))?.[1] ?? 'bank')) as AccountKind
  const balance = typeof args.saldo === 'number' && args.saldo >= 0 ? r2(args.saldo) : old ? num(old.balance) : undefined
  if (balance === undefined) return { writes: [], report: [`¿Cuánto ${isDebt(kind) ? 'debes en' : 'hay en'} «${name}»?`] }
  const id = old ? String(old.id) : env.newId()
  const order = Math.max(0, ...list.map((a) => num(a.order))) + 1
  const data: Data = {
    ...(old ?? { createdAt: env.now, order }),
    id,
    name: old ? str(old.name) : name.charAt(0).toUpperCase() + name.slice(1),
    kind,
    ...withBalance({ balance: num(old?.balance), history: Array.isArray(old?.history) ? (old.history as { date: string; balance: number }[]) : undefined }, balance, today),
    ...(typeof args.interes === 'number' && args.interes >= 0 ? { rate: args.interes } : {}),
    ...(typeof args.cuota === 'number' && args.cuota > 0 ? { payment: r2(args.cuota) } : {}),
    ...(args.notas ? { notes: args.notas } : {}),
    updatedAt: env.now,
  }
  const before = old ? num(old.balance) : undefined
  const next = rows.filter((r) => !(r.tbl === 'accounts' && r.id === id)).concat({ tbl: 'accounts', id, data })
  const nw = netWorth(accountRows(next))
  const change = before !== undefined && before !== balance ? ` (antes ${money(before)})` : ''
  return {
    writes: [{ tbl: 'accounts', id, data }],
    report: [`${old ? 'Actualizada' : 'Añadida'} «${str(data.name)}» (${kindOf(kind).label}): ${isDebt(kind) ? 'debe ' : ''}${money(balance)}${change}. Patrimonio neto: ${money(Math.round(nw.net))}.`],
  }
}

// ── Siri ───────────────────────────────────────────────────────

/** «¿cuánto me queda este mes?», «¿cuánto he ahorrado?», «¿cómo voy de dinero?» */
export const FLOW_Q = /^(?:cu[aá]nto\s+(?:me\s+queda(?:\s+(?:este\s+mes|de\s+dinero|para\s+fin\s+de\s+mes))?|(?:he|llevo)\s+ahorrado|ahorro)|c[oó]mo\s+(?:voy|ando|estoy)\s+de\s+dinero|cu[aá]nto\s+(?:he\s+cobrado|me\s+ha\s+entrado))(?=\s|$)/i
/** «¿cuánto tengo?», «¿cuál es mi patrimonio?», «¿cuánto debo?» */
export const WORTH_Q = /^(?:cu[aá]nto\s+(?:dinero\s+)?(?:tengo|debo)(?:\s+(?:en\s+total|ahorrado))?|cu[aá]l\s+es\s+mi\s+patrimonio|mi\s+patrimonio)$/i

/** «¿cómo puedo ahorrar?», «¿cómo gasto menos?», «dame un consejo para ahorrar», «¿en qué se me va el dinero?», «¿en qué gasto más?» */
export const SAVE_Q = /^(?:(?:c[oó]mo\s+(?:puedo\s+)?(?:ahorrar|ahorro|gastar\s+menos|gasto\s+menos))|(?:dame\s+)?(?:un\s+)?consejos?\s+para\s+(?:ahorrar|gastar\s+menos)|en\s+qu[eé]\s+(?:se\s+me\s+va\s+el\s+dinero|gasto\s+m[aá]s|me\s+gasto\s+m[aá]s))(?=\s|$)/i

export function moneyVoice(rows: Row[], text: string, env: Env): string | undefined {
  const today = ymdIn(env.now, env.tz)
  if (SAVE_Q.test(text)) {
    const s = monthSummary(expenseRows(rows).filter((e) => !e.unclassified), today.slice(0, 7), today)
    const top = s.byCategory[0]
    const tips = adviceOf(rows, env)
    const first = (t: { title: string; body: string }) => `${t.title}: ${t.body.split(/(?<=\.)\s/)[0]}`
    const where = top && /gasto\s+m[aá]s|se\s+me\s+va/i.test(text) ? `Este mes, lo que más: ${catLabel(top.id).toLowerCase()}, ${money(Math.round(top.amount))}. ` : ''
    if (!tips.length) return `${where}No veo nada que recortar ahora mismo: vas bien.`
    const save = totalSaving(tips)
    return `${where}${save >= 10 ? `Podrías ahorrar unos ${money(save)} al mes. ` : ''}${first(tips[0])}${tips[1] ? ` También: ${tips[1].title.charAt(0).toLowerCase()}${tips[1].title.slice(1)}.` : ''}`
  }
  if (FLOW_Q.test(text)) {
    const flow = monthFlow(expenseRows(rows), incomeRows(rows), today.slice(0, 7), fixedOf(rows).total)
    if (!flow.income && !flow.out) return 'Este mes no hay nada apuntado.'
    const pending = pendingIncomes(incomeRows(rows), today.slice(0, 7))
    return `Este mes han entrado ${money(Math.round(flow.income))} y han salido ${money(Math.round(flow.out))}, contando los pagos fijos: ${flow.saved >= 0 ? `te quedan ${money(Math.round(flow.saved))}` : `faltan ${money(Math.round(-flow.saved))}`}.${pending.length ? ` Aún no ha llegado ${pending.map((p) => p.note.toLowerCase()).join(' ni ')}.` : ''}`
  }
  if (WORTH_Q.test(text)) {
    const accounts = accountRows(rows)
    if (!accounts.length) return 'No tienes cuentas apuntadas: se añaden en Dinero → Cuentas.'
    const nw = netWorth(accounts)
    if (/debo/i.test(text)) return nw.debts ? `Debes ${money(Math.round(nw.debts))} en total.` : 'No tienes deudas apuntadas.'
    const liquid = accounts.filter((a) => groupOf(a.kind) === 'liquid').reduce((s, a) => s + a.balance, 0)
    return `Tu patrimonio neto es de ${money(Math.round(nw.net))}: tienes ${money(Math.round(nw.assets))}${nw.debts ? ` y debes ${money(Math.round(nw.debts))}` : ''}. Disponible en cuentas, ${money(Math.round(liquid))}.`
  }
  return undefined
}
