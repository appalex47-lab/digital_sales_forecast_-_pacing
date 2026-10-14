/**
 * changeStore.js — Guarda el estado de las alertas y la foto diaria de «Qué cambió desde ayer».
 *  - Con sesión de equipo: tablas alert_states y daily_snapshots de Supabase (las ve todo el equipo, RLS por equipo).
 *  - Sin sesión, sin las tablas o sin red: respaldo en este navegador (localStorage, fuera de lo que se sincroniza).
 *  - «Mi última visita» es SIEMPRE de este navegador: se guarda al cerrar o esconder la pestaña.
 * La lógica de qué insertar/parchar vive en FP.changeEngine.reconcile (pura).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const KEY = 'fp.changes.v1';
  const MAX_SNAPS = 30;
  const E = () => FP.changeEngine;
  const empty = () => ({ rows: [], snaps: {}, lastVisit: null });
  let memo = null, visitBase = null, lastBuilt = null, lastNote = null;

  function load() {
    if (memo) return memo;
    try { const r = root.localStorage.getItem(KEY); memo = r ? Object.assign(empty(), JSON.parse(r)) : empty(); } catch (e) { memo = empty(); }
    return memo;
  }
  function save() {
    const m = load(); const days = Object.keys(m.snaps).sort(); days.slice(0, Math.max(0, days.length - MAX_SNAPS)).forEach((d) => delete m.snaps[d]);
    try { root.localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) { /* sin storage */ }
  }
  function boot() { visitBase = load().lastVisit || null; }
  const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  async function session() {
    if (!FP.cloud || !FP.cloud.loadSession || !FP.cloud.loadSession()) return null;
    const s = await FP.cloud.ensureSession(); return s.ok ? s.session : null;
  }
  const missingTable = (e) => /does not exist|PGRST205|schema cache|relation|Could not find the table|404/i.test(String(e && e.message));

  /**
   * Sincroniza: registra la foto de hoy, concilia las alertas y devuelve todo lo que la vista necesita.
   * Nunca lanza: ante cualquier fallo de la nube cae al respaldo local y lo dice en `note`.
   */
  async function sync(run, opts) {
    const o = opts || {}, today = o.today || localToday(), now = o.now || new Date().toISOString();
    const snap = E().snapshot(run, { now, today });
    lastBuilt = snap;
    const m = load();
    let rows = m.rows, snaps = Object.assign({}, m.snaps), source = 'local', note = null, ses = null;
    try { ses = o.noCloud ? null : await session(); } catch (e) { ses = null; }
    if (ses) {
      try {
        const [cr, cs] = await Promise.all([
          FP.cloud.rest('alert_states?select=*', { session: ses }),
          FP.cloud.rest(`daily_snapshots?select=day,data_day,payload&order=day.desc&limit=${MAX_SNAPS}`, { session: ses })
        ]);
        rows = cr || []; (cs || []).forEach((s) => { snaps[s.day] = s.payload; });
        const plan = E().reconcile(rows, run.alerts, today, snap.dataDay, now);
        if (plan.inserts.length) await FP.cloud.rest('alert_states?on_conflict=team_id,alert_key', { method: 'POST', body: plan.inserts.map((r) => ({ ...r, updated_by: ses.user_id })), prefer: 'resolution=ignore-duplicates,return=minimal', session: ses });
        for (const p of plan.patches) await FP.cloud.rest(`alert_states?alert_key=eq.${encodeURIComponent(p.alert_key)}`, { method: 'PATCH', body: { ...p.fields, updated_at: now, updated_by: ses.user_id }, prefer: 'return=minimal', session: ses });
        rows = E().applyTo(rows, plan);
        const prev = snaps[today];
        if (snap.dataDay && (!prev || !prev.dataDay || snap.dataDay >= prev.dataDay)) {
          await FP.cloud.rest('daily_snapshots?on_conflict=team_id,day', { method: 'POST', body: [{ day: today, data_day: snap.dataDay, payload: snap, updated_at: now, updated_by: ses.user_id }], prefer: 'resolution=merge-duplicates,return=minimal', session: ses });
          snaps[today] = snap;
        }
        source = 'cloud';
      } catch (e) {
        note = missingTable(e) ? 'La nube todavía no tiene las tablas de alertas (falta aplicar la migración 20261014_alertas_historia.sql). Se guarda solo en este navegador.' : `No pude usar la nube (${e.message}). Se guarda solo en este navegador.`;
        ses = null; rows = m.rows; snaps = Object.assign({}, m.snaps);
      }
    }
    if (!ses) {
      const plan = E().reconcile(rows, run.alerts, today, snap.dataDay, now);
      rows = E().applyTo(rows, plan);
      const prev = snaps[today]; if (snap.dataDay && (!prev || !prev.dataDay || snap.dataDay >= prev.dataDay)) snaps[today] = snap;
    }
    m.rows = rows; m.snaps = snaps; save();   // el respaldo local siempre refleja lo último que se vio
    lastNote = note;
    const days = Object.keys(snaps).sort();
    const ayer = days.filter((d) => d < today).map((d) => snaps[d]).pop() || null;
    return { source, note, today, snap, rows, ayer, visita: visitBase, week: null, userEmail: ses ? ses.email : (FP.cloud && FP.cloud.loadSession && (FP.cloud.loadSession() || {}).email) || null };
  }

  /** Cambia estado, responsable o nota de una alerta. Devuelve { ok, source, error? }. */
  async function update(key, fields, opts) {
    const m = load(), now = new Date().toISOString(), row = m.rows.find((r) => r.alert_key === key);
    if (!row) return { ok: false, error: 'La alerta ya no existe.' };
    const f = Object.assign({}, fields); if (f.status === 'resolved') f.resolved_at = now; else if (f.status) f.resolved_at = null;
    if (typeof f.note === 'string') f.note = f.note.slice(0, 500);
    let ses = null; try { ses = opts && opts.noCloud ? null : await session(); } catch (e) { ses = null; }
    let source = 'local';
    if (ses) {
      try { await FP.cloud.rest(`alert_states?alert_key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', body: { ...f, updated_at: now, updated_by: ses.user_id }, prefer: 'return=minimal', session: ses }); source = 'cloud'; }
      catch (e) { return { ok: false, error: e.message }; }
    }
    Object.assign(row, f); save();
    return { ok: true, source };
  }

  /** Guarda la última foto construida como «mi última visita» (al cerrar o esconder la pestaña). */
  function markVisit() { if (!lastBuilt) return; const m = load(); m.lastVisit = lastBuilt; save(); }
  if (root.document && root.addEventListener) {
    boot();
    root.addEventListener('pagehide', markVisit);
    root.document.addEventListener('visibilitychange', () => { if (root.document.visibilityState === 'hidden') markVisit(); });
  }

  FP.changeStore = { sync, update, markVisit, boot, localToday, _reset() { memo = null; visitBase = null; lastBuilt = null; }, _state: () => load(), note: () => lastNote };
})(typeof window !== 'undefined' ? window : globalThis);
