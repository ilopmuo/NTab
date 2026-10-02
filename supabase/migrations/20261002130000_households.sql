-- Casa compartida: un piso con sus miembros, tareas de casa con turnos, la
-- compra común y las cuentas. Lo crea alguien con cuenta; sus compañeros
-- entran con el enlace privado (sin cuenta), así que todo pasa por la Edge
-- Function `casa`, que comprueba el token. Sin políticas: el navegador no lee
-- estas tablas directamente.

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Casa',
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create index if not exists households_owner on public.households (owner);

create table if not exists public.household_items (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('member', 'chore', 'shop', 'expense')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

alter table public.households enable row level security;
alter table public.household_items enable row level security;
