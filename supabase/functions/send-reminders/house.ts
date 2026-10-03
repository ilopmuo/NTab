// Avisos del piso compartido: por la mañana, a cada uno lo que le toca en casa
// (y lo que lleva retraso); por la tarde, lo de hoy que sigue sin hacer. Llegan
// también a los compañeros sin cuenta (ver household_push).
import { houseReminder, reminderKindAt, type HouseItem, type HouseReminderKind } from '../_shared/house.ts'
import { hhmmIn, ymdIn } from '../_shared/time.ts'

/** Lo que se usa del cliente de Supabase (sin sus tipos, para poder probarlo fuera de Deno) */
// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any }

interface HousePush {
  endpoint: string
  household_id: string
  member: string
  p256dh: string
  auth: string
  tz: string | null
  open: 'piso' | 'house'
}

/** Envía un aviso a un móvil: bien, ya no existe (app borrada, permiso quitado) o error temporal */
export type SendPush = (sub: { endpoint: string; p256dh: string; auth: string }, payload: string) => Promise<'ok' | 'gone' | 'error'>

export async function sendHouseReminders(admin: Db, send: SendPush, now = Date.now()): Promise<number> {
  const { data, error } = await admin.from('household_push').select('endpoint,household_id,member,p256dh,auth,tz,open')
  // Sin la migración aplicada aún, lo demás sigue funcionando
  if (error) {
    console.error('household_push', error.message)
    return 0
  }
  // Solo los móviles a los que ahora les toca (las 9:00 o las 20:00 en su hora)
  const due = ((data ?? []) as HousePush[])
    .map((s) => {
      const tz = s.tz || 'Europe/Madrid'
      return { s, kind: reminderKindAt(hhmmIn(now, tz)), day: ymdIn(now, tz) }
    })
    .filter((d): d is { s: HousePush; kind: HouseReminderKind; day: string } => !!d.kind)
  if (!due.length) return 0

  const houses = [...new Set(due.map((d) => d.s.household_id))]
  const [{ data: logs }, { data: tokens }] = await Promise.all([
    admin.from('household_push_log').select('household_id,member,kind,day').in('household_id', houses).in('day', [...new Set(due.map((d) => d.day))]),
    admin.from('households').select('id,token').in('id', houses),
  ])
  const done = new Set(((logs ?? []) as { household_id: string; member: string; kind: string; day: string }[]).map((l) => `${l.household_id}|${l.member}|${l.kind}|${l.day}`))
  const tokenOf = new Map(((tokens ?? []) as { id: string; token: string }[]).map((h) => [h.id, h.token]))

  let sent = 0
  const gone: string[] = []
  const log: { household_id: string; member: string; kind: string; day: string }[] = []
  for (const house of houses) {
    const { data: rows, error: failed } = await admin.from('household_items').select('id,kind,data').eq('household_id', house).limit(5000)
    if (failed) {
      console.error('household_items', failed.message)
      continue
    }
    const items = (rows ?? []) as HouseItem[]
    // Un aviso por persona, hora y día, a todos sus móviles
    const groups = new Map<string, typeof due>()
    for (const d of due.filter((x) => x.s.household_id === house)) {
      const key = `${house}|${d.s.member}|${d.kind}|${d.day}`
      if (!done.has(key)) groups.set(key, [...(groups.get(key) ?? []), d])
    }
    for (const group of groups.values()) {
      const { s, kind, day } = group[0]
      const entry = { household_id: house, member: s.member, kind, day }
      const msg = houseReminder(items, s.member, day, kind)
      if (!msg) {
        log.push(entry)
        continue
      }
      let delivered = false
      let transient = false
      for (const { s: sub } of group) {
        const url = sub.open === 'house' ? './#/house' : `./#/piso/${tokenOf.get(house) ?? ''}`
        const r = await send(sub, JSON.stringify({ ...msg, tag: `ntab-house-${kind}`, url }))
        if (r === 'ok') {
          delivered = true
          sent++
        } else if (r === 'gone') gone.push(sub.endpoint)
        else transient = true
      }
      // Si falló por algo temporal, se reintenta en la siguiente vuelta
      if (delivered || !transient) log.push(entry)
    }
  }
  if (log.length) await admin.from('household_push_log').upsert(log, { onConflict: 'household_id,member,kind,day', ignoreDuplicates: true })
  if (gone.length) await admin.from('household_push').delete().in('endpoint', gone)
  return sent
}
