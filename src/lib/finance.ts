import { addMonths, addYears, getDaysInMonth } from 'date-fns'
import type { BillingCycle, Subscription } from '@/db/types'
import { addDaysYmd, diffDays, fromYmd, today, ymd } from './dates'
import { DEFAULT_REMIND_TIME, dueMoment } from './reminders'

export const CYCLES: { value: BillingCycle; label: string; per: string }[] = [
  { value: 'week', label: 'Semanal', per: 'semana' },
  { value: 'month', label: 'Mensual', per: 'mes' },
  { value: 'quarter', label: 'Trimestral', per: 'trimestre' },
  { value: 'year', label: 'Anual', per: 'año' },
]

/** Cuántas veces se cobra al año */
const PER_YEAR: Record<BillingCycle, number> = { week: 52, month: 12, quarter: 4, year: 1 }

export const yearly = (s: Pick<Subscription, 'amount' | 'cycle'>) => s.amount * PER_YEAR[s.cycle]
export const monthly = (s: Pick<Subscription, 'amount' | 'cycle'>) => yearly(s) / 12

/** Siguiente cargo tras `from`. En los meses se respeta el día original (31 → 28/29 → 31). */
export function advanceCharge(from: string, cycle: BillingCycle, anchorDay?: number): string {
  if (cycle === 'week') return addDaysYmd(from, 7)
  const d = fromYmd(from)
  const next = cycle === 'year' ? addYears(d, 1) : addMonths(d, cycle === 'quarter' ? 3 : 1)
  if (anchorDay) next.setDate(Math.min(anchorDay, getDaysInMonth(next)))
  return ymd(next)
}

/** Primer cargo en `ref` o después */
export function rollForward(s: Pick<Subscription, 'nextDate' | 'cycle' | 'anchorDay'>, ref = today()): string {
  let d = s.nextDate
  for (let i = 0; d < ref && i < 1000; i++) d = advanceCharge(d, s.cycle, s.anchorDay)
  return d
}

/** Cuándo avisar de un cargo: `notifyDays` antes, a las 09:00 */
export function computeSubRemindAt(s: Pick<Subscription, 'nextDate' | 'notifyDays' | 'active'>): number | undefined {
  if (!s.active || s.notifyDays == null || !s.nextDate) return undefined
  return dueMoment(addDaysYmd(s.nextDate, -s.notifyDays), DEFAULT_REMIND_TIME)
}

export function money(amount: number, currency = 'EUR', decimals?: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals ?? (Number.isInteger(amount) ? 0 : 2),
    maximumFractionDigits: decimals ?? 2,
  }).format(amount)
}

/** "hoy", "mañana", "en 5 días", "hace 2 días" */
export function chargeWhen(date: string, ref = today()): string {
  const n = diffDays(date, ref)
  if (n === 0) return 'Hoy'
  if (n === 1) return 'Mañana'
  if (n === -1) return 'Ayer'
  if (n < 0) return `Hace ${-n} días`
  if (n < 7) return `En ${n} días`
  return fromYmd(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export const NOTIFY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: 'none', label: 'Sin aviso', days: null },
  { value: '0', label: 'El mismo día', days: 0 },
  { value: '1', label: '1 día antes', days: 1 },
  { value: '2', label: '2 días antes', days: 2 },
  { value: '3', label: '3 días antes', days: 3 },
  { value: '7', label: '1 semana antes', days: 7 },
]

// ── Pruebas gratis, subidas de precio y previsión ──────────────

/** ¿Está en la prueba gratis? (el próximo cargo es el primero, cuando acaba) */
export const inTrial = (s: Pick<Subscription, 'trialEnds' | 'nextDate'>, ref = today()) => !!s.trialEnds && s.nextDate === s.trialEnds && s.trialEnds >= ref

/**
 * La última subida (o bajada) de precio, si fue en los últimos `days` días
 * (como los avisos de subidas de Rocket Money).
 */
export function priceChange(s: Pick<Subscription, 'amount' | 'priceHistory'>, ref = today(), days = 90) {
  const last = s.priceHistory?.at(-1)
  if (!last || last.amount === s.amount || diffDays(ref, last.date) > days) return undefined
  const diff = Math.round((s.amount - last.amount) * 100) / 100
  return { from: last.amount, to: s.amount, diff, pct: Math.round((diff / last.amount) * 100), date: last.date }
}

/** Lo que han subido tus pagos en el último año, en € al año */
export function yearlyIncrease(subs: Pick<Subscription, 'amount' | 'cycle' | 'priceHistory' | 'active' | 'currency'>[], ref = today()) {
  let n = 0
  let total = 0
  for (const s of subs) {
    if (!s.active || s.currency !== 'EUR') continue
    const c = priceChange(s, ref, 365)
    if (c && c.diff > 0) {
      n++
      total += yearly({ amount: c.diff, cycle: s.cycle })
    }
  }
  return { count: n, perYear: Math.round(total * 100) / 100 }
}

/** Precio nuevo: guarda el anterior en el historial */
export function withNewPrice<T extends Pick<Subscription, 'amount' | 'priceHistory'>>(s: T, amount: number, ref = today()): Pick<Subscription, 'amount' | 'priceHistory'> {
  if (amount === s.amount) return { amount, priceHistory: s.priceHistory }
  return { amount, priceHistory: [...(s.priceHistory ?? []), { date: ref, amount: s.amount }].slice(-12) }
}

/**
 * Previsión (como la de Chronicle): los cargos de cada uno de los próximos
 * `n` meses, desde el mes de `ref`. Lo vencido sin pagar cuenta en el primero.
 */
export function forecast(subs: Subscription[], ref = today(), n = 12) {
  const first = `${ref.slice(0, 7)}-01`
  const months = Array.from({ length: n }, (_, i) => ymd(addMonths(fromYmd(first), i)).slice(0, 7))
  const end = ymd(addMonths(fromYmd(first), n))
  const out = months.map((month) => ({ month, total: 0, charges: [] as { sub: Subscription; date: string; amount: number }[] }))
  for (const s of subs) {
    if (!s.active || !s.nextDate) continue
    let d = s.nextDate
    for (let i = 0; d < end && i < 400; i++) {
      const slot = d < first ? out[0] : out.find((m) => d.startsWith(m.month))
      if (slot) {
        slot.charges.push({ sub: s, date: d, amount: s.amount })
        if (s.currency === 'EUR') slot.total = Math.round((slot.total + s.amount) * 100) / 100
      }
      d = advanceCharge(d, s.cycle, s.anchorDay)
    }
  }
  for (const m of out) m.charges.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/**
 * Lo que cuestan al mes los pagos fijos en euros: los recibos (alquiler, luz…)
 * cuentan como lo necesario y las suscripciones como caprichos (para el 50/30/20).
 */
export function fixedMonthly(subs: Pick<Subscription, 'amount' | 'cycle' | 'active' | 'currency' | 'kind'>[]) {
  let needs = 0
  let wants = 0
  for (const s of subs) {
    if (!s.active || s.currency !== 'EUR') continue
    if (s.kind === 'bill') needs += monthly(s)
    else wants += monthly(s)
  }
  const r = (n: number) => Math.round(n * 100) / 100
  return { total: r(needs + wants), needs: r(needs), wants: r(wants) }
}
