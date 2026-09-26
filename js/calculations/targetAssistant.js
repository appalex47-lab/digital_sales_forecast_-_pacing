/**
 * targetAssistant.js — Asistente para PROPONER metas anuales a partir de la venta real de un año base.
 *
 * La meta es una decisión del negocio (Original Target): el asistente solo llena el formulario con una
 * propuesta; nada se guarda hasta que el usuario pulsa "Guardar metas".
 *
 *   base_canal   = venta real del año base (actual si existe para esa llave; si no, histórico)
 *   total        = total capturado, o Σ base_canal × (1 + crecimiento)
 *   mezcla       = % capturados por canal (deben sumar 100 %), o participación de cada canal en el año base
 *   meta_canal   = total × mezcla_canal   (repartido exacto en pesos: Σ canales = total)
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  /** Venta real por canal de un año y días cubiertos. */
  function yearActuals(store, year) {
    const byKey = new Map();
    ['historical', 'actual'].forEach((t) => FP.dataStore.resolveLatest(store, t).forEach((r) => {
      if (!r.date || !r.date.startsWith(`${year}-`)) return;
      const v = r.metrics.revenue && r.metrics.revenue.value;
      if (!fin(v)) return;
      byKey.set(`${r.date}|${r.channel}`, { channel: r.channel, date: r.date, revenue: v }); // actual pisa a histórico
    }));
    const days = FP.calendar.daysOfYear(year).length;
    const out = {};
    C().channelIds.forEach((ch) => { out[ch] = { revenue: 0, days: new Set() }; });
    byKey.forEach((x) => { out[x.channel].revenue += x.revenue; out[x.channel].days.add(x.date); });
    const total = C().channelIds.reduce((a, ch) => a + out[ch].revenue, 0);
    return {
      year, total, daysInYear: days,
      byChannel: Object.fromEntries(C().channelIds.map((ch) => [ch, { revenue: out[ch].revenue, days: out[ch].days.size,
        coverage: out[ch].days.size / days, share: total > 0 ? out[ch].revenue / total : null }])),
      coverage: Math.min(...C().channelIds.map((ch) => out[ch].days.size / days))
    };
  }

  /** Años con venta real cargada (del más reciente al más antiguo). */
  function baseYears(store) {
    const ys = new Set();
    ['historical', 'actual'].forEach((t) => FP.dataStore.records(store, t).forEach((r) => { if (r.date) ys.add(+r.date.slice(0, 4)); }));
    return [...ys].sort((a, b) => b - a).map((y) => ({ year: y, coverage: yearActuals(store, y).coverage }));
  }

  /**
   * @param {object} p { store, baseYear, growth (fracción), total (opcional), mix (opcional, fracciones por canal) }
   * @returns { ok, total, byChannel, mix, base, warnings, errors }
   */
  function suggest({ store, baseYear, growth = 0, total = null, mix = null }) {
    const errors = [], warnings = [];
    const base = yearActuals(store, baseYear);
    if (!(base.total > 0)) return { ok: false, errors: [`No hay venta real cargada para ${baseYear}.`], warnings, base };
    if (!fin(growth) || growth <= -1) errors.push('El crecimiento debe ser un número mayor a −100 %.');
    let useMix = C().channelIds.map((ch) => base.byChannel[ch].share || 0);
    if (mix) {
      const m = C().channelIds.map((ch) => (fin(mix[ch]) ? mix[ch] : NaN));
      const sum = m.reduce((a, b) => a + b, 0);
      if (m.some((x) => !fin(x))) errors.push('Captura el porcentaje de los cuatro canales, o deja todos vacíos para usar la mezcla del año base.');
      else if (m.some((x) => x < 0)) errors.push('Cada porcentaje de mezcla debe ser un número de 0 a 100.');
      else if (Math.abs(sum - 1) > 0.005) errors.push(`La mezcla suma ${(sum * 100).toFixed(1)} %; debe sumar 100 %.`);
      else useMix = m;
    }
    const tot = fin(total) && total > 0 ? total : base.total * (1 + growth);
    if (errors.length) return { ok: false, errors, warnings, base };
    if (base.coverage < 0.95) warnings.push(`El año ${baseYear} tiene datos en ${(base.coverage * 100).toFixed(0)} % de los días en algún canal: la base está incompleta y la propuesta puede quedar baja. Usa el último año completo.`);
    const amounts = FP.distribution.distributeTarget(Math.round(tot), useMix, { decimals: 0 });
    return { ok: true, total: Math.round(tot), byChannel: Object.fromEntries(C().channelIds.map((ch, i) => [ch, amounts[i]])),
      mix: Object.fromEntries(C().channelIds.map((ch, i) => [ch, useMix[i]])), base, warnings, errors: [] };
  }

  FP.targetAssistant = { yearActuals, baseYears, suggest };
})(typeof window !== 'undefined' ? window : globalThis);
