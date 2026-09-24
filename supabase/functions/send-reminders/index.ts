// Edge Function: envía las notificaciones push de los avisos que tocan.
// La llama pg_cron cada minuto (ver supabase/migrations/*_push_reminders.sql).
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   VAPID_PRIVATE_KEY  clave privada VAPID (la pública está en la app)
//   VAPID_SUBJECT      opcional, p. ej. "mailto:tu@email.com"
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { buildPayload, type DueReminder } from './format.ts'

const PUBLIC_KEY =
  Deno.env.get('VAPID_PUBLIC_KEY') ?? 'BITtwUVzfRk6yMCn5x36uN9n3nRV7fpCXOyk_bf1RwMYryFTJ54C6HbJFCzdNVPNVMBuTzlT3OEOYbwM6eH3CJM'
const PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://github.com/ilopmuo/NTab'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface Subscription {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  tz: string | null
}

Deno.serve(async () => {
  if (!PRIVATE_KEY) return json({ error: 'Falta el secreto VAPID_PRIVATE_KEY' }, 500)
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: due, error } = await admin.rpc('due_reminders', { window_minutes: 15 })
  if (error) return json({ error: error.message }, 500)
  const reminders = (due ?? []) as DueReminder[]
  if (!reminders.length) return json({ sent: 0 })

  const users = [...new Set(reminders.map((r) => r.user_id))]
  const { data: subsData, error: subsError } = await admin.from('push_subscriptions').select('endpoint,user_id,p256dh,auth,tz').in('user_id', users)
  if (subsError) return json({ error: subsError.message }, 500)
  const subs = (subsData ?? []) as Subscription[]

  let sent = 0
  const gone = new Set<string>()
  const used = new Set<string>()
  const log: { user_id: string; tbl: string; item_id: string; remind_at: string }[] = []

  for (const r of reminders) {
    const mine = subs.filter((s) => s.user_id === r.user_id && !gone.has(s.endpoint))
    let delivered = false
    let transient = false
    for (const s of mine) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(buildPayload(r, s.tz ?? 'Europe/Madrid')),
          { TTL: 60 * 60, urgency: 'high' },
        )
        delivered = true
        used.add(s.endpoint)
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // 404/410: el dispositivo ya no existe (app borrada, permiso retirado…)
        if (status === 404 || status === 410) gone.add(s.endpoint)
        else {
          transient = true
          console.error('push', status, (e as Error).message)
        }
      }
    }
    // Si falló por un error temporal, no se apunta: se reintenta en el siguiente minuto
    if (delivered || !transient) log.push({ user_id: r.user_id, tbl: r.tbl, item_id: r.item_id, remind_at: r.remind_at })
  }

  if (log.length) await admin.from('push_log').upsert(log, { onConflict: 'user_id,tbl,item_id,remind_at', ignoreDuplicates: true })
  if (gone.size) await admin.from('push_subscriptions').delete().in('endpoint', [...gone])
  if (used.size) await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('endpoint', [...used])

  return json({ sent, removed: gone.size })
})
