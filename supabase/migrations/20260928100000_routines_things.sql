-- Rutinas y cosas.
--
-- 1. Rutinas: a su hora (routines.time, 'HH:MM'), si toca hoy y aún no está
--    completa, se avisa por push para empezarla. Como en los hábitos, la hora se
--    interpreta en la zona horaria del último dispositivo con avisos; lo enviado
--    se apunta en push_log (tbl 'routines', item_id '<id>:<fecha>').
-- 2. Cosas: los préstamos que hay que reclamar y lo que caduca llevan
--    `remindAt`, así que se añaden a los avisos normales (due_reminders).

create or replace function public.due_routine_reminders(window_minutes int default 15)
returns table (
  user_id uuid,
  routine_id text,
  name text,
  steps int,
  local_date text,
  remind_time text
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
  routines as (
    select r.user_id, r.id, r.data, (now() at time zone z.tz) as local_now
    from public.records r
    join zone z on z.user_id = r.user_id
    where r.tbl = 'routines'
      and not r.deleted
      and coalesce((r.data->>'archived')::int, 0) = 0
      and coalesce(r.data->>'time', '') ~ '^\d{2}:\d{2}$'
      and jsonb_typeof(r.data->'steps') = 'array'
      and jsonb_array_length(r.data->'steps') > 0
  )
  select
    x.user_id,
    x.id,
    coalesce(x.data->>'name', 'Rutina'),
    jsonb_array_length(x.data->'steps'),
    to_char(x.local_now, 'YYYY-MM-DD'),
    x.data->>'time'
  from routines x
  where x.data->'days' @> to_jsonb(extract(dow from x.local_now)::int)
    and x.local_now::time >= (x.data->>'time')::time
    and x.local_now::time < (x.data->>'time')::time + make_interval(mins => window_minutes)
    and not exists (
      select 1 from public.records l
      where l.user_id = x.user_id
        and l.tbl = 'routineRuns'
        and not l.deleted
        and l.data->>'routineId' = x.id
        and l.data->>'date' = to_char(x.local_now, 'YYYY-MM-DD')
        and l.data ? 'completedAt'
    )
    and not exists (
      select 1 from public.push_log p
      where p.user_id = x.user_id and p.tbl = 'routines' and p.item_id = x.id || ':' || to_char(x.local_now, 'YYYY-MM-DD')
    );
$$;

revoke all on function public.due_routine_reminders(int) from public, anon, authenticated;
grant execute on function public.due_routine_reminders(int) to service_role;

-- Avisos normales: ahora también las cosas (préstamos y caducidades)
create or replace function public.due_reminders(window_minutes int default 15)
returns table (
  user_id uuid,
  tbl text,
  item_id text,
  title text,
  remind_at timestamptz,
  due_date text,
  due_time text,
  amount numeric,
  currency text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.user_id,
    r.tbl,
    r.id,
    coalesce(r.data->>'title', r.data->>'name', 'Recordatorio'),
    to_timestamp((r.data->>'remindAt')::double precision / 1000.0),
    case
      when r.tbl = 'things' then coalesce(r.data->>'expires', r.data->>'returnBy')
      else coalesce(r.data->>'dueDate', r.data->>'nextDate')
    end,
    case when r.tbl = 'things' then r.data->>'kind' else r.data->>'dueTime' end,
    nullif(r.data->>'amount', '')::numeric,
    case when r.tbl = 'things' then coalesce(r.data->>'personName', '') else r.data->>'currency' end
  from public.records r
  where r.tbl in ('tasks', 'subscriptions', 'things')
    and not r.deleted
    and r.data ? 'remindAt'
    and jsonb_typeof(r.data->'remindAt') = 'number'
    and coalesce((r.data->>'done')::int, 0) = 0
    and coalesce((r.data->>'returned')::int, 0) = 0
    and coalesce((r.data->>'active')::boolean, true)
    and to_timestamp((r.data->>'remindAt')::double precision / 1000.0)
        between now() - make_interval(mins => window_minutes) and now()
    and exists (select 1 from public.push_subscriptions s where s.user_id = r.user_id)
    and not exists (
      select 1 from public.push_log l
      where l.user_id = r.user_id
        and l.tbl = r.tbl
        and l.item_id = r.id
        and l.remind_at = to_timestamp((r.data->>'remindAt')::double precision / 1000.0)
    );
$$;

revoke all on function public.due_reminders(int) from public, anon, authenticated;
grant execute on function public.due_reminders(int) to service_role;
