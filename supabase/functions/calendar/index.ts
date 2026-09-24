// Edge Function: calendario de NTab en formato iCalendar.
// GET /functions/v1/calendar?token=<token de calendar_feeds>
// Sin sesión (los calendarios no la envían): el token del enlace es la llave.
// Con &format=json devuelve los eventos como lista (script de Google Calendar).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildCalendar, buildEvents, type IcsBirthday, type IcsPayment, type IcsTask } from './ics.ts'

interface RecordRow {
  tbl: string
  id: string
  data: Record<string, unknown>
}

const text = (body: string, status: number) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  if (!/^[a-f0-9]{32,128}$/.test(token)) return text('Enlace no válido', 404)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: feed, error } = await admin.from('calendar_feeds').select('user_id,tz,app_url').eq('token', token).maybeSingle()
  if (error) return text('Error', 500)
  if (!feed) return text('Enlace no válido', 404)

  const rows: RecordRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error: e } = await admin
      .from('records')
      .select('tbl,id,data')
      .eq('user_id', feed.user_id)
      .eq('deleted', false)
      .in('tbl', ['tasks', 'projects', 'subscriptions', 'people'])
      .range(from, from + 999)
    if (e) return text('Error', 500)
    rows.push(...((data ?? []) as RecordRow[]))
    if (!data || data.length < 1000) break
  }

  const projects = new Map(rows.filter((r) => r.tbl === 'projects').map((r) => [r.id, String(r.data.name ?? '')]))
  const tasks: IcsTask[] = rows
    .filter((r) => r.tbl === 'tasks' && !r.data.done && typeof r.data.dueDate === 'string')
    .map((r) => ({
      id: r.id,
      title: String(r.data.title ?? ''),
      notes: typeof r.data.notes === 'string' ? r.data.notes : undefined,
      dueDate: r.data.dueDate as string,
      dueTime: typeof r.data.dueTime === 'string' ? r.data.dueTime : undefined,
      estimate: typeof r.data.estimate === 'number' ? r.data.estimate : undefined,
      priority: typeof r.data.priority === 'number' ? r.data.priority : undefined,
      projectName: typeof r.data.projectId === 'string' ? projects.get(r.data.projectId) : undefined,
    }))
  const payments: IcsPayment[] = rows
    .filter((r) => r.tbl === 'subscriptions' && r.data.active !== false && typeof r.data.nextDate === 'string')
    .map((r) => ({
      id: r.id,
      name: String(r.data.name ?? ''),
      amount: Number(r.data.amount ?? 0),
      currency: typeof r.data.currency === 'string' ? r.data.currency : 'EUR',
      nextDate: r.data.nextDate as string,
    }))
  const birthdays: IcsBirthday[] = rows
    .filter((r) => r.tbl === 'people' && typeof r.data.birthday === 'string' && r.data.birthday)
    .map((r) => ({ id: r.id, name: String(r.data.name ?? ''), birthday: r.data.birthday as string }))

  const input = { tz: feed.tz || 'Europe/Madrid', appUrl: feed.app_url, tasks, payments, birthdays }
  if (url.searchParams.get('format') === 'json') {
    return new Response(JSON.stringify({ tz: input.tz, events: buildEvents(input) }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  const ics = buildCalendar(input)
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="ntab.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
})
