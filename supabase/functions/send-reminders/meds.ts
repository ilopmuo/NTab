// Avisos de la medicación: a la hora de cada toma y, si no se marca, a los 15 y
// a los 30 minutos (como Medisafe). Con el botón «Tomada» en el aviso. La hora
// es la de la zona horaria del último dispositivo con avisos (como el resto).
import { activeOn, cleanTimes, doseLogId, medReminder, nagIndex, type MedLike } from '../_shared/meds.ts'
import { hhmmIn, ymdIn } from '../_shared/time.ts'

/** Lo que se usa del cliente de Supabase (sin sus tipos, para poder probarlo fuera de Deno) */
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

export interface MedJob {
  user_id: string
  payload: () => unknown
  log: { user_id: string; tbl: string; item_id: string; remind_at: string }
}

interface Candidate {
  user: string
  med: MedLike
  date: string
  time: string
  n: number
}

export async function dueMedJobs(admin: Db, now = Date.now()): Promise<MedJob[]> {
  const { data: subs, error } = await admin.from('push_subscriptions').select('user_id,tz,last_used_at,created_at')
  if (error) throw new Error(error.message)
  // La zona horaria de cada usuario: la de su dispositivo usado más recientemente
  const zone = new Map<string, { tz: string; at: string }>()
  for (const s of (subs ?? []) as { user_id: string; tz: string | null; last_used_at: string | null; created_at: string }[]) {
    const at = s.last_used_at ?? s.created_at ?? ''
    const prev = zone.get(s.user_id)
    if (!prev || at > prev.at) zone.set(s.user_id, { tz: s.tz || 'Europe/Madrid', at })
  }
  if (!zone.size) return []

  const { data: rows, error: medsError } = await admin.from('records').select('user_id,id,data').eq('tbl', 'meds').eq('deleted', false).in('user_id', [...zone.keys()])
  if (medsError) throw new Error(medsError.message)
  const due: Candidate[] = []
  for (const r of (rows ?? []) as { user_id: string; id: string; data: MedLike | null }[]) {
    const med = r.data && { ...r.data, id: r.id }
    const tz = zone.get(r.user_id)?.tz
    if (!med || !tz || !Array.isArray(med.times)) continue
    const date = ymdIn(now, tz)
    const hm = hhmmIn(now, tz)
    if (!activeOn(med, date)) continue
    for (const time of cleanTimes(med.times)) {
      const n = nagIndex(time, hm)
      if (n !== undefined) due.push({ user: r.user_id, med, date, time, n })
    }
  }
  if (!due.length) return []

  // Ya marcada (tomada o saltada) o este aviso ya enviado: nada
  const item = (c: Candidate) => `${c.med.id}:${c.date}:${c.time}:${c.n}`
  const [{ data: logs }, { data: sent }] = await Promise.all([
    admin.from('records').select('user_id,id').eq('tbl', 'medLogs').eq('deleted', false).in('id', [...new Set(due.map((c) => doseLogId(c.med.id, c.date, c.time)))]),
    admin.from('push_log').select('user_id,item_id').eq('tbl', 'meds').in('item_id', due.map(item)),
  ])
  const marked = new Set(((logs ?? []) as { user_id: string; id: string }[]).map((l) => `${l.user_id}|${l.id}`))
  const done = new Set(((sent ?? []) as { user_id: string; item_id: string }[]).map((l) => `${l.user_id}|${l.item_id}`))
  const at = new Date(now).toISOString()
  return due
    .filter((c) => !marked.has(`${c.user}|${doseLogId(c.med.id, c.date, c.time)}`) && !done.has(`${c.user}|${item(c)}`))
    .map((c) => ({
      user_id: c.user,
      payload: () => ({
        ...medReminder(c.med, c.time, c.n),
        // Misma etiqueta para los tres: el siguiente sustituye al anterior
        tag: `meds-${c.med.id}-${c.time}`,
        key: `meds-${c.med.id}-${c.date}-${c.time}-${c.n}`,
        url: './#/meds',
        medDose: `${c.med.id}|${c.date}|${c.time}`,
      }),
      log: { user_id: c.user, tbl: 'meds', item_id: item(c), remind_at: at },
    }))
}
