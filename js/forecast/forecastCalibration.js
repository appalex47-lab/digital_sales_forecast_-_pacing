/**
 * forecastCalibration.js — Fase 3.3 · Calibración de la confianza del cierre estimado (determinista, sin IA).
 *
 * Qué hace: compara cada cierre estimado con lo que el mes realmente cerró y, con ese historial, ajusta qué tan exigentes son los umbrales de los factores de
 * `forecastConfidence` (cobertura, estabilidad, separación entre métodos). Solo se mueven UMBRALES: nunca los pesos, la regla de topes ni el forecast.
 *
 * Datos: para cada mes cerrado con venta real en todos los canales y cada corte (día 5, 10, 15, 20 y 25) se recalcula el forecast como si se estuviera en ese
 * día (el motor solo ve la venta real hasta el corte), se anota el cierre estimado, la etiqueta de confianza y sus factores medidos, y se compara contra el
 * cierre real. Cada caso es una «muestra». Con los factores guardados, probar unos umbrales candidatos NO vuelve a correr el motor (`FP.forecastConfidence.relabel`).
 *
 * Honestidad estadística: «en 8 de cada 10 casos el error fue menor a X %» es el percentil 80 del error absoluto. Las bandas objetivo (3 % para Alta y 7 % para
 * Media) son una propuesta del dueño, no una verdad: la calibración busca acercarse a ellas con tu historial y dice si lo logró o no. Con menos de 12 meses
 * cerrados NO calibra (mantiene los umbrales iniciales). Un cambio nunca es silencioso: queda en un historial con la fecha y los meses usados, y se puede deshacer.
 *
 * Este archivo es lógica pura (sin DOM, sin almacenamiento). El motor del forecast y el guardado los inyecta app.js.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  const CUTS = [5, 10, 15, 20, 25];
  const MIN_MONTHS = 12;
  const MIN_CASES = 6;                                   // casos mínimos de una etiqueta para decir algo de ella
  const TARGETS = { alta: 0.03, media: 0.07 };           // propuesta del dueño (error p80), no una verdad
  const TUNABLE = ['cobAlta', 'cobMedia', 'estAlta', 'estMedia', 'rngAlta', 'rngMedia'];
  const FACTOR_OF = { cobAlta: 'cobertura', cobMedia: 'cobertura', estAlta: 'estabilidad', estMedia: 'estabilidad', rngAlta: 'rango', rngMedia: 'rango' };
  const LEVEL_OF = { cobAlta: 'Alta', cobMedia: 'Media', estAlta: 'Alta', estMedia: 'Media', rngAlta: 'Alta', rngMedia: 'Media' };
  const BOUNDS = { cobAlta: [0.3, 0.9], cobMedia: [0.1, 0.8], estAlta: [0.02, 0.4], estMedia: [0.05, 0.6], rngAlta: [0.005, 0.1], rngMedia: [0.01, 0.2] };
  const MULTS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2];
  const GAIN = 0.002;   // una modificación solo se acepta si mejora la pérdida al menos esto (evita cambios por ruido)
  const LABELS = ['alta', 'media', 'baja'];
  const LABEL_TXT = { alta: 'Alta', media: 'Media', baja: 'Baja' };

  const FC = () => FP.forecastConfidence;
  const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const pad2 = (n) => String(n).padStart(2, '0');
  const daysIn = (monthKey) => new Date(Date.UTC(+monthKey.slice(0, 4), +monthKey.slice(5, 7), 0)).getUTCDate();

  /** Percentil por rango más cercano: «en q de cada 1 casos el error fue menor o igual a…». */
  function percentile(values, q) {
    const v = values.filter(fin).slice().sort((a, b) => a - b);
    if (!v.length) return null;
    return v[Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1))];
  }
  const median = (values) => percentile(values, 0.5);

  /** Resumen por etiqueta con unos umbrales dados (null = los iniciales): casos, error típico (mediana) y error en 8 de cada 10 casos (p80). */
  function summarize(samples, thresholds) {
    const out = { n: samples.length, labels: {} };
    LABELS.forEach((l) => { out.labels[l] = { label: LABEL_TXT[l], n: 0, errs: [] }; });
    samples.forEach((s) => {
      const r = FC().relabel(s.factors, thresholds || undefined);
      if (!r) return;
      const g = out.labels[r.level]; g.n++; g.errs.push(s.abs);
    });
    LABELS.forEach((l) => {
      const g = out.labels[l];
      g.typical = median(g.errs); g.p80 = percentile(g.errs, 0.8);
      g.share = samples.length ? g.n / samples.length : 0;
      delete g.errs;
    });
    return out;
  }

  /** Error típico del cierre estimado según el día del mes en que se estimó (los cortes). */
  function byCut(samples) {
    const out = {};
    CUTS.forEach((c) => {
      const e = samples.filter((s) => s.cut === c).map((s) => s.abs);
      out[c] = { cut: c, n: e.length, typical: median(e), p80: percentile(e, 0.8) };
    });
    return out;
  }

  const monthsOf = (samples) => [...new Set(samples.map((s) => s.month))].sort();

  /* ---------- Búsqueda de umbrales ---------- */

  function valid(t) {
    return TUNABLE.every((k) => fin(t[k]) && t[k] >= BOUNDS[k][0] && t[k] <= BOUNDS[k][1])
      && t.cobAlta >= t.cobMedia && t.estAlta <= t.estMedia && t.rngAlta <= t.rngMedia;
  }
  /** Pérdida a minimizar: cuánto se pasa el error p80 de cada etiqueta de su banda objetivo + orden Alta<Media<Baja + premio por poder decir «Alta/Media» + inercia. */
  function loss(samples, t, initial, targets) {
    const sm = summarize(samples, t), L = sm.labels, N = samples.length || 1;
    let v = 0;
    ['alta', 'media'].forEach((l) => {
      const g = L[l];
      if (g.n >= MIN_CASES) v += 10 * Math.max(0, g.p80 - targets[l]); else v += 0.05;   // sin casos suficientes no se puede afirmar nada de esa etiqueta
    });
    const pr = ['alta', 'media', 'baja'].map((l) => L[l]).filter((g) => g.n >= MIN_CASES);
    for (let i = 1; i < pr.length; i++) v += 5 * Math.max(0, pr[i - 1].p80 - pr[i].p80);   // Alta no debería equivocarse más que Media, ni Media más que Baja
    v -= 0.02 * (L.alta.n + 0.5 * L.media.n) / N;
    TUNABLE.forEach((k) => { v += 0.001 * Math.abs(t[k] / initial[k] - 1); });
    return v;
  }

  /** Texto corto de un umbral para el historial: «Estabilidad Alta: ± 10 % → ± 12 %». */
  function fmtThr(k, v) {
    if (k === 'cobAlta' || k === 'cobMedia') return `≥ ${(v * 100).toFixed(0)} %`;
    if (k === 'estAlta' || k === 'estMedia') return `± ${(v * 100).toFixed(1).replace(/\.0$/, '')} %`;
    return `< ${(v * 100).toFixed(1).replace(/\.0$/, '')} %`;
  }
  function diff(from, to) {
    const NAMES = FC().NAMES;
    return TUNABLE.filter((k) => Math.abs((to[k] ?? from[k]) - from[k]) > 1e-9).map((k) => ({
      key: k, factor: FACTOR_OF[k], factorLabel: NAMES[FACTOR_OF[k]], level: LEVEL_OF[k], from: from[k], to: to[k],
      text: `${NAMES[FACTOR_OF[k]]} ${LEVEL_OF[k]}: ${fmtThr(k, from[k])} → ${fmtThr(k, to[k])}`
    }));
  }

  /**
   * Calibra con las muestras. No toca nada fuera de su resultado.
   * @param {object[]} samples  muestras de `collectSamples`
   * @param {{initial?:object, targets?:object, minMonths?:number}} [o]  La búsqueda siempre parte de los umbrales INICIALES, para que el resultado no dependa de la última calibración.
   * @returns {{status:'insufficient'|'ok', monthsUsed:number, needed:number, thresholds?:object, changes?:object[], before?:object, after?:object, targets:object, meets?:object}}
   */
  function calibrate(samples, o = {}) {
    const initial = Object.assign({}, FC().INITIAL, o.initial || {});
    const targets = Object.assign({}, TARGETS, o.targets || {});
    const needed = o.minMonths || MIN_MONTHS, months = monthsOf(samples);
    if (months.length < needed) return { status: 'insufficient', monthsUsed: months.length, needed, targets };
    // Búsqueda por coordenadas desde los umbrales INICIALES (para que el resultado no dependa de la última calibración) y una sola regla de aceptación.
    let cur = {}; TUNABLE.forEach((k) => { cur[k] = initial[k]; });
    let best = loss(samples, cur, initial, targets);
    const round4 = (x) => Math.round(x * 10000) / 10000;
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      // 1) Un umbral a la vez.
      TUNABLE.forEach((k) => {
        let bk = cur[k], bl = best;
        MULTS.forEach((m) => {
          const cand = { ...cur, [k]: round4(initial[k] * m) };
          if (!valid(cand)) return;
          const l = loss(samples, cand, initial, targets);
          if (l < bl - GAIN) { bl = l; bk = cand[k]; }
        });
        if (bk !== cur[k]) { cur = { ...cur, [k]: bk }; best = bl; moved = true; }
      });
      if (moved) continue;
      // 2) Si ninguno solo mejora, de dos en dos (p. ej. subir «Alta» y «Media» de cobertura a la vez; la regla fija exige dos factores flojos para bajar de nivel).
      let pair = null, pl = best;
      const coarse = [0.67, 1, 1.5];
      for (let i = 0; i < TUNABLE.length; i++) for (let j = i + 1; j < TUNABLE.length; j++) {
        const same = FACTOR_OF[TUNABLE[i]] === FACTOR_OF[TUNABLE[j]], grid = same ? MULTS : coarse;   // mismo factor: rejilla completa; factores distintos: rejilla gruesa
        grid.forEach((mi) => grid.forEach((mj) => {
          const cand = { ...cur, [TUNABLE[i]]: round4(initial[TUNABLE[i]] * mi), [TUNABLE[j]]: round4(initial[TUNABLE[j]] * mj) };
          if (!valid(cand)) return;
          const l = loss(samples, cand, initial, targets);
          if (l < pl - GAIN) { pl = l; pair = cand; }
        }));
      }
      if (pair) { cur = pair; best = pl; moved = true; }
      if (!moved) break;
    }
    const thresholds = {}; TUNABLE.forEach((k) => { thresholds[k] = cur[k]; });
    const before = summarize(samples, null), after = summarize(samples, thresholds);
    const meets = {
      alta: after.labels.alta.n >= MIN_CASES ? after.labels.alta.p80 <= targets.alta : null,
      media: after.labels.media.n >= MIN_CASES ? after.labels.media.p80 <= targets.media : null
    };
    return { status: 'ok', monthsUsed: months.length, needed, thresholds, changes: diff(initial, thresholds), before, after, byCut: byCut(samples), targets, meets, cases: samples.length };
  }

  /* ---------- Muestras desde el motor (inyectado) ---------- */

  /**
   * Meses cerrados con venta real en todos los canales, a partir de las corridas «de hoy» de cada año.
   * @param {Object<number,object>} finalRuns  { 2025: run, 2026: run } (forecast con la fecha de referencia actual)
   * @returns {{key:string, year:number, actual:number, days:number}[]}
   */
  function closedMonthsOf(finalRuns) {
    const out = [];
    Object.keys(finalRuns || {}).forEach((y) => {
      const run = finalRuns[y], months = run && run.total && run.total.months;
      (months || []).forEach((m) => {
        const rev = m.actualToDate && m.actualToDate.revenue;
        if (m.status === 'closed' && !(m.missingActualDays > 0) && m.countedDays === m.days && fin(rev) && rev > 0) out.push({ key: m.key, year: +y, actual: rev, days: m.days });
      });
    });
    return out.sort((a, b) => (a.key < b.key ? -1 : 1));
  }

  /**
   * Recorre mes × corte, corre el forecast «como si fuera ese día» y arma las muestras. Asíncrono para no congelar la pantalla (cede el hilo entre corridas).
   * @param {{closed:object[], runAt:(year:number, referenceDate:string)=>object, todayStatus?:string, advisor?:object, onProgress?:(done:number,total:number)=>void, yieldFn?:()=>Promise<void>, shouldStop?:()=>boolean}} p
   *   `runAt(year, referenceDate)` debe correr el forecast con esa fecha de referencia. Con `todayStatus: 'in_progress'` el corte es el día anterior a la referencia.
   * @returns {Promise<{samples:object[], skipped:number, skippedByYear:Object<number,number>, total:number, stopped:boolean}>}
   */
  async function collectSamples(p) {
    const closed = p.closed || [], inProgress = p.todayStatus === 'in_progress';
    const jobs = [];
    closed.forEach((m) => CUTS.forEach((c) => { if (c < m.days) jobs.push({ m, c }); }));
    const samples = [], skippedByYear = {}; let skipped = 0, done = 0;
    const skip = (m) => { skipped++; skippedByYear[m.year] = (skippedByYear[m.year] || 0) + 1; };
    for (const { m, c } of jobs) {
      if (p.shouldStop && p.shouldStop()) return { samples, skipped, skippedByYear, total: jobs.length, stopped: true };
      const cutISO = `${m.key}-${pad2(c)}`, ref = inProgress ? addDays(cutISO, 1) : cutISO;
      try {
        const run = p.runAt(m.year, ref);
        const mon = run && run.total && (run.total.months || []).find((x) => x.key === m.key);
        const est = mon && mon.forecast && mon.forecast.revenue;
        const a = FC().assess({ run, channel: 'total', period: { type: 'month', key: m.key }, advisor: p.advisor, thresholds: FC().INITIAL });
        if (!mon || !fin(est) || !a || a.status !== 'ok') skip(m);
        else {
          const err = (est - m.actual) / m.actual;
          samples.push({ month: m.key, year: m.year, cut: c, estimate: est, actual: m.actual, err, abs: Math.abs(err), label: a.level,
            factors: a.factors.map((f) => ({ id: f.id, value: f.value, miss: f.miss || 0, fixed: Boolean(f.fixed), level: f.level })) });
        }
      } catch (e) { skip(m); }
      done++;
      if (p.onProgress) p.onProgress(done, jobs.length);
      if (p.yieldFn) await p.yieldFn();
    }
    return { samples, skipped, skippedByYear, total: jobs.length, stopped: false };
  }

  /* ---------- Estado, historial y deshacer (puro; app.js lo guarda) ---------- */

  const emptyState = () => ({ v: 1, auto: false, active: null, history: [], lastAutoMonth: null });

  /** Lee un estado guardado; si algo no cuadra, devuelve uno vacío (nunca lanza ni adivina). */
  function normalize(raw) {
    const s = emptyState();
    if (!raw || typeof raw !== 'object') return s;
    s.auto = raw.auto === true;
    const okThr = (t) => t && typeof t === 'object' && TUNABLE.every((k) => fin(t[k])) && valid(t);
    if (raw.active && okThr(raw.active.thresholds)) {
      s.active = { thresholds: TUNABLE.reduce((o, k) => { o[k] = raw.active.thresholds[k]; return o; }, {}), at: String(raw.active.at || ''), monthsUsed: raw.active.monthsUsed | 0,
        cases: raw.active.cases | 0, summary: raw.active.summary || null };
    }
    s.history = (Array.isArray(raw.history) ? raw.history : []).filter((h) => h && typeof h === 'object' && okThr(h.to) && (h.from === null || okThr(h.from)))
      .map((h) => ({ id: String(h.id || ''), at: String(h.at || ''), kind: ['calibrate', 'reset', 'undo'].includes(h.kind) ? h.kind : 'calibrate', trigger: h.trigger === 'auto' ? 'auto' : 'manual',
        monthsUsed: h.monthsUsed | 0, from: h.from, to: h.to, text: Array.isArray(h.text) ? h.text.map(String) : [], undone: h.undone === true, month: h.month ? String(h.month) : null })).slice(-50);
    s.lastAutoMonth = raw.lastAutoMonth ? String(raw.lastAutoMonth) : null;
    return s;
  }

  const idOf = (at) => `cal-${String(at).replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
  const initialThr = () => { const o = {}; TUNABLE.forEach((k) => { o[k] = FC().INITIAL[k]; }); return o; };
  const thrOf = (state) => (state && state.active ? state.active.thresholds : initialThr());

  /** Aplica un resultado de `calibrate` al estado (inmutable). Si no cambia nada, lo anota igual como «sin cambio» solo cuando se pidió a mano. */
  function applyResult(state, res, { at, trigger = 'manual', month = null } = {}) {
    if (!res || res.status !== 'ok') return state;
    const from = thrOf(state);
    const changed = res.changes.length > 0;
    const when = at || new Date().toISOString();
    const entry = { id: idOf(when), at: when, kind: 'calibrate', trigger, monthsUsed: res.monthsUsed, from, to: res.thresholds, month,
      text: changed ? diff(from, res.thresholds).map((c) => c.text) : ['Sin cambios: con tu historial los umbrales actuales ya están bien.'], undone: false };
    const next = { ...state, active: { thresholds: res.thresholds, at: when, monthsUsed: res.monthsUsed, cases: res.cases, summary: summaryLite(res) },
      history: state.history.concat(entry).slice(-50) };
    if (trigger === 'auto' && month) next.lastAutoMonth = month;
    return next;
  }
  /** Lo mínimo que se guarda del resumen para poder mostrarlo sin recalcular. */
  function summaryLite(res) {
    const o = { after: {}, targets: res.targets, meets: res.meets, byCut: res.byCut || null, cases: res.cases };
    LABELS.forEach((l) => { const g = res.after.labels[l]; o.after[l] = { n: g.n, typical: g.typical, p80: g.p80 }; });
    return o;
  }
  /** Deshace la última calibración (no deshecha): vuelve a sus umbrales anteriores y la marca. Devuelve el mismo estado si no hay nada que deshacer. */
  function undo(state, { at } = {}) {
    const i = state.history.map((h) => !h.undone && h.kind !== 'undo').lastIndexOf(true);
    if (i < 0) return state;
    const h = state.history[i], when = at || new Date().toISOString();
    const hist = state.history.map((x, j) => (j === i ? { ...x, undone: true } : x));
    const sameAsInitial = TUNABLE.every((k) => Math.abs(h.from[k] - FC().INITIAL[k]) < 1e-9);
    hist.push({ id: idOf(when), at: when, kind: 'undo', trigger: 'manual', monthsUsed: h.monthsUsed, from: h.to, to: h.from, month: null, undone: false,
      text: [h.kind === 'reset' ? `Se deshizo la vuelta a los umbrales iniciales del ${h.at.slice(0, 10)}.` : `Se deshizo la calibración del ${h.at.slice(0, 10)}.`] });
    return { ...state, active: sameAsInitial ? null : { thresholds: h.from, at: when, monthsUsed: h.monthsUsed, cases: 0, summary: null }, history: hist.slice(-50) };
  }
  /** Vuelve a los umbrales iniciales (queda en el historial). */
  function reset(state, { at } = {}) {
    if (!state.active) return state;
    const when = at || new Date().toISOString();
    return { ...state, active: null, history: state.history.concat({ id: idOf(when), at: when, kind: 'reset', trigger: 'manual', monthsUsed: state.active.monthsUsed, from: state.active.thresholds, to: initialThr(),
      month: null, undone: false, text: ['Se volvió a los umbrales iniciales.'] }).slice(-50) };
  }

  /** ¿Toca recalibrar sola? Solo con el interruptor encendido, con ≥ 12 meses y si hay un mes cerrado más reciente que el de la última recalibración automática. */
  function autoDue(state, closedKeys, minMonths = MIN_MONTHS) {
    if (!state || !state.auto) return { due: false, reason: 'off' };
    const keys = (closedKeys || []).slice().sort();
    if (keys.length < minMonths) return { due: false, reason: 'pocos_meses', months: keys.length };
    const last = keys[keys.length - 1];
    if (state.lastAutoMonth && state.lastAutoMonth >= last) return { due: false, reason: 'ya_hecho', month: last };
    return { due: true, month: last, months: keys.length };
  }

  /** Lo que la pantalla muestra del análisis: del caché de muestras si lo hay (con los umbrales en uso) o, si no, del resumen guardado en la última calibración. */
  function analysisOf(state, samples) {
    if (samples && samples.length) {
      const sm = summarize(samples, thrOf(state)), L = {};
      LABELS.forEach((l) => { const g = sm.labels[l]; L[l] = { n: g.n, typical: g.typical, p80: g.p80 }; });
      return { source: 'live', labels: L, byCut: byCut(samples), cases: samples.length, months: monthsOf(samples).length };
    }
    const s = state && state.active && state.active.summary;
    if (s && s.after) return { source: 'saved', labels: s.after, byCut: s.byCut || null, cases: s.cases || 0, months: state.active.monthsUsed || 0 };
    return null;
  }

  /** Frase para Pacing: «Cuando salió Media, en 8 de cada 10 casos el cierre real quedó a menos de 8.2 % del estimado.» Null si no hay casos suficientes. */
  function phrase(summary, level) {
    const g = summary && summary.after ? summary.after[level] : summary && summary.labels ? summary.labels[level] : null;
    if (!g || g.n < MIN_CASES || !fin(g.p80)) return null;
    return { n: g.n, p80: g.p80, typical: g.typical, text: `En tu historial, cuando salió ${LABEL_TXT[level]}, el cierre real del mes quedó a menos de ${(g.p80 * 100).toFixed(1)} % del estimado en 8 de cada 10 casos (${g.n} casos).` };
  }

  FP.forecastCalibration = { CUTS, MIN_MONTHS, MIN_CASES, TARGETS, TUNABLE, percentile, median, summarize, byCut, calibrate, closedMonthsOf, collectSamples,
    emptyState, normalize, applyResult, undo, reset, autoDue, phrase, analysisOf, diff, fmtThr, thrOf, initialThr, monthsOf };
})(typeof window !== 'undefined' ? window : globalThis);
