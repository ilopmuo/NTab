-- Fase 21: avisos de fecha límite.
--
-- Las tareas con fecha límite (`deadline`, YYYY-MM-DD) avisan la víspera y el
-- mismo día a la hora del ajuste settings/deadlineAlerts ({ enabled, time };
-- sin él, encendido a las 09:00), en la zona horaria del último dispositivo con
-- avisos. Lo enviado se apunta en push_log (tbl 'deadline', item_id =
-- '<tarea>:<fecha local>'), así que cada tarea avisa como mucho una vez al día.

create or replace function public.due_deadline_reminders(window_minutes int default 15)
returns table (
  user_id uuid,
  item_id text,
  title text,
  deadline text,
  local_date text,
  tomorrow text
)
language sql
stable
security definer
set search_path = ''
as $$
  with zone as (
    select distinct on (s.user_id) s.user_id, coalesce(nullif(s.tz, ''), 'Europe/Madrid') as tz
    from public.push_subscriptions s
    order by s.user_id, coalesce(s.last_used_at, s.created_at) desc
  ),
  cfg as (
    select
      z.user_id,
      (now() at time zone z.tz) as local_now,
      coalesce(nullif(c.data->'value'->>'time', ''), '09:00') as t,
      coalesce((c.data->'value'->>'enabled')::boolean, true) as enabled
    from zone z
    left join public.records c
      on c.user_id = z.user_id and c.tbl = 'settings' and c.id = 'deadlineAlerts' and not c.deleted
  )
  select
    r.user_id,
    r.id,
    coalesce(r.data->>'title', 'Tarea'),
    r.data->>'deadline',
    to_char(k.local_now, 'YYYY-MM-DD'),
    to_char(k.local_now + interval '1 day', 'YYYY-MM-DD')
  from cfg k
  join public.records r on r.user_id = k.user_id
  where k.enabled
    and k.local_now::time >= k.t::time
    and k.local_now::time < k.t::time + make_interval(mins => window_minutes)
    and r.tbl = 'tasks'
    and not r.deleted
    and coalesce((r.data->>'done')::int, 0) = 0
    and r.data->>'deadline' in (to_char(k.local_now, 'YYYY-MM-DD'), to_char(k.local_now + interval '1 day', 'YYYY-MM-DD'))
    and not exists (
      select 1 from public.push_log l
      where l.user_id = r.user_id
        and l.tbl = 'deadline'
        and l.item_id = r.id || ':' || to_char(k.local_now, 'YYYY-MM-DD')
    );
$$;

revoke all on function public.due_deadline_reminders(int) from public, anon, authenticated;
grant execute on function public.due_deadline_reminders(int) to service_role;
