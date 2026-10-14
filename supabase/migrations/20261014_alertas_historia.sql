-- RevNavigator · Alertas con estado compartido e historial diario («Qué cambió desde ayer»).
-- Aditiva: no toca team_blobs ni las demás tablas. Mismo aislamiento por equipo (my_team_id()).
-- Se puede correr varias veces sin romper nada.

-- 1. Estado de cada alerta del equipo (una fila por alerta: tipo|canal).
create table if not exists public.alert_states (
  team_id uuid not null default public.my_team_id() references public.teams(id) on delete cascade,
  alert_key text not null check (length(alert_key) between 1 and 120),
  type text not null check (length(type) <= 60),
  channel text not null check (length(channel) <= 60),
  message text not null default '' check (length(message) <= 500),
  status text not null default 'open' check (status in ('open', 'seen', 'following', 'resolved')),
  owner_email text check (owner_email is null or length(owner_email) <= 200),
  note text check (note is null or length(note) <= 500),
  first_seen date not null,
  last_seen date not null,
  last_data_day date,                                   -- hasta qué día de venta real llegaban los datos cuando se vio por última vez
  resolved_at timestamptz,
  times_opened integer not null default 1 check (times_opened >= 1),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, alert_key)
);

-- 2. Foto diaria de las cifras clave (una por día y equipo): base de «desde ayer».
create table if not exists public.daily_snapshots (
  team_id uuid not null default public.my_team_id() references public.teams(id) on delete cascade,
  day date not null,
  data_day date,                                        -- último día con venta real en todos los canales
  payload jsonb not null check (pg_column_size(payload) < 60000),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, day)
);

alter table public.alert_states enable row level security;
alter table public.daily_snapshots enable row level security;

drop policy if exists alert_states_all on public.alert_states;
create policy alert_states_all on public.alert_states for all to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());

drop policy if exists daily_snapshots_all on public.daily_snapshots;
create policy daily_snapshots_all on public.daily_snapshots for all to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());

revoke all on public.alert_states, public.daily_snapshots from anon;
grant select, insert, update, delete on public.alert_states, public.daily_snapshots to authenticated;
