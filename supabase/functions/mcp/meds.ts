/**
 * Medicación desde Claude y Siri: «¿me he tomado la pastilla?» y «me la he
 * tomado». Misma lógica que la app (../_shared/meds.ts) sobre los registros de
 * la sincronización.
 */
import { addDays, hhmmIn, ymdIn } from '../_shared/time.ts'
import { activeOn, adherence, asNeeded, doseToTake, dosesOn, extraTaken, findMed, medsSummary, minutesOf, needsRefill, daysLeft, stockAfter, takeLog, type MedLike, type MedLogLike } from '../_shared/meds.ts'
import type { Env, Row, WriteResult } from './ntab.ts'

type Med = MedLike & Record<string, unknown>
const medsOf = (rows: Row[]): Med[] => rows.filter((r) => r.tbl === 'meds' && !r.data.archived && Array.isArray(r.data.times)).map((r) => ({ ...r.data, id: r.id }) as Med)
const logsOf = (rows: Row[], since: string): MedLogLike[] =>
  rows.filter((r) => r.tbl === 'medLogs' && typeof r.data.date === 'string' && (r.data.date as string) >= since).map((r) => ({ ...r.data, id: r.id }) as unknown as MedLogLike)
const clock = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', timeZone: tz })
const short = (hhmm: string) => hhmm.replace(/^0(\d)/, '$1')

/** Para el resumen: lo de hoy de cada medicamento */
export function medLines(rows: Row[], env: Env, today: string): string[] {
  const meds = medsOf(rows)
  if (!meds.length) return []
  const lines = medsSummary(meds, logsOf(rows, today), today, hhmmIn(env.now, env.tz), env.tz)
  if (!lines.length) return []
  return ['\nMEDICACIÓN DE HOY (ante «¿me la he tomado?», mira aquí; para marcarla, tomar_medicacion):', ...lines.map((l) => `- ${l}`)]
}

/**
 * Para Siri: lo que queda por tomar hoy («ibuprofeno a las 21:00») o, si ya
 * no queda nada, `undefined`. Lo que se pasó sin tomar va primero.
 */
export function medsLeft(rows: Row[], env: Env): string | undefined {
  const today = ymdIn(env.now, env.tz)
  const now = hhmmIn(env.now, env.tz)
  const meds = medsOf(rows).filter((m) => !asNeeded(m) && activeOn(m, today))
  const doses = dosesOn(meds, logsOf(rows, today), today, today, now).filter((d) => d.state !== 'taken' && d.state !== 'skipped')
  if (!doses.length) return undefined
  const late = doses.filter((d) => d.state === 'late' || d.state === 'missed' || d.state === 'due')
  const later = doses.filter((d) => d.state === 'upcoming')
  const say = (xs: typeof doses) => xs.map((d) => `${d.med.name} de las ${short(d.time)}`)
  const list = (xs: string[]) => (xs.length < 2 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`)
  return [late.length ? `Sin tomar: ${list(say(late))}.` : '', later.length ? `Te queda: ${list(say(later))}.` : ''].filter(Boolean).join(' ')
}

/** ver_medicacion: hoy, lo que queda y cómo va las dos últimas semanas */
export function viewMeds(rows: Row[], args: { medicamento?: unknown }, env: Env): string {
  const all = medsOf(rows)
  if (!all.length) return 'No tiene medicación apuntada en LUNO (se apunta en Hábitos → Medicación).'
  const today = ymdIn(env.now, env.tz)
  const now = hhmmIn(env.now, env.tz)
  const asked = typeof args.medicamento === 'string' && args.medicamento.trim() ? findMed(all, args.medicamento) : undefined
  if (typeof args.medicamento === 'string' && args.medicamento.trim() && !asked) return `No encuentro «${args.medicamento}». Tiene: ${all.map((m) => m.name).join(', ')}.`
  const meds = asked ? [asked] : all
  const logs = logsOf(rows, addDays(today, -13))
  const out = medsSummary(meds, logs, today, now, env.tz).map((l) => `- ${l}`)
  for (const m of meds) {
    if (asNeeded(m)) continue
    const a = adherence([m], logs, today, now, 14)
    if (a.rate !== undefined) out.push(`- ${m.name}: ${a.taken} de ${a.due} tomas en las dos últimas semanas (${Math.round(a.rate * 100)} %)`)
    if (m.stock !== undefined) out.push(`- ${m.name}: quedan ${m.stock}${daysLeft(m) !== undefined ? `, para ${daysLeft(m)} días` : ''}${needsRefill(m, today) ? ' (toca reponer)' : ''}`)
  }
  return [`MEDICACIÓN (${today}, son las ${now}):`, ...out].join('\n')
}

/** tomar_medicacion: marca la toma (la más cercana a ahora, o la de `hora`) y descuenta de la caja */
export function takeMed(rows: Row[], args: { medicamento?: unknown; hora?: unknown; saltada?: unknown }, env: Env): WriteResult {
  const all = medsOf(rows)
  if (!all.length) return { writes: [], report: ['No tiene medicación apuntada en LUNO (se apunta en Hábitos → Medicación).'] }
  const med = findMed(all, typeof args.medicamento === 'string' ? args.medicamento : '')
  if (!med) return { writes: [], report: [`¿Cuál? Tiene: ${all.map((m) => m.name).join(', ')}.`] }
  const today = ymdIn(env.now, env.tz)
  const now = hhmmIn(env.now, env.tz)
  const logs = logsOf(rows, today)
  const status = args.saltada === true ? 'skipped' : 'taken'
  let time: string | undefined
  if (typeof args.hora === 'string' && /^\d{1,2}:\d{2}$/.test(args.hora)) {
    // La toma programada más cercana a la hora que dice
    const h = args.hora.padStart(5, '0')
    time = dosesOn([med], logs, today, today, now).sort((a, b) => Math.abs(minutesOf(a.time) - minutesOf(h)) - Math.abs(minutesOf(b.time) - minutesOf(h)))[0]?.time
  } else time = doseToTake(med, logs, today, now).time
  const log = takeLog(med, today, time, env.now, status)
  const prev = logs.find((l) => l.id === log.id)
  if (prev?.status === status) return { writes: [], report: [`Ya estaba marcada: ${med.name}${time ? ` de las ${short(time)}` : ''}, ${status === 'taken' ? `tomada a las ${clock(prev.at, env.tz)}` : 'saltada'}.`] }
  const stock = prev?.status === 'taken' ? med.stock : stockAfter(med, status)
  const writes: Row[] = [{ tbl: 'medLogs', id: log.id, data: log as unknown as Record<string, unknown> }]
  const next = { ...med, stock }
  if (stock !== med.stock) writes.push({ tbl: 'meds', id: med.id, data: next })
  const extra = asNeeded(med) ? extraTaken(med, [...logs, log], today).length : 0
  const report = [
    status === 'skipped'
      ? `${med.name}${time ? ` de las ${short(time)}` : ''}: saltada.`
      : `${med.name}${time ? ` de las ${short(time)}` : ''}: tomada a las ${clock(env.now, env.tz)}.${extra > 1 ? ` Van ${extra} hoy${med.maxPerDay ? ` (máximo ${med.maxPerDay})` : ''}.` : ''}`,
  ]
  if (stock !== undefined && needsRefill(next, today)) report.push(`Quedan ${stock}: toca reponer.`)
  return { writes, report }
}

const TAKEN = /^\s*¿?\s*(?:ya\s+)?(?:me\s+he\s+tomado|me\s+tom[eé]|he\s+tomado|tomad[ao])\s*(?:ya\s+)?[:,]?\s*(.*?)[\s?!.]*$/i

/**
 * Siri: «tomada: ibuprofeno», «me he tomado la pastilla» (la marca) o «¿me he
 * tomado la pastilla?» (lo dice). Sin medicación que encaje, no es suyo
 * («he tomado café con Ana» es una tarea más).
 */
export function captureMed(rows: Row[], text: string, env: Env): WriteResult | undefined {
  const m = TAKEN.exec(text)
  if (!m) return undefined
  const meds = medsOf(rows)
  if (!meds.length) return undefined
  const what = m[1]
  const generic = !what || /pastill|medic|comprimid|c[aá]psul/i.test(what)
  const med = findMed(meds, what)
  if (!med && !generic) return undefined
  const ask = /[?¿]/.test(text)
  if (!ask) return med ? takeMed(rows, { medicamento: med.name }, env) : { writes: [], report: [`¿Cuál? Tienes: ${meds.map((x) => x.name).join(', ')}.`] }
  const today = ymdIn(env.now, env.tz)
  const now = hhmmIn(env.now, env.tz)
  const logs = logsOf(rows, today)
  const answer = (x: Med) => {
    if (asNeeded(x)) {
      const e = extraTaken(x, logs, today)
      return e.length ? `${x.name}: hoy ${e.length === 1 ? 'una vez' : `${e.length} veces`}, la última a las ${clock(e[0].at, env.tz)}.` : `${x.name}: hoy no.`
    }
    const doses = dosesOn([x], logs, today, today, now).filter((d) => d.state !== 'upcoming')
    if (!doses.length) return `${x.name}: aún no toca hoy.`
    const taken = doses.filter((d) => d.state === 'taken')
    const missing = doses.filter((d) => d.state !== 'taken' && d.state !== 'skipped')
    if (!missing.length) return `Sí: ${x.name}${taken.length ? ` a las ${taken.map((d) => clock(d.log!.at, env.tz)).join(' y a las ')}` : ''}.`
    return `No: ${x.name} de las ${missing.map((d) => short(d.time)).join(' y de las ')}, aún no.${taken.length ? ` La de las ${short(taken[0].time)}, sí.` : ''}`
  }
  return { writes: [], report: [(med ? [med] : meds).map(answer).join(' ')] }
}
