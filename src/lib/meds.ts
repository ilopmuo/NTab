export {
  EARLY_MINUTES,
  LATE_MINUTES,
  NAG_MINUTES,
  activeOn,
  adherence,
  asNeeded,
  cleanTimes,
  dailyUse,
  daysLeft,
  doseLogId,
  doseText,
  doseToTake,
  dosesOn,
  extraTaken,
  findMed,
  lastTaken,
  medReminder,
  medsSummary,
  minutesOf,
  nagIndex,
  needsRefill,
  perDoseOf,
  stockAfter,
  takeLog,
  treatmentDay,
  type Dose,
  type DoseState,
} from '../../supabase/functions/_shared/meds.ts'

/** Colores de las pastillas (como en Apple Salud): para reconocerlas de un vistazo */
export const PILL_COLORS = ['#F2F2F7', '#FF9F0A', '#FF453A', '#0A84FF', '#30D158', '#BF5AF2', '#FFD60A', '#AC8E68']

/** «HH:MM» de ahora */
export const nowHHMM = () => new Date().toTimeString().slice(0, 5)

/** '09:00' → '9:00' */
export const shortTime = (hhmm: string) => hhmm.replace(/^0(\d)/, '$1')

const DAY_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
/** «9:00 y 21:00 · cada día», «9:00 · L, X y V», «Cuando haga falta» */
export function scheduleLabel(m: { times: string[]; days?: number[] }) {
  if (!m.times.length) return 'Cuando haga falta'
  const times = m.times.map(shortTime)
  const at = times.length > 1 ? `${times.slice(0, -1).join(', ')} y ${times.at(-1)}` : times[0]
  if (!m.days?.length || m.days.length >= 7) return `${at} · cada día`
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => m.days!.includes(d)).map((d) => DAY_SHORT[d])
  return `${at} · ${days.length > 1 ? `${days.slice(0, -1).join(', ')} y ${days.at(-1)}` : days[0]}`
}
