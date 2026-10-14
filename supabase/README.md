# Acceso controlado por equipo (Supabase)

Modelo: un usuario pertenece a **un** equipo; todos los miembros ven y escriben los mismos datos; otro equipo solo ve los suyos.
No hay registro abierto ni sesiones anónimas. Todo el alta se hace en el panel de Supabase.

## 1. Aplicar la migración (una vez)
SQL Editor → pegar `APLICAR_TODO.sql` (o las dos migraciones en orden) → Run. Crea `teams`, `team_members`, `team_blobs` con RLS.
No toca `cloud_blobs` (copias anónimas anteriores). Cuando ya no se necesiten: `drop table public.cloud_blobs;`.

## 2. Cerrar el registro
Authentication → Sign In / Providers:
- **Allow new users to sign up**: OFF.
- **Allow anonymous sign-ins**: OFF.
- Email provider: Confirm email puede quedar ON (las cuentas se crean ya confirmadas desde el panel).
Si usas CAPTCHA (Turnstile), déjalo: la app ya envía el token al iniciar sesión.

## 3. Dar de alta personas (así de simple)
Equipo inicial: **Ecommerce**; primera persona: `appalex@hotmail.es` (ya quedó invitada en la migración `20261013b`).
1. Invitar el correo al equipo (SQL Editor):
```sql
insert into public.team_invites (email, team_id)
select 'persona@empresa.com', id from public.teams where name = 'Ecommerce'
on conflict (email) do update set team_id = excluded.team_id;
```
2. Authentication → Users → **Add user → Create new user**: ese correo + una contraseña, con «Auto Confirm User» marcado.
   Al crearlo entra solo al equipo invitado. Pasa la contraseña por un canal seguro; cada persona puede cambiarla en Configuración → Nube.
Equipo nuevo (otra empresa): `insert into public.teams (name) values ('Nombre');` y repite el paso 1 con ese nombre.
Quitar a alguien: `delete from public.team_members where user_id = (select id from auth.users where email = '...');`
Restablecer contraseña: Authentication → Users → ⋯ → Send password recovery, o ponerle una nueva.

## 4. Redirect URLs
Authentication → URL Configuration: Site URL y Redirect URLs con la URL real de GitHub Pages (para enlaces de recuperación).
