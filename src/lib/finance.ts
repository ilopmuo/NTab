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
