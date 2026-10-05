/**
 * auth.js — Login (Supabase Auth) + acceso a datos multi-tenant.
 *
 * Requiere, ANTES de este archivo, el CDN de supabase-js:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *
 * La anon key es pública por diseño: la seguridad la da RLS (supabase/schema.sql),
 * nunca pongas aquí la service_role key.
 */
(function (root) {
  'use strict';

  const SUPABASE_URL = 'https://odsaouldxxjurniizefc.supabase.co/rest/v1/';   // ← reemplazar
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kc2FvdWxkeHhqdXJuaWl6ZWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExNDU1MTYsImV4cCI6MjEwNjcyMTUxNn0.saH_lO9hjm4OoSsZdMQ668-cD3A1lgGsIrEaODeYww8';           // ← reemplazar

  const FP = (root.FP = root.FP || {});
  const $ = (id) => document.getElementById(id);

  if (!root.supabase) {
    console.error('[auth] supabase-js no cargó (revisa el <script> del CDN).');
    return;
  }
  const sb = root.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const els = {
    overlay: $('auth-overlay'), form: $('auth-form'), email: $('auth-email'),
    password: $('auth-password'), submit: $('auth-submit'), error: $('auth-error'),
    controls: $('session-controls'), userEmail: $('session-email'), logout: $('btn-logout')
  };

  // ---- UI según sesión -------------------------------------------------
  function render(session) {
    const logged = !!session;
    document.body.classList.toggle('auth-locked', !logged);
    els.overlay.hidden = logged;
    els.controls.hidden = !logged;
    els.userEmail.textContent = logged ? session.user.email : '';
    if (logged) { els.form.reset(); showError(''); }
    else els.email.focus();
  }

  function showError(msg) { els.error.textContent = msg; els.error.hidden = !msg; }

  // Estado inicial: bloqueado hasta que Supabase confirme la sesión.
  render(null);

  // INITIAL_SESSION se emite al cargar (con o sin sesión previa en localStorage).
  // No hacer llamadas async a supabase dentro del callback: puede bloquearse; se difiere.
  sb.auth.onAuthStateChange((event, session) => {
    render(session);
    setTimeout(() => document.dispatchEvent(
      new CustomEvent('auth:changed', { detail: { event, session } })), 0);
  });

  // ---- Login / logout --------------------------------------------------
  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    els.submit.disabled = true;
    const { error } = await sb.auth.signInWithPassword({
      email: els.email.value.trim(), password: els.password.value
    });
    els.submit.disabled = false;
    if (error) showError('Correo o contraseña incorrectos.');
    // En éxito, onAuthStateChange(SIGNED_IN) oculta el modal.
  });

  els.logout.addEventListener('click', async () => {
    const { error } = await sb.auth.signOut();
    if (error) console.error('[auth] signOut:', error.message);
  });

  // ---- Ejemplos de datos con RLS --------------------------------------
  // Nunca filtramos por user_id en el cliente: RLS ya devuelve solo las filas
  // del usuario autenticado. En el insert, user_id se rellena solo
  // (default auth.uid()) y la política WITH CHECK rechaza cualquier otro valor.

  /** Lee la configuración del usuario actual. Otro usuario jamás verá estas filas. */
  async function loadSettings(key = 'forecast_config') {
    const { data, error } = await sb
      .from('user_settings')
      .select('key, value, updated_at')
      .eq('key', key)
      .maybeSingle();               // 0 filas → null (no error)
    if (error) throw error;
    return data ? data.value : null;
  }

  /** Crea o actualiza la configuración del usuario actual (unique user_id+key). */
  async function saveSettings(value, key = 'forecast_config') {
    const { data, error } = await sb
      .from('user_settings')
      .upsert({ key, value }, { onConflict: 'user_id,key' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  FP.auth = { client: sb, loadSettings, saveSettings };
})(window);
