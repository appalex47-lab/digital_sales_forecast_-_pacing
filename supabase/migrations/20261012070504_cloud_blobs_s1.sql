-- RevNavigator · copias anónimas anteriores (cloud_blobs). Ya está aplicada en el proyecto con esta misma versión (20261012070504, «cloud_blobs_s1»);
-- este archivo existe para que el historial de migraciones local coincida con el remoto. Es idempotente: no cambia nada si la tabla ya existe.
-- Reconstruida a partir de la tabla y las políticas vigentes. Se borra aparte cuando se decida (ver README: `drop table public.cloud_blobs;`).

create table if not exists public.cloud_blobs (
  user_id uuid not null default auth.uid() references auth.users(id),
  key text not null,
  part integer not null default 0,
  total integer not null default 1,
  payload text not null,
  bytes integer not null default 0,
  is_sample boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, key, part)
);

alter table public.cloud_blobs enable row level security;

drop policy if exists cloud_blobs_select_own on public.cloud_blobs;
create policy cloud_blobs_select_own on public.cloud_blobs for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists cloud_blobs_insert_own on public.cloud_blobs;
create policy cloud_blobs_insert_own on public.cloud_blobs for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists cloud_blobs_update_own on public.cloud_blobs;
create policy cloud_blobs_update_own on public.cloud_blobs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists cloud_blobs_delete_own on public.cloud_blobs;
create policy cloud_blobs_delete_own on public.cloud_blobs for delete to authenticated using ((select auth.uid()) = user_id);
