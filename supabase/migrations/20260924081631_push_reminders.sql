-- Avisos con la app cerrada (Web Push).
--
-- 1. Cada dispositivo que activa los avisos guarda aquí su suscripción push.
-- 2. La app calcula `remindAt` (ms) en cada tarea/suscripción y lo sincroniza
--    dentro de `records.data`.
-- 3. Cada minuto, pg_cron llama a la Edge Function `send-reminders`, que pide
--    a `due_reminders()` los avisos que tocan y envía las notificaciones.
-- 4. `push_log` apunta lo enviado para no repetir un aviso.

-- ── Suscripciones de los dispositivos ─────────────────────────
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  tz text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ── Avisos ya enviados (solo lo usa el servidor) ──────────────
create table if not exists public.push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  tbl text not null,
  item_id text not null,
  remind_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, tbl, item_id, remind_at)
);

alter table public.push_log enable row level security;
-- Sin políticas: ningún usuario puede leerla ni escribirla; solo el servidor (service_role).

-- ── Avisos pendientes ─────────────────────────────────────────
-- Devuelve lo que tenía que avisar en los últimos `window_minutes` minutos y
-- aún no se ha enviado. La ventana permite recuperar avisos si el cron se salta
-- alguna vuelta, sin mandar avisos muy antiguos.
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
    coalesce(r.data->>'dueDate', r.data->>'nextDate'),
    r.data->>'dueTime',
    nullif(r.data->>'amount', '')::numeric,
    r.data->>'currency'
  from public.records r
  where r.tbl in ('tasks', 'subscriptions')
    and not r.deleted
    and r.data ? 'remindAt'
    and jsonb_typeof(r.data->'remindAt') = 'number'
    and coalesce((r.data->>'done')::int, 0) = 0
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

-- ── Cada minuto: enviar los avisos ────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ntab-send-reminders') then
    perform cron.unschedule('ntab-send-reminders');
  end if;
end;
$$;

-- La clave "anon" es pública (va dentro de la web): solo sirve para que la
-- función acepte la llamada. La función usa internamente su propia clave de servicio.
select cron.schedule(
  'ntab-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://dmvvlfouwxyepnmrbnfx.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdnZsZm91d3h5ZXBubXJibmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxOTM1ODAsImV4cCI6MjEwNTc2OTU4MH0.R8a4M8AkSRFLQ865fCGFAJ6Y3iwQYcZvTEUTtV806R0'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
