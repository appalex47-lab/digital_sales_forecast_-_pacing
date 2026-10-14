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
