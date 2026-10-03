// Edge Function: casa compartida (piso con compañeros).
//
//   GET  /functions/v1/casa/<token>            → el piso: nombre y elementos
//   POST /functions/v1/casa/<token> { ops }    → aplica cambios y devuelve el piso
//   POST /functions/v1/casa { create }         → crea un piso (con la sesión del usuario)
//   POST /functions/v1/casa/<token> { admin }  → enlace nuevo o borrar el piso (solo quien lo creó)
//
// Los compañeros no tienen cuenta: el token del enlace es la llave, como en el
// calendario. Todo lo que llega se valida con _shared/house.ts.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { sanitize, type HouseItem, type HouseKind, type HouseOp } from '../_shared/house.ts'
import { applyHouseOps, findHouse, houseItems, type HouseRow } from '../_shared/houseStore.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const TOKEN = /^[a-f0-9]{32,128}$/

type Admin = SupabaseClient

const state = (h: Pick<HouseRow, 'name'>, items: HouseItem[]) => ({ name: h.name, items })

/** El usuario de la sesión (para crear el piso o cambiar su enlace) */
async function userOf(admin: Admin, req: Request) {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data } = await admin.auth.getUser(jwt)
  return data.user ?? null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)
  const url = new URL(req.url)
  const token = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {}

  try {
    // Crear un piso: quien lo crea y sus compañeros (solo nombres)
    if (!TOKEN.test(token)) {
      const create = body.create as { name?: unknown; me?: unknown; others?: unknown } | undefined
      if (req.method !== 'POST' || !create) return json({ error: 'Enlace no válido' }, 404)
      const user = await userOf(admin, req)
      if (!user) return json({ error: 'Entra con tu cuenta para crear el piso' }, 401)
      const { count } = await admin.from('households').select('id', { count: 'exact', head: true }).eq('owner', user.id)
      if ((count ?? 0) >= 5) return json({ error: 'Ya tienes 5 pisos' }, 400)
      const name = typeof create.name === 'string' && create.name.trim() ? create.name.trim().slice(0, 60) : 'Casa'
      const { data: house, error } = await admin.from('households').insert({ owner: user.id, name }).select('id,owner,name,token').single()
      if (error || !house) throw new Error(error?.message ?? 'No se ha podido crear')
      const names = [create.me, ...(Array.isArray(create.others) ? create.others : [])].filter((n): n is string => typeof n === 'string' && !!n.trim()).slice(0, 20)
      const members = names.map((n, i) => ({ id: crypto.randomUUID(), kind: 'member' as HouseKind, data: sanitize('member', { name: n, order: i }) }))
      if (members.length) await admin.from('household_items').insert(members.map((m) => ({ household_id: house.id, ...m })))
      return json({ token: house.token, me: members[0]?.id, ...state(house as HouseRow, members as HouseItem[]) })
    }

    const h = await findHouse(admin, token)
    if (!h) return json({ error: 'Este enlace ya no es válido: pide uno nuevo a quien creó el piso' }, 404)

    if (req.method === 'GET') return json(state(h, await houseItems(admin, h.id)))

    // Cambiar el enlace o borrar el piso: solo quien lo creó, con su sesión
    if (body.admin) {
      const user = await userOf(admin, req)
      if (!user || user.id !== h.owner) return json({ error: 'Solo quien creó el piso puede hacerlo' }, 403)
      if (body.admin === 'delete') {
        await admin.from('households').delete().eq('id', h.id)
        return json({ deleted: true })
      }
      if (body.admin === 'rotate') {
        const fresh = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '')
        await admin.from('households').update({ token: fresh }).eq('id', h.id)
        return json({ token: fresh })
      }
      return json({ error: 'Acción no válida' }, 400)
    }

    // Los cambios (y, de paso, fuera lo viejo: lo comprado hace semanas, las tareas sueltas ya hechas)
    // Avisos del piso en este móvil (para el miembro que dice ser)
    if (body.push) {
      const p = body.push as { member?: unknown; endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; tz?: unknown; open?: unknown }
      const items = await houseItems(admin, h.id)
      const ok =
        typeof p.endpoint === 'string' && p.endpoint.startsWith('https://') && p.endpoint.length < 1000 &&
        typeof p.keys?.p256dh === 'string' && p.keys.p256dh.length < 300 &&
        typeof p.keys?.auth === 'string' && p.keys.auth.length < 300 &&
        items.some((i) => i.kind === 'member' && i.id === p.member)
      if (!ok) return json({ error: 'Suscripción no válida' }, 400)
      const { error: e } = await admin.from('household_push').upsert(
        {
          endpoint: p.endpoint,
          household_id: h.id,
          member: p.member,
          p256dh: p.keys!.p256dh,
          auth: p.keys!.auth,
          tz: typeof p.tz === 'string' ? p.tz.slice(0, 64) : null,
          open: p.open === 'house' ? 'house' : 'piso',
        },
        { onConflict: 'endpoint' },
      )
      if (e) throw new Error(e.message)
      return json({ push: true })
    }
    if (body.unpush) {
      const endpoint = (body.unpush as { endpoint?: unknown }).endpoint
      if (typeof endpoint === 'string') await admin.from('household_push').delete().eq('household_id', h.id).eq('endpoint', endpoint)
      return json({ push: false })
    }

    const ops = Array.isArray(body.ops) ? (body.ops as HouseOp[]) : []
    return json(await applyHouseOps(admin, h, ops))
  } catch (e) {
    console.error('[casa]', e)
    return json({ error: 'Error del servidor' }, 500)
  }
})
