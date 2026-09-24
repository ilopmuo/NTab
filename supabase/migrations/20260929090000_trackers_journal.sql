-- Fase 12.
--
-- 1. «Última vez» (tbl 'trackers'): cuando toca volver a hacer algo, el
--    registro lleva `remindAt` y se avisa como el resto (due_reminders). En
--    due_date va la última vez que se hizo y en currency cada cuántos días.
-- 2. Diario: aviso por la noche si hoy aún no se ha escrito. La hora está en
--    los ajustes (settings/journalReminder, { enabled, time: 'HH:MM' }) y se
--    interpreta en la zona horaria del último dispositivo con avisos. Lo
--    enviado se apunta en push_log (tbl 'journal', item_id = fecha).

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
      when r.tbl = 'trackers' then r.data->'log'->>0
      else coalesce(r.data->>'dueDate', r.data->>'nextDate')
    end,
    case
      when r.tbl = 'things' then r.data->>'kind'
      when r.tbl = 'trackers' then 'tracker'
      else r.data->>'dueTime'
    end,
    nullif(r.data->>'amount', '')::numeric,
    case
      when r.tbl = 'things' then coalesce(r.data->>'personName', '')
      when r.tbl = 'trackers' then coalesce(r.data->>'every', '')
      else r.data->>'currency'
    end
  from public.records r
  where r.tbl in ('tasks', 'subscriptions', 'things', 'trackers')
    and not r.deleted
    and r.data ? 'remindAt'
    and jsonb_typeof(r.data->'remindAt') = 'number'
    and coalesce((r.data->>'done')::int, 0) = 0
    and coalesce((r.data->>'returned')::int, 0) = 0
    and coalesce((r.data->>'archived')::int, 0) = 0
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

create or replace function public.due_journal_reminders(window_minutes int default 15)
returns table (
  user_id uuid,
  local_date text,
  done_today int
)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select r.user_id, coalesce(nullif(r.data->'value'->>'time', ''), '21:30') as t
    from public.records r
    where r.tbl = 'settings'
      and r.id = 'journalReminder'
      and not r.deleted
      and coalesce((r.data->'value'->>'enabled')::boolean, false)
  ),
  zone as (
    select distinct on (s.user_id) s.user_id, coalesce(nullif(s.tz, ''), 'Europe/Madrid') as tz
    from public.push_subscriptions s
    order by s.user_id, coalesce(s.last_used_at, s.created_at) desc
  ),
  ready as (
    select c.user_id, (now() at time zone z.tz) as local_now, c.t
    from cfg c
    join zone z on z.user_id = c.user_id
  )
  select
    k.user_id,
    to_char(k.local_now, 'YYYY-MM-DD'),
    (
      select count(*)::int from public.records t
      where t.user_id = k.user_id
        and t.tbl = 'tasks'
        and not t.deleted
        and coalesce((t.data->>'done')::int, 0) = 1
        and jsonb_typeof(t.data->'completedAt') = 'number'
        and to_char(to_timestamp((t.data->>'completedAt')::double precision / 1000.0) at time zone (select z.tz from zone z where z.user_id = k.user_id), 'YYYY-MM-DD') = to_char(k.local_now, 'YYYY-MM-DD')
    )
  from ready k
  where k.local_now::time >= k.t::time
    and k.local_now::time < k.t::time + make_interval(mins => window_minutes)
    and not exists (
      select 1 from public.records j
      where j.user_id = k.user_id
        and j.tbl = 'journal'
        and j.id = to_char(k.local_now, 'YYYY-MM-DD')
        and not j.deleted
        and (j.data ? 'mood' or coalesce(j.data->>'text', '') <> '')
    )
    and not exists (
      select 1 from public.push_log l
      where l.user_id = k.user_id and l.tbl = 'journal' and l.item_id = to_char(k.local_now, 'YYYY-MM-DD')
    );
$$;

revoke all on function public.due_journal_reminders(int) from public, anon, authenticated;
grant execute on function public.due_journal_reminders(int) to service_role;
