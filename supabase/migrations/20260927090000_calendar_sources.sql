-- Calendarios externos (Google, iCloud, Outlook…) que NTab muestra junto a las
-- tareas. Se guarda la dirección privada .ics de cada uno; la Edge Function
-- `events` la lee y devuelve los eventos del rango pedido. Solo lectura.

create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_sources_user_idx on public.calendar_sources (user_id);

alter table public.calendar_sources enable row level security;

drop policy if exists "calendar_sources_own" on public.calendar_sources;
create policy "calendar_sources_own" on public.calendar_sources
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.calendar_sources to authenticated;
