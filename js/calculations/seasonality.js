/**
 * seasonality.js — Motor de estacionalidad (Fase 2).
 *
 * Entrada: registros canónicos del HISTÓRICO (Fase 1) de un canal.
 * Salida: un perfil con factores por componente, muestras y confianza.
 * No distribuye metas: eso lo hace forecast/planningEngine.js.
 *
 * Modelo multiplicativo (por canal, sobre venta observada):
 *
 *   venta(día) ≈ base(año, mes) × F_diaSemana × F_calendario × F_evento × F_temporada
 *
 * - base(año, mes): promedio de los días "regulares" del mismo mes y año
 *   (sin evento ni festivo). Quita tendencia y efecto mensual.
 * - F_diaSemana: ratio día / base, agrupado por lunes…domingo, centro robusto, promedio 1.
 * - F_calendario (día del mes): ratio / F_diaSemana, agrupado por día 1…31. Solo se aplica
 *   si el efecto supera `calendarEvidenceZ` errores estándar; además se encoge por muestra.
 *   Así no se asume un efecto de quincena: aparece solo si los datos lo muestran.
 * - F_evento / F_festivo: ratio de los días con ese evento contra base × F_diaSemana.
 *   Encogido por muestra, acotado a `eventFactorBounds`, con confianza por años observados.
 * - F_temporada: ratio de días con temporada contra días regulares SIN temporada del mismo
 *   mes. Si la temporada cubre meses completos no hay contraste: su efecto ya está en el
 *   peso mensual y el factor queda en 1 (se informa).
 * - Peso mensual: índice de venta diaria promedio por mes en años COMPLETOS
 *   (cada mes con ≥ monthMinCoverage de días). Se multiplica por los días del mes del año
 *   planeado al distribuir, así febrero bisiesto recibe su día extra.
 *
 * Métricas (CR, AOV) por mes: razón de sumas (Σpedidos/Σvolumen, Σventa/Σpedidos), nunca promedio de ratios.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const W = () => FP.weights;
  const Cal = () => FP.calendar;

  const MIN_REGULAR_DAYS_FOR_BASE = 5;
  const keyOf = (s) => FP.normalize.simplify(s);

  /* ---------- Serie diaria ---------- */

  /**
   * Registros históricos de un canal, deduplicados por llave (última carga gana),
   * dentro del periodo, con venta observada ≥ 0.
   */
  function dailySeries(records, channel, period = {}) {
    const byKey = new Map();
    records.forEach((r) => {
      if (r.channel !== channel || !r.date) return;
      if (period.from && r.date < period.from) return;
      if (period.to && r.date > period.to) return;
      byKey.set(r.key, r);
    });
    return [...byKey.values()]
      .filter((r) => r.metrics.revenue.source === 'observed' && r.metrics.revenue.value >= 0)
      .map((r) => {
        const a = Cal().getDateAttributes(r.date);
        const holiday = r.holiday || (r.dayType === 'holiday' ? 'Festivo' : null);
        return {
          date: r.date, year: a.year, month: a.month, dow: a.dayOfWeekIndex,
          dom: +r.date.slice(8, 10), value: r.metrics.revenue.value,
          orders: r.metrics.orders.source === 'observed' ? r.metrics.orders.value : null,
          traffic: r.metrics.trafficVolume.source === 'observed' ? r.metrics.trafficVolume.value : null,
          event: r.event || null, holiday, season: r.season || null,
          regular: !r.event && !holiday && (r.dayType === 'regular' || !r.dayType)
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  const ymKey = (d) => `${d.year}-${d.month}`;

  /** Base por año-mes: promedio de días regulares (o de todos si hay pocos regulares). */
  function monthBaselines(series) {
    const groups = new Map();
    series.forEach((d) => {
      const k = ymKey(d);
      if (!groups.has(k)) groups.set(k, { reg: [], all: [] });
      groups.get(k).all.push(d.value);
      if (d.regular) groups.get(k).reg.push(d.value);
    });
    const out = new Map();
    groups.forEach((g, k) => out.set(k, W().mean(g.reg.length >= MIN_REGULAR_DAYS_FOR_BASE ? g.reg : g.all)));
    return out;
  }

  /* ---------- Componentes ---------- */

  function calculateMonthlyWeights(series, cfg) {
    const byYear = new Map();
    series.forEach((d) => {
      if (!byYear.has(d.year)) byYear.set(d.year, Array.from({ length: 12 }, () => ({ sum: 0, n: 0 })));
      const m = byYear.get(d.year)[d.month - 1];
      m.sum += d.value; m.n += 1;
    });
    const complete = [];
    const partial = [];
    byYear.forEach((months, y) => {
      const ok = months.every((m, i) => m.n / Cal().daysInMonth(y, i + 1) >= cfg.monthMinCoverage);
      (ok ? complete : partial).push(y);
    });
    complete.sort();
    const perYear = complete.map((y) => {
      const months = byYear.get(y);
      const avg = months.map((m) => m.sum / m.n);
      const avgMean = W().mean(avg);
      const est = avg.map((a, i) => a * Cal().daysInMonth(y, i + 1));
      const tot = est.reduce((a, b) => a + b, 0);
      return { year: y, index: avg.map((a) => (avgMean ? a / avgMean : null)), share: est.map((e) => (tot ? e / tot : null)) };
    });
    const combine = (arr) => (arr.length >= 3 ? W().robustCenter(arr, cfg.smoothing) : W().mean(arr));
    const confidence = W().confidenceFrom(complete.length, cfg.yearThresholds);
    const index = Array.from({ length: 12 }, (_, i) => (perYear.length ? combine(perYear.map((p) => p.index[i])) : null));
    const histShare = Array.from({ length: 12 }, (_, i) => (perYear.length ? W().mean(perYear.map((p) => p.share[i])) : null));
    return {
      available: perYear.length > 0,
      confidence,
      yearsUsed: complete,
      partialYears: partial.sort(),
      index: perYear.length ? W().normalizeToMeanOne(index) : Array(12).fill(1),
      histShare,
      perYear,
      note: perYear.length ? null : 'No hay ningún año completo en el periodo: el peso mensual usa días del mes (uniforme).'
    };
  }

  function calculateDayOfWeekWeights(series, baselines, cfg) {
    const groups = Array.from({ length: 7 }, () => []);
    series.forEach((d) => {
      const b = baselines.get(ymKey(d));
      if (d.regular && b > 0) groups[d.dow - 1].push(d.value / b);
    });
    const samples = groups.map((g) => g.length);
    const outliers = groups.reduce((a, g) => a + W().countOutliers(g, cfg.outlierMadK), 0);
    const raw = groups.map((g) => (g.length >= cfg.minSamples ? W().robustCenter(g, cfg.smoothing) : null));
    const available = raw.every((f) => f !== null);
    const confidence = available ? W().confidenceFrom(Math.min(...samples), cfg.sampleThresholds.dayOfWeek) : 'insufficient';
    const factors = available ? W().normalizeToMeanOne(raw) : Array(7).fill(1);
    return { available, confidence, factors, raw, samples, outliers };
  }

  function calculateDayOfMonthWeights(series, baselines, dowFactors, cfg) {
    const groups = Array.from({ length: 31 }, () => []);
    series.forEach((d) => {
      const b = baselines.get(ymKey(d));
      if (d.regular && b > 0) groups[d.dom - 1].push(d.value / (b * dowFactors[d.dow - 1]));
    });
    const samples = groups.map((g) => g.length);
    const raw = groups.map((g) => (g.length >= cfg.minSamples ? W().robustCenter(g, cfg.smoothing) : null));
    const se = groups.map((g) => W().robustStdError(g));
    const significant = raw.map((f, i) => f !== null && se[i] !== null &&
      Math.abs(f - 1) >= cfg.calendarMinEffect && Math.abs(f - 1) > cfg.calendarEvidenceZ * se[i]);
    let factors = raw.map((f, i) => (significant[i] ? W().shrink(f, samples[i], cfg.shrinkageK) : 1));
    // Renormalizar para que el promedio de días 1–28 (presentes en todo mes) sea 1
    const m = W().mean(factors.slice(0, 28));
    if (m) factors = factors.map((f) => f / m);
    const minN = Math.min(...samples.slice(0, 28));
    const available = raw.slice(0, 28).every((f) => f !== null);
    const segment = (days) => W().mean(days.map((d) => factors[d - 1]));
    return {
      available, confidence: available ? W().confidenceFrom(minN, cfg.sampleThresholds.calendar) : 'insufficient',
      factors: available ? factors : Array(31).fill(1), raw, samples, significant, stdError: se,
      significantDays: significant.filter(Boolean).length,
      segments: { inicio: segment([1, 2, 3]), quincena: segment([14, 15, 16]), fin: segment([28, 29, 30, 31].filter((d) => raw[d - 1] !== null)) }
    };
  }

  /** Factores por grupo (eventos, festivos o temporadas). */
  function groupFactors(entries, cfg, type) {
    const groups = new Map();
    entries.forEach((e) => {
      if (!groups.has(e.key)) groups.set(e.key, { key: e.key, name: e.name, type, ratios: [], years: new Set() });
      const g = groups.get(e.key);
      g.ratios.push(e.ratio); g.years.add(e.year);
    });
    const out = {};
    groups.forEach((g) => {
      const n = g.ratios.length;
      const raw = W().robustCenter(g.ratios, cfg.smoothing);
      const occurrences = g.years.size;
      let confidence = W().confidenceFrom(occurrences, cfg.eventYearThresholds);
      if (n < cfg.minSamples) confidence = 'insufficient';
      const shrunk = W().clamp(W().shrink(raw, n, cfg.shrinkageK), cfg.eventFactorBounds);
      const capped = raw !== W().clamp(raw, cfg.eventFactorBounds);
      out[g.key] = {
        key: g.key, name: g.name, type, raw, factor: confidence === 'insufficient' ? 1 : shrunk,
        applied: confidence !== 'insufficient', samples: n, occurrences, years: [...g.years].sort(), confidence,
        outliers: W().countOutliers(g.ratios, cfg.outlierMadK), capped,
        note: confidence === 'insufficient' ? `Menos de ${cfg.minSamples} días observados: no se aplica.` :
          confidence === 'limited' ? 'Observado en un solo año: factor encogido hacia 1.' : null
      };
    });
    return out;
  }

  function calculateEventWeights(series, baselines, dowFactors, cfg) {
    const ev = [], hol = [];
    series.forEach((d) => {
      const b = baselines.get(ymKey(d));
      if (!(b > 0)) return;
      const ratio = d.value / (b * dowFactors[d.dow - 1]);
      if (d.event) ev.push({ key: `event:${keyOf(d.event)}`, name: d.event, year: d.year, ratio });
      else if (d.holiday) {
        hol.push({ key: `holiday:${keyOf(d.holiday)}`, name: d.holiday, year: d.year, ratio });
        hol.push({ key: 'holiday:*', name: 'Festivo (general)', year: d.year, ratio });
      }
    });
    return { ...groupFactors(ev, cfg, 'event'), ...groupFactors(hol, cfg, 'holiday') };
  }

  function calculateSeasonWeights(series, dowFactors, cfg) {
    // Base: días regulares SIN temporada del mismo año-mes
    const base = new Map();
    series.forEach((d) => {
      if (!d.regular || d.season) return;
      const k = ymKey(d);
      if (!base.has(k)) base.set(k, []);
      base.get(k).push(d.value / dowFactors[d.dow - 1]);
    });
    const entries = [];
    const absorbed = new Map();
    series.forEach((d) => {
      if (!d.season || !d.regular) return;
      const k = keyOf(d.season);
      const b = base.get(ymKey(d));
      if (!b || b.length < MIN_REGULAR_DAYS_FOR_BASE) { absorbed.set(k, (absorbed.get(k) || 0) + 1); return; }
      entries.push({ key: `season:${k}`, name: d.season, year: d.year, ratio: (d.value / dowFactors[d.dow - 1]) / W().mean(b) });
    });
    const out = groupFactors(entries, cfg, 'season');
    absorbed.forEach((n, k) => {
      const key = `season:${k}`;
      if (!out[key]) {
        const name = series.find((d) => d.season && keyOf(d.season) === k).season;
        out[key] = { key, name, type: 'season', raw: null, factor: 1, applied: false, samples: n, occurrences: 0, years: [],
          confidence: 'insufficient', outliers: 0, capped: false,
          note: 'La temporada cubre meses completos: su efecto ya está en el peso mensual.' };
      }
    });
    return out;
  }

  /** CR y AOV históricos por mes (razón de sumas) y del canal completo. */
  function calculateMetricAssumptions(series, cfg) {
    const acc = Array.from({ length: 12 }, () => ({ rev: 0, ordA: 0, ordC: 0, trf: 0, nA: 0, nC: 0 }));
    const all = { rev: 0, ordA: 0, ordC: 0, trf: 0, nA: 0, nC: 0 };
    series.forEach((d) => {
      [acc[d.month - 1], all].forEach((a) => {
        if (d.orders !== null) { a.rev += d.value; a.ordA += d.orders; a.nA++; }
        if (d.orders !== null && d.traffic !== null) { a.ordC += d.orders; a.trf += d.traffic; a.nC++; }
      });
    });
    const pack = (a) => ({
      aov: a.nA >= cfg.minSamples ? FP.metrics.calculateAOV(a.rev, a.ordA) : null,
      conversionRate: a.nC >= cfg.minSamples ? FP.metrics.calculateConversionRate(a.ordC, a.trf) : null,
      samplesAov: a.nA, samplesCr: a.nC
    });
    return { byMonth: acc.map(pack), overall: pack(all) };
  }

  /* ---------- Orquestación ---------- */

  /** Periodo efectivo según configuración y año planeado. */
  function resolvePeriod(cfg, targetYear) {
    const hp = cfg.historicalPeriod || {};
    if (hp.mode === 'custom') return { from: hp.from || null, to: hp.to || null, mode: 'custom' };
    if (hp.mode === 'all') return { from: null, to: null, mode: 'all' };
    return { from: null, to: `${targetYear - 1}-12-31`, mode: 'before_target' };
  }

  /**
   * Perfil de estacionalidad de un canal.
   * @param {Array} records   registros canónicos históricos (todas las colecciones de tipo historical)
   * @param {string} channel
   * @param {object} cfg      config de planeación efectiva (defaults + ajustes del usuario)
   * @param {number} targetYear
   */
  function buildChannelProfile(records, channel, cfg, targetYear) {
    const period = resolvePeriod(cfg, targetYear);
    const series = dailySeries(records, channel, period);
    const baselines = monthBaselines(series);
    const monthly = calculateMonthlyWeights(series, cfg);
    const dayOfWeek = calculateDayOfWeekWeights(series, baselines, cfg);
    const calendar = calculateDayOfMonthWeights(series, baselines, dayOfWeek.factors, cfg);
    const events = calculateEventWeights(series, baselines, dayOfWeek.factors, cfg);
    const seasons = calculateSeasonWeights(series, dayOfWeek.factors, cfg);
    const metrics = calculateMetricAssumptions(series, cfg);
    const years = [...new Set(series.map((d) => d.year))].sort();
    return {
      channel,
      metric: 'revenue',
      period: { ...period, firstDate: series.length ? series[0].date : null, lastDate: series.length ? series[series.length - 1].date : null },
      days: series.length,
      years,
      sufficiency: W().confidenceFrom(monthly.yearsUsed.length, cfg.yearThresholds),
      monthly, dayOfWeek, calendar, events, seasons, metrics,
      outliersDetected: dayOfWeek.outliers + Object.values(events).reduce((a, e) => a + e.outliers, 0)
    };
  }

  function buildProfiles(records, cfg, targetYear) {
    const out = {};
    C().channelIds.forEach((ch) => { out[ch] = buildChannelProfile(records, ch, cfg, targetYear); });
    return out;
  }

  /** Configuración efectiva: defaults de config.planning + ajustes guardados del usuario. */
  function effectiveConfig(settings = {}) {
    const d = C().planning;
    const merged = JSON.parse(JSON.stringify(d));
    Object.entries(settings || {}).forEach(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v) && merged[k] && typeof merged[k] === 'object') merged[k] = { ...merged[k], ...v };
      else if (v !== undefined) merged[k] = v;
    });
    if (settings && settings.assumptions) {
      C().channelIds.forEach((ch) => { merged.assumptions[ch] = { ...d.assumptions[ch], ...(settings.assumptions[ch] || {}) }; });
    }
    return merged;
  }

  FP.seasonality = {
    dailySeries, monthBaselines, calculateMonthlyWeights, calculateDayOfWeekWeights, calculateDayOfMonthWeights,
    calculateEventWeights, calculateSeasonWeights, calculateMetricAssumptions,
    resolvePeriod, buildChannelProfile, buildProfiles, effectiveConfig, keyOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
