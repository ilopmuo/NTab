// Edge Function: eventos de los calendarios externos del usuario (solo lectura).
// POST { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } con la sesión del usuario.
// El navegador no puede leer los .ics de Google o iCloud directamente (CORS),
// así que los lee el servidor.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { loadEvents } from '../_shared/loadEvents.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const YMD = /^\d{4}-\d{2}-\d{2}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'Inicia sesión para ver tus calendarios.' }, 401)

  let body: { from?: string; to?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* sin cuerpo */
  }
  if (!YMD.test(body.from ?? '') || !YMD.test(body.to ?? '')) return json({ error: 'Rango no válido' }, 400)
  // Un día de margen a cada lado por las zonas horarias
  const from = Date.parse(`${body.from}T00:00:00Z`) - 864e5
  const to = Date.parse(`${body.to}T00:00:00Z`) + 2 * 864e5
  if (to - from > 100 * 864e5) return json({ error: 'Rango demasiado grande' }, 400)

  try {
    return json(await loadEvents(admin, auth.user.id, from, to))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error' }, 500)
  }
})
