/**
 * Patrimonio: cuentas, bienes y deudas (el balance de Monarch o de la pestaña
 * «Patrimonio» de las plantillas de Excel), el plan para salir de deudas
 * (bola de nieve o avalancha), el fondo de emergencia y la independencia
 * financiera (la regla del 4 %). Sin dependencias: lo usan la app y Claude.
 */

export type AccountKind = 'cash' | 'bank' | 'savings' | 'investment' | 'pension' | 'property' | 'vehicle' | 'asset' | 'card' | 'loan' | 'mortgage' | 'debt'
export type AccountGroup = 'liquid' | 'invested' | 'property' | 'debt'

export const ACCOUNT_KINDS: { id: AccountKind; label: string; group: AccountGroup; icon: string }[] = [
  { id: 'bank', label: 'Cuenta corriente', group: 'liquid', icon: 'wallet' },
  { id: 'savings', label: 'Cuenta de ahorro', group: 'liquid', icon: 'leaf' },
  { id: 'cash', label: 'Efectivo', group: 'liquid', icon: 'wallet' },
  { id: 'investment', label: 'Inversiones (fondos, acciones…)', group: 'invested', icon: 'rocket' },
  { id: 'pension', label: 'Plan de pensiones', group: 'invested', icon: 'sun' },
  { id: 'property', label: 'Vivienda o local', group: 'property', icon: 'home' },
  { id: 'vehicle', label: 'Vehículo', group: 'property', icon: 'car' },
  { id: 'asset', label: 'Otro bien', group: 'property', icon: 'star' },
  { id: 'mortgage', label: 'Hipoteca', group: 'debt', icon: 'home' },
  { id: 'loan', label: 'Préstamo', group: 'debt', icon: 'key' },
  { id: 'card', label: 'Tarjeta de crédito', group: 'debt', icon: 'wallet' },
  { id: 'debt', label: 'Otra deuda', group: 'debt', icon: 'users' },
]

export const GROUPS: { id: AccountGroup; label: string }[] = [
  { id: 'liquid', label: 'Dinero disponible' },
  { id: 'invested', label: 'Inversiones' },
  { id: 'property', label: 'Bienes' },
  { id: 'debt', label: 'Deudas' },
]

export const kindOf = (k: string) => ACCOUNT_KINDS.find((x) => x.id === k) ?? ACCOUNT_KINDS[0]
export const groupOf = (k: string): AccountGroup => kindOf(k).group
export const isDebt = (k: string) => groupOf(k) === 'debt'

export interface AccountLike {
  id: string
  name: string
  kind: AccountKind
  /** lo que hay (o lo que se debe, en positivo) */
  balance: number
  /** interés anual en % (TIN de un préstamo o una tarjeta) */
  rate?: number
  /** cuota al mes (de una deuda) */
  payment?: number
  /** saldo de cada día en que cambió (YYYY-MM-DD), para la evolución */
  history?: { date: string; balance: number }[]
  archived?: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Patrimonio neto: lo que tienes menos lo que debes */
export function netWorth(accounts: AccountLike[]) {
  const byGroup: Record<AccountGroup, number> = { liquid: 0, invested: 0, property: 0, debt: 0 }
  for (const a of accounts) if (!a.archived) byGroup[groupOf(a.kind)] += a.balance
  for (const k of Object.keys(byGroup) as AccountGroup[]) byGroup[k] = round2(byGroup[k])
  const assets = round2(byGroup.liquid + byGroup.invested + byGroup.property)
  return { assets, debts: byGroup.debt, net: round2(assets - byGroup.debt), byGroup }
}

/** Saldo nuevo de hoy: se guarda en el historial (uno por día, los últimos 400) */
export function withBalance<T extends Pick<AccountLike, 'balance' | 'history'>>(a: T, balance: number, date: string): Pick<AccountLike, 'balance' | 'history'> {
  const value = round2(balance)
  return { balance: value, history: [...(a.history ?? []).filter((h) => h.date !== date), { date, balance: value }].sort((x, y) => x.date.localeCompare(y.date)).slice(-400) }
}

/** El saldo que tenía un día: el último apuntado hasta entonces (sin historial, el de ahora) */
export function balanceAt(a: Pick<AccountLike, 'balance' | 'history'>, date: string): number {
  if (!a.history?.length) return a.balance
  let v: number | undefined
  for (const h of a.history) if (h.date <= date) v = h.balance
  return v ?? 0
}

/** Último día de un mes (YYYY-MM) */
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/**
 * Patrimonio a final de cada mes (el de este mes, el de hoy), para la gráfica
 * de evolución: los meses antes de la primera cuenta no salen.
 */
export function netWorthSeries(accounts: AccountLike[], months: string[], today: string) {
  const live = accounts.filter((a) => !a.archived)
  const first = live.flatMap((a) => a.history?.map((h) => h.date) ?? []).sort()[0]
  return months
    .filter((m) => !first || monthEnd(m) >= first)
    .map((m) => {
      const day = m === today.slice(0, 7) ? today : monthEnd(m)
      let net = 0
      for (const a of live) net += (isDebt(a.kind) ? -1 : 1) * balanceAt(a, day)
      return { month: m, net: round2(net) }
    })
}

// ── Fondo de emergencia ────────────────────────────────────────

/**
 * Cuántos meses podrías vivir con el dinero disponible (cuentas y efectivo)
 * si mañana dejara de entrar nada. Lo aconsejable: de 3 a 6.
 */
export function emergencyFund(accounts: AccountLike[], monthlyOut: number, goal = 6) {
  const liquid = netWorth(accounts).byGroup.liquid
  const months = monthlyOut > 0 ? liquid / monthlyOut : undefined
  const target = round2(monthlyOut * goal)
  return { liquid, months, target, missing: round2(Math.max(0, target - liquid)), goal }
}

// ── Salir de deudas ────────────────────────────────────────────

export type DebtMethod = 'snowball' | 'avalanche'

export interface DebtPlan {
  /** meses hasta acabar con todas (undefined: con estas cuotas no se acaba nunca) */
  months?: number
  interest: number
  /** cada deuda, en el orden en que se acaba, con el mes (1 = el que viene) */
  payoffs: { id: string; name: string; month: number }[]
}

/**
 * Simula mes a mes el pago de las deudas con cuota. Cada mes se pagan los
 * intereses y la cuota de todas; lo que sobra (`extra` y las cuotas de las ya
 * pagadas, si `rollover`) va a la primera de la lista: la más pequeña en la
 * bola de nieve (Dave Ramsey: victorias rápidas) o la de interés más alto en
 * la avalancha (lo que menos intereses paga).
 */
export function debtPlan(debts: AccountLike[], extra = 0, method: DebtMethod = 'snowball', rollover = true, max = 600): DebtPlan {
  const list = debts
    .filter((d) => isDebt(d.kind) && !d.archived && d.balance > 0 && (d.payment ?? 0) > 0)
    .map((d) => ({ id: d.id, name: d.name, left: d.balance, rate: (d.rate ?? 0) / 1200, payment: d.payment! }))
    .sort((a, b) => (method === 'snowball' ? a.left - b.left || b.rate - a.rate : b.rate - a.rate || a.left - b.left))
  const budget = list.reduce((s, d) => s + d.payment, 0) + Math.max(0, extra)
  const payoffs: DebtPlan['payoffs'] = []
  let interest = 0
  for (let month = 1; month <= max && payoffs.length < list.length; month++) {
    let pool = rollover ? budget : Math.max(0, extra)
    for (const d of list) {
      if (d.left <= 0) continue
      const i = d.left * d.rate
      interest += i
      d.left += i
      const pay = Math.min(d.payment, d.left)
      d.left -= pay
      if (rollover) pool -= pay
    }
    // Lo que sobra, a la primera que quede (y si se acaba, a la siguiente)
    for (const d of list) {
      if (pool <= 0.005) break
      if (d.left <= 0) continue
      const pay = Math.min(pool, d.left)
      d.left -= pay
      pool -= pay
    }
    for (const d of list) {
      if (d.left <= 0.005 && !payoffs.some((p) => p.id === d.id)) {
        d.left = 0
        payoffs.push({ id: d.id, name: d.name, month })
      }
    }
  }
  const done = payoffs.length === list.length
  return { ...(done ? { months: payoffs.reduce((m, p) => Math.max(m, p.month), 0) } : {}), interest: round2(interest), payoffs }
}

/** YYYY-MM dentro de `n` meses desde `today` */
export function monthsFrom(today: string, n: number) {
  const [y, m] = today.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

// ── Independencia financiera ───────────────────────────────────

/**
 * La cifra con la que podrías vivir de tus ahorros (la regla del 4 % de los
 * calculadores FIRE: 25 veces lo que gastas al año) y cuánto tardarías en
 * llegar ahorrando lo de ahora con una rentabilidad real (descontada la
 * inflación) del `realReturn`.
 */
export function financialIndependence({ annualSpend, invested, monthlySaving, realReturn = 0.05, withdrawRate = 0.04 }: { annualSpend: number; invested: number; monthlySaving: number; realReturn?: number; withdrawRate?: number }) {
  const target = round2(annualSpend / withdrawRate)
  const progress = target > 0 ? Math.max(0, invested) / target : 0
  const monthsTo = (saving: number) => {
    let v = Math.max(0, invested)
    const r = Math.pow(1 + realReturn, 1 / 12) - 1
    for (let m = 0; m <= 1200; m++) {
      if (v >= target) return m
      v = v * (1 + r) + saving
      if (saving <= 0 && v <= 0) return undefined
    }
    return undefined
  }
  const months = target > 0 ? monthsTo(monthlySaving) : undefined
  const faster = target > 0 && months !== undefined ? monthsTo(monthlySaving + 100) : undefined
  return { target, progress, months, ...(months !== undefined && faster !== undefined ? { gainPer100: months - faster } : {}) }
}

/** Lo que tienes para invertir o ya invertido, sin la casa ni el coche, menos lo que debes que no es la hipoteca */
export function investable(accounts: AccountLike[]) {
  let v = 0
  for (const a of accounts) {
    if (a.archived) continue
    const g = groupOf(a.kind)
    if (g === 'liquid' || g === 'invested') v += a.balance
    else if (g === 'debt' && a.kind !== 'mortgage') v -= a.balance
  }
  return round2(v)
}
