// Edge Function: conector de NTab para Claude (servidor MCP por HTTP).
// URL: /functions/v1/mcp/<token>  (el token está en la tabla mcp_connectors)
//
// Se añade en Claude → Ajustes → Conectores → Añadir conector personalizado.
// Así se usa NTab desde Claude con la suscripción de Claude, sin claves de API.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleMessage, type Store } from './server.ts'
import type { Env, Row } from './ntab.ts'
import { loadEvents } from '../_shared/loadEvents.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const TOKEN = /^[a-f0-9]{32,128}$/

function tokenFrom(url: URL) {
  const fromQuery = url.searchParams.get('token')
  if (fromQuery) return fromQuery
  const last = url.pathname.split('/').filter(Boolean).pop() ?? ''
  return last
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  // Sin flujo de eventos (SSE): solo peticiones POST con respuesta JSON
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { ...CORS, Allow: 'POST' } })

  const token = tokenFrom(new URL(req.url))
  if (!TOKEN.test(token)) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Enlace del conector no válido' } }, 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: connector, error } = await admin.from('mcp_connectors').select('user_id,tz').eq('token', token).maybeSingle()
  if (error) return json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Error interno' } }, 500)
  if (!connector) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Este enlace ya no es válido: crea uno nuevo en NTab → Ajustes → Claude' } }, 404)
  const userId = connector.user_id as string

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
  }

  const env: Env = { tz: connector.tz || 'Europe/Madrid', now: Date.now(), autoRemind: true, newId: () => crypto.randomUUID() }

  // Los registros del usuario, leídos una vez por petición
  let cache: Row[] | null = null
  const store: Store = {
    async load() {
      if (cache) return cache
      const rows: Row[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await admin
          .from('records')
          .select('tbl,id,data')
          .eq('user_id', userId)
          .eq('deleted', false)
          .order('tbl')
          .order('id')
          .range(from, from + 999)
        if (e) throw new Error(e.message)
        rows.push(...((data ?? []) as Row[]))
        if (!data || data.length < 1000) break
      }
      const setting = rows.find((r) => r.tbl === 'settings' && r.id === 'autoRemind')
      env.autoRemind = setting?.data?.value !== false
      cache = rows
      return rows
    },
    async events(from, to) {
      const r = await loadEvents(admin, userId, from, to)
      return { events: r.events, names: r.names }
    },
    async save(writes, deletes = []) {
      const upserts = [
        ...writes.map((r) => ({ user_id: userId, tbl: r.tbl, id: r.id, data: r.data, deleted: false })),
        ...deletes.map((r) => ({ user_id: userId, tbl: r.tbl, id: r.id, data: null, deleted: true })),
      ]
      const { error: e } = await admin.from('records').upsert(upserts, { onConflict: 'user_id,tbl,id' })
      if (e) throw new Error(e.message)
      cache = null
    },
  }

  void admin.from('mcp_connectors').update({ last_used_at: new Date().toISOString() }).eq('user_id', userId).then(() => {})

  const messages = Array.isArray(body) ? body : [body]
  const replies: unknown[] = []
  for (const m of messages) {
    const r = await handleMessage(m, store, env)
    if (r !== null) replies.push(r)
  }
  if (!replies.length) return new Response(null, { status: 202, headers: CORS })
  return json(Array.isArray(body) ? replies : replies[0])
})
