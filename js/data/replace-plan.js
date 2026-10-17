/**
 * replace-plan.js — Reemplazo de un archivo cargado por su versión nueva (Google Sheets «Actualizar» o archivo suelto).
 * Módulo puro (sin DOM ni almacenamiento): compara la versión anterior con la nueva y decide si hace falta una confirmación extra.
 *
 * Resumen de una versión: { rows, dateMin, dateMax, dayRev: {fecha: venta} | null, keys: Map llave→firma | null }.
 *   - keys sólo existe cuando se tienen las filas (almacén de venta real); con él se cuentan nuevas / modificadas / quitadas.
 *   - dayRev sólo existe cuando se conoce la venta por día; sin él no se evalúa la regla de venta.
 * Reglas de confirmación extra (umbrales ajustables en Ajustes):
 *   1) la versión nueva trae más de `rowsDropPct` menos filas;
 *   2) el periodo se acorta (se pierde cualquier día al inicio o al final, sin margen);
 *   3) la venta sumada de los días que están en ambas versiones cambia más de `revenueChangePct`.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const DEFAULT_RULES = { rowsDropPct: 0.2, revenueChangePct: 0.05 };

  const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
  function sig(r) {
    const m = (r && r.metrics) || {};
    return Object.keys(m).sort().map((k) => `${k}:${m[k] && m[k].value !== undefined && m[k].value !== null ? m[k].value : ''}`).join('|');
  }

  /** Resumen a partir de registros canónicos del almacén (venta real, plan, histórico, segmentos). */
  function fromRecords(records) {
    const keys = new Map(), dayRev = {};
    let dateMin = null, dateMax = null;
    for (const r of records || []) {
      keys.set(r.key, sig(r));
      if (r.date) { if (dateMin === null || r.date < dateMin) dateMin = r.date; if (dateMax === null || r.date > dateMax) dateMax = r.date; }
      const rev = r.metrics && r.metrics.revenue && r.metrics.revenue.value;
      if (r.date && typeof rev === 'number' && isFinite(rev)) dayRev[r.date] = (dayRev[r.date] || 0) + rev;
    }
    return { rows: keys.size, dateMin, dateMax, dayRev, keys };
  }

  /** Resumen a partir del resumen guardado de un lote de productos (rows = SKU-días aceptados). */
  function fromProductBatch(b) {
    const s = (b && b.summary) || {};
    return { rows: num(s.accepted), dateMin: s.dateMin || null, dateMax: s.dateMax || null, dayRev: s.dayRev || null, keys: null };
  }

  function compare(oldS, newS) {
    const out = { oldRows: oldS.rows, newRows: newS.rows, oldRange: [oldS.dateMin, oldS.dateMax], newRange: [newS.dateMin, newS.dateMax],
      added: null, removed: null, changed: null, same: null, overlapDays: null, overlapOld: null, overlapNew: null, overlapPct: null };
    if (oldS.keys && newS.keys) {
      let added = 0, changed = 0, same = 0;
      newS.keys.forEach((s, k) => { if (!oldS.keys.has(k)) added++; else if (oldS.keys.get(k) === s) same++; else changed++; });
      out.added = added; out.changed = changed; out.same = same; out.removed = oldS.keys.size - same - changed;
    }
    if (oldS.dayRev && newS.dayRev) {
      let a = 0, b = 0, n = 0;
      for (const d in oldS.dayRev) if (Object.prototype.hasOwnProperty.call(newS.dayRev, d)) { a += oldS.dayRev[d]; b += newS.dayRev[d]; n++; }
      out.overlapDays = n; out.overlapOld = a; out.overlapNew = b;
      out.overlapPct = n && a ? (b - a) / Math.abs(a) : (n && b ? 1 : 0);
    }
    return out;
  }

  /** → { flags:[{id,text}], needsConfirm }. `rules` = { rowsDropPct, revenueChangePct } (fracciones). */
  function assess(cmp, rules) {
    const R = { ...DEFAULT_RULES, ...(rules || {}) };
    const flags = [];
    const pct = (x) => `${(x * 100).toFixed(1).replace(/\.0$/, '')} %`;
    if (cmp.oldRows > 0) {
      const drop = (cmp.oldRows - cmp.newRows) / cmp.oldRows;
      if (drop > R.rowsDropPct) flags.push({ id: 'rows', text: `La versión nueva trae ${pct(drop)} menos filas (${cmp.oldRows.toLocaleString('es-MX')} → ${cmp.newRows.toLocaleString('es-MX')}; tu límite es ${pct(R.rowsDropPct)}).` });
    }
    const [o0, o1] = cmp.oldRange, [n0, n1] = cmp.newRange;
    if (o0 && o1 && (!n0 || !n1 || n0 > o0 || n1 < o1)) {
      flags.push({ id: 'period', text: `El periodo se acorta: antes ${o0} a ${o1}, ahora ${n0 ? `${n0} a ${n1}` : 'sin fechas'}. Esos días dejarían de existir.` });
    }
    if (cmp.overlapPct !== null && Math.abs(cmp.overlapPct) > R.revenueChangePct) {
      flags.push({ id: 'revenue', text: `La venta de los ${cmp.overlapDays.toLocaleString('es-MX')} días que están en ambas versiones cambia ${cmp.overlapPct > 0 ? '+' : ''}${pct(cmp.overlapPct)} (tu límite es ${pct(R.revenueChangePct)}).` });
    }
    return { flags, needsConfirm: flags.length > 0 };
  }

  FP.replacePlan = { DEFAULT_RULES, fromRecords, fromProductBatch, compare, assess, sig };
  if (typeof module !== 'undefined' && module.exports) module.exports = FP.replacePlan;
})(typeof window !== 'undefined' ? window : globalThis);
