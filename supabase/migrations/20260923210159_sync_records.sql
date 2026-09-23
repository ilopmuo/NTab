-- Sincronización de NTab entre dispositivos.
--
-- La app guarda sus datos en IndexedDB (Dexie). Cada registro local
-- (tarea, proyecto, nota, hábito…) se refleja aquí como una fila JSON.
-- Una tabla genérica evita tener que migrar la base de datos cada vez
-- que la app añade un campo nuevo.

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- tabla local de origen: tasks, projects, areas, notes, habits…
  tbl text not null,
  -- clave primaria del registro en la app
  id text not null,
  -- el registro completo; null cuando está borrado
  data jsonb,
  deleted boolean not null default false,
  -- lo fija el servidor en cada escritura; los dispositivos piden "lo cambiado desde X"
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

-- Cada usuario solo puede ver y tocar sus propias filas.
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "records_delete_own" on public.records;
create policy "records_delete_own" on public.records
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.records to authenticated;

-- updated_at siempre con el reloj del servidor (no el del dispositivo)
create or replace function public.records_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch();

-- Avisos en tiempo real: cuando cambias algo en el móvil, el ordenador se entera al momento.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records'
     ) then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;
