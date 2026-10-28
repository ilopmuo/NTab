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

const PILL_COLORS = ['#F2F2F7', '#FF9F0A', '#FF453A', '#0A84FF', '#30D158', '#BF5AF2', '#FFD60A', '#AC8E68']

export interface SaveMedArgs {
  medicamento?: unknown
  dosis?: unknown
  horas?: unknown
  dias?: unknown
  cuando_haga_falta?: unknown
  maximo_al_dia?: unknown
  dias_tratamiento?: unknown
  hasta?: unknown
  quedan?: unknown
  por_toma?: unknown
  nota?: unknown
  dejar?: unknown
}

/**
 * guardar_medicacion: da de alta un medicamento o cambia el que hay, SOLO con
 * lo que diga el usuario (nunca se deducen dosis ni horas). «dejar» lo quita de
 * la medicación (queda en el historial).
 */
export function saveMed(rows: Row[], args: SaveMedArgs, env: Env, parseDays: (v: unknown) => { days?: number[]; error?: string }): WriteResult {
  const name = typeof args.medicamento === 'string' ? args.medicamento.trim() : ''
  if (!name) return { writes: [], report: ['Falta el nombre del medicamento.'] }
  const today = ymdIn(env.now, env.tz)
  const all = rows.filter((r) => r.tbl === 'meds').map((r) => ({ ...r.data, id: r.id }) as Med)
  const existing = findMed(all.filter((m) => !m.archived), name) ?? all.find((m) => m.name.toLowerCase() === name.toLowerCase())
  const errors: string[] = []
  const med: Med = existing
    ? { ...existing, archived: 0 }
    : ({ id: env.newId(), name: name.charAt(0).toUpperCase() + name.slice(1), times: [], from: today, archived: 0, color: PILL_COLORS[all.length % PILL_COLORS.length], order: env.now, createdAt: env.now } as unknown as Med)

  if (args.dejar === true) {
    if (!existing) return { writes: [], report: [`No tiene «${name}» en la medicación.`] }
    return { writes: [{ tbl: 'meds', id: med.id, data: { ...existing, archived: 1 } }], report: [`${existing.name}: fuera de la medicación (queda en el historial).`] }
  }
  if (typeof args.dosis === 'string') med.dose = args.dosis.trim() || undefined
  if (args.cuando_haga_falta === true) {
    med.times = []
    delete med.days
  } else if (args.horas !== undefined) {
    const list = (Array.isArray(args.horas) ? args.horas : String(args.horas).split(/[,;y\s]+/)).map((h) => String(h).trim()).filter(Boolean)
    const bad = list.filter((h) => !/^\d{1,2}:\d{2}$/.test(h))
    if (bad.length) errors.push(`Horas que no valen: ${bad.join(', ')} (usa HH:MM).`)
    med.times = [...new Set(list.filter((h) => /^\d{1,2}:\d{2}$/.test(h)).map((h) => h.padStart(5, '0')))].sort()
  }
  if (args.dias !== undefined) {
    const d = parseDays(args.dias)
    if (d.error) errors.push(d.error)
    else if (d.days) {
      if (d.days.length >= 7) delete med.days
      else med.days = d.days
    }
  }
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined)
  if (args.maximo_al_dia !== undefined) med.maxPerDay = n(args.maximo_al_dia)
  if (args.quedan !== undefined) med.stock = n(args.quedan)
  if (args.por_toma !== undefined) med.perDose = n(args.por_toma) || undefined
  if (typeof args.nota === 'string') med.note = args.nota.trim() || undefined
  if (typeof args.hasta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.hasta)) med.until = args.hasta
  else if (n(args.dias_tratamiento)) med.until = addDays(existing ? (med.from ?? today) : today, n(args.dias_tratamiento)! - 1)
  if (errors.length) return { writes: [], report: [...errors, 'No he guardado nada: corrígelo y vuelve a intentarlo.'] }
  if (!existing && !med.times.length && args.cuando_haga_falta !== true)
    return { writes: [], report: [`¿A qué horas se toma ${med.name}? Dímelo (o si es «cuando haga falta»): no me lo invento.`] }

  // Sin campos vacíos (la app no los espera)
  const data = Object.fromEntries(Object.entries(med).filter(([, v]) => v !== undefined))
  const when = med.times.length ? `a las ${med.times.map(short).join(', ')}${med.days?.length ? ' (algunos días)' : ''}` : `cuando haga falta${med.maxPerDay ? `, máximo ${med.maxPerDay} al día` : ''}`
  return {
    writes: [{ tbl: 'meds', id: med.id, data }],
    report: [`${existing ? 'Cambiado' : 'Apuntado'}: ${med.name}${med.dose ? ` (${med.dose})` : ''}, ${when}${med.until ? `, hasta el ${med.until}` : ''}${med.stock !== undefined ? `; quedan ${med.stock}` : ''}. Le avisaré a su hora.`],
  }
}
