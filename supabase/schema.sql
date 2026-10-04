-- =====================================================================
-- Multi-tenant: una fila de configuración por usuario, aislada con RLS.
-- Ejecutar en Supabase → SQL Editor.
-- =====================================================================

create table if not exists public.user_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  key         text not null,                       -- p. ej. 'forecast_config'
  value       jsonb not null default '{}'::jsonb,  -- payload de configuración
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, key)                            -- habilita upsert por usuario+clave
);

create index if not exists user_settings_user_id_idx on public.user_settings (user_id);

-- Mantiene updated_at al día
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_user_settings_updated_at on public.user_settings;
create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
drop policy if exists "user_settings_delete_own" on public.user_settings;

create policy "user_settings_select_own" on public.user_settings
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_settings_update_own" on public.user_settings
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "user_settings_delete_own" on public.user_settings
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Sin acceso anónimo
revoke all on public.user_settings from anon;
grant select, insert, update, delete on public.user_settings to authenticated;

-- ---------------------------------------------------------------------
-- Sin registro público: crea los usuarios a mano en
-- Authentication → Users → Add user (y desactiva "Allow new users to sign up"
-- en Authentication → Providers → Email).
-- ---------------------------------------------------------------------
