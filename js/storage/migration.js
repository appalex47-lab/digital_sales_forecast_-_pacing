/**
 * migration.js — Migración NO destructiva de localStorage → IndexedDB (Fase 8.1).
 *
 *   localStorage (fuente) ─copia─▶ IndexedDB kv ─lectura directa─▶ verificación ─▶ estado 'verified'
 *
 * - Solo se copian claves de datos (config.storageDb.dataKeys); preferencias y banderas se quedan.
 * - localStorage NUNCA se borra aquí: queda como respaldo hasta una decisión explícita del usuario.
 * - Idempotente: la copia es por clave (put), así que repetirla no duplica. Si IndexedDB ya tiene una versión
 *   más reciente de una clave (la app siguió guardando después de migrar), no se sobrescribe.
 * - Verificación: además de "hay datos", compara el contenido (JSON idéntico) y un resumen por clave
 *   (registros, lotes, fechas mínima/máxima, canales, versiones).
 * - Estado en localStorage `storageMigration`: pending → copying → verified | failed (con intentos y error).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  /** Resumen comparable de un dato guardado (colección empaquetada, registro de versiones u otro). */
  function summarize(data) {
    const s = { type: Array.isArray(data) ? 'array' : typeof data, records: null, batches: null, dateMin: null, dateMax: null, channels: [], versions: null, bytes: JSON.stringify(data === undefined ? null : data).length };
    if (!data || typeof data !== 'object') return s;
    if (Array.isArray(data.records)) {
      s.records = data.records.length;
      const dates = [], ch = new Set();
      data.records.forEach((r) => {
        const d = Array.isArray(r) ? r[0] : r && r.date;
        const c = Array.isArray(r) ? r[1] : r && r.channel;
        if (d) dates.push(d);
        if (c) ch.add(c);
      });
      dates.sort();
      s.dateMin = dates[0] || null; s.dateMax = dates[dates.length - 1] || null; s.channels = [...ch].sort();
    }
    if (Array.isArray(data.batches)) s.batches = data.batches.length;
    if (Array.isArray(data.versions)) s.versions = data.versions.length;
    if (Array.isArray(data.scenarios)) s.versions = data.scenarios.length;
    if (Array.isArray(data.actions)) s.versions = data.actions.length;
    return s;
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /** Lee el estado de migración (bandera pequeña en localStorage). */
  function status(ls) {
    const env = ls.load(C().storage.keys.storageMigration);
    return env && env.data ? env.data : { schema: C().storageDb.migrationSchema, status: 'pending', attempts: 0, keys: [] };
  }

  /**
   * Ejecuta (o reintenta) la migración.
   * @param {object} p { ls: FP.storage de localStorage, lsAdapter: adaptador crudo (keys/get), repo, force }
   * @returns estado final
   */
  async function migrate({ ls, lsAdapter, repo, force = false }) {
    const ns = C().storage.namespace;
    const prev = status(ls);
    if (!repo.ready) return { ...prev, status: prev.status === 'verified' ? 'verified' : 'unavailable', error: repo.lastError };
    if (prev.status === 'verified' && !force && prev.schema === C().storageDb.migrationSchema) return prev;

    const st = { schema: C().storageDb.migrationSchema, status: 'copying', attempts: (prev.attempts || 0) + 1, startedAt: new Date().toISOString(), keys: [], error: null };
    ls.save(C().storage.keys.storageMigration, st);
    try {
      const keys = lsAdapter.keys().filter((k) => k.startsWith(`${ns}:`)).map((k) => k.slice(ns.length + 1)).filter(FP.repository.isDataKey);
      for (const key of keys) {
        const env = ls.load(key);
        if (!env) { st.keys.push({ key, action: 'skipped', reason: 'Valor ilegible en localStorage' }); continue; }
        const existing = await repo.kvRead(key);
        if (existing && existing.savedAt && env.savedAt && existing.savedAt > env.savedAt) {
          st.keys.push({ key, action: 'kept_newer', source: summarize(env.data), target: summarize(existing.data) });
          continue;
        }
        await repo.kvPut(key, env);
        st.keys.push({ key, action: 'copied', source: summarize(env.data) });
      }
      // Verificación contra la fuente, leyendo directo de IndexedDB (no de la caché)
      const problems = [];
      for (const k of st.keys.filter((x) => x.action === 'copied')) {
        const src = ls.load(k.key);
        const dst = await repo.kvRead(k.key);
        k.target = dst ? summarize(dst.data) : null;
        k.verified = Boolean(dst) && same(src.data, dst.data) && same(summarize(src.data), k.target);
        if (!k.verified) problems.push(k.key);
      }
      st.status = problems.length ? 'failed' : 'verified';
      st.error = problems.length ? `No coinciden: ${problems.join(', ')}` : null;
    } catch (e) {
      st.status = 'failed';
      st.error = String(e && e.message || e);
    }
    st.finishedAt = new Date().toISOString();
    st.localStorageKept = true;
    ls.save(C().storage.keys.storageMigration, st);
    return st;
  }

  FP.storageMigration = { migrate, status, summarize };
})(typeof window !== 'undefined' ? window : globalThis);
