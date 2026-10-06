/**
 * scenarioEngine.js — Motor de escenarios (Fase 6).
 *
 * Un escenario es una SIMULACIÓN determinística: aplica cambios a los drivers primarios y deriva
 * el resto con las fórmulas centrales de FP.metrics (no se duplican):
 *
 *   volumen' = volumen × (1 + Δvol%)
 *   CR'      = CR + Δpp            (o CR × (1 + Δ%))
 *   AOV'     = AOV × (1 + Δ%)       (o AOV + Δ$)
 *   pedidos' = calculateOrders(volumen', CR')      = volumen' × CR'
 *   venta'   = calculateRevenue(pedidos', AOV')    = volumen' × CR' × AOV'
 *
 * Se aplica día por día sobre los días EDITABLES del periodo (por defecto, los no cerrados: el pasado
 * ya ocurrió). Base de cada día: su real si está contado, su forecast (Fase 3, método en uso) si no.
 * Cada canal se simula por separado; el total digital = Σ canales (un escenario de App no toca Ecommerce).
 *
 * Nivel 2 (segmento): la exposición del segmento se estima con su participación en los datos de
 * segmentos más recientes (volumen, pedidos y venta por separado); el cambio se aplica a esa parte
 * y el incremento se suma al canal. Solo para dimensiones y segmentos que existen en los datos.
 *
 * Nada aquí escribe sobre plan, actual, forecast ni reforecast: se trabaja con copias.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const P = () => FP.pacing;
  const V = () => FP.scenarioValidation;

  const ADD = ['revenue', 'orders', 'trafficVolume'];
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const block = (b) => (b ? P().completeBlock(b) : null);
  const sum = (blocks) => (blocks.length ? P().strictAggregate(blocks) : null);
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  /** Canales del alcance y de "total digital" (los contextos importados pueden traer otros). */
  const scopeOf = (ctx) => ctx.scopeChannels || (ctx.channel === 'total' ? C().channelIds : [ctx.channel]);
  const allOf = (ctx) => ctx.allChannels || C().channelIds;
  const chLabel = (ch) => { const c = C().channels.find((x) => x.id === ch); return c ? c.label : ch === 'total' ? 'Total digital' : ch === '__import' ? 'Importado' : ch; };

  /* ---------- Periodo ---------- */

  /** { type: year|month|week|day|range, key?, start?, end? } → { start, end, label } */
  function resolvePeriod(period, year) {
    const t = period.type;
    if (t === 'year') return { ...period, key: String(period.key || year), start: `${period.key || year}-01-01`, end: `${period.key || year}-12-31`, label: `Año ${period.key || year}` };
    if (t === 'month') {
      const [y, m] = period.key.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { ...period, start: `${period.key}-01`, end: `${period.key}-${String(last).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}` };
    }
    if (t === 'week') {
      const days = FP.calendar.daysOfYear(year).filter((d) => FP.calendar.getWeekInfo(d).weekKey === period.key);
      const all = [year - 1, year, year + 1].flatMap((y) => FP.calendar.daysOfYear(y)).filter((d) => FP.calendar.getWeekInfo(d).weekKey === period.key);
      const w = all.length ? all : days;
      return { ...period, start: w[0], end: w[w.length - 1], label: `Semana ${period.key}` };
    }
    if (t === 'day') return { ...period, start: period.key, end: period.key, label: period.key };
    return { ...period, type: 'range', start: period.start, end: period.end, label: `${period.start} a ${period.end}` };
  }

  /* ---------- Contexto ---------- */

  /**
   * Contexto desde la app (corrida de forecast de Fase 3 y reforecast de Fase 4).
   * @param {object} p { run, rf, channel ('total'|id), period, applyTo: 'future'|'all', store }
   */
  function buildContext({ run, rf = null, channel = 'total', period, applyTo = 'future', store = null }) {
    const per = resolvePeriod(period, run.year);
    const byChannel = {};
    C().channelIds.forEach((ch) => {
      const days = run.channels[ch].days.filter((d) => d.date >= per.start && d.date <= per.end).map((d) => ({
        date: d.date,
        base: block(d.counted ? d.actual : d.forecast),
        plan: block(d.plan),
        editable: applyTo === 'all' ? true : !d.closed,
        closed: d.closed, counted: d.counted, tag: d.tag || null
      }));
      byChannel[ch] = summarizeChannel(days);
      if (rf) {
        const rdays = rf.channels[ch].days.filter((d) => d.date >= per.start && d.date <= per.end);
        const vals = rdays.map((d) => d.reforecast).filter(Boolean);
        byChannel[ch].reforecast = vals.length ? P().strictAggregate(vals) : null;
        byChannel[ch].required = rdays.some((d) => d.required) ? P().strictAggregate(rdays.filter((d) => d.required).map((d) => d.required)) : null;
      }
    });
    const ctx = {
      source: 'app', year: run.year, channel, period: per, applyTo,
      referenceDate: run.referenceDate, cutoff: run.cutoff,
      forecastMethod: { id: run.method.id, label: run.method.label },
      planVersion: run.plan ? { id: run.plan.versionId || null, label: run.plan.label } : null,
      byChannel,
      reforecast: rf ? reforecastContext(rf, channel) : null,
      segments: store ? segmentShares(store, run.cutoff || per.end) : null
    };
    return ctx;
  }

  function summarizeChannel(days) {
    const editable = days.filter((d) => d.editable);
    return {
      days,
      plan: sum(days.map((d) => d.plan)),
      base: sum(days.map((d) => d.base)),
      editableBase: sum(editable.map((d) => d.base)),
      editablePlan: sum(editable.map((d) => d.plan)),
      editableDays: editable.length
    };
  }

  function reforecastContext(rf, channel) {
    const s = channel === 'total' ? rf.total : rf.channels[channel];
    const h = s.horizon, hs = s.horizonSummary;
    return { horizon: h.type, key: h.key, target: h.target, actualToDate: h.actualToDate, remaining: h.remaining,
      surplus: h.surplus, requiredTotal: h.requiredTotal, futureDays: h.futureDays,
      reforecast: hs && hs.reforecast ? hs.reforecast.revenue : null,
      forecast: hs && hs.forecast ? hs.forecast.revenue : null,
      pressure: hs && hs.pressure ? hs.pressure.revenue.pressure : null };
  }

  /* ---------- Segmentos ---------- */

  /**
   * Participación de cada segmento por canal y dimensión, con los últimos N días de datos de
   * segmentos hasta `until`. { [ch]: { [dimension]: { [segmentKey]: { label, sT, sO, sR, days } } } }
   */
  function segmentShares(store, until) {
    const recs = FP.dataStore.records(store, 'segments').filter((r) => r.dimension && r.segmentKey && r.date <= until);
    if (!recs.length) return null;
    const out = {};
    const n = C().recovery.segmentShareDays;
    C().channelIds.forEach((ch) => {
      const cr = recs.filter((r) => r.channel === ch);
      if (!cr.length) return;
      const lastDate = cr.reduce((a, r) => (r.date > a ? r.date : a), '');
      const from = FP.calendar.addDays(lastDate, -(n - 1));
      const dims = {};
      cr.filter((r) => r.date >= from).forEach((r) => {
        const d = (dims[r.dimension] = dims[r.dimension] || {});
        const g = (d[r.segmentKey] = d[r.segmentKey] || { label: r.segment, revenue: 0, orders: 0, trafficVolume: 0, days: new Set() });
        ADD.forEach((k) => { const v = r.metrics[k] && r.metrics[k].value; if (fin(v)) g[k] += v; });
        g.days.add(r.date);
      });
      Object.values(dims).forEach((d) => {
        const tot = { revenue: 0, orders: 0, trafficVolume: 0 };
        Object.values(d).forEach((g) => ADD.forEach((k) => { tot[k] += g[k]; }));
        Object.values(d).forEach((g) => {
          g.sR = M().safeDivide(g.revenue, tot.revenue); g.sO = M().safeDivide(g.orders, tot.orders);
          g.sT = M().safeDivide(g.trafficVolume, tot.trafficVolume); g.days = g.days.size;
          g.from = from; g.to = lastDate;
        });
      });
      out[ch] = dims;
    });
    return out;
  }

  /** Dimensiones y segmentos simulables (existen en los datos del canal o de todos si es total). */
  function availableTargets(ctx) {
    if (!ctx.segments) return [];
    const chs = scopeOf(ctx);
    const map = new Map();
    chs.forEach((ch) => Object.entries(ctx.segments[ch] || {}).forEach(([dim, segs]) => {
      if (!map.has(dim)) map.set(dim, new Map());
      Object.entries(segs).forEach(([k, g]) => { if (!map.get(dim).has(k)) map.get(dim).set(k, g.label); });
    }));
    return [...map.entries()].map(([dimension, segs]) => ({
      dimension, label: (C().diagnostics.dimensions[dimension] || { label: dimension }).label,
      segments: [...segs.entries()].map(([key, label]) => ({ key, label }))
    }));
  }

  /* ---------- Simulación ---------- */

  /** Aplica los cambios a un bloque (volumen, pedidos, venta). Devuelve bloque o null si falta un driver necesario. */
  function applyChanges(b, changes) {
    const c = V().normalizeChanges(changes);
    if (!b) return null;
    const use = V().usesDriver(c);
    const T = b.trafficVolume, CR = b.conversionRate, AOV = b.aov;
    if (![T, CR, AOV].every(fin)) {
      // Sin los tres drivers no se puede recomponer venta = volumen × CR × AOV
      return (use.trafficVolume || use.conversionRate || use.aov) ? null : block(b);
    }
    const T2 = T * (1 + c.trafficPct);
    const CR2 = c.crMode === 'pp' ? CR + c.crValue : CR * (1 + c.crValue);
    const AOV2 = c.aovMode === 'abs' ? AOV + c.aovValue : AOV * (1 + c.aovValue);
    const orders = M().calculateOrders(T2, CR2);
    const revenue = M().calculateRevenue(orders, AOV2);
    return { revenue, orders, trafficVolume: T2, conversionRate: CR2, aov: AOV2 };
  }

  const diff = (a, b) => { const o = {}; ADD.forEach((k) => { o[k] = fin(a[k]) && fin(b[k]) ? a[k] - b[k] : null; }); return o; };
  const addTo = (b, d) => block({ revenue: b.revenue + d.revenue, orders: b.orders + d.orders, trafficVolume: b.trafficVolume + d.trafficVolume });

  /** Simula un canal. `target`: { type: 'channel' } | { type: 'segment', dimension, segment } */
  function simulateChannel(ctx, ch, changes, target) {
    const s = ctx.byChannel[ch];
    const errors = [];
    let seg = null;
    if (target && target.type === 'segment') {
      seg = ctx.segments && ctx.segments[ch] && ctx.segments[ch][target.dimension] ? ctx.segments[ch][target.dimension][target.segment] : null;
      if (!seg) return { channel: ch, skipped: true, reason: 'El segmento no existe en los datos de este canal.', days: [] };
      if (![seg.sT, seg.sO, seg.sR].every(fin)) return { channel: ch, skipped: true, reason: 'El segmento no tiene volumen, pedidos y venta suficientes.', days: [] };
    }
    const days = s.days.map((d) => {
      if (!d.editable || !d.base) return { date: d.date, base: d.base, scenario: d.base, editable: d.editable };
      let scen;
      if (seg) {
        const part = block({ revenue: d.base.revenue * seg.sR, orders: d.base.orders * seg.sO, trafficVolume: d.base.trafficVolume * seg.sT });
        const partScen = applyChanges(part, changes);
        scen = partScen ? addTo(d.base, diff(partScen, part)) : null;
      } else scen = applyChanges(d.base, changes);
      if (!scen) errors.push(`${d.date}: faltan volumen, CR o AOV para simular.`);
      else V().validateBlock(scen).forEach((m) => errors.push(`${d.date}: ${m}.`));
      return { date: d.date, base: d.base, scenario: scen, editable: true };
    });
    const editable = days.filter((d) => d.editable && d.base);
    const scenario = errors.length ? null : sum(days.map((d) => d.scenario));
    const editableScenario = errors.length ? null : sum(editable.map((d) => d.scenario));
    return { channel: ch, skipped: false, days, errors: [...new Set(errors)].slice(0, 8), segmentShare: seg ? { sT: seg.sT, sO: seg.sO, sR: seg.sR, from: seg.from, to: seg.to } : null,
      plan: s.plan, base: s.base, scenario, editableBase: s.editableBase, editableScenario,
      incremental: scenario && s.base ? P().completeBlock(diff(scenario, s.base)) : null };
  }

  /**
   * Simula un escenario sobre el contexto.
   * @param {object} spec { changes, target, constraints }
   * @returns resultado con base, escenario, incremental, gap antes/después y total digital.
   */
  function simulate(ctx, { changes = {}, target = { type: 'channel' }, constraints = null } = {}) {
    const inputCheck = V().validateInputs(changes);
    const chs = scopeOf(ctx);
    const result = { valid: false, errors: inputCheck.errors.map((e) => e.message), warnings: [], changes: inputCheck.changes, target };
    if (inputCheck.errors.length) return result;
    const byChannel = {};
    chs.forEach((ch) => { byChannel[ch] = simulateChannel(ctx, ch, inputCheck.changes, target); });
    const used = Object.values(byChannel).filter((r) => !r.skipped);
    if (!used.length) { result.errors.push(target.type === 'segment' ? 'El segmento no existe en los datos del canal seleccionado.' : 'Sin datos para simular.'); return result; }
    used.forEach((r) => r.errors.forEach((e) => result.errors.push(`${chLabel(r.channel)} · ${e}`)));
    if (!chs.some((ch) => ctx.byChannel[ch].editableDays)) result.errors.push('El periodo no tiene días editables (ya cerró). Cambia a "todo el periodo" para una simulación retrospectiva.');
    Object.values(byChannel).filter((r) => r.skipped).forEach((r) => result.warnings.push(`${chLabel(r.channel)}: ${r.reason}`));
    if (result.errors.length) return result;

    // Alcance seleccionado (canal o total) y total digital
    const scopeBase = sum(chs.map((ch) => ctx.byChannel[ch].base));
    const scopePlan = sum(chs.map((ch) => ctx.byChannel[ch].plan));
    const scopeScenario = sum(chs.map((ch) => (byChannel[ch].skipped ? ctx.byChannel[ch].base : byChannel[ch].scenario)));
    const edBase = sum(chs.map((ch) => ctx.byChannel[ch].editableBase).filter(Boolean));
    const edScen = sum(chs.map((ch) => (byChannel[ch].skipped ? ctx.byChannel[ch].editableBase : byChannel[ch].editableScenario)).filter(Boolean));
    const digitalBase = sum(allOf(ctx).map((ch) => ctx.byChannel[ch].base));
    const digitalPlan = sum(allOf(ctx).map((ch) => ctx.byChannel[ch].plan));
    const digitalScenario = sum(allOf(ctx).map((ch) => (byChannel[ch] && !byChannel[ch].skipped ? byChannel[ch].scenario : ctx.byChannel[ch].base)));
    const incremental = P().completeBlock(diff(scopeScenario, scopeBase));
    const gap = gapBlock(scopePlan, scopeBase, incremental.revenue);

    Object.assign(result, {
      valid: true, byChannel, channels: chs,
      plan: scopePlan, base: scopeBase, scenario: scopeScenario, incremental,
      editable: { base: edBase, scenario: edScen, days: Math.max(...chs.map((ch) => ctx.byChannel[ch].editableDays)) },
      digital: { plan: digitalPlan, base: digitalBase, scenario: digitalScenario, incremental: P().completeBlock(diff(digitalScenario, digitalBase)),
        gap: gapBlock(digitalPlan, digitalBase, digitalScenario.revenue - digitalBase.revenue) },
      gap,
      warnings: [...result.warnings, ...V().constraintWarnings(inputCheck.changes, constraints, edBase ? edBase.conversionRate : null).map((w) => w.message)]
    });
    result.assumptions = assumptionsOf(ctx, target, byChannel);
    return result;
  }

  /**
   * Gap con convención de "falta para el plan" (positivo = falta):
   *   gapBefore = plan − base;  gapAfter = gapBefore − incremental;  recovery% = incremental ÷ gapBefore
   */
  function gapBlock(plan, base, incremental) {
    const before = plan && base && fin(plan.revenue) && fin(base.revenue) ? plan.revenue - base.revenue : null;
    const after = fin(before) && fin(incremental) ? before - incremental : null;
    return {
      plan: plan ? plan.revenue : null, base: base ? base.revenue : null,
      gapBefore: before, gapAfter: after,
      recoveryPercent: fin(before) && before > 0 && fin(incremental) ? incremental / before : null,
      remainingPercent: fin(before) && before > 0 && fin(after) ? after / before : null,
      noGap: fin(before) && before <= 0
    };
  }

  function assumptionsOf(ctx, target, byChannel) {
    const a = [
      `Base de días no cerrados: forecast del método ${ctx.forecastMethod ? `${ctx.forecastMethod.id} · ${ctx.forecastMethod.label}` : 'del archivo importado'}; días cerrados: real.`,
      ctx.applyTo === 'all' ? 'Simulación retrospectiva: el cambio se aplica también a días ya ocurridos.' : 'El cambio solo se aplica a días no cerrados del periodo.',
      'Volumen, CR y AOV cambian; pedidos = volumen × CR y venta = pedidos × AOV.',
      'Cada canal se simula por separado; el total digital es la suma de canales.'
    ];
    if (target && target.type === 'segment') {
      const s = Object.values(byChannel).find((r) => r.segmentShare);
      if (s) a.push(`Exposición del segmento estimada con su participación entre ${s.segmentShare.from} y ${s.segmentShare.to} (volumen ${(s.segmentShare.sT * 100).toFixed(1)} %, venta ${(s.segmentShare.sR * 100).toFixed(1)} %).`);
    }
    return a;
  }

  /* ---------- Persistencia (escenarios versionados e inmutables) ---------- */

  function deepFreeze(o) {
    Object.getOwnPropertyNames(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }

  function createScenarioStore(year) { return { year, scenarios: [] }; }

  function hydrateScenarioStore(raw, year) {
    if (!raw || !Array.isArray(raw.scenarios)) return createScenarioStore(year);
    return { year: raw.year, scenarios: raw.scenarios.filter((s) => s && s.scenarioId).map(deepFreeze) };
  }

  /** Días editables compactos por canal (para medir después contra el real). */
  function snapshotDays(result) {
    const out = {};
    Object.values(result.byChannel).filter((r) => !r.skipped).forEach((r) => {
      out[r.channel] = r.days.filter((d) => d.editable && d.base && d.scenario).map((d) => [d.date,
        d.base.revenue, d.base.orders, d.base.trafficVolume, d.scenario.revenue, d.scenario.orders, d.scenario.trafficVolume]);
    });
    return out;
  }

  /**
   * Guarda un escenario como entidad independiente (nunca toca plan/actual/forecast/reforecast).
   * Si `supersedes` apunta a otro escenario, se guarda como su versión siguiente; el anterior queda intacto.
   */
  function saveScenario(store, { ctx, result, name, type = 'custom', links = {}, supersedes = null }) {
    if (!result || !result.valid) throw new Error('Solo se guardan escenarios válidos.');
    const prev = supersedes ? store.scenarios.find((s) => s.scenarioId === supersedes) : null;
    const family = prev ? prev.family : `SC_${String(store.scenarios.length + 1).padStart(3, '0')}`;
    const version = prev ? store.scenarios.filter((s) => s.family === family).length + 1 : 1;
    const sc = {
      scenarioId: `${family}_v${version}`, family, version, supersedes: prev ? prev.scenarioId : null,
      name: name || `Escenario ${family}`, type,
      createdAt: new Date().toISOString(), algorithmVersion: C().recovery.algorithmVersion,
      context: { source: ctx.source, sourceFile: ctx.sourceFile || null, channel: ctx.channel, period: ctx.period, applyTo: ctx.applyTo,
        referenceDate: ctx.referenceDate, cutoff: ctx.cutoff, forecastMethod: ctx.forecastMethod, planVersion: ctx.planVersion },
      target: result.target,
      inputs: result.changes,
      links: { hypothesisId: links.hypothesisId || null, hypothesis: links.hypothesis || null, signalIds: links.signalIds || [],
        driver: primaryDriver(result.changes) || links.driver || null, hypothesisDriver: links.driver || null,
        diagnosisComparison: links.diagnosisComparison || null },
      outputs: { exposure: exposureOf(result), plan: result.plan, base: result.base, scenario: result.scenario, incremental: result.incremental,
        editable: result.editable, gap: result.gap, digital: { base: result.digital.base, scenario: result.digital.scenario, gap: result.digital.gap } },
      expectedImpact: FP.impactCalculator.expectedImpact(result),
      assumptions: result.assumptions, warnings: result.warnings,
      days: snapshotDays(result)
    };
    store.scenarios.push(deepFreeze(sc));
    return sc;
  }

  /** Peso del alcance simulado en la venta digital (segmento: × su participación en el canal). */
  function exposureOf(result) {
    const dig = result.digital && result.digital.base ? result.digital.base.revenue : null;
    const scope = result.base ? result.base.revenue : null;
    let share = fin(dig) && dig > 0 && fin(scope) ? scope / dig : null;
    const seg = Object.values(result.byChannel || {}).find((r) => r.segmentShare);
    if (seg && fin(share)) share *= seg.segmentShare.sR;
    return share;
  }

  /** Driver con el mayor cambio relativo del escenario (para enlazar acciones). */
  function primaryDriver(changes) {
    const c = V().normalizeChanges(changes);
    const list = [['trafficVolume', Math.abs(c.trafficPct)], ['conversionRate', Math.abs(c.crMode === 'pp' ? c.crValue * 50 : c.crValue)], ['aov', Math.abs(c.aovMode === 'pct' ? c.aovValue : 0.01)]];
    list.sort((a, b) => b[1] - a[1]);
    return list[0][1] > 0 ? list[0][0] : null;
  }

  FP.scenarioEngine = { scopeOf, allOf, chLabel, resolvePeriod, buildContext, summarizeChannel, segmentShares, availableTargets, applyChanges,
    simulate, gapBlock, createScenarioStore, hydrateScenarioStore, saveScenario, primaryDriver, deepFreeze };
})(typeof window !== 'undefined' ? window : globalThis);
