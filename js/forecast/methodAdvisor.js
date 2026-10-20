/**
 * methodAdvisor.js — Lectura explicable de la comparación de métodos A/B/C/D (solo lectura: NO cambia el método en uso).
 *  - Semáforo por método: verde = índices con días suficientes y sin fallback · amarillo = pocos días o con fallback · rojo = falta un índice o no calcula.
 *  - Sugerencia con reglas visibles (la decide el usuario): pocos días contados → A · mejor error en prueba (backtest) → ese método
 *    · B y C se separan → C (hubo un cambio reciente; se muestran ambos) · acumulado estable → B · si no → A.
 *  - Rango de cierre entre los métodos utilizables.
 *  - Total digital: conciliación entre el Total estricto (un día cuenta solo si TODOS los canales tienen real) y la suma de canales.
 * No toca fórmulas del motor: solo lee `run` (resultado de FP.forecastEngine.runForecast) y, opcional, el backtest.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const IDS = ['A', 'B', 'C', 'D'];
  const DIVERGENCE = 0.02;        // B y C se separan ≥ 2 % de la meta del periodo
  const BACKTEST_MARGIN = 0.9;    // el método debe tener ≤ 90 % del error del plan sin ajustar

  const chIds = (run) => Object.keys(run.channels || {});
  function entryOf(run, ch, id) { return ch === 'total' ? run.comparison.total[id] : run.comparison.byChannel[ch][id]; }
  const forecastOf = (run, ch, id, k) => { const m = entryOf(run, ch, id); const b = ch === 'total' ? m && m.forecast : m && m.annual && m.annual.forecast; return b && fin(b[k]) ? b[k] : null; };
  const planOf = (run, ch, k) => { const a = ch === 'total' ? run.total.annual : run.channels[ch].annual; return a && a.plan && fin(a.plan[k]) ? a.plan[k] : null; };
  const countedOf = (run, ch) => { const a = ch === 'total' ? run.total.annual : run.channels[ch].annual; return a ? a.countedDays || 0 : 0; };
  function fallbackOf(run, ch, id) { return ch === 'total' ? chIds(run).reduce((s, c) => s + ((run.comparison.byChannel[c][id] || {}).fallbackDays || 0), 0) : (entryOf(run, ch, id).fallbackDays || 0); }
  function comparableOf(run, ch, id) {
    const one = (c) => { const ix = ((run.comparison.byChannel[c][id] || {}).assumptions || {}).indices || {}; const v = Object.values(ix).map((i) => i.comparableDays).filter(fin); return v.length ? Math.min(...v) : null; };
    if (id === 'A') return null;
    if (ch !== 'total') return one(ch);
    const v = chIds(run).map(one).filter(fin); return v.length ? Math.min(...v) : null;
  }

  function lightOf(run, ch, id, k) {
    if (id === 'A') return { light: 'green', reasons: ['Línea base: usa el plan tal cual; no depende de índices.'] };
    const m = entryOf(run, ch, id), reasons = [];
    const hist = m && m.historyAdequacy, fb = fallbackOf(run, ch, id), cd = comparableOf(run, ch, id);
    if (!m || forecastOf(run, ch, id, k) === null) return { light: 'red', reasons: ['No se puede proyectar: falta el plan o datos suficientes.'] };
    if (hist === 'insufficient') return { light: 'red', reasons: ['Falta al menos un índice (días comparables insuficientes).'] };
    let light = 'green';
    if (hist === 'limited') { light = 'yellow'; reasons.push(`Histórico limitado${fin(cd) ? ` (${cd} días comparables)` : ''}.`); }
    if (fb > 0) { light = 'yellow'; reasons.push(`${fb} día(s) con índice sin datos usan el plan (fallback).`); }
    if (!reasons.length) reasons.push(`Índices con días suficientes${fin(cd) ? ` (${cd} comparables)` : ''} y sin fallback.`);
    return { light, reasons };
  }

  function bestByBacktest(backtest, ch, usable, horizon) {
    if (!backtest || ch === 'total' || !backtest.byChannel || !backtest.byChannel[ch]) return null;
    let best = null;
    usable.forEach((id) => {
      const r = backtest.byChannel[ch][id] && backtest.byChannel[ch][id][horizon];
      if (r && r.status === 'evaluated' && fin(r.wape) && fin(r.planWape) && r.planWape > 0 && r.wape <= BACKTEST_MARGIN * r.planWape && (!best || r.wape < best.wape)) best = { id, wape: r.wape, planWape: r.planWape };
    });
    return best;
  }

  /** Días cerrados que el Total excluye porque a algún canal le falta el real, con los canales faltantes. */
  function totalReconciliation(run) {
    if (!run || !run.total || !run.channels) return null;
    const ids = chIds(run), excluded = [];
    run.total.days.forEach((d, i) => {
      if (!d.closed || d.counted) return;
      const missing = ids.filter((c) => !run.channels[c].days[i].counted), have = ids.filter((c) => run.channels[c].days[i].counted);
      if (missing.length && have.length) excluded.push({ date: d.date, missing });
    });
    const gapOf = (a) => (a && a.toDate && a.toDate.revenue && fin(a.toDate.revenue.gap) ? a.toDate.revenue.gap : null);
    const chGaps = ids.map((c) => gapOf(run.channels[c].annual));
    const sumChannels = chGaps.every(fin) ? chGaps.reduce((a, b) => a + b, 0) : null;
    const totalGap = gapOf(run.total.annual);
    const byChannel = {}; excluded.forEach((e) => e.missing.forEach((c) => { (byChannel[c] = byChannel[c] || []).push(e.date); }));
    const ranges = (dates) => { const out = []; dates.sort().forEach((d) => { const l = out[out.length - 1]; if (l && Math.round((Date.parse(d) - Date.parse(l[1])) / 86400000) === 1) l[1] = d; else out.push([d, d]); }); return out; };
    return { excludedDays: excluded.length, byChannel: Object.fromEntries(Object.entries(byChannel).map(([c, ds]) => [c, ranges(ds)])),
      sumChannelsGap: sumChannels, totalGap, difference: fin(sumChannels) && fin(totalGap) ? sumChannels - totalGap : null };
  }

  /** @param {{run:object, channel?:string, metric?:string, backtest?:object, horizon?:string|number}} p */
  function advise({ run, channel = 'total', metric = 'revenue', backtest = null, horizon = 7 }) {
    if (!run || !run.comparison) return null;
    const methods = {};
    IDS.forEach((id) => { methods[id] = { id, forecast: forecastOf(run, channel, id, metric), comparableDays: comparableOf(run, channel, id), fallbackDays: id === 'A' ? 0 : fallbackOf(run, channel, id), ...lightOf(run, channel, id, metric) }; });
    const usable = IDS.filter((id) => id !== 'A' && methods[id].light !== 'red');
    const plan = planOf(run, channel, metric), counted = countedOf(run, channel), minDays = run.settings && run.settings.minComparableDays || 5;
    let suggestion;
    const best = bestByBacktest(backtest, channel, usable, horizon);
    const fB = methods.B.forecast, fC = methods.C.forecast;
    const spread = usable.includes('B') && usable.includes('C') && fin(fB) && fin(fC) && fin(plan) && plan > 0 ? Math.abs(fB - fC) / plan : null;
    if (counted < minDays) suggestion = { method: 'A', rule: 'few_days', reasons: [`Solo hay ${counted} día(s) contados (mínimo ${minDays}): los índices aún no son confiables; el plan es la referencia más segura.`] };
    else if (best) suggestion = { method: best.id, rule: 'backtest', reasons: [`En la prueba histórica (${horizon} días) el método ${best.id} tuvo error ${(best.wape * 100).toFixed(1)} % contra ${(best.planWape * 100).toFixed(1)} % del plan sin ajustar.`, 'Es evidencia pasada: no garantiza el resultado futuro.'] };
    else if (fin(spread) && spread >= DIVERGENCE) suggestion = { method: 'C', rule: 'divergence', reasons: [`B (acumulado del año) y C (reciente) difieren ${(spread * 100).toFixed(1)} % de la meta: el desempeño reciente se separó del acumulado.`, 'Revisa ambos cierres; C refleja el cambio reciente pero se apoya en pocos días.'] };
    else if (methods.B.light === 'green') suggestion = { method: 'B', rule: 'stable', reasons: ['El acumulado del año tiene días suficientes y no se separa del desempeño reciente.'] };
    else suggestion = { method: 'A', rule: 'default', reasons: ['Ningún método ajustado cumple todas las condiciones; se mantiene el plan como referencia.'] };
    suggestion.current = run.method && run.method.id; suggestion.differsFromCurrent = suggestion.method !== suggestion.current;
    const vals = [methods.A].concat(usable.map((id) => methods[id])).filter((m) => fin(m.forecast));
    let range = null;
    if (vals.length >= 2) { const lo = vals.reduce((a, b) => (b.forecast < a.forecast ? b : a)), hi = vals.reduce((a, b) => (b.forecast > a.forecast ? b : a));
      range = { min: lo.forecast, max: hi.forecast, minMethod: lo.id, maxMethod: hi.id, spreadPct: fin(plan) && plan > 0 ? (hi.forecast - lo.forecast) / plan : null }; }
    return { channel, metric, methods, suggestion, range, spreadBC: spread, reconciliation: channel === 'total' && metric === 'revenue' ? totalReconciliation(run) : null };
  }

  FP.methodAdvisor = { advise, totalReconciliation, DIVERGENCE, BACKTEST_MARGIN };
})(typeof window !== 'undefined' ? window : globalThis);
