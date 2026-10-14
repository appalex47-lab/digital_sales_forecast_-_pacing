# Acceso controlado por equipo (Supabase)

Modelo: un usuario pertenece a **un** equipo; todos los miembros ven y escriben los mismos datos; otro equipo solo ve los suyos.
No hay registro abierto ni sesiones anónimas. Todo el alta se hace en el panel de Supabase.

## 1. Aplicar la migración (una vez)
SQL Editor → pegar `migrations/20261013_teams_login.sql` → Run. Crea `teams`, `team_members`, `team_blobs` con RLS.
No toca `cloud_blobs` (copias anónimas anteriores). Cuando ya no se necesiten: `drop table public.cloud_blobs;`.

## 2. Cerrar el registro
Authentication → Sign In / Providers:
- **Allow new users to sign up**: OFF.
- **Allow anonymous sign-ins**: OFF.
- Email provider: Confirm email puede quedar ON (las cuentas se crean ya confirmadas desde el panel).
Si usas CAPTCHA (Turnstile), déjalo: la app ya envía el token al iniciar sesión.

## 3. Crear el equipo y las personas
```sql
insert into public.teams (name) values ('Ecommerce') returning id;   -- copia el id
```
Authentication → Users → **Add user → Create new user** (correo + contraseña, marcar «Auto Confirm User»). Luego:
```sql
insert into public.team_members (user_id, team_id)
select id, '<ID-DEL-EQUIPO>' from auth.users where email = 'persona@empresa.com';
```
Quitar a alguien: `delete from public.team_members where user_id = (select id from auth.users where email = '...');`
Restablecer contraseña: Authentication → Users → ⋯ → Send password recovery, o ponerle una nueva.

## 4. Redirect URLs
Authentication → URL Configuration: Site URL y Redirect URLs con la URL real de GitHub Pages (para enlaces de recuperación).
