/**
 * Medicación (como Medicamentos de Apple Salud, Medisafe o MyTherapy): cada
 * medicamento con sus horas, «¿me la he tomado?» con la hora exacta, avisos que
 * insisten hasta marcarla, lo que queda en la caja y cuándo reponer. Sin
 * dependencias de la app: lo usan la app (src/lib/meds.ts), los avisos del
 * servidor y el conector de Claude. Fechas 'YYYY-MM-DD', horas 'HH:MM'.
 */
import { addDays, diffDays, weekday } from './time.ts'
import { normalize } from './text.ts'

export interface MedLike {
  id: string
  name: string
  /** «600 mg», «1 comprimido», «10 gotas» */
  dose?: string
  /** horas de las tomas; sin horas, «cuando haga falta» */
  times: string[]
  /** días de la semana (0 = domingo); sin días, todos */
  days?: number[]
  /** primer día (el de alta, o el del tratamiento): lo de antes no cuenta */
  from?: string
  /** último día (tratamiento de N días) */
  until?: string
  /** unidades que quedan en casa */
  stock?: number
  /** unidades por toma (1 si no se dice) */
  perDose?: number
  /** «cuando haga falta»: como mucho N al día */
  maxPerDay?: number
  /** «con comida», «en ayunas» */
  note?: string
  archived: 0 | 1
}

export interface MedLogLike {
  /** `${medId}:${date}:${time}` para las tomas con hora (así dos móviles no la apuntan dos veces) */
  id: string
  medId: string
  date: string
  /** hora de la toma programada; sin ella, una toma «cuando haga falta» */
  time?: string
  /** cuándo se marcó (ms) */
  at: number
  status: 'taken' | 'skipped'
}

/** Cuánto antes de la hora ya se puede marcar, y desde cuándo cuenta como tarde */
export const EARLY_MINUTES = 90
export const LATE_MINUTES = 60
/** Avisos: a la hora y, si no se marca, dos veces más */
export const NAG_MINUTES = [0, 15, 30]

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const pad = (n: number) => String(n).padStart(2, '0')
export const hhmmOf = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`

export const doseLogId = (medId: string, date: string, time: string) => `${medId}:${date}:${time}`
export const perDoseOf = (m: Pick<MedLike, 'perDose'>) => (m.perDose && m.perDose > 0 ? m.perDose : 1)
export const asNeeded = (m: Pick<MedLike, 'times'>) => !m.times.length

/** «HH:MM» válidas, sin repetir y en orden */
export function cleanTimes(times: string[]) {
  return [...new Set(times.filter((t) => /^\d{2}:\d{2}$/.test(t) && minutesOf(t) < 24 * 60))].sort()
}

/** ¿Se toma ese día? (dentro del tratamiento y en sus días de la semana) */
export function activeOn(m: MedLike, date: string) {
  if (m.archived) return false
  if (m.from && date < m.from) return false
  if (m.until && date > m.until) return false
  return !m.days?.length || m.days.length >= 7 || m.days.includes(weekday(date))
}

export type DoseState = 'taken' | 'skipped' | 'upcoming' | 'due' | 'late' | 'missed'

export interface Dose<M extends MedLike = MedLike, L extends MedLogLike = MedLogLike> {
  med: M
  date: string
  time: string
  log?: L
  state: DoseState
}

/**
 * Las tomas con hora de un día, en orden, con su estado. `now` ('HH:MM') solo
 * cuenta si `date` es hoy: lo de días pasados sin marcar es «missed».
 */
export function dosesOn<M extends MedLike, L extends MedLogLike>(meds: M[], logs: L[], date: string, today: string, now: string): Dose<M, L>[] {
  const byId = new Map(logs.filter((l) => l.date === date && l.time).map((l) => [doseLogId(l.medId, l.date, l.time!), l]))
  const out: Dose<M, L>[] = []
  for (const med of meds) {
    if (asNeeded(med) || !activeOn(med, date)) continue
    for (const time of cleanTimes(med.times)) {
      const log = byId.get(doseLogId(med.id, date, time))
      let state: DoseState
      if (log) state = log.status
      else if (date < today) state = 'missed'
      else if (date > today) state = 'upcoming'
      else {
        const late = minutesOf(now) - minutesOf(time)
        state = late < 0 ? 'upcoming' : late < LATE_MINUTES ? 'due' : 'late'
      }
      out.push({ med, date, time, log, state })
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name))
}

/** Tomas «cuando haga falta» de un día, de la más reciente a la más antigua */
export function extraTaken<L extends MedLogLike>(med: MedLike, logs: L[], date: string) {
  return logs.filter((l) => l.medId === med.id && l.date === date && !l.time && l.status === 'taken').sort((a, b) => b.at - a.at)
}

/** La última vez que se tomó (cualquier día) */
export function lastTaken<L extends MedLogLike>(med: MedLike, logs: L[]): L | undefined {
  return logs.filter((l) => l.medId === med.id && l.status === 'taken').sort((a, b) => b.at - a.at)[0]
}

/** Unidades al día de media (según sus horas y días de la semana) */
export function dailyUse(m: MedLike) {
  if (asNeeded(m)) return 0
  const days = !m.days?.length || m.days.length >= 7 ? 7 : m.days.length
  return (cleanTimes(m.times).length * perDoseOf(m) * days) / 7
}

/** Para cuántos días queda (sin contar el final del tratamiento) */
export function daysLeft(m: MedLike): number | undefined {
  if (m.stock === undefined) return undefined
  const use = dailyUse(m)
  if (!use) return undefined
  return Math.floor(m.stock / use)
}

/**
 * ¿Toca reponer? Cuando quedan para `within` días o menos (y el tratamiento
 * sigue más allá); lo que se toma cuando hace falta, al quedar 3 tomas.
 */
export function needsRefill(m: MedLike, today: string, within = 7) {
  if (m.archived || m.stock === undefined) return false
  if (m.until && m.until < today) return false
  if (asNeeded(m)) return m.stock < perDoseOf(m) * 3
  const left = daysLeft(m) ?? Infinity
  if (m.until && diffDays(m.until, today) < left) return false
  return left <= within
}

/** Tratamiento: día N de M (si tiene principio y fin) */
export function treatmentDay(m: MedLike, date: string) {
  if (!m.from || !m.until) return undefined
  return { day: diffDays(date, m.from) + 1, total: diffDays(m.until, m.from) + 1 }
}

/** Cumplimiento de los últimos días (las tomas con hora ya pasadas): tomadas / programadas */
export function adherence(meds: MedLike[], logs: MedLogLike[], today: string, now: string, days = 14) {
  let due = 0
  let taken = 0
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    for (const d of dosesOn(meds, logs, date, today, now)) {
      if (d.state === 'upcoming' || d.state === 'due') continue
      due++
      if (d.state === 'taken') taken++
    }
  }
  return { due, taken, rate: due ? taken / due : undefined }
}

/** Una línea por toma: «09:00 tomada a las 9:12» */
const clock = (ms: number, tz?: string) => new Date(ms).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', timeZone: tz })
export function doseText(d: Dose, tz?: string) {
  if (d.state === 'taken' && d.log) return `${d.time} tomada a las ${clock(d.log.at, tz)}`
  if (d.state === 'skipped') return `${d.time} saltada`
  if (d.state === 'late' || d.state === 'missed') return `${d.time} sin tomar`
  if (d.state === 'due') return `${d.time} toca ahora`
  return `${d.time} pendiente`
}

/** Medicación de hoy en texto (para Claude y Siri): una línea por medicamento */
export function medsSummary(meds: MedLike[], logs: MedLogLike[], today: string, now: string, tz?: string) {
  const lines: string[] = []
  for (const m of meds.filter((x) => !x.archived)) {
    const head = `${m.name}${m.dose ? ` ${m.dose}` : ''}`
    if (asNeeded(m)) {
      const extra = extraTaken(m, logs, today)
      const last = lastTaken(m, logs)
      lines.push(
        `${head} (cuando haga falta): ${extra.length ? `hoy ${extra.length} ${extra.length === 1 ? 'vez' : 'veces'}, la última a las ${clock(extra[0].at, tz)}` : last ? `hoy no; la última, el ${last.date}` : 'hoy no'}${m.maxPerDay ? ` · máximo ${m.maxPerDay} al día` : ''}`,
      )
      continue
    }
    if (!activeOn(m, today)) continue
    const doses = dosesOn([m], logs, today, today, now)
    const t = treatmentDay(m, today)
    lines.push(`${head}: ${doses.map((d) => doseText(d, tz)).join('; ')}${t ? ` · día ${t.day} de ${t.total}` : ''}${needsRefill(m, today) ? ` · quedan ${m.stock}, toca reponer` : ''}`)
  }
  return lines
}

/** Buscar un medicamento por lo que se dice («el ibuprofeno», «la pastilla de la tensión») */
export function findMed<M extends MedLike>(meds: M[], text: string): M | undefined {
  const live = meds.filter((m) => !m.archived)
  const q = normalize(text)
    .replace(/\b(el|la|los|las|mi|mis|de|del|para|pastillas?|medicamentos?|medicinas?|comprimidos?|capsulas?|sobres?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!q) return live.length === 1 ? live[0] : undefined
  const exact = live.find((m) => normalize(m.name) === q)
  if (exact) return exact
  const words = q.split(' ').filter((w) => w.length > 2)
  return live.find((m) => normalize(m.name).includes(q) || q.includes(normalize(m.name))) ?? live.find((m) => words.some((w) => normalize(`${m.name} ${m.note ?? ''}`).includes(w)))
}

/**
 * Qué toma marcar al decir «me la he tomado» a una hora: la pendiente más
 * cercana (desde 90 min antes de su hora); si no hay, una toma suelta.
 */
export function doseToTake(med: MedLike, logs: MedLogLike[], today: string, now: string): { time?: string } {
  if (asNeeded(med) || !activeOn(med, today)) return {}
  const open = dosesOn([med], logs, today, today, now).filter((d) => !d.log && minutesOf(d.time) - minutesOf(now) <= EARLY_MINUTES)
  if (!open.length) return {}
  // La más cercana a ahora (una de esta mañana olvidada pierde frente a la de ahora)
  const best = open.sort((a, b) => Math.abs(minutesOf(a.time) - minutesOf(now)) - Math.abs(minutesOf(b.time) - minutesOf(now)))[0]
  return { time: best.time }
}

/** La toma nueva y lo que queda en la caja después */
export function takeLog(med: MedLike, today: string, time: string | undefined, at: number, status: MedLogLike['status'] = 'taken'): MedLogLike {
  return { id: time ? doseLogId(med.id, today, time) : `${med.id}:${today}:a${at}`, medId: med.id, date: today, time, at, status }
}
export const stockAfter = (med: MedLike, status: MedLogLike['status']) => (med.stock === undefined || status !== 'taken' ? med.stock : Math.max(0, med.stock - perDoseOf(med)))

/** Texto del aviso: el primero a la hora y los siguientes, insistiendo */
export function medReminder(med: MedLike, time: string, nth: number) {
  const detail = [med.dose, med.note].filter(Boolean).join(' · ')
  if (nth === 0) return { title: `Hora de tomar: ${med.name}`, body: `${detail ? `${detail} · ` : ''}${time}` }
  return { title: `¿Te has tomado ${med.name}?`, body: `Era a las ${time}. Marca «Tomada» cuando lo hagas.` }
}

/** Qué aviso toca ahora (`now` 'HH:MM' local): 0, 1 o 2; o nada */
export function nagIndex(time: string, now: string) {
  const late = minutesOf(now) - minutesOf(time)
  if (late < 0) return undefined
  for (let i = NAG_MINUTES.length - 1; i >= 0; i--) if (late >= NAG_MINUTES[i]) return late < NAG_MINUTES[i] + 15 ? i : undefined
  return undefined
}
