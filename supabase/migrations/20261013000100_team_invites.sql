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
