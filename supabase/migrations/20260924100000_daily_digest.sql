-- Resumen de la mañana: una notificación diaria con lo que toca hoy.
--
-- La hora se guarda en los ajustes del usuario (registro settings/dailyDigest,
-- { enabled, time: 'HH:MM' }) y se interpreta en la zona horaria del último
-- dispositivo con avisos. La Edge Function send-reminders (cada minuto) pide
-- aquí los resúmenes pendientes y apunta los enviados en push_log (tbl 'digest').

create or replace function public.due_digests(window_minutes int default 15)
returns table (
  user_id uuid,
  local_date text,
  tz text,
  today_count int,
  overdue_count int,
  titles text[],
  payments int
)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select r.user_id, coalesce(nullif(r.data->'value'->>'time', ''), '08:00') as t
    from public.records r
    where r.tbl = 'settings'
      and r.id = 'dailyDigest'
      and not r.deleted
      and coalesce((r.data->'value'->>'enabled')::boolean, false)
  ),
  zone as (
    select distinct on (s.user_id) s.user_id, coalesce(nullif(s.tz, ''), 'Europe/Madrid') as tz
    from public.push_subscriptions s
    order by s.user_id, coalesce(s.last_used_at, s.created_at) desc
  ),
  clock as (
    select c.user_id, z.tz, c.t, (now() at time zone z.tz) as local_now
    from cfg c
    join zone z on z.user_id = c.user_id
  ),
  ready as (
    select k.user_id, k.tz, to_char(k.local_now, 'YYYY-MM-DD') as local_date
    from clock k
    where k.local_now::time >= k.t::time
      and k.local_now::time < k.t::time + make_interval(mins => window_minutes)
      and not exists (
        select 1 from public.push_log l
        where l.user_id = k.user_id and l.tbl = 'digest' and l.item_id = to_char(k.local_now, 'YYYY-MM-DD')
      )
  ),
  open_tasks as (
    select r.user_id, r.data
    from public.records r
    join ready rd on rd.user_id = r.user_id
    where r.tbl = 'tasks'
      and not r.deleted
      and coalesce((r.data->>'done')::int, 0) = 0
      and r.data->>'dueDate' <= rd.local_date
  )
  select
    rd.user_id,
    rd.local_date,
    rd.tz,
    (select count(*)::int from open_tasks o where o.user_id = rd.user_id and o.data->>'dueDate' = rd.local_date),
    (select count(*)::int from open_tasks o where o.user_id = rd.user_id and o.data->>'dueDate' < rd.local_date),
    array(
      select o.data->>'title'
      from open_tasks o
      where o.user_id = rd.user_id
      order by
        (o.data->>'dueDate' = rd.local_date) desc,
        o.data->>'dueTime' nulls last,
        coalesce((o.data->>'priority')::int, 0) desc
      limit 3
    ),
    (
      select count(*)::int from public.records r
      where r.user_id = rd.user_id
        and r.tbl = 'subscriptions'
        and not r.deleted
        and coalesce((r.data->>'active')::boolean, true)
        and r.data->>'nextDate' = rd.local_date
    )
  from ready rd;
$$;

revoke all on function public.due_digests(int) from public, anon, authenticated;
grant execute on function public.due_digests(int) to service_role;
