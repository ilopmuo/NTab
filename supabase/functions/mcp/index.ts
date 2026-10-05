// Edge Function: conector de LUNO para Claude (servidor MCP por HTTP).
// URL: /functions/v1/mcp/<token>  (el token está en la tabla mcp_connectors)
//
// Se añade en Claude → Ajustes → Conectores → Añadir conector personalizado.
// Así se usa LUNO desde Claude con la suscripción de Claude, sin claves de API.
//
// Con la misma URL privada + /capturar (POST con el texto) se apunta desde un
// atajo de Siri: «llamar al dentista mañana a las 10», «compra: leche y pan».
// También un gasto dictado ({ gasto }) o un pago de Apple Pay desde la
// automatización «Transacción» de Atajos ({ importe, comercio }).
// Responde una frase en texto plano, para que Siri la lea.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleMessage, type Store } from './server.ts'
import { capture, captureFields, type CaptureInput, type Env, type Row } from './ntab.ts'
import { loadEvents } from '../_shared/loadEvents.ts'
import { applyHouseOps, findHouse, houseItems } from '../_shared/houseStore.ts'
import { houseAdd, pisoText } from './casa.ts'
import { ymdIn } from '../_shared/time.ts'
import { findUrl } from '../_shared/links.ts'
import { fetchTitle } from '../_shared/fetchPage.ts'

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
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[parts.length - 1] === 'capturar') parts.pop()
  return parts.pop() ?? ''
}

const isCapture = (url: URL) => url.pathname.replace(/\/+$/, '').endsWith('/capturar')
const text = (body: string, status = 200) => new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } })

/** Lo que manda el atajo: JSON ({texto}, {gasto} o {importe, comercio}), formulario, texto plano o ?texto= */
async function captureInput(req: Request, url: URL): Promise<CaptureInput> {
  const q = captureFields(Object.fromEntries(url.searchParams))
  if (q.texto || q.gasto || q.importe !== undefined) return q
  const type = req.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/json')) return captureFields((await req.json()) as Record<string, unknown>)
    if (type.includes('form')) return captureFields(Object.fromEntries(await req.formData()))
    return { texto: await req.text() }
  } catch {
    return {}
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  // Sin flujo de eventos (SSE): solo peticiones POST con respuesta JSON
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { ...CORS, Allow: 'POST' } })

  const url = new URL(req.url)
  const capturing = isCapture(url)
  const token = tokenFrom(url)
  if (!TOKEN.test(token)) {
    if (capturing) return text('Enlace no válido: cópialo de nuevo en LUNO → Ajustes → Claude y Siri.', 404)
    return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Enlace del conector no válido' } }, 404)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: connector, error } = await admin.from('mcp_connectors').select('user_id,tz').eq('token', token).maybeSingle()
  if (error) return capturing ? text('No he podido apuntarlo: error del servidor.', 500) : json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Error interno' } }, 500)
  if (!connector) {
    if (capturing) return text('Este enlace ya no es válido: cópialo de nuevo en LUNO → Ajustes → Claude y Siri.', 404)
    return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Este enlace ya no es válido: crea uno nuevo en LUNO → Ajustes → Claude y Siri' } }, 404)
  }
  const userId = connector.user_id as string


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
    // La casa compartida (ajuste `household`: el enlace del piso y quién es en él)
    async house() {
      const mine = (await store.load()).find((r) => r.tbl === 'settings' && r.id === 'household')?.data.value as { token?: string; me?: string } | null | undefined
      if (!mine?.token || !mine.me) return null
      const h = await findHouse(admin, mine.token)
      return h ? { name: h.name, items: await houseItems(admin, h.id), me: mine.me } : null
    },
    async houseOps(ops) {
      const mine = (await store.load()).find((r) => r.tbl === 'settings' && r.id === 'household')?.data.value as { token?: string } | null | undefined
      const h = mine?.token ? await findHouse(admin, mine.token) : null
      if (h) await applyHouseOps(admin, h, ops)
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

  // Atajo de Siri: apuntar sin abrir la app
  if (capturing) {
    try {
      const input = await captureInput(req, url)
      // «piso: leche y pan» → la compra del piso compartido
      const piso = typeof input.texto === 'string' ? pisoText(input.texto) : null
      if (piso) {
        const house = await store.house!()
        if (!house) return text('No tienes piso compartido en LUNO: créalo en Casa → Tareas.')
        const r = houseAdd(house, { tipo: 'compra', texto: piso }, { now: env.now, today: ymdIn(env.now, env.tz), newId: env.newId })
        if (r.ops.length) await store.houseOps!(r.ops)
        return text(r.report)
      }
      // Un enlace solo (de la hoja de compartir): se lee el título de la página
      const link = typeof input.texto === 'string' && !input.titulo ? findUrl(input.texto) : undefined
      if (link && !link.rest) input.titulo = await fetchTitle(link.url)
      const r = capture(await store.load(), input, env)
      if (r.writes.length || r.deletes?.length) await store.save(r.writes, r.deletes)
      return text(r.report.join(' '))
    } catch {
      return text('No he podido apuntarlo. Vuelve a probar en un momento.', 500)
    }
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
  }

  const messages = Array.isArray(body) ? body : [body]
  const replies: unknown[] = []
  for (const m of messages) {
    const r = await handleMessage(m, store, env)
    if (r !== null) replies.push(r)
  }
  if (!replies.length) return new Response(null, { status: 202, headers: CORS })
  return json(Array.isArray(body) ? replies : replies[0])
})
