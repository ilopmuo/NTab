// Edge Function: envía las notificaciones push de los avisos que tocan.
// La llama pg_cron cada minuto (ver supabase/migrations/*_push_reminders.sql).
// Con { "test": true } y la sesión del usuario, envía un aviso de prueba a sus
// dispositivos (botón "Enviar un aviso de prueba" de Ajustes).
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   VAPID_PRIVATE_KEY  clave privada VAPID (la pública está en la app)
//   VAPID_SUBJECT      opcional, p. ej. "mailto:tu@email.com"
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { buildDigest, buildHabitPayload, buildPayload, type DueDigest, type DueHabit, type DueReminder } from './format.ts'

const PUBLIC_KEY =
  Deno.env.get('VAPID_PUBLIC_KEY') ?? 'BITtwUVzfRk6yMCn5x36uN9n3nRV7fpCXOyk_bf1RwMYryFTJ54C6HbJFCzdNVPNVMBuTzlT3OEOYbwM6eH3CJM'
const PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://github.com/ilopmuo/NTab'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

interface Subscription {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  tz: string | null
}

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, 'public', any>

/** Aviso de prueba para los dispositivos del usuario que lo pide */
async function sendTest(req: Request, admin: Admin, delaySeconds: number) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return json({ error: 'Inicia sesión para enviar la prueba' }, 401)
  const { data: subsData, error: subsError } = await admin.from('push_subscriptions').select('endpoint,user_id,p256dh,auth,tz').eq('user_id', data.user.id)
  if (subsError) return json({ error: subsError.message }, 500)
  const subs = (subsData ?? []) as Subscription[]
  if (!subs.length) return json({ sent: 0 })
  // Un momento para salir de la app: iOS no siempre enseña el aviso con la app delante
  await new Promise((r) => setTimeout(r, Math.min(Math.max(delaySeconds, 0), 10) * 1000))
  const payload = JSON.stringify({ title: 'NTab', body: 'Así te llegarán los avisos de tus tareas ⏰', tag: 'ntab-test', url: './#/settings' })
  let sent = 0
  const gone: string[] = []
  const failures: string[] = []
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60, urgency: 'high' })
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) gone.push(s.endpoint)
      else failures.push(`${status ?? ''} ${(e as { body?: string }).body ?? (e as Error).message}`.trim())
    }
  }
  if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone)
  if (!sent && failures.length) return json({ error: `El servicio push rechazó el envío: ${failures[0]}` }, 502)
  return json({ sent, removed: gone.length })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!PRIVATE_KEY) return json({ error: 'Falta el secreto VAPID_PRIVATE_KEY en Supabase (Edge Functions → Secrets)' }, 500)
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  let body: { test?: boolean; delay?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* sin cuerpo: llamada del cron */
  }
  if (body.test) return sendTest(req, admin, Number(body.delay) || 0)

  const [remindersRes, digestsRes, habitsRes, nagsRes] = await Promise.all([
    admin.rpc('due_reminders', { window_minutes: 15 }),
    admin.rpc('due_digests', { window_minutes: 15 }),
    admin.rpc('due_habit_reminders', { window_minutes: 15 }),
    admin.rpc('due_nags', { window_minutes: 15 }),
  ])
  if (remindersRes.error) return json({ error: remindersRes.error.message }, 500)
  // Si la migración del resumen aún no está aplicada, los avisos siguen funcionando
  if (digestsRes.error) console.error('due_digests', digestsRes.error.message)
  if (habitsRes.error) console.error('due_habit_reminders', habitsRes.error.message)
  if (nagsRes.error) console.error('due_nags', nagsRes.error.message)

  // Cada envío: a quién, qué (según la zona horaria del dispositivo) y qué apuntar al terminar
  interface Job {
    user_id: string
    payload: (tz: string) => unknown
    log: { user_id: string; tbl: string; item_id: string; remind_at: string }
  }
  const jobs: Job[] = [
    ...((remindersRes.data ?? []) as DueReminder[]).map((r) => ({
      user_id: r.user_id,
      payload: (tz: string) => buildPayload(r, tz),
      log: { user_id: r.user_id, tbl: r.tbl, item_id: r.item_id, remind_at: r.remind_at },
    })),
    // Avisos insistentes: misma etiqueta que el aviso original, así que lo sustituyen
    ...((nagsRes.data ?? []) as DueReminder[]).map((r) => ({
      user_id: r.user_id,
      payload: (tz: string) => buildPayload(r, tz),
      log: { user_id: r.user_id, tbl: r.tbl, item_id: r.item_id, remind_at: r.remind_at },
    })),
    ...((digestsRes.data ?? []) as DueDigest[]).map((d) => ({
      user_id: d.user_id,
      payload: () => buildDigest(d),
      log: { user_id: d.user_id, tbl: 'digest', item_id: d.local_date, remind_at: new Date().toISOString() },
    })),
    ...((habitsRes.data ?? []) as DueHabit[]).map((h) => ({
      user_id: h.user_id,
      payload: () => buildHabitPayload(h),
      log: { user_id: h.user_id, tbl: 'habits', item_id: `${h.habit_id}:${h.local_date}`, remind_at: new Date().toISOString() },
    })),
  ]
  if (!jobs.length) return json({ sent: 0 })

  const users = [...new Set(jobs.map((j) => j.user_id))]
  const { data: subsData, error: subsError } = await admin.from('push_subscriptions').select('endpoint,user_id,p256dh,auth,tz').in('user_id', users)
  if (subsError) return json({ error: subsError.message }, 500)
  const subs = (subsData ?? []) as Subscription[]

  let sent = 0
  const gone = new Set<string>()
  const used = new Set<string>()
  const log: Job['log'][] = []

  for (const job of jobs) {
    const mine = subs.filter((s) => s.user_id === job.user_id && !gone.has(s.endpoint))
    let delivered = false
    let transient = false
    for (const s of mine) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(job.payload(s.tz ?? 'Europe/Madrid')),
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
    if (delivered || !transient) log.push(job.log)
  }

  if (log.length) await admin.from('push_log').upsert(log, { onConflict: 'user_id,tbl,item_id,remind_at', ignoreDuplicates: true })
  if (gone.size) await admin.from('push_subscriptions').delete().in('endpoint', [...gone])
  if (used.size) await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('endpoint', [...used])

  return json({ sent, removed: gone.size })
})
