/**
 * trendStoryEngine.js — «La historia» de una entidad (producto, categoría, SKU…): cuándo creció, cuándo cayó,
 * cómo está AHORA, si es estable o volátil y cómo se compara con su contexto. Puro y determinístico.
 *
 * Entrada: serie de períodos CERRADOS [{period, value|null}] + opciones { current, context[], typicalLevel }.
 *   · current = { label, value, baseline, baselineLabel, partial }  (período en curso vs comparable equivalente)
 *   · context = [{ id, label, series }]  (p. ej. la categoría o el total del canal, mismos períodos)
 * Salida: episodios (fases), máximo/mínimo, variabilidad propia, estado actual, comparación con el contexto y una frase.
 *
 * Reglas (todas visibles en `rules`):
 *   · Fase = tramo entre dos giros confirmados (zigzag). Un giro se confirma cuando el movimiento contrario supera
 *     max(10 %, 1.5 × la variación típica propia del producto). Lo que no llega a ese umbral es «estable».
 *   · Períodos sin venta (null o 0) no se tratan como caída gradual: forman un episodio «sin ventas».
 *   · Variación típica = mediana de |cambio período a período| del propio producto.
 *   · Lectura poco confiable si vende muy poco frente a lo típico, tiene huecos o poca historia.
 * No explica causas: describe lo que muestran los números.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const DEFAULTS = { reversalMin: 0.10, reversalNoiseMult: 1.5, tolerance: 0.03, partialTolerance: 0.10, noiseStable: 0.05, noiseVolatile: 0.15,
    lowVolumeRatio: 0.25, minCoverage: 0.7, minActive: 6, minRun: 3, contextWindow: 6, contextPp: 5 };
  const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  function pLabel(key) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key)); if (m) return `${MES[+m[2] - 1]} ${m[1]}`;
    return String(key);
  }
  function rangeText(a, b) {
    const ma = /^(\d{4})-(\d{2})$/.exec(String(a)), mb = /^(\d{4})-(\d{2})$/.exec(String(b));
    if (ma && mb) { if (a === b) return pLabel(a); return ma[1] === mb[1] ? `${MES[+ma[2] - 1]}–${MES[+mb[2] - 1]} ${mb[1]}` : `${pLabel(a)}–${pLabel(b)}`; }
    return a === b ? String(a) : `${a} → ${b}`;
  }
  const pct = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(0)} %`;

  /** Giros confirmados sobre una corrida activa de valores > 0 (índices relativos a la corrida).
   *  Devuelve { piv, tailStart }: tailStart = índice del último extremo cuando después de él hay ≥3 períodos dentro del umbral (cola estable). */
  function zigzag(v, R) {
    const n = v.length; let hi = 0, lo = 0, dir = 0; const piv = [];
    for (let i = 1; i < n; i++) {
      if (dir === 0) {
        if (v[i] > v[hi]) hi = i; if (v[i] < v[lo]) lo = i;
        if (v[i] / v[lo] - 1 >= R && lo < i) { piv.push(lo); dir = 1; hi = i; }
        else if (v[i] / v[hi] - 1 <= -R && hi < i) { piv.push(hi); dir = -1; lo = i; }
      } else if (dir === 1) {
        if (v[i] > v[hi]) hi = i; else if (v[i] / v[hi] - 1 <= -R) { piv.push(hi); dir = -1; lo = i; }
      } else {
        if (v[i] < v[lo]) lo = i; else if (v[i] / v[lo] - 1 >= R) { piv.push(lo); dir = 1; hi = i; }
      }
    }
    const ext = dir === 1 ? hi : dir === -1 ? lo : null;
    const tailStart = ext !== null && n - 1 - ext >= 2 ? ext : null;
    return { piv: [...new Set([0, ...piv, ...(tailStart !== null ? [tailStart] : []), n - 1])].sort((a, b) => a - b), tailStart };
  }

  function analyze(series, options = {}) {
    const c = { ...DEFAULTS, ...(options.rules || {}) };
    const s = (Array.isArray(series) ? series : []).filter((x) => x && x.period != null).map((x) => ({ period: x.period, value: fin(x.value) ? x.value : null }))
      .sort((a, b) => String(a.period).localeCompare(String(b.period)));
    const act = (i) => fin(s[i].value) && s[i].value > 0;
    const n = s.length, activeIdx = s.map((_, i) => i).filter(act);
    const rules = { ...c };
    if (activeIdx.length < 2) return { status: 'insufficient_history', episodes: [], rules, headline: 'Historia insuficiente para describir la tendencia.', current: currentState(s, [], null, options.current, c), reliability: { level: 'low', reasons: ['poca historia'] }, relative: [] };

    // variación típica propia
    const changes = []; for (let i = 1; i < n; i++) if (act(i) && act(i - 1)) changes.push(Math.abs(s[i].value / s[i - 1].value - 1));
    const noise = median(changes);
    const R = Math.max(c.reversalMin, c.reversalNoiseMult * (noise || 0));

    // corridas activas / huecos
    const runs = []; let i0 = 0;
    while (i0 < n) { const a = act(i0); let j = i0; while (j + 1 < n && act(j + 1) === a) j++; runs.push({ active: a, from: i0, to: j }); i0 = j + 1; }
    const firstActive = activeIdx[0];
    const episodes = [];
    runs.forEach((r) => {
      if (!r.active) {
        if (r.from < firstActive) return;                                   // antes de que el producto existiera: no es un episodio
        episodes.push({ type: 'no_sales', from: s[r.from].period, to: s[r.to].period, periods: r.to - r.from + 1, ongoing: r.to === n - 1 });
        return;
      }
      const vals = s.slice(r.from, r.to + 1).map((x) => x.value);
      if (vals.length < c.minRun) { episodes.push({ type: 'short', from: s[r.from].period, to: s[r.to].period, periods: vals.length, startValue: vals[0], endValue: vals[vals.length - 1], changePct: vals.length > 1 ? vals[vals.length - 1] / vals[0] - 1 : null }); return; }
      const { piv, tailStart } = zigzag(vals, R);
      for (let k = 0; k < piv.length - 1; k++) {
        const a = piv[k], b = piv[k + 1], ch = vals[b] / vals[a] - 1;
        const type = Math.abs(ch) < R ? 'stable' : ch > 0 ? 'growth' : 'decline';      // lo que no supera el umbral (inicio o cola) es «estable»
        const ep = { type, from: s[r.from + a].period, to: s[r.from + b].period, periods: b - a + 1, startValue: vals[a], endValue: vals[b], changePct: ch };
        const prev = episodes[episodes.length - 1];
        if (prev && prev.type === ep.type && prev.to === ep.from) { prev.to = ep.to; prev.periods += ep.periods - 1; prev.endValue = ep.endValue; prev.changePct = prev.endValue / prev.startValue - 1; }
        else episodes.push(ep);
      }
    });

    const act_vals = activeIdx.map((i) => ({ period: s[i].period, value: s[i].value }));
    const peak = act_vals.reduce((m, x) => (x.value > m.value ? x : m), act_vals[0]), trough = act_vals.reduce((m, x) => (x.value < m.value ? x : m), act_vals[0]);
    const lastActive = act_vals[act_vals.length - 1];
    const fromPeak = lastActive.value / peak.value - 1;

    // estabilidad y confiabilidad
    const stability = noise === null ? 'sin_dato' : noise <= c.noiseStable ? 'estable' : noise > c.noiseVolatile ? 'volatil' : 'moderada';
    const reasons = [];
    const m = mean(act_vals.map((x) => x.value));
    if (fin(options.typicalLevel) && options.typicalLevel > 0 && m < c.lowVolumeRatio * options.typicalLevel) reasons.push('vende poco frente a lo típico');
    const coverage = activeIdx.length / (n - firstActive);
    if (coverage < c.minCoverage) reasons.push('tiene meses sin venta');
    if (activeIdx.length < c.minActive) reasons.push('poca historia');
    const reliability = { level: reasons.length ? 'low' : 'ok', reasons };

    const cur = currentState(s, episodes, lastActive, options.current, c, noise);
    const relative = (options.context || []).map((x) => relativeTo(s, x, c)).filter(Boolean);

    // frase
    const shown = episodes.filter((e) => e.type !== 'short').slice(-3);
    const verb = { growth: 'Creció', decline: 'Cayó', stable: 'Estable', no_sales: 'Sin ventas' };
    const parts = shown.map((e, k) => {
      if (e.type === 'stable' && k === shown.length - 1) return `estable desde ${pLabel(e.from)}`;
      if (e.type === 'no_sales') return `${e.ongoing ? 'sin ventas desde' : 'sin ventas'} ${e.ongoing ? pLabel(e.from) : rangeText(e.from, e.to)}`;
      const t = `${k === 0 ? verb[e.type] : verb[e.type].toLowerCase()} ${rangeText(e.from, e.to)}`;
      return e.type === 'stable' ? t : `${t} (${pct(e.changePct)})`;
    });
    const hist = parts.length ? `${parts.join(', ')}` : 'Sin cambios de fase confirmados';
    const headline = `${hist}. ${cur.text ? 'Ahora: ' + cur.text + '.' : ''}`.trim();
    return { status: 'available', episodes, peak, trough, lastActive, fromPeak, noise, stability, reversal: R, reliability, current: cur, relative, headline, rules };
  }

  function currentState(s, episodes, lastActive, cur, c, noise) {
    const none = { state: 'not_comparable', tag: '—', text: 'sin período en curso comparable', change: null };
    if (!cur) return none;
    const cv = fin(cur.value) ? cur.value : 0, bv = fin(cur.baseline) ? cur.baseline : 0, label = cur.label || 'el período en curso', bl = cur.baselineLabel || 'el período comparable';
    const everActive = !!lastActive;
    const lastEp = episodes.filter((e) => ['growth', 'decline', 'stable'].includes(e.type)).slice(-1)[0] || null;
    if (cv <= 0 && bv > 0) return { state: 'stopped', tag: 'Sin ventas', change: -1, text: `sin ventas en ${label} (en ${bl} sí vendió)` };
    if (cv <= 0 && bv <= 0) return everActive ? { state: 'inactive', tag: 'Inactivo', change: null, text: `sin ventas desde ${pLabel(lastActive.period)}` } : { state: 'no_data', tag: '—', change: null, text: 'sin ventas registradas' };
    if (cv > 0 && bv <= 0) return everActive && s.some((x) => fin(x.value) && x.value > 0) ? { state: 'reactivated', tag: 'Reactivado', change: null, text: `vuelve a vender en ${label} (no vendió en ${bl})` } : { state: 'new', tag: 'Nuevo', change: null, text: `empieza a vender en ${label}` };
    const ch = cv / bv - 1;
    const band = cur.partial ? Math.max(c.partialTolerance, noise || 0) : Math.max(c.tolerance, noise || 0);
    // si el producto viene en una fase de caída/crecimiento y el período en curso sigue en esa dirección (más allá de la tolerancia mínima), es continuidad, no «en línea»
    const follows = lastEp && ((lastEp.type === 'decline' && ch < -c.tolerance) || (lastEp.type === 'growth' && ch > c.tolerance));
    const state = follows ? (ch < 0 ? 'falling' : 'rising') : ch > band ? 'rising' : ch < -band ? 'falling' : 'in_line';
    const tag = { rising: 'Subiendo', falling: 'Cayendo', in_line: 'En línea' }[state];
    let rel = '';
    if (lastEp) {
      if (state === 'falling') rel = lastEp.type === 'decline' ? ' · continúa la caída' : lastEp.type === 'growth' ? ' · revierte la fase de crecimiento' : '';
      if (state === 'rising') rel = lastEp.type === 'growth' ? ' · continúa el crecimiento' : lastEp.type === 'decline' ? ' · repunta tras la caída' : '';
    }
    return { state, tag, change: ch, band, text: `${pct(ch)} en ${label} vs ${bl}${state === 'in_line' ? ' (dentro de su variación normal)' : ''}${rel}` };
  }

  function relativeTo(s, ctx, c) {
    if (!ctx || !Array.isArray(ctx.series)) return null;
    const cm = new Map(ctx.series.map((x) => [x.period, x.value]));
    const idx = s.map((_, i) => i).filter((i) => fin(s[i].value) && s[i].value > 0);
    if (idx.length < 2) return null;
    const end = idx[idx.length - 1]; const target = Math.max(idx[0], end - c.contextWindow);
    const start = idx.find((i) => i >= target);
    if (start === undefined || start === end) return null;
    const c0 = cm.get(s[start].period), c1 = cm.get(s[end].period);
    if (!fin(c0) || !fin(c1) || c0 <= 0) return null;
    const e = s[end].value / s[start].value - 1, k = c1 / c0 - 1, diff = (e - k) * 100;
    return { id: ctx.id, label: ctx.label, entityChange: e, contextChange: k, diffPp: diff, verdict: diff >= c.contextPp ? 'better' : diff <= -c.contextPp ? 'worse' : 'similar', window: { from: s[start].period, to: s[end].period, periods: end - start } };
  }

  /**
   * Proyección simple («si sigue así»): recta de mínimos cuadrados sobre los últimos períodos cerrados CONSECUTIVOS con venta.
   * No es un pronóstico: extiende lo que muestran los números recientes y dice qué tan bien habría acertado esa misma regla en el pasado (backtest).
   * options: { horizon=3, window=6, minPoints=4, nextPeriod(period,k)->period, current (mismo objeto que analyze), story (resultado de analyze) }
   */
  function fitLine(ys) {
    const n = ys.length, xm = (n - 1) / 2, ym = mean(ys);
    let sxx = 0, sxy = 0; ys.forEach((y, i) => { sxx += (i - xm) ** 2; sxy += (i - xm) * (y - ym); });
    const b = sxx > 0 ? sxy / sxx : 0, a = ym - b * xm;
    const res = ys.map((y, i) => y - (a + b * i)), sse = res.reduce((q, r) => q + r * r, 0);
    const sd = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
    return { a, b, n, xm, sxx, sd, se: sxx > 0 ? sd / Math.sqrt(sxx) : 0 };
  }
  function outlook(series, options = {}) {
    const c = { ...DEFAULTS, outlookWindow: 6, outlookMinPoints: 4, outlookHorizon: 3, outlookZ: 1.5, outlookMapeOk: 0.10, outlookMapeMid: 0.20, outlookFlat: 0.03, ...(options.rules || {}) };
    const H = Math.max(1, Math.min(6, options.horizon || c.outlookHorizon));
    const s = (Array.isArray(series) ? series : []).filter((x) => x && x.period != null).sort((a, b) => String(a.period).localeCompare(String(b.period)));
    const act = (x) => fin(x.value) && x.value > 0;
    const cur = options.current || null, story = options.story || null;
    const unavailable = (why, extra = {}) => ({ status: 'unavailable', message: why, ...extra });
    if (cur && story && story.current && ['stopped', 'inactive'].includes(story.current.state)) return unavailable('Sin ventas en el período en curso: no se proyecta.');
    // corrida activa que termina en el último período cerrado
    let end = s.length - 1; if (end < 0 || !act(s[end])) return unavailable('El último período cerrado no tiene venta: no se proyecta.');
    let start = end; while (start - 1 >= 0 && act(s[start - 1])) start--;
    const run = s.slice(start, end + 1).map((x) => x.value);
    if (run.length < c.outlookMinPoints) return unavailable(`Hay solo ${run.length} períodos seguidos con venta; se necesitan al menos ${c.outlookMinPoints}.`);
    const W = Math.min(c.outlookWindow, run.length), ys = run.slice(-W), win = s.slice(end - W + 1, end + 1);
    const f = fitLine(ys), mu = mean(ys);
    const fitted = win.map((x, i) => ({ period: x.period, value: f.a + f.b * i }));
    const nextP = options.nextPeriod || ((p, k) => { const m = /^(\d{4})-(\d{2})$/.exec(String(p)); if (!m) return null; const d = (+m[1]) * 12 + (+m[2] - 1) + k; return `${Math.floor(d / 12)}-${String((d % 12) + 1).padStart(2, '0')}`; });
    const proj = []; for (let h = 1; h <= H; h++) {
      const x = W - 1 + h, mid = f.a + f.b * x;
      const spread = c.outlookZ * f.sd * Math.sqrt(1 + 1 / W + (x - f.xm) ** 2 / (f.sxx || 1));
      proj.push({ period: nextP(win[W - 1].period, h), h, value: Math.max(0, mid), low: Math.max(0, mid - spread), high: Math.max(0, mid + spread) });
    }
    // dirección: pendiente significativa (|t| ≥ 2) y cambio ajustado en la ventana > umbral
    const tStat = f.se > 0 ? f.b / f.se : (f.b === 0 ? 0 : Math.sign(f.b) * 99);
    const fitChange = fitted[0].value > 0 ? fitted[W - 1].value / fitted[0].value - 1 : null;
    const perPeriod = mu > 0 ? f.b / mu : 0;
    let direction = 'flat';
    if (Math.abs(tStat) >= 2 && fitChange !== null && Math.abs(fitChange) >= c.outlookFlat * 2) direction = f.b > 0 ? 'up' : 'down';
    // backtest: la misma regla (recta sobre las últimas ≤W) aplicada hacia atrás, un período adelante
    const errs = [], naive = [];
    for (let t = c.outlookMinPoints; t < run.length; t++) {
      const hist = run.slice(Math.max(0, t - c.outlookWindow), t), g = fitLine(hist), pred = Math.max(0, g.a + g.b * hist.length);
      errs.push(Math.abs(pred - run[t]) / run[t]); naive.push(Math.abs(hist[hist.length - 1] - run[t]) / run[t]);
    }
    const mape = errs.length ? mean(errs) : null, mapeNaive = naive.length ? mean(naive) : null;
    const reasons = [];
    if (W < 6) reasons.push(`solo ${W} meses de referencia`);
    if (errs.length < 3) reasons.push('poco historial para probar la regla');
    if (story && story.stability === 'volatil') reasons.push('producto volátil');
    if (story && story.reliability && story.reliability.reasons.includes('vende poco frente a lo típico')) reasons.push('vende poco');
    if (mu > 0 && f.sd / mu > 0.2) reasons.push('los meses se alejan mucho de la recta');
    let level = mape === null ? 'low' : mape <= c.outlookMapeOk ? 'high' : mape <= c.outlookMapeMid ? 'medium' : 'low';
    if (reasons.length && level === 'high') level = 'medium';
    if (reasons.length >= 2 && level === 'medium') level = 'low';
    if (mapeNaive !== null && mape !== null && mape > mapeNaive * 1.15 && level !== 'low') { level = 'low'; reasons.push('no mejora a repetir el último mes'); }
    // contradicción con el período en curso
    let contradiction = null;
    const st = story && story.current ? story.current : null;
    if (st && st.state === 'falling' && direction === 'up') contradiction = 'El período en curso va por debajo de su comparable: la tendencia reciente podría estar cambiando.';
    if (st && st.state === 'rising' && direction === 'down') contradiction = 'El período en curso va por encima de su comparable: la tendencia reciente podría estar cambiando.';
    if (contradiction && level === 'high') level = 'medium';
    const last = ys[W - 1];
    // Referencia estacional (solo series mensuales): qué hizo la serie el año anterior entre el mismo mes base y cada mes proyectado
    let seasonal = { status: 'unavailable', message: 'Hace falta el mismo mes del año anterior (y el de cada mes proyectado) con venta para comparar la temporada.' };
    if (/^\d{4}-\d{2}$/.test(String(win[W - 1].period))) {
      const ref = options.seasonRef || {};
      const get = (k) => { const x = s.find((y) => y.period === k); if (x && act(x)) return x.value; return fin(ref[k]) && ref[k] > 0 ? ref[k] : null; };
      const ly = (k) => `${+String(k).slice(0, 4) - 1}${String(k).slice(4)}`;
      const baseLY = get(ly(win[W - 1].period));
      const items = baseLY ? proj.map((p) => { const v = p.period ? get(ly(p.period)) : null; return v ? { period: p.period, h: p.h, lastYear: v, seasonalChange: v / baseLY - 1, seasonalValue: last * (v / baseLY), projChange: p.value / last - 1 } : null; }).filter(Boolean) : [];
      if (items.length) {
        const f1 = items[0], gap = Math.abs(f1.seasonalChange - f1.projChange);
        const opposite = Math.sign(f1.seasonalChange) !== Math.sign(f1.projChange) && Math.abs(f1.seasonalChange) >= 0.05 && Math.abs(f1.projChange) >= 0.05;
        seasonal = { status: 'available', baseLastYear: baseLY, baseLabel: ly(win[W - 1].period), items, differs: opposite || gap >= (c.outlookSeasonGap || 0.15) };
      }
    }
    return { status: 'available', seasonal, direction, window: { from: win[0].period, to: win[W - 1].period, periods: W }, fitted, projection: proj, last, lastPeriod: win[W - 1].period,
      slopePerPeriod: f.b, perPeriodPct: perPeriod, fitChange, tStat, residualSd: f.sd,
      confidence: { level, mape, mapeNaive, tests: errs.length, reasons }, contradiction, horizon: H };
  }

  /** Separación simple volumen / precio de UNA entidad entre dos períodos (Σ = Δ venta). null si faltan unidades. */
  function priceVolume({ r0, u0, r1, u1 }) {
    if (![r0, u0, r1, u1].every(fin) || r0 <= 0 || r1 <= 0 || u0 <= 0 || u1 <= 0) return null;
    const p0 = r0 / u0, p1 = r1 / u1;
    return { volume: (u1 - u0) * p0, price: (p1 - p0) * u1, delta: r1 - r0, p0, p1, u0, u1 };
  }

  FP.trendStoryEngine = { DEFAULTS, analyze, outlook, priceVolume, pLabel, rangeText };
})(typeof window !== 'undefined' ? window : globalThis);
