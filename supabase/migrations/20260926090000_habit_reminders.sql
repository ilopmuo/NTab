-- Recordatorios de hábitos: a la hora elegida (habits.remindTime, 'HH:MM'),
-- si el hábito toca hoy y aún no está marcado, se avisa por push.
-- Como el resumen de la mañana, la hora se interpreta en la zona horaria del
-- último dispositivo con avisos, y lo enviado se apunta en push_log
-- (tbl 'habits', item_id '<id del hábito>:<fecha>').

create or replace function public.due_habit_reminders(window_minutes int default 15)
returns table (
  user_id uuid,
  habit_id text,
  name text,
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
  habits as (
    select r.user_id, r.id, r.data, z.tz, (now() at time zone z.tz) as local_now
    from public.records r
    join zone z on z.user_id = r.user_id
    where r.tbl = 'habits'
      and not r.deleted
      and coalesce((r.data->>'archived')::int, 0) = 0
      and coalesce(r.data->>'remindTime', '') ~ '^\d{2}:\d{2}$'
  )
  select h.user_id, h.id, coalesce(h.data->>'name', 'Hábito'), to_char(h.local_now, 'YYYY-MM-DD'), h.data->>'remindTime'
  from habits h
  where h.data->'days' @> to_jsonb(extract(dow from h.local_now)::int)
    and h.local_now::time >= (h.data->>'remindTime')::time
    and h.local_now::time < (h.data->>'remindTime')::time + make_interval(mins => window_minutes)
    and not exists (
      select 1 from public.records l
      where l.user_id = h.user_id
        and l.tbl = 'habitLogs'
        and not l.deleted
        and l.data->>'habitId' = h.id
        and l.data->>'date' = to_char(h.local_now, 'YYYY-MM-DD')
    )
    and not exists (
      select 1 from public.push_log p
      where p.user_id = h.user_id and p.tbl = 'habits' and p.item_id = h.id || ':' || to_char(h.local_now, 'YYYY-MM-DD')
    );
$$;

revoke all on function public.due_habit_reminders(int) from public, anon, authenticated;
grant execute on function public.due_habit_reminders(int) to service_role;
