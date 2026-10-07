/**
 * Cuándo avisar de un pago, una cosa o algo de «Última vez», y lo mínimo para
 * apuntarlos: lo usan los ganchos de la base de datos y las acciones al
 * arrancar, sin traer el resto de finance.ts, things.ts y trackers.ts.
 */
import { addMonths, addYears, getDaysInMonth } from 'date-fns'
import type { BillingCycle, Subscription, Thing, Tracker } from '@/db/types'
import { addDaysYmd, fromYmd, today, ymd } from './dates'
import { DEFAULT_REMIND_TIME, dueMoment } from './reminders'

// ── Pagos ──────────────────────────────────────────────────────

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

// ── Cosas ──────────────────────────────────────────────────────

/** Días antes de caducar para avisar, por defecto */
export const DEFAULT_NOTIFY_DAYS = 30

function at(date: string, hh: number) {
  const d = fromYmd(date)
  d.setHours(hh, 0, 0, 0)
  return d.getTime()
}

/**
 * Cuándo avisar de una cosa:
 * - lo que caduca: `notifyDays` antes, a las 9:00;
 * - lo prestado con fecha: ese día, a las 10:00 («¿te lo ha devuelto?»);
 * - lo que me prestaron con fecha: el día antes, a las 9:00.
 * Si se apunta algo que ya está dentro del margen (caduca en 10 días y se
 * avisa 30 antes), se avisa a las 9:00 siguientes, mientras no haya caducado.
 * Lo que ya pasó no se avisa (no se reenvía lo antiguo).
 */
export function computeThingRemindAt(t: Pick<Thing, 'kind' | 'expires' | 'notifyDays' | 'returnBy' | 'returned' | 'warranty'>, now = Date.now()): number | undefined {
  /** `days` antes de `date`, a las 9; ya dentro del margen, a las 9 siguientes (si no ha pasado) */
  const before = (date: string, days: number) => {
    let when: number | undefined = at(addDaysYmd(date, -days), 9)
    if (when <= now) {
      const next = new Date(now)
      if (next.getHours() >= 9) next.setDate(next.getDate() + 1)
      next.setHours(9, 0, 0, 0)
      when = next.getTime() <= at(date, 9) ? next.getTime() : undefined
    }
    return when
  }
  let when: number | undefined
  if (t.kind === 'document' && t.expires) when = before(t.expires, t.notifyDays ?? DEFAULT_NOTIFY_DAYS)
  else if (t.kind === 'lent' && t.returnBy && !t.returned) when = at(t.returnBy, 10)
  else if (t.kind === 'borrowed' && t.returnBy && !t.returned) when = at(addDaysYmd(t.returnBy, -1), 9)
  // Lo que no tiene otro aviso: el fin de la garantía, un mes antes
  if ((when === undefined || when <= now) && t.warranty && !t.returned) when = before(t.warranty, DEFAULT_NOTIFY_DAYS)
  return when !== undefined && when > now ? when : undefined
}

// ── Última vez ─────────────────────────────────────────────────

/** Añade una fecha al historial (sin repetir, de más reciente a más antigua) */
export function withDate(log: string[], date: string) {
  return [...new Set([date, ...log])].sort((a, b) => b.localeCompare(a)).slice(0, 200)
}

/** Aviso: el día que toca, a las 10:00. Si ya pasó, a las 10:00 siguientes (una vez). Lo que se quiere dejar no avisa. */
export function computeTrackerRemindAt(t: Pick<Tracker, 'log' | 'every' | 'archived' | 'avoid'>, now = Date.now()): number | undefined {
  if (t.avoid || !t.every || !t.log[0] || t.archived) return undefined
  const at = fromYmd(addDaysYmd(t.log[0], t.every))
  at.setHours(10, 0, 0, 0)
  if (at.getTime() > now) return at.getTime()
  const next = new Date(now)
  if (next.getHours() >= 10) next.setDate(next.getDate() + 1)
  next.setHours(10, 0, 0, 0)
  return next.getTime()
}
