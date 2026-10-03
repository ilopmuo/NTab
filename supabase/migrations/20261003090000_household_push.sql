-- Avisos del piso compartido, también para los compañeros sin cuenta: cada
-- móvil que los activa guarda aquí su suscripción push, unida a un miembro del
-- piso (no a un usuario). `send-reminders` les avisa por la mañana de lo que les
-- toca y por la tarde de lo que sigue sin hacer; `household_push_log` evita
-- repetir un aviso el mismo día. Sin políticas: solo las Edge Functions.

create table if not exists public.household_push (
  endpoint text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  member text not null,
  p256dh text not null,
  auth text not null,
  tz text,
  -- dónde abre el aviso: la página del piso (compañeros) o Casa → Tareas (quien usa LUNO)
  open text not null default 'piso' check (open in ('piso', 'house')),
  created_at timestamptz not null default now()
);

create index if not exists household_push_house on public.household_push (household_id);

create table if not exists public.household_push_log (
  household_id uuid not null references public.households (id) on delete cascade,
  member text not null,
  kind text not null,
  day text not null,
  sent_at timestamptz not null default now(),
  primary key (household_id, member, kind, day)
);

alter table public.household_push enable row level security;
alter table public.household_push_log enable row level security;

-- La compra del piso recuerda lo que más compráis («lo de siempre») y su precio
alter table public.household_items drop constraint if exists household_items_kind_check;
alter table public.household_items add constraint household_items_kind_check check (kind in ('member', 'chore', 'shop', 'expense', 'usual'));
