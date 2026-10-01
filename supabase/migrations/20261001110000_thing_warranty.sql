-- Fase 23: garantías en «Cosas».
--
-- Una cosa puede tener fecha de fin de garantía (things.warranty). Si no tiene
-- otro aviso (caducidad o préstamo con fecha), avisa un mes antes; el texto lo
-- decide send-reminders con due_time = 'warranty'. Por lo demás, igual que en
-- 20260929090000_trackers_journal.sql.

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
      when r.tbl = 'things' then coalesce(r.data->>'expires', r.data->>'returnBy', r.data->>'warranty')
      when r.tbl = 'trackers' then r.data->'log'->>0
      else coalesce(r.data->>'dueDate', r.data->>'nextDate')
    end,
    case
      -- Sin caducidad ni préstamo con fecha, el aviso es por el fin de la garantía
      when r.tbl = 'things' and r.data->>'expires' is null and r.data->>'returnBy' is null and r.data ? 'warranty' then 'warranty'
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
