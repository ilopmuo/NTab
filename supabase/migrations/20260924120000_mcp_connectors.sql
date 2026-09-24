-- Conector de NTab para Claude (servidor MCP, Edge Function `mcp`).
-- Cada usuario tiene una URL privada con un token: quien la tenga puede leer y
-- cambiar sus tareas, así que se puede cambiar para invalidar la anterior.
-- `tz` es la zona horaria del dispositivo que la creó ("hoy", horas de los avisos).

create table if not exists public.mcp_connectors (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  tz text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.mcp_connectors enable row level security;

drop policy if exists "mcp_connectors_own" on public.mcp_connectors;
create policy "mcp_connectors_own" on public.mcp_connectors
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.mcp_connectors to authenticated;
