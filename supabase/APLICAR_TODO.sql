-- RevNavigator · Acceso controlado por equipo (sin alta abierta, sin sesiones anónimas).
-- Un usuario pertenece a UN equipo; todos los miembros del equipo ven y escriben los mismos datos.
-- Aditiva: NO toca cloud_blobs (copias anónimas anteriores); se borra aparte cuando se decida.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,   -- PK: un usuario, un equipo
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists team_members_team_idx on public.team_members(team_id);

-- Equipo del usuario autenticado y NO anónimo. SECURITY DEFINER para que las políticas no se llamen a sí mismas.
create or replace function public.my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.team_id from public.team_members m
  where m.user_id = auth.uid() and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;
revoke all on function public.my_team_id() from public, anon;
grant execute on function public.my_team_id() to authenticated;

create table if not exists public.team_blobs (
  team_id uuid not null default public.my_team_id() references public.teams(id) on delete cascade,
  key text not null,
  part integer not null default 0,
  total integer not null default 1,
  payload text not null,
  bytes integer not null default 0,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (team_id, key, part)
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_blobs enable row level security;

drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using (id = public.my_team_id());

drop policy if exists members_read on public.team_members;
create policy members_read on public.team_members for select to authenticated
  using (team_id = public.my_team_id());   -- ve a los integrantes de su equipo; nadie puede escribir desde la app

drop policy if exists blobs_all on public.team_blobs;
create policy blobs_all on public.team_blobs for all to authenticated
  using (team_id = public.my_team_id()) with check (team_id = public.my_team_id());

revoke all on public.teams, public.team_members, public.team_blobs from anon;
grant select on public.teams, public.team_members to authenticated;
grant select, insert, update, delete on public.team_blobs to authenticated;
-- Altas y bajas de equipos/usuarios: solo desde el panel de Supabase (SQL Editor / Authentication), nunca desde la app.
-- Altas por correo: se «invita» un correo a un equipo y, en cuanto la persona administradora crea ese usuario en
-- Authentication → Users, el usuario queda dentro del equipo automáticamente (sin tocar team_members a mano).
create table if not exists public.team_invites (
  email text primary key check (email = lower(btrim(email))),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.team_invites enable row level security;          -- sin políticas: la app no puede leer ni escribir
revoke all on public.team_invites from anon, authenticated;

create or replace function public.handle_new_user_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.team_members (user_id, team_id)
  select new.id, i.team_id from public.team_invites i where i.email = lower(btrim(new.email))
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user_team() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_team on auth.users;
create trigger on_auth_user_created_team after insert on auth.users
  for each row execute function public.handle_new_user_team();

-- Equipo inicial y primera persona
insert into public.teams (name) select 'Ecommerce' where not exists (select 1 from public.teams where name = 'Ecommerce');
insert into public.team_invites (email, team_id)
  select 'appalex@hotmail.es', t.id from public.teams t where t.name = 'Ecommerce'
  on conflict (email) do update set team_id = excluded.team_id;
-- Si ese usuario ya existía, se agrega ahora mismo
insert into public.team_members (user_id, team_id)
  select u.id, i.team_id from auth.users u join public.team_invites i on i.email = lower(u.email)
  on conflict (user_id) do nothing;


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
