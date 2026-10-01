-- Fase 22: hábitos en pausa o con el día libre.
--
-- Un hábito puede tener días de descanso (habits.breaks: [{ from, to? }], de
-- `from` a `to` incluidos; sin `to`, en pausa hasta que se reanude). Esos días
-- no avisa. Por lo demás, igual que en 20260930090000_habit_goals.sql.

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
    select
      r.user_id,
      r.id,
      r.data,
      (now() at time zone z.tz) as local_now,
      greatest(1, coalesce((r.data->>'target')::numeric, 1)) as target,
      case when coalesce((r.data->>'perWeek')::numeric, 0) between 1 and 6 then (r.data->>'perWeek')::numeric else null end as per_week
    from public.records r
    join zone z on z.user_id = r.user_id
    where r.tbl = 'habits'
      and not r.deleted
      and coalesce((r.data->>'archived')::int, 0) = 0
      and coalesce(r.data->>'remindTime', '') ~ '^\d{2}:\d{2}$'
  ),
  -- Cantidad hecha por hábito y día (última semana larga)
  logs as (
    select l.user_id, l.data->>'habitId' as habit_id, l.data->>'date' as date, sum(coalesce((l.data->>'count')::numeric, 1)) as amount
    from public.records l
    where l.tbl = 'habitLogs'
      and not l.deleted
      and l.data->>'date' >= to_char(current_date - 8, 'YYYY-MM-DD')
    group by 1, 2, 3
  )
  select h.user_id, h.id, coalesce(h.data->>'name', 'Hábito'), to_char(h.local_now, 'YYYY-MM-DD'), h.data->>'remindTime'
  from habits h
  where (h.per_week is not null or h.data->'days' @> to_jsonb(extract(dow from h.local_now)::int))
    and h.local_now::time >= (h.data->>'remindTime')::time
    and h.local_now::time < (h.data->>'remindTime')::time + make_interval(mins => window_minutes)
    -- hoy aún no ha llegado a su objetivo
    and not exists (
      select 1 from logs l
      where l.user_id = h.user_id
        and l.habit_id = h.id
        and l.date = to_char(h.local_now, 'YYYY-MM-DD')
        and l.amount >= h.target
    )
    -- «N veces por semana»: la semana aún no está cumplida
    and (
      h.per_week is null
      or (
        select count(*) from logs l
        where l.user_id = h.user_id
          and l.habit_id = h.id
          and l.date >= to_char(date_trunc('week', h.local_now), 'YYYY-MM-DD')
          and l.date <= to_char(h.local_now, 'YYYY-MM-DD')
          and l.amount >= h.target
      ) < h.per_week
    )
    -- ni en pausa ni en un día libre (habits.breaks: [{ from, to? }], fechas locales)
    and not exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(h.data->'breaks') = 'array' then h.data->'breaks' else '[]'::jsonb end) b
      where b->>'from' <= to_char(h.local_now, 'YYYY-MM-DD')
        and (b->>'to' is null or b->>'to' >= to_char(h.local_now, 'YYYY-MM-DD'))
    )
    and not exists (
      select 1 from public.push_log p
      where p.user_id = h.user_id and p.tbl = 'habits' and p.item_id = h.id || ':' || to_char(h.local_now, 'YYYY-MM-DD')
    );
$$;

revoke all on function public.due_habit_reminders(int) from public, anon, authenticated;
grant execute on function public.due_habit_reminders(int) to service_role;
