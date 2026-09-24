-- Captura desde fuera de la app (Siri, Atajos de iOS, hoja de compartir…).
-- Cada usuario tiene una URL privada con un token que solo permite AÑADIR
-- tareas (Edge Function `capture`). Se puede cambiar para invalidar la anterior.

create table if not exists public.capture_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  tz text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.capture_keys enable row level security;

drop policy if exists "capture_keys_own" on public.capture_keys;
create policy "capture_keys_own" on public.capture_keys
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.capture_keys to authenticated;
