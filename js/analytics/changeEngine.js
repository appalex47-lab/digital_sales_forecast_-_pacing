/**
 * changeEngine.js — «Qué cambió desde ayer». Puro: no toca la red, el DOM ni el almacenamiento.
 * Solo LEE la corrida de forecast (run) y, si existe, una foto anterior (snapshot). No crea cálculos nuevos de negocio:
 * compara cifras que Pacing/Forecast ya produjeron y ordena lo que se movió.
 *  - lastFullDay:  último día con venta real en TODOS los canales («ayer» de la vista).
 *  - snapshot:     foto compacta de las cifras clave (guardable en el navegador o en la nube).
 *  - compare:      lo que se movió contra el plan, contra el mismo día de la semana pasada y contra una foto anterior.
 *  - reconcile:    ciclo de vida de las alertas (nueva · sigue · resuelta) contra las filas guardadas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const T = { badVsPlan: -0.05, watchVsPlan: -0.01, goodVsPlan: 0.02, effectPp: 0.0005 };   // umbrales de la señal por canal
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekStart = (iso) => { const d = new Date(`${iso}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return addDays(iso, -dow); };
  const pct = (a, b) => (fin(a) && fin(b) && b !== 0 ? a / b - 1 : null);

  const rev = (day, k) => (day && day[k] && fin(day[k].revenue) ? day[k].revenue : null);
  const countedDay = (day) => Boolean(day && day.counted && fin(rev(day, 'actual')));

  /** Series del run por id: 'total' + cada canal. */
  function seriesOf(run) {
    const out = { total: run.total };
    Object.keys(run.channels || {}).forEach((ch) => { out[ch] = run.channels[ch]; });
    return out;
  }
  const byDate = (series) => { const m = new Map(); (series.days || []).forEach((d) => m.set(d.date, d)); return m; };

  /**
   * «Ayer»: último día con venta real en todos los canales. Además, los días parciales (algún canal sí, otro no)
   * de las últimas dos semanas: no entran al Total y el equipo debe saberlo.
   */
  function lastFullDay(run) {
    const chIds = Object.keys(run.channels || {});
    if (!chIds.length) return { day: null, partial: [] };
    const maps = chIds.map((ch) => byDate(run.channels[ch]));
    const dates = new Set(); maps.forEach((m) => m.forEach((d, k) => { if (countedDay(d)) dates.add(k); }));
    const cutoff = run.cutoff || run.referenceDate || '9999-12-31';
    const sorted = [...dates].filter((d) => d <= cutoff).sort();
    let day = null; const partial = [];
    sorted.forEach((d) => {
      const have = maps.map((m) => countedDay(m.get(d)));
      if (have.every(Boolean)) day = d;
    });
    sorted.forEach((d) => {
      const have = maps.map((m) => countedDay(m.get(d)));
      if (!have.every(Boolean) && (!day || d >= addDays(day, -14))) {
        const missing = chIds.filter((_, i) => !have[i]);
        const others = chIds.reduce((s, ch, i) => s + (have[i] ? rev(maps[i].get(d), 'actual') : 0), 0);
        partial.push({ date: d, missing, othersRevenue: others });
      }
    });
    return { day, partial };
  }

  /** Cierre proyectado: del mes de `day` si hay cifras; si no, del año. */
  function closeOf(series, day) {
    const key = day ? day.slice(0, 7) : null;
    const m = key && (series.months || []).find((x) => x.key === key);
    const gapOf = (b) => (b && b.forecastGap && b.forecastGap.revenue ? b.forecastGap.revenue : null);
    const mk = (b, scope, label) => {
      if (!b || !b.forecast || !fin(b.forecast.revenue)) return null;
      const g = gapOf(b);
      return { scope, label, forecast: b.forecast.revenue, plan: b.plan && fin(b.plan.revenue) ? b.plan.revenue : null, gap: g && fin(g.gap) ? g.gap : null, gapPct: g && fin(g.gapPct) ? g.gapPct : null };
    };
    return mk(m, 'month', m ? `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}` : '') || mk(series.annual, 'year', `año ${(series.annual && series.annual.firstDate || '').slice(0, 4)}`);
  }

  /** Foto compacta de las cifras clave. `alerts` = run.alerts. */
  function snapshot(run, opts) {
    const o = opts || {};
    const now = o.now || new Date().toISOString();
    const lf = lastFullDay(run), S = seriesOf(run);
    const close = {}, last = {};
    Object.keys(S).forEach((id) => {
      const c = closeOf(S[id], lf.day); close[id] = c ? { scope: c.scope, forecast: c.forecast, plan: c.plan, gap: c.gap } : null;
      const days = (S[id].days || []).filter(countedDay); const l = days[days.length - 1];
      last[id] = { lastDay: l ? l.date : null, daysCounted: days.length, revenue: days.reduce((s, d) => s + rev(d, 'actual'), 0) };
    });
    return { v: 1, at: now, day: o.today || now.slice(0, 10), dataDay: lf.day, planVersion: (run.plan && (run.plan.versionId || run.plan.label)) || null,
      planDays: run.plan ? run.plan.days : null, close, last, alerts: (run.alerts || []).map((a) => ({ key: alertKey(a), type: a.type, channel: a.channel, message: a.message })) };
  }

  const alertKey = (a) => `${a.type}|${a.channel || 'total'}`;

  /** Señal por canal (palabras, no colores): combina lo de ayer contra el plan con el efecto en el cierre. */
  function signal(vsPlan, effectPp, hasBase) {
    if (!fin(vsPlan)) return { id: 'unknown', label: 'Sin dato' };
    if (vsPlan <= T.badVsPlan || (hasBase && fin(effectPp) && effectPp <= -T.effectPp * 3)) return { id: 'worse', label: 'Empeoró' };
    if (vsPlan < T.watchVsPlan || (hasBase && fin(effectPp) && effectPp < -T.effectPp)) return { id: 'watch', label: 'A vigilar' };
    if (vsPlan >= T.goodVsPlan || (hasBase && fin(effectPp) && effectPp > T.effectPp)) return { id: 'better', label: 'Mejoró' };
    return { id: 'flat', label: 'Sin cambio' };
  }

  /**
   * Compara. mode: 'ayer' | 'visita' | 'semana'. `base`: foto contra la que medir el cierre (puede ser null).
   * labels: { ch: 'Ecommerce' }. Devuelve { status, ... }; nunca inventa: si falta algo, lo dice.
   */
  function compare(run, opts) {
    const o = opts || {}, labels = o.labels || {}, base = o.base || null, mode = o.mode || 'ayer';
    if (!run || !run.channels || (run.plan && run.plan.source === 'none')) return { status: 'no_run' };
    const lf = lastFullDay(run);
    if (!lf.day) return { status: 'no_actual', partial: lf.partial };
    const S = seriesOf(run), ids = Object.keys(run.channels), D = lf.day;
    const prevWeek = addDays(D, -7), wk0 = weekStart(D);
    const label = (id) => labels[id] || (id === 'total' ? 'Total digital' : id);
    const sumRange = (series, from, to, k) => {
      let s = 0, n = 0; (series.days || []).forEach((d) => { if (d.date >= from && d.date <= to && countedDay(d)) { s += rev(d, k) || 0; n++; } }); return { s, n };
    };
    const rowOf = (id) => {
      const ser = S[id], map = byDate(ser), cur = map.get(D);
      let actual, plan, lastWeek = null;
      if (mode === 'semana') {
        const a = sumRange(ser, wk0, D, 'actual'), p = sumRange(ser, wk0, D, 'plan');
        actual = a.n ? a.s : null; plan = p.n ? p.s : null;
        const pw = sumRange(ser, addDays(wk0, -7), addDays(D, -7), 'actual'); lastWeek = pw.n === a.n && pw.n ? pw.s : null;
      } else {
        actual = rev(cur, 'actual'); plan = rev(cur, 'plan');
        const pd = map.get(prevWeek); lastWeek = countedDay(pd) ? rev(pd, 'actual') : null;
      }
      const c = closeOf(ser, D), b = base && base.close && base.close[id];
      const sameScope = c && b && c.scope === b.scope && fin(b.forecast);
      const closeDelta = sameScope ? c.forecast - b.forecast : null;
      const planClose = (S.total && closeOf(S.total, D) || {}).plan;
      const effectPp = fin(closeDelta) && fin(planClose) && planClose ? closeDelta / planClose : null;
      const vsPlan = pct(actual, plan);
      return { id, label: label(id), actual, plan, gap: fin(actual) && fin(plan) ? actual - plan : null, vsPlan, lastWeek, vsLastWeek: pct(actual, lastWeek),
        close: c, closeDelta, effectPp, signal: signal(vsPlan, effectPp, Boolean(sameScope)) };
    };
    const total = rowOf('total'), channels = ids.map(rowOf);
    channels.sort((a, b) => (Math.abs(b.effectPp || 0) - Math.abs(a.effectPp || 0)) || ((a.gap || 0) - (b.gap || 0)));
    const sameScopeT = total.close && base && base.close && base.close.total && base.close.total.scope === total.close.scope;
    const gapNow = total.close && fin(total.close.gap) ? total.close.gap : null;
    const gapBase = sameScopeT && fin(base.close.total.gap) ? base.close.total.gap : null;
    const reachable = total.close && fin(total.close.forecast) && fin(total.close.plan) ? total.close.forecast >= total.close.plan : null;

    // Qué canal aporta más a la diferencia contra el plan del día (en dinero)
    const neg = channels.filter((c) => fin(c.gap) && c.gap !== 0).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0] || null;
    const period = mode === 'semana' ? 'Esta semana' : 'Ayer';
    const sentences = [];
    if (fin(total.vsPlan)) {
      const p = Math.abs(total.vsPlan * 100).toFixed(1);
      let s = mode === 'semana' ? `Esta semana llevas ${p}% ${total.vsPlan < 0 ? 'por debajo' : 'por encima'} del plan` : `Ayer cerraste ${p}% ${total.vsPlan < 0 ? 'por debajo' : 'por encima'} del plan`;
      if (sameScopeT && fin(total.closeDelta) && total.close.plan) {
        const pp = (total.closeDelta / total.close.plan) * 100;
        if (Math.abs(pp) >= 0.05) s += ` y el cierre proyectado ${total.close.scope === 'month' ? 'del mes' : 'del año'} ${pp < 0 ? 'bajó' : 'subió'} ${Math.abs(pp).toFixed(1)} puntos`;
      }
      sentences.push(`${s}.`);
    }
    if (neg && fin(total.gap) && total.gap !== 0 && Math.sign(neg.gap) === Math.sign(total.gap)) {
      sentences.push(`${neg.label} aporta la mayor parte de la diferencia (${neg.gap < 0 ? '−' : '+'}$${Math.round(Math.abs(neg.gap)).toLocaleString('en-US')}${fin(neg.vsPlan) ? `, ${neg.vsPlan < 0 ? '−' : '+'}${Math.abs(neg.vsPlan * 100).toFixed(1)}% vs plan` : ''}).`);
    }
    if (fin(total.vsLastWeek)) sentences.push(`Contra ${mode === 'semana' ? 'la misma parte de la semana pasada' : 'el mismo día de la semana pasada'}, el total ${total.vsLastWeek < 0 ? 'bajó' : 'subió'} ${Math.abs(total.vsLastWeek * 100).toFixed(1)}%.`);
    if (!sameScopeT) sentences.push('Aún no hay una foto anterior comparable: el cambio del cierre proyectado aparece desde la próxima visita.');

    return { status: 'ok', mode, period, day: D, partial: lf.partial, total, channels, headline: sentences, base: base ? { at: base.at, day: base.day, dataDay: base.dataDay } : null,
      gap: { now: gapNow, base: gapBase, delta: fin(gapNow) && fin(gapBase) ? gapNow - gapBase : null }, reachable, newDays: base && base.dataDay && D > base.dataDay ? daysBetween(base.dataDay, D) : 0,
      planChanged: Boolean(base && base.planVersion && run.plan && (run.plan.versionId || run.plan.label) && base.planVersion !== (run.plan.versionId || run.plan.label)), planVersion: (run.plan && (run.plan.versionId || run.plan.label)) || null };
  }
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

  /**
   * Ciclo de vida de alertas contra las filas guardadas (local o nube). Puro: devuelve qué insertar y qué parchar.
   * rows: [{alert_key,status,first_seen,last_seen,last_data_day,resolved_at,times_opened}]. active: run.alerts. today/dataDay: 'YYYY-MM-DD'.
   * Seguridad: si estos datos son MÁS VIEJOS que los que el equipo ya vio, no se actualiza ni se resuelve nada.
   */
  function reconcile(rows, active, today, dataDay, nowIso) {
    const inserts = [], patches = [], now = nowIso || new Date().toISOString();
    const byKey = new Map((rows || []).map((r) => [r.alert_key, r]));
    const seen = new Set();
    (active || []).forEach((a) => {
      const k = alertKey(a); if (seen.has(k)) return; seen.add(k);
      const r = byKey.get(k), msg = String(a.message || '').slice(0, 500);
      if (!r) { inserts.push({ alert_key: k, type: a.type, channel: a.channel || 'total', message: msg, status: 'open', first_seen: today, last_seen: today, last_data_day: dataDay || null, times_opened: 1 }); return; }
      if (r.last_data_day && dataDay && dataDay < r.last_data_day) return;   // datos más viejos que los del equipo
      if (r.status === 'resolved') {
        if (!r.resolved_at || r.resolved_at.slice(0, 10) < today) patches.push({ alert_key: k, fields: { status: 'open', first_seen: today, last_seen: today, last_data_day: dataDay || null, resolved_at: null, times_opened: (r.times_opened || 1) + 1, message: msg } });
        return;
      }
      if (r.last_seen !== today || r.message !== msg || (dataDay && r.last_data_day !== dataDay)) patches.push({ alert_key: k, fields: { last_seen: today, last_data_day: dataDay || r.last_data_day || null, message: msg } });
    });
    (rows || []).forEach((r) => {
      if (seen.has(r.alert_key) || r.status === 'resolved') return;
      if (!dataDay || (r.last_data_day && dataDay < r.last_data_day)) return;   // sin datos o más viejos: no se resuelve nada
      patches.push({ alert_key: r.alert_key, fields: { status: 'resolved', resolved_at: now } });
    });
    return { inserts, patches };
  }

  /** Aplica inserts/patches a una lista de filas (para el respaldo local y para pruebas). */
  function applyTo(rows, plan) {
    const m = new Map((rows || []).map((r) => [r.alert_key, { ...r }]));
    plan.inserts.forEach((r) => m.set(r.alert_key, { ...r }));
    plan.patches.forEach((p) => { const r = m.get(p.alert_key); if (r) Object.assign(r, p.fields); });
    return [...m.values()];
  }

  /** Etiqueta de ciclo de vida de una fila frente a una fecha base (día de la foto anterior). */
  function lifecycle(row, today, baseDay) {
    if (row.status === 'resolved') return { id: 'resolved', label: 'Resuelta' };
    const days = daysBetween(row.first_seen, today) + 1;
    if (!baseDay) return { id: 'active', label: 'Activa', days };   // sin foto de comparación no se puede decir si es nueva
    if (row.first_seen > baseDay) return { id: 'new', label: 'Nueva', days };
    return { id: 'continues', label: 'Sigue', days };
  }

  FP.changeEngine = { lastFullDay, snapshot, compare, reconcile, applyTo, lifecycle, alertKey, addDays, weekStart, daysBetween, THRESHOLDS: T };
})(typeof window !== 'undefined' ? window : globalThis);
