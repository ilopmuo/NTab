-- Avisos insistentes: una tarea con `nag` (minutos) repite su aviso cada `nag`
-- minutos mientras siga sin hacer, hasta 12 veces. Si se pospone, `remindAt`
-- cambia y la cuenta empieza de nuevo desde ahí. Cada repetición se apunta en
-- `push_log` con su propio momento, así que no se envía dos veces.
create or replace function public.due_nags(window_minutes int default 15)
returns table (
  user_id uuid,
  tbl text,
  item_id text,
  title text,
  remind_at timestamptz,
  due_date text,
  due_time text,
  amount numeric,
  currency text,
  repeat int
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select
      r.user_id,
      r.id,
      r.data,
      (r.data->>'remindAt')::double precision / 1000.0 as ra,
      (r.data->>'nag')::double precision * 60.0 as step
    from public.records r
    where r.tbl = 'tasks'
      and not r.deleted
      and jsonb_typeof(r.data->'remindAt') = 'number'
      and jsonb_typeof(r.data->'nag') = 'number'
      and (r.data->>'nag')::double precision >= 1
      and coalesce((r.data->>'done')::int, 0) = 0
  ),
  slots as (
    select b.*, floor((extract(epoch from now()) - b.ra) / b.step)::int as n
    from base b
    where extract(epoch from now()) > b.ra
      -- Nada que empezara hace más de un día
      and extract(epoch from now()) - b.ra < 86400
  )
  select
    s.user_id,
    'tasks'::text,
    s.id,
    coalesce(s.data->>'title', 'Recordatorio'),
    to_timestamp(s.ra + s.n * s.step),
    s.data->>'dueDate',
    s.data->>'dueTime',
    null::numeric,
    null::text,
    s.n
  from slots s
  where s.n between 1 and 12
    and to_timestamp(s.ra + s.n * s.step) >= now() - make_interval(mins => window_minutes)
    and exists (select 1 from public.push_subscriptions p where p.user_id = s.user_id)
    and not exists (
      select 1 from public.push_log l
      where l.user_id = s.user_id
        and l.tbl = 'tasks'
        and l.item_id = s.id
        and l.remind_at = to_timestamp(s.ra + s.n * s.step)
    );
$$;

revoke all on function public.due_nags(int) from public, anon, authenticated;
grant execute on function public.due_nags(int) to service_role;
