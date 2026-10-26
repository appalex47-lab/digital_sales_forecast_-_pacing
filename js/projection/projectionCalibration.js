/**
 * projectionCalibration.js — Calibración de la proyección del año siguiente (lógica pura, sin DOM ni almacenamiento).
 *
 * Qué calibra (y qué NO):
 *  - SÍ: (1) la ventana de ritmo de cada canal (2, 3, 6 o 12 meses) con que se proyecta; (2) cómo se sugiere repartir la meta entre
 *    canales (base, últimos 6 meses o tendencia amortiguada); (3) la forma de los meses del reparto mensual (año base, promedio de 2 o de 3 años).
 *  - NO: la meta ni el crecimiento de la meta (los fijas tú), la cobertura mínima de un mes (90 %), el aviso de ritmo atípico (40 %).
 *
 * Cómo mide (backtest con origen móvil, sin mirar el futuro): para cada mes cerrado T se proyecta lo que habría salido con la información
 * de hasta T y se compara contra lo que pasó en los H meses siguientes (H = 3, 6 y 12). La proyección de un origen es
 * «lo vendido en esos mismos meses un año antes × (1 + ritmo de la ventana)», que es la misma regla que usa la pantalla.
 * Solo cuentan meses cerrados con cobertura suficiente; un caso necesita todos sus meses.
 *
 * Tope del ritmo: el ritmo medido se recorta a [−30 %, +50 %] al proyectar (y al medir), porque un ritmo de pocos meses no se sostiene un año completo.
 * Reglas de honestidad: con menos de 24 meses (o menos de 6 casos comparables) no calibra y se queda con la regla inicial;
 * un cambio exige mejorar al menos 10 % relativo (y un mínimo absoluto) sobre la regla inicial; los casos de un mismo canal se traslapan
 * (orígenes consecutivos comparten meses), así que 6 casos no son 6 observaciones independientes. Las bandas de «calibrada» son una propuesta.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  const WINDOWS = [2, 3, 6, 12];
  const DEFAULT_WINDOW = 2;
  const SHARE_METHODS = ['base', 'recent6', 'trend'];
  const SHAPE_METHODS = ['base', 'avg2', 'avg3'];
  const MIN_MONTHS = 24;          // meses cerrados de un canal para poder comparar año contra año
  const MIN_CASES = 6;            // casos comparables para cambiar algo o decir «Sí / Casi / No»
  const HORIZONS = [3, 6, 12];
  const MAX_GROWTH = 0.5, MIN_GROWTH = -0.3;   // tope del ritmo proyectable (se proyectan 12 meses con un ritmo medido en pocos); un ritmo fuera del rango se recorta y se avisa
  const capGrowth = (g) => Math.max(MIN_GROWTH, Math.min(MAX_GROWTH, g));
  const REL_GAIN = 0.10;          // mejora relativa mínima sobre la regla inicial
  const ABS_GAIN = { window: 0.005, share: 0.003, shape: 0.003 };
  const BANDS = { total: { buena: 0.05, calibrada: 0.08 }, big: 0.12, small: 0.20 };   // error en 8 de cada 10 casos (propuesta)
  const SMALL_SHARE = 0.15;       // un canal con menos de 15 % de la base cuenta como chico
  const LABEL = { base: 'participación de la base', recent6: 'participación de los últimos 6 meses', trend: 'participación con tendencia amortiguada',
    avg2: 'promedio de 2 años', avg3: 'promedio de 3 años' };
  const SHAPE_LABEL = { base: 'forma del año base', avg2: 'promedio de 2 años', avg3: 'promedio de 3 años' };

  /* ---------- Estadística ---------- */
  function percentile(values, q) {
    const v = values.filter(fin).slice().sort((a, b) => a - b);
    if (!v.length) return null;
    return v[Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1))];
  }
  const median = (v) => percentile(v, 0.5);
  const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

  /* ---------- Series ----------
     series = { canal: { [idx]: venta } } con idx = año × 12 + (mes − 1), solo meses cerrados con cobertura. */
  const idxOf = (y, m) => y * 12 + (m - 1);
  const keyOf = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  const bounds = (s) => { const k = Object.keys(s || {}).map(Number); return k.length ? { first: Math.min(...k), last: Math.max(...k), n: k.length } : null; };
  const sumRange = (s, from, to) => { let t = 0; for (let i = from; i <= to; i++) { if (!fin(s[i])) return null; t += s[i]; } return t; };

  /** Ritmo de la ventana: venta de los w meses que terminan en T contra los mismos meses un año antes. */
  function growthAt(s, T, w) {
    const cur = sumRange(s, T - w + 1, T), prev = sumRange(s, T - w + 1 - 12, T - 12);
    return cur === null || prev === null || !(prev > 0) ? null : cur / prev - 1;
  }
  /** Proyección de los H meses siguientes a T: lo del año anterior en esos meses × (1 + g). */
  function projectAt(s, T, H, g) {
    const base = sumRange(s, T + 1 - 12, T + H - 12);
    return base === null ? null : base * (1 + g);
  }
  const actualAt = (s, T, H) => sumRange(s, T + 1, T + H);

  /** Casos de un canal con una ventana: [{T, H, pred, act, err}] */
  function windowCases(s, w, lastIdx) {
    const b = bounds(s), out = [];
    if (!b) return out;
    for (let T = b.first; T <= lastIdx; T++) {
      const g0 = growthAt(s, T, w); if (g0 === null) continue; const g = capGrowth(g0);
      HORIZONS.forEach((H) => {
        if (T + H > b.last) return;
        const pred = projectAt(s, T, H, g), act = actualAt(s, T, H);
        if (pred === null || act === null || !(act > 0)) return;
        out.push({ T, H, pred, act, err: (pred - act) / act });
      });
    }
    return out;
  }
  const absScore = (cases) => {   // promedio de los errores medios por horizonte (cada horizonte pesa igual)
    const per = HORIZONS.map((H) => cases.filter((c) => c.H === H).map((c) => Math.abs(c.err))).filter((a) => a.length).map(mean);
    return per.length ? mean(per) : null;
  };
  const summaryOf = (cases, H) => {
    const c = cases.filter((x) => x.H === H);
    if (!c.length) return { n: 0, typical: null, p80: null, bias: null };
    const a = c.map((x) => Math.abs(x.err));
    return { n: c.length, typical: median(a), p80: percentile(a, 0.8), bias: median(c.map((x) => x.err)) };
  };

  /** Quita ventanas, de la más larga a la más corta, hasta que el conjunto común de orígenes tenga ≥ MIN_CASES casos a 6 meses. */
  function commonSet(candidates, casesOf, minCases, HH = 6) {
    let k = candidates.length;
    while (k >= 1) {
      const set = candidates.slice(0, k), origins = set.map((c) => new Set(casesOf(c).filter((x) => x.H === HH).map((x) => x.T)));
      const common = [...origins[0]].filter((T) => origins.every((o) => o.has(T)));
      if (common.length >= minCases) return { set, common: new Set(common) };
      k--;
    }
    return { set: [], common: new Set() };
  }

  /* ---------- 1) Ventana de ritmo por canal ---------- */
  function analyzeWindows(s, lastIdx) {
    const all = {}; WINDOWS.forEach((w) => { all[w] = windowCases(s, w, lastIdx); });
    // Se proyecta un año: una ventana solo puede ganarle a la regla inicial con ≥ MIN_CASES casos a 12 meses (a 6 meses los casos son más y se traslapan más)
    const eligible = WINDOWS.filter((w) => all[w].filter((c) => c.H === 12).length >= MIN_CASES);
    if (!eligible.includes(DEFAULT_WINDOW)) return { status: 'insufficient', chosen: DEFAULT_WINDOW, rows: [] };
    const { set, common } = commonSet(eligible, (w) => all[w], MIN_CASES, 12);
    if (!set.includes(DEFAULT_WINDOW) || set.length < 2) return { status: 'insufficient', chosen: DEFAULT_WINDOW, rows: [] };
    const rows = set.map((w) => {
      const cs = all[w].filter((c) => common.has(c.T));
      return { w, score: absScore(cs), n6: cs.filter((c) => c.H === 6).length, n12: cs.filter((c) => c.H === 12).length, h12: summaryOf(cs, 12), h6: summaryOf(cs, 6) };
    });
    const def = rows.find((r) => r.w === DEFAULT_WINDOW);
    let best = def;
    rows.forEach((r) => { if (r.score !== null && r.score < best.score) best = r; });
    const gain = def.score - best.score;
    const switches = best.w !== DEFAULT_WINDOW && gain >= ABS_GAIN.window && gain >= REL_GAIN * def.score;
    const chosen = switches ? best.w : DEFAULT_WINDOW;
    return { status: switches ? 'changed' : 'kept', chosen, best: best.w, rows, commonCases: common.size, gain: switches ? gain : 0 };
  }

  /* ---------- 2) Reparto sugerido entre canales ---------- */
  function sharesAt(series, ids, T, method) {
    const ttm = (to) => { const v = {}; let tot = 0; for (const id of ids) { const x = sumRange(series[id] || {}, to - 11, to); if (x === null) return null; v[id] = x; tot += x; } return tot > 0 ? Object.fromEntries(ids.map((id) => [id, v[id] / tot])) : null; };
    const s0 = method === 'recent6' ? (() => { const v = {}; let tot = 0; for (const id of ids) { const x = sumRange(series[id] || {}, T - 5, T); if (x === null) return null; v[id] = x; tot += x; } return tot > 0 ? Object.fromEntries(ids.map((id) => [id, v[id] / tot])) : null; })() : ttm(T);
    if (!s0) return null;
    if (method !== 'trend') return s0;
    const sp = ttm(T - 12); if (!sp) return null;
    const raw = Object.fromEntries(ids.map((id) => [id, Math.max(0, s0[id] + 0.5 * (s0[id] - sp[id]))]));
    const tot = ids.reduce((a, id) => a + raw[id], 0);
    return tot > 0 ? Object.fromEntries(ids.map((id) => [id, raw[id] / tot])) : null;
  }
  function shareCases(series, ids, method, lastIdx) {
    const out = []; const firsts = ids.map((id) => (bounds(series[id]) || {}).first); if (firsts.some((f) => !fin(f))) return out;
    const first = Math.max(...firsts);
    for (let T = first; T <= lastIdx; T++) {
      const p = sharesAt(series, ids, T, method); if (!p) continue;
      [6, 12].forEach((H) => {
        const act = {}; let tot = 0;
        for (const id of ids) { const x = actualAt(series[id] || {}, T, H); if (x === null) return; act[id] = x; tot += x; }
        if (!(tot > 0)) return;
        out.push({ T, H, err: ids.reduce((a, id) => a + Math.abs(p[id] - act[id] / tot), 0) / 2 });
      });
    }
    return out;
  }
  const mae = (cases) => { const per = [6, 12].map((H) => cases.filter((c) => c.H === H).map((c) => c.err)).filter((a) => a.length).map(mean); return per.length ? mean(per) : null; };
  function analyzeShares(series, ids, lastIdx) {
    if (ids.length < 2) return { status: 'insufficient', chosen: 'base', rows: [] };
    const all = {}; SHARE_METHODS.forEach((m) => { all[m] = shareCases(series, ids, m, lastIdx); });
    const eligible = SHARE_METHODS.filter((m) => all[m].filter((c) => c.H === 6).length >= MIN_CASES);
    if (!eligible.includes('base')) return { status: 'insufficient', chosen: 'base', rows: [] };
    const { set, common } = commonSet(eligible, (m) => all[m], MIN_CASES);
    if (!set.includes('base') || set.length < 2) return { status: 'insufficient', chosen: 'base', rows: [] };
    const rows = set.map((m) => { const cs = all[m].filter((c) => common.has(c.T)); return { method: m, score: mae(cs), n: cs.filter((c) => c.H === 6).length }; });
    const def = rows.find((r) => r.method === 'base'); let best = def;
    rows.forEach((r) => { if (r.score < best.score) best = r; });
    const gain = def.score - best.score, switches = best.method !== 'base' && gain >= ABS_GAIN.share && gain >= REL_GAIN * def.score;
    return { status: switches ? 'changed' : 'kept', chosen: switches ? best.method : 'base', best: best.method, rows, commonCases: common.size, gain: switches ? gain : 0 };
  }

  /* ---------- 3) Forma de los meses ---------- */
  /** Forma (12 participaciones por mes calendario) del bloque de 12 meses que termina en `to`; null si falta algún mes. */
  function blockShape(s, to) {
    const tot = sumRange(s, to - 11, to); if (!(tot > 0)) return null;
    const out = new Array(12);
    for (let i = to - 11; i <= to; i++) out[i % 12] = s[i] / tot;
    return out;
  }
  function shapePredict(s, T, method) {
    const n = method === 'avg3' ? 3 : method === 'avg2' ? 2 : 1, blocks = [];
    for (let j = 0; j < n; j++) { const b = blockShape(s, T - 12 * j); if (!b) return null; blocks.push(b); }
    return blocks[0].map((_, m) => mean(blocks.map((b) => b[m])));
  }
  function shapeCases(series, ids, method, lastIdx) {
    const out = [], firsts = ids.map((id) => (bounds(series[id]) || {}).first); if (firsts.some((f) => !fin(f))) return out;
    const first = Math.max(...firsts);
    for (let T = first + 11; T <= lastIdx - 12; T++) {
      const errs = [];
      for (const id of ids) {
        const p = shapePredict(series[id] || {}, T, method), a = blockShape(series[id] || {}, T + 12);
        if (!p || !a) { errs.length = 0; break; }
        let e = 0; for (let m = 0; m < 12; m++) e += Math.abs(p[m] - a[m]); errs.push(e / 2);
      }
      if (errs.length === ids.length) out.push({ T, err: mean(errs) });
    }
    return out;
  }
  function analyzeShape(series, ids, lastIdx) {
    const all = {}; SHAPE_METHODS.forEach((m) => { all[m] = shapeCases(series, ids, m, lastIdx); });
    const eligible = SHAPE_METHODS.filter((m) => all[m].length >= MIN_CASES);
    if (!eligible.includes('base')) return { status: 'insufficient', chosen: 'base', rows: [], counts: Object.fromEntries(SHAPE_METHODS.map((m) => [m, all[m].length])) };
    let k = eligible.length, set = [], common = [];
    while (k >= 1) {
      set = eligible.slice(0, k); const sets = set.map((m) => new Set(all[m].map((c) => c.T)));
      common = [...sets[0]].filter((T) => sets.every((x) => x.has(T)));
      if (common.length >= MIN_CASES) break; k--;
    }
    if (!set.includes('base') || set.length < 2 || common.length < MIN_CASES) return { status: 'insufficient', chosen: 'base', rows: [], counts: Object.fromEntries(SHAPE_METHODS.map((m) => [m, all[m].length])) };
    const cm = new Set(common), rows = set.map((m) => ({ method: m, score: mean(all[m].filter((c) => cm.has(c.T)).map((c) => c.err)), n: common.length }));
    const def = rows.find((r) => r.method === 'base'); let best = def;
    rows.forEach((r) => { if (r.score < best.score) best = r; });
    const gain = def.score - best.score, switches = best.method !== 'base' && gain >= ABS_GAIN.shape && gain >= REL_GAIN * def.score;
    return { status: switches ? 'changed' : 'kept', chosen: switches ? best.method : 'base', best: best.method, rows, commonCases: common.length, gain: switches ? gain : 0,
      counts: Object.fromEntries(SHAPE_METHODS.map((m) => [m, all[m].length])) };
  }

  /* ---------- Total digital con unas ventanas dadas ---------- */
  function totalCases(series, ids, windows, lastIdx) {
    const out = [], firsts = ids.map((id) => (bounds(series[id]) || {}).first); if (!ids.length || firsts.some((f) => !fin(f))) return out;
    const first = Math.max(...firsts);
    for (let T = first; T <= lastIdx; T++) {
      HORIZONS.forEach((H) => {
        let pred = 0, act = 0;
        for (const id of ids) {
          const s = series[id] || {}, g0 = growthAt(s, T, windows[id] || DEFAULT_WINDOW); if (g0 === null) return; const g = capGrowth(g0);
          const p = projectAt(s, T, H, g), a = actualAt(s, T, H); if (p === null || a === null) return;
          pred += p; act += a;
        }
        if (act > 0) out.push({ T, H, pred, act, err: (pred - act) / act });
      });
    }
    return out;
  }

  const verdict = (p80, band, n) => (n < MIN_CASES || !fin(p80) ? 'pocos' : p80 <= band ? 'si' : p80 <= band * 1.5 ? 'casi' : 'no');
  const totalVerdict = (p80, n) => (n < MIN_CASES || !fin(p80) ? 'pocos' : p80 <= BANDS.total.buena ? 'buena' : p80 <= BANDS.total.calibrada ? 'si' : p80 <= BANDS.total.calibrada * 1.5 ? 'casi' : 'no');

  /**
   * @param {object} series  { canal: { idx: venta } } (meses cerrados con cobertura)
   * @param {string[]} ids   canales
   * @returns análisis completo + `params` (lo que se aplicaría) + `changes` (frases)
   */
  function calibrate(series, ids, { labels = {} } = {}) {
    const bs = Object.fromEntries(ids.map((id) => [id, bounds(series[id])]));
    const months = Object.fromEntries(ids.map((id) => [id, bs[id] ? bs[id].n : 0]));
    const maxMonths = Math.max(0, ...ids.map((id) => months[id]));
    const defaults = defaultParams(ids);
    if (maxMonths < MIN_MONTHS) return { status: 'insufficient', months, needed: MIN_MONTHS, params: defaults, changes: [], monthsUsed: maxMonths };
    const lastIdx = Math.max(...ids.filter((id) => bs[id]).map((id) => bs[id].last));
    const channels = {}, windows = {};
    ids.forEach((id) => {
      const a = months[id] >= MIN_MONTHS ? analyzeWindows(series[id], lastIdx) : { status: 'insufficient', chosen: DEFAULT_WINDOW, rows: [] };
      channels[id] = a; windows[id] = a.chosen;
    });
    const shares = analyzeShares(series, ids, lastIdx), shape = analyzeShape(series, ids, lastIdx);
    const params = { windows, shareMethod: shares.chosen, shapeMethod: shape.chosen };
    // Total digital: la regla inicial contra la elegida
    const before = totalCases(series, ids, Object.fromEntries(ids.map((i) => [i, DEFAULT_WINDOW])), lastIdx), after = totalCases(series, ids, windows, lastIdx);
    const tot = (cs) => ({ h12: summaryOf(cs, 12), h6: summaryOf(cs, 6), h3: summaryOf(cs, 3) });
    const total = { before: tot(before), after: tot(after) };
    total.verdict = totalVerdict(total.after.h12.p80, total.after.h12.n);
    total.verdict6 = totalVerdict(total.after.h6.p80, total.after.h6.n);
    // veredicto por canal con la ventana elegida (casos propios de esa ventana, a 12 meses)
    const baseTotal = ids.reduce((a, id) => a + (bs[id] ? sumLast12(series[id], bs[id].last) : 0), 0);
    ids.forEach((id) => {
      const c = channels[id], w = c.chosen, cs = windowCases(series[id], w, lastIdx), h12 = summaryOf(cs, 12), h6 = summaryOf(cs, 6);
      const share = baseTotal > 0 && bs[id] ? sumLast12(series[id], bs[id].last) / baseTotal : 0, small = share < SMALL_SHARE, band = small ? BANDS.small : BANDS.big;
      Object.assign(c, { months: months[id], h12, h6, band, small, share, verdict: verdict(h12.p80, band, h12.n), verdict6: verdict(h6.p80, band, h6.n) });
    });
    const changes = [];
    ids.forEach((id) => { if (windows[id] !== DEFAULT_WINDOW) changes.push(`${labels[id] || id}: ritmo de los últimos ${windows[id]} meses (antes ${DEFAULT_WINDOW}).`); });
    if (params.shareMethod !== 'base') changes.push(`Reparto sugerido: ${LABEL[params.shareMethod]} (antes participación de la base).`);
    if (params.shapeMethod !== 'base') changes.push(`Forma de los meses: ${SHAPE_LABEL[params.shapeMethod]} (antes forma del año base).`);
    return { status: 'ok', months, monthsUsed: maxMonths, lastMonth: keyOf(lastIdx), channels, shares, shape, total, params, changes, lastClosedKey: keyOf(lastIdx) };
  }
  function sumLast12(s, last) { const x = sumRange(s, last - 11, last); return x === null ? 0 : x; }

  /* ---------- Parámetros ---------- */
  const defaultParams = (ids) => ({ windows: Object.fromEntries((ids || []).map((id) => [id, DEFAULT_WINDOW])), shareMethod: 'base', shapeMethod: 'base' });
  function normParams(raw, ids) {
    const d = defaultParams(ids);
    if (!raw || typeof raw !== 'object') return d;
    (ids || []).forEach((id) => { const w = raw.windows && raw.windows[id]; if (WINDOWS.includes(w)) d.windows[id] = w; });
    if (SHARE_METHODS.includes(raw.shareMethod)) d.shareMethod = raw.shareMethod;
    if (SHAPE_METHODS.includes(raw.shapeMethod)) d.shapeMethod = raw.shapeMethod;
    return d;
  }
  const sameParams = (a, b, ids) => ids.every((id) => a.windows[id] === b.windows[id]) && a.shareMethod === b.shareMethod && a.shapeMethod === b.shapeMethod;
  const isDefault = (p, ids) => sameParams(p, defaultParams(ids), ids);

  /* ---------- Estado con historial y deshacer (puro; app.js lo guarda) ---------- */
  const emptyState = () => ({ v: 1, auto: true, active: null, history: [], lastAutoMonth: null });
  function normalize(raw, ids) {
    const s = emptyState();
    if (!raw || typeof raw !== 'object') return s;
    s.auto = raw.auto !== false;
    if (raw.active && typeof raw.active === 'object') {
      s.active = { params: normParams(raw.active.params, ids), at: String(raw.active.at || ''), monthsUsed: raw.active.monthsUsed | 0, summary: raw.active.summary || null };
    }
    s.history = (Array.isArray(raw.history) ? raw.history : []).filter((h) => h && typeof h === 'object')
      .map((h) => ({ id: String(h.id || ''), at: String(h.at || ''), kind: ['calibrate', 'reset', 'undo'].includes(h.kind) ? h.kind : 'calibrate', trigger: h.trigger === 'auto' ? 'auto' : 'manual',
        monthsUsed: h.monthsUsed | 0, from: normParams(h.from, ids), to: normParams(h.to, ids), text: Array.isArray(h.text) ? h.text.map(String) : [], undone: h.undone === true, month: h.month ? String(h.month) : null })).slice(-50);
    s.lastAutoMonth = raw.lastAutoMonth ? String(raw.lastAutoMonth) : null;
    return s;
  }
  const paramsOf = (state, ids) => (state && state.active ? normParams(state.active.params, ids) : defaultParams(ids));
  const idOf = (at) => `pcal-${String(at).replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
  function summaryLite(res) {
    const channels = {}; Object.keys(res.channels).forEach((id) => { const c = res.channels[id]; channels[id] = { chosen: c.chosen, status: c.status, h12: c.h12, band: c.band, verdict: c.verdict, months: c.months }; });
    return { channels, total: { after: res.total.after, before: res.total.before, verdict: res.total.verdict }, shares: { chosen: res.shares.chosen, status: res.shares.status }, shape: { chosen: res.shape.chosen, status: res.shape.status } };
  }
  function applyResult(state, res, ids, { at, trigger = 'manual', month = null } = {}) {
    if (!res || res.status !== 'ok') return state;
    const from = paramsOf(state, ids), when = at || new Date().toISOString(), to = normParams(res.params, ids), changed = !sameParams(from, to, ids);
    const entry = { id: idOf(when), at: when, kind: 'calibrate', trigger, monthsUsed: res.monthsUsed, from, to, month,
      text: changed ? res.changes.slice() : ['Sin cambios: con tu historial la regla actual ya era la mejor medida.'], undone: false };
    const next = { ...state, active: isDefault(to, ids) && !state.active ? null : { params: to, at: when, monthsUsed: res.monthsUsed, summary: summaryLite(res) }, history: state.history.concat(entry).slice(-50) };
    if (trigger === 'auto' && month) next.lastAutoMonth = month;
    return next;
  }
  function undo(state, ids, { at } = {}) {
    const i = state.history.map((h) => !h.undone && h.kind !== 'undo').lastIndexOf(true);
    if (i < 0) return state;
    const h = state.history[i], when = at || new Date().toISOString(), hist = state.history.map((x, j) => (j === i ? { ...x, undone: true } : x));
    hist.push({ id: idOf(when), at: when, kind: 'undo', trigger: 'manual', monthsUsed: h.monthsUsed, from: h.to, to: h.from, month: null, undone: false,
      text: [h.kind === 'reset' ? `Se deshizo la vuelta a la regla inicial del ${h.at.slice(0, 10)}.` : `Se deshizo la calibración del ${h.at.slice(0, 10)}.`] });
    return { ...state, active: isDefault(h.from, ids) ? null : { params: h.from, at: when, monthsUsed: h.monthsUsed, summary: null }, history: hist.slice(-50) };
  }
  function reset(state, ids, { at } = {}) {
    if (!state.active) return state;
    const when = at || new Date().toISOString();
    return { ...state, active: null, history: state.history.concat({ id: idOf(when), at: when, kind: 'reset', trigger: 'manual', monthsUsed: state.active.monthsUsed, from: state.active.params, to: defaultParams(ids), month: null, undone: false,
      text: ['Se volvió a la regla inicial (ritmo de 2 meses, reparto y meses de la base).'] }).slice(-50) };
  }
  /** ¿Toca recalibrar sola? Con el interruptor encendido, ≥ 24 meses y un mes cerrado más nuevo que el de la última recalibración automática. */
  function autoDue(state, lastClosedKey, maxMonths) {
    if (!state || !state.auto) return { due: false, reason: 'off' };
    if (!lastClosedKey || (maxMonths | 0) < MIN_MONTHS) return { due: false, reason: 'pocos_meses' };
    if (state.lastAutoMonth && state.lastAutoMonth >= lastClosedKey) return { due: false, reason: 'ya_hecho' };
    return { due: true, month: lastClosedKey };
  }

  /* ---------- Aplicar los parámetros a los cálculos de la proyección ---------- */
  /** Reparto sugerido (porcentajes que suman 100, a 0.1) con el método dado, o null si faltan meses. */
  function suggestShares(series, ids, method) {
    const lasts = ids.map((id) => (bounds(series[id]) || {}).last); if (lasts.some((x) => !fin(x))) return null;
    const T = Math.min(...lasts), p = sharesAt(series, ids, T, method); if (!p) return null;
    const out = Object.fromEntries(ids.map((id) => [id, Math.round(p[id] * 1000) / 10]));
    const diff = Math.round((100 - ids.reduce((a, id) => a + out[id], 0)) * 10) / 10;
    if (diff !== 0) { const big = ids.reduce((a, id) => (p[id] > p[a] ? id : a), ids[0]); out[big] = Math.round((out[big] + diff) * 10) / 10; }
    return out;
  }
  /** Pesos de los 12 meses (calendario) para repartir: año base, promedio de 2 o de 3 años. `years` = [año base, año−1, año−2] (cada uno, 12 valores o null). */
  function shapeWeights(method, years) {
    const n = method === 'avg3' ? 3 : method === 'avg2' ? 2 : 1, sh = [];
    for (let j = 0; j < n; j++) {
      const y = years[j]; if (!y || y.length !== 12 || y.some((v) => !fin(v))) return { weights: years[0], used: 'base' };
      const t = y.reduce((a, b) => a + b, 0); if (!(t > 0)) return { weights: years[0], used: 'base' };
      sh.push(y.map((v) => v / t));
    }
    if (n === 1) return { weights: years[0], used: 'base' };
    return { weights: sh[0].map((_, m) => mean(sh.map((b) => b[m]))), used: method };
  }

  FP.projectionCalibration = { MAX_GROWTH, MIN_GROWTH, capGrowth, WINDOWS, DEFAULT_WINDOW, SHARE_METHODS, SHAPE_METHODS, MIN_MONTHS, MIN_CASES, HORIZONS, BANDS, SMALL_SHARE, LABEL, SHAPE_LABEL,
    percentile, idxOf, keyOf, bounds, growthAt, projectAt, calibrate, defaultParams, normParams, sameParams, isDefault, emptyState, normalize, paramsOf, applyResult, undo, reset, autoDue,
    suggestShares, shapeWeights, sharesAt, blockShape, windowCases, analyzeWindows, analyzeShares, analyzeShape };
})(typeof window !== 'undefined' ? window : globalThis);
