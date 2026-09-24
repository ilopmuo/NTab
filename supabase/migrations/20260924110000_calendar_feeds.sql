-- Calendario suscribible: un enlace privado por usuario que sirve sus tareas,
-- pagos y cumpleaños en formato iCalendar (Edge Function `calendar`).
-- El token es el único control de acceso del enlace: se puede cambiar para
-- invalidar el anterior.

create table if not exists public.calendar_feeds (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  tz text,
  app_url text,
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

drop policy if exists "calendar_feeds_own" on public.calendar_feeds;
create policy "calendar_feeds_own" on public.calendar_feeds
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.calendar_feeds to authenticated;
