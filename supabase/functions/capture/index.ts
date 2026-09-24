// Edge Function: añadir tareas desde fuera de NTab (Siri, Atajos de iOS, la
// hoja de compartir, un script…) con el mismo lenguaje natural que la app.
//
//   POST /functions/v1/capture/<token>   { "text": "llamar al banco mañana a las 10" }
//   (también texto plano en el cuerpo, o GET ?text=…)
//
// Responde con una frase corta ("Apuntado: …") para que el Atajo la muestre o la lea.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { captureTasks } from './logic.ts'
import type { Env, Row } from '../mcp/ntab.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const reply = (text: string, status = 200) => new Response(text, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } })

async function readText(req: Request, url: URL) {
  if (req.method === 'GET') return url.searchParams.get('text') ?? ''
  const raw = await req.text()
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/json') || raw.trim().startsWith('{')) {
    try {
      const body = JSON.parse(raw)
      return String(body.text ?? body.texto ?? body.input ?? '')
    } catch {
      return raw
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) return new URLSearchParams(raw).get('text') ?? ''
  return raw
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST' && req.method !== 'GET') return reply('Método no permitido', 405)
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? url.pathname.split('/').filter(Boolean).pop() ?? ''
  if (!/^[a-f0-9]{32,128}$/.test(token)) return reply('Enlace no válido', 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: key, error } = await admin.from('capture_keys').select('user_id,tz').eq('token', token).maybeSingle()
  if (error) return reply('Error del servidor', 500)
  if (!key) return reply('Este enlace ya no es válido: crea uno nuevo en NTab → Ajustes → Siri y Atajos.', 404)

  const text = (await readText(req, url)).trim()
  if (!text) return reply('No he recibido nada que apuntar.', 400)

  // Solo hace falta saber los proyectos, las áreas y el ajuste de avisos
  const { data, error: e } = await admin
    .from('records')
    .select('tbl,id,data')
    .eq('user_id', key.user_id)
    .eq('deleted', false)
    .or('tbl.eq.projects,tbl.eq.areas,and(tbl.eq.settings,id.eq.autoRemind)')
  if (e) return reply('Error del servidor', 500)
  const rows = (data ?? []) as Row[]

  const env: Env = {
    tz: key.tz || 'Europe/Madrid',
    now: Date.now(),
    autoRemind: rows.find((r) => r.tbl === 'settings')?.data?.value !== false,
    newId: () => crypto.randomUUID(),
  }
  const result = captureTasks(rows, text, env)
  if (!result.writes.length) return reply(result.reply, 400)

  const { error: w } = await admin
    .from('records')
    .upsert(result.writes.map((r) => ({ user_id: key.user_id, tbl: r.tbl, id: r.id, data: r.data, deleted: false })), { onConflict: 'user_id,tbl,id' })
  if (w) return reply('No se pudo guardar. Prueba otra vez.', 500)
  void admin.from('capture_keys').update({ last_used_at: new Date().toISOString() }).eq('user_id', key.user_id).then(() => {})
  return reply(result.reply)
})
