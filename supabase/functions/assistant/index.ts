// Edge Function: asistente de NTab (Claude, de Anthropic).
// POST { messages: [{ role, content }], context: string } con la sesión del usuario.
// Devuelve { text, tasks, changes }: la app enseña las propuestas y el usuario las aplica.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  clave de la API de Anthropic (console.anthropic.com)
//   ANTHROPIC_MODEL    opcional; por defecto claude-opus-5-5
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TOOLS, cleanMessages, parseReply, systemPrompt } from './prompt.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5-5'
const API_URL = Deno.env.get('ANTHROPIC_API_URL') || 'https://api.anthropic.com/v1/messages'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  if (!API_KEY) return json({ error: 'Falta el secreto ANTHROPIC_API_KEY en Supabase (Edge Functions → Secrets).' }, 500)

  // Solo usuarios con sesión: la función no es un proxy abierto a la API
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth, error: authError } = await admin.auth.getUser(token)
  if (authError || !auth.user) return json({ error: 'Inicia sesión para usar el asistente.' }, 401)

  let body: { messages?: unknown; context?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Petición no válida' }, 400)
  }
  const messages = cleanMessages(body.messages)
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'Falta la pregunta' }, 400)

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt(String(body.context ?? '')),
      tools: TOOLS,
      messages,
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.error?.message ?? `HTTP ${res.status}`
    console.error('anthropic', res.status, detail)
    const message =
      res.status === 401
        ? 'La clave de Anthropic no es válida. Revisa el secreto ANTHROPIC_API_KEY.'
        : res.status === 429 || res.status === 529
          ? 'El asistente está saturado ahora mismo. Prueba en un momento.'
          : `El asistente no pudo responder: ${detail}`
    return json({ error: message }, 502)
  }
  return json(parseReply(data?.content ?? []))
})
