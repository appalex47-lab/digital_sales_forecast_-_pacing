/**
 * planningEngine.js — Motor de planeación (Fase 2).
 *
 * Responde: "dada la meta y el histórico, ¿cómo debería distribuirse en el tiempo y por canal?"
 * No proyecta ni hace reforecast.
 *
 * Jerarquía y prioridad de fuentes (de mayor a menor):
 *   1. Meta diaria explícita (planData importado)             → source 'explicit_plan'  (nunca se reemplaza)
 *   2. Meta mensual explícita (targets.byMonth o mes completo explícito) → 'user_target' / 'explicit_plan'
 *   3. Distribución histórica mensual                          → 'historical_seasonality'
 *   4. Distribución histórica diaria (día de semana, calendario, eventos, temporada)
 *   5. Distribución estándar (por días)                        → 'fallback'
 *
 * Reglas:
 *   - La meta original (Original Target) nunca se modifica; el Plan Distribuido la reparte
 *     EXACTAMENTE (centavos) con FP.distribution.distributeTarget.
 *   - Lo explícito se fija primero; solo el remanente se distribuye con pesos.
 *   - Pedidos = venta ÷ AOV supuesto; volumen = pedidos ÷ CR supuesto. Enteros por mes, repartidos
 *     por mayor residuo. CR y AOV diarios se recalculan de los enteros (identidad exacta).
 *   - Sin supuesto de AOV/CR → pedidos/volumen quedan null con status 'insufficient_data', nunca 0.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const W = () => FP.weights;
  const D = () => FP.distribution;
  const S = () => FP.seasonality;
  const Cal = () => FP.calendar;
  const M = () => FP.metrics;

  const mk = (year, month) => `${year}-${String(month).padStart(2, '0')}`;
  const cell = (value, source, status, confidence = null, note = null) => {
    const c = { value: value === undefined ? null : value, source, status };
    if (confidence) c.confidence = confidence;
    if (note) c.note = note;
    return c;
  };

  /* ---------- Entradas ---------- */

  /**
   * Etiquetas de calendario del año planeado por canal y fecha.
   * Fuentes: planData y actualData del año (campos evento/festivo/temporada/tipo_dia)
   * y eventos configurados por el usuario (Fase 0). No se inventan eventos.
   */
  function buildTags(year, { store = null, events = [], records = null } = {}) {
    const tags = {};
    C().channelIds.forEach((ch) => { tags[ch] = new Map(); });
    const put = (ch, date, t) => {
      const cur = tags[ch].get(date) || {};
      tags[ch].set(date, {
        event: cur.event || t.event || null, holiday: cur.holiday || t.holiday || null,
        season: cur.season || t.season || null,
        dayType: cur.dayType && cur.dayType !== 'regular' ? cur.dayType : t.dayType || cur.dayType || null
      });
    };
    const recs = records || (store ? ['plan', 'actual'].flatMap((t) => FP.dataStore.records(store, t)) : []);
    recs.forEach((r) => {
      if (!r.date || !r.date.startsWith(`${year}-`)) return;
      if (r.event || r.holiday || r.season || (r.dayType && r.dayType !== 'regular')) {
        put(r.channel, r.date, { event: r.event, holiday: r.holiday || (r.dayType === 'holiday' ? 'Festivo' : null), season: r.season, dayType: r.dayType });
      }
    });
    (events || []).forEach((ev) => {
      if (!ev.startDate) return;
      Cal().eachDay(ev.startDate, ev.endDate || ev.startDate).forEach((date) => {
        if (!date.startsWith(`${year}-`)) return;
        const chs = ev.channels && ev.channels.length ? ev.channels : C().channelIds;
        chs.forEach((ch) => put(ch, date, ev.type === 'holiday' ? { holiday: ev.name, dayType: 'holiday' } : { event: ev.name, dayType: 'event' }));
      });
    });
    return tags;
  }

  /** planData del año: canal → fecha → registro canónico (última carga gana). */
  function explicitPlan(store, year) {
    const out = {};
    C().channelIds.forEach((ch) => { out[ch] = new Map(); });
    if (!store) return out;
    FP.dataStore.resolveLatest(store, 'plan').forEach((r) => {
      if (r.date && r.date.startsWith(`${year}-`) && r.metrics.revenue.source === 'observed') out[r.channel].set(r.date, r);
    });
    return out;
  }

  /* ---------- Pesos ---------- */

  /** Factor de un día (sin normalizar) y su desglose, según los componentes del método. */
  function dayWeight(date, tag, profile, components, cfg) {
    const a = Cal().getDateAttributes(date);
    const dom = +date.slice(8, 10);
    const f = { dayOfWeek: 1, calendar: 1, event: 1, season: 1 };
    const used = [];
    const warnings = [];
    const α = cfg.componentWeights;
    if (components.includes('dayOfWeek') && profile.dayOfWeek.available) {
      f.dayOfWeek = W().applyIntensity(profile.dayOfWeek.factors[a.dayOfWeekIndex - 1], α.dayOfWeek);
      used.push(profile.dayOfWeek.confidence);
    }
    if (components.includes('calendar') && profile.calendar.available) {
      f.calendar = W().applyIntensity(profile.calendar.factors[dom - 1], α.calendar);
      used.push(profile.calendar.confidence);
    }
    if (components.includes('events') && tag) {
      let g = null;
      if (tag.event) {
        g = profile.events[`event:${S().keyOf(tag.event)}`];
        if (!g) warnings.push(`"${tag.event}" no tiene histórico: factor 1.`);
      } else if (tag.holiday) {
        g = profile.events[`holiday:${S().keyOf(tag.holiday)}`] || profile.events['holiday:*'];
        if (!g) warnings.push(`Festivo "${tag.holiday}" sin histórico: factor 1.`);
      }
      if (g && g.applied) { f.event = W().applyIntensity(g.factor, α.events); used.push(g.confidence); }
    }
    if (components.includes('season') && tag && tag.season) {
      const g = profile.seasons[`season:${S().keyOf(tag.season)}`];
      if (g && g.applied) { f.season = W().applyIntensity(g.factor, α.season); used.push(g.confidence); }
    }
    return { weight: f.dayOfWeek * f.calendar * f.event * f.season, factors: f, confidences: used, warnings };
  }

  /** Peso de cada mes (sin normalizar): índice histórico mezclado por intensidad × días del mes. */
  function monthWeights(year, profile, components, cfg) {
    const useHist = components.includes('monthly') && profile.monthly.available;
    const α = cfg.componentWeights.monthly;
    return Array.from({ length: 12 }, (_, i) => {
      const days = Cal().daysInMonth(year, i + 1);
      const idx = useHist ? α * profile.monthly.index[i] + (1 - α) : 1;
      return { weight: idx * days, source: useHist ? 'historical_seasonality' : 'fallback',
        confidence: useHist ? profile.monthly.confidence : components.includes('monthly') ? 'insufficient' : null };
    });
  }

  /* ---------- Supuestos de CR y AOV ---------- */

  function metricAssumption(profile, cfg, channel, month, metric) {
    const byM = profile.metrics.byMonth[month - 1][metric];
    if (byM !== null && byM > 0) return { value: byM, source: 'historical_average', status: 'calculated', confidence: profile.monthly.available ? profile.monthly.confidence : 'limited', note: 'Histórico del mismo mes' };
    const all = profile.metrics.overall[metric];
    if (all !== null && all > 0) return { value: all, source: 'historical_average', status: 'calculated_with_assumption', confidence: 'limited', note: 'Promedio histórico del canal (sin datos del mes)' };
    const u = cfg.assumptions[channel] && cfg.assumptions[channel][metric];
    if (u !== null && u !== undefined && u > 0) return { value: u, source: 'user_assumption', status: 'calculated_with_assumption', confidence: 'limited', note: 'Supuesto capturado por el usuario' };
    return { value: null, source: 'insufficient_data', status: 'insufficient_data', confidence: 'insufficient', note: 'Sin histórico ni supuesto' };
  }

  /* ---------- Generación ---------- */

  /**
   * Plan completo de un año.
   * @param {object} p
   *   year, targets (Targets Fase 0), store (Fase 1), events (Fase 0), settings (planningSettings),
   *   method ('A'|'B'|'C'|'D', opcional), profiles (opcional, se calculan si faltan),
   *   tags (opcional), explicit (opcional)
   */
  function generatePlan(p) {
    const cfg = S().effectiveConfig(p.settings);
    const year = p.year;
    const methodId = p.method || cfg.method;
    const method = cfg.methods[methodId];
    const components = method.components;
    const histRecords = p.store ? FP.dataStore.records(p.store, 'historical') : [];
    const profiles = p.profiles || S().buildProfiles(histRecords, cfg, year);
    const tags = p.tags || buildTags(year, { store: p.store, events: p.events });
    const explicit = p.explicit || (cfg.useExplicitPlan ? explicitPlan(p.store, year) : explicitPlan(null, year));
    const targets = p.targets || FP.dataModel.createTargets(year);

    const channels = {};
    C().channelIds.forEach((ch) => {
      channels[ch] = generateChannelPlan({ ch, year, cfg, components, profile: profiles[ch], tags: tags[ch], explicit: explicit[ch], targets });
    });

    const totalTarget = targets.annual && targets.annual.revenue !== null && targets.annual.revenue !== undefined
      ? { value: targets.annual.revenue, source: 'user_target' } : null;

    const plan = {
      schema: 'distributed_plan',
      year, methodId,
      status: 'preview',
      targets: {
        total: totalTarget,
        byChannel: Object.fromEntries(C().channelIds.map((ch) => [ch, channels[ch].annualTarget]))
      },
      channels,
      total: aggregate(C().channelIds.map((ch) => channels[ch].annual)),
      profiles
    };
    plan.validation = validatePlanClosure(plan);
    plan.audit = buildAudit(plan, cfg, method, histRecords.length, p);
    return plan;
  }

  function generateChannelPlan({ ch, year, cfg, components, profile, tags, explicit, targets }) {
    const issues = [];
    const days = Cal().daysOfYear(year);
    const byMonthDays = Array.from({ length: 12 }, () => []);
    days.forEach((d) => byMonthDays[+d.slice(5, 7) - 1].push(d));

    // 1. Meta anual (Original Target)
    const annualTarget = generateAnnualPlan({ ch, year, targets, explicit, days });
    if (annualTarget.value === null) {
      issues.push({ severity: 'error', message: 'Sin meta anual para este canal: captura la meta en Resumen o carga un plan diario completo.' });
    }

    // 2. Mensual
    const months = generateMonthlyPlan({ ch, year, cfg, components, profile, targets, explicit, byMonthDays, annualTarget, issues });

    // 3. Diario
    const dayRows = [];
    months.forEach((m, i) => {
      const rows = generateDailyPlan({ ch, year, month: i + 1, monthPlan: m, dates: byMonthDays[i], cfg, components, profile, tags, explicit, issues });
      dayRows.push(...rows);
    });

    // 4. Métricas de volumen: pedidos y tráfico
    applyVolumeMetrics({ ch, cfg, profile, months, dayRows });

    // 5. Resúmenes
    months.forEach((m, i) => {
      const rows = dayRows.filter((r) => r.month === i + 1);
      m.plan = aggregate(rows.map((r) => r.values));
    });
    const annual = aggregate(dayRows.map((r) => r.values));
    const status = annualTarget.value === null ? 'no_target' : issues.some((x) => x.severity === 'error') ? 'error' : 'ok';
    return { channel: ch, annualTarget, months, days: dayRows, annual, issues, status };
  }

  /** Meta anual del canal: meta del usuario; si no hay y el plan diario cubre todo el año, su suma. */
  function generateAnnualPlan({ ch, targets, explicit, days }) {
    const t = targets.byChannel && targets.byChannel[ch] ? targets.byChannel[ch].revenue : null;
    if (t !== null && t !== undefined) return { value: t, source: 'user_target', status: 'loaded' };
    if (explicit.size === days.length) {
      return { value: D().exactSum([...explicit.values()].map((r) => r.metrics.revenue.value)), source: 'explicit_plan', status: 'loaded' };
    }
    return { value: null, source: 'insufficient_data', status: 'insufficient_data' };
  }

  function generateMonthlyPlan({ ch, year, cfg, components, profile, targets, explicit, byMonthDays, annualTarget, issues }) {
    const weights = monthWeights(year, profile, components, cfg);
    const months = weights.map((w, i) => {
      const key = mk(year, i + 1);
      const userT = targets.byMonth && targets.byMonth[key] && targets.byMonth[key].byChannel && targets.byMonth[key].byChannel[ch];
      const expDays = byMonthDays[i].filter((d) => explicit.has(d));
      const expSum = D().exactSum(expDays.map((d) => explicit.get(d).metrics.revenue.value));
      let fixed = null;
      if (userT && userT.revenue !== null && userT.revenue !== undefined) fixed = { value: userT.revenue, source: 'user_target' };
      else if (expDays.length === byMonthDays[i].length) fixed = { value: expSum, source: 'explicit_plan' };
      return {
        month: i + 1, key, days: byMonthDays[i].length, explicitDays: expDays.length, explicitSum: expSum,
        weight: w.weight, histShare: profile.monthly.histShare[i], confidence: fixed ? 'excellent' : w.confidence,
        target: fixed ? fixed.value : null, source: fixed ? fixed.source : w.source, fixed: Boolean(fixed), share: null
      };
    });
    if (annualTarget.value === null) return months;

    const fixedSum = D().exactSum(months.filter((m) => m.fixed).map((m) => m.target));
    const free = months.filter((m) => !m.fixed);
    const remaining = Math.round((annualTarget.value - fixedSum) * 100) / 100;
    if (free.length) {
      if (remaining < 0) {
        issues.push({ severity: 'error', message: `Las metas mensuales explícitas (${fixedSum}) superan la meta anual (${annualTarget.value}). No se distribuye el remanente.` });
      } else {
        const parts = D().distributeTarget(remaining, free.map((m) => m.weight), { decimals: cfg.moneyDecimals });
        free.forEach((m, j) => { m.target = parts[j]; });
      }
    } else if (Math.abs(remaining) >= 0.005) {
      issues.push({ severity: 'error', message: `Todos los meses son explícitos y suman ${fixedSum}, distinto de la meta anual ${annualTarget.value}.` });
    }
    months.forEach((m) => { m.share = m.target === null ? null : M().safeDivide(m.target, annualTarget.value); });
    return months;
  }

  function generateDailyPlan({ month, monthPlan, dates, cfg, components, profile, tags, explicit, issues }) {
    const rows = dates.map((date) => {
      const tag = tags.get(date) || null;
      const exp = explicit.get(date) || null;
      const w = dayWeight(date, tag, profile, components, cfg);
      return { date, month, tag, explicit: exp, weightInfo: w, values: M().emptyBlock(), cells: {} };
    });
    const target = monthPlan.target;
    const expRows = rows.filter((r) => r.explicit);
    const freeRows = rows.filter((r) => !r.explicit);
    expRows.forEach((r) => { r.values.revenue = r.explicit.metrics.revenue.value; r.cells.revenue = cell(r.values.revenue, 'explicit_plan', 'loaded', 'excellent'); });
    if (target === null) {
      freeRows.forEach((r) => { r.cells.revenue = cell(null, 'insufficient_data', 'insufficient_data', 'insufficient'); });
      return rows;
    }
    const remaining = Math.round((target - monthPlan.explicitSum) * 100) / 100;
    if (freeRows.length) {
      if (remaining < 0) {
        issues.push({ severity: 'error', message: `${monthPlan.key}: los días explícitos suman más que la meta mensual.` });
        freeRows.forEach((r) => { r.cells.revenue = cell(null, 'insufficient_data', 'insufficient_data', 'insufficient'); });
      } else {
        const parts = D().distributeTarget(remaining, freeRows.map((r) => r.weightInfo.weight), { decimals: cfg.moneyDecimals });
        const conf = W().worstConfidence([monthPlan.confidence, ...freeRows[0].weightInfo.confidences]);
        const hist = monthPlan.source === 'historical_seasonality' || freeRows.some((r) => r.weightInfo.confidences.length);
        freeRows.forEach((r, j) => {
          r.values.revenue = parts[j];
          r.cells.revenue = cell(parts[j], hist ? 'historical_seasonality' : 'fallback', 'calculated',
            W().worstConfidence([conf, ...r.weightInfo.confidences]), r.weightInfo.warnings.join(' ') || null);
        });
      }
    } else if (Math.abs(remaining) >= 0.005) {
      issues.push({ severity: 'error', message: `${monthPlan.key}: todos los días son explícitos y no suman la meta mensual.` });
    }
    // Participación normalizada de cada día en su mes
    rows.forEach((r) => { r.share = r.values.revenue === null ? null : M().safeDivide(r.values.revenue, target); });
    return rows;
  }

  /** Pedidos y volumen enteros por mes (mayor residuo); CR y AOV diarios recalculados. */
  function applyVolumeMetrics({ ch, cfg, profile, months, dayRows }) {
    months.forEach((m) => {
      const rows = dayRows.filter((r) => r.month === m.month);
      const aovA = metricAssumption(profile, cfg, ch, m.month, 'aov');
      const crA = metricAssumption(profile, cfg, ch, m.month, 'conversionRate');
      m.assumptions = { aov: aovA, conversionRate: crA };

      // Pedidos
      const expO = (r) => r.explicit && r.explicit.metrics.orders.source === 'observed';
      const freeO = rows.filter((r) => !expO(r) && r.values.revenue !== null);
      rows.filter(expO).forEach((r) => { r.values.orders = r.explicit.metrics.orders.value; r.cells.orders = cell(r.values.orders, 'explicit_plan', 'loaded', 'excellent'); });
      if (aovA.value) {
        const floats = freeO.map((r) => r.values.revenue / aovA.value);
        const total = Math.round(floats.reduce((a, b) => a + b, 0));
        const parts = D().distributeTarget(total, floats, { decimals: 0 });
        freeO.forEach((r, j) => { r.values.orders = parts[j]; r.cells.orders = cell(parts[j], 'calculated', aovA.status, aovA.confidence, 'venta ÷ AOV supuesto'); });
      } else freeO.forEach((r) => { r.cells.orders = cell(null, 'insufficient_data', 'insufficient_data', 'insufficient', 'Sin AOV histórico ni supuesto'); });

      // Volumen
      const expT = (r) => r.explicit && r.explicit.metrics.trafficVolume.source === 'observed';
      const freeT = rows.filter((r) => !expT(r) && r.values.orders !== null);
      rows.filter(expT).forEach((r) => { r.values.trafficVolume = r.explicit.metrics.trafficVolume.value; r.cells.trafficVolume = cell(r.values.trafficVolume, 'explicit_plan', 'loaded', 'excellent'); });
      if (crA.value) {
        const floats = freeT.map((r) => r.values.orders / crA.value);
        const total = Math.round(floats.reduce((a, b) => a + b, 0));
        const parts = D().distributeTarget(total, floats, { decimals: 0 });
        freeT.forEach((r, j) => { r.values.trafficVolume = parts[j]; r.cells.trafficVolume = cell(parts[j], 'calculated', crA.status, W().worstConfidence([crA.confidence, aovA.confidence]), 'pedidos ÷ CR supuesto'); });
      } else freeT.forEach((r) => { r.cells.trafficVolume = cell(null, 'insufficient_data', 'insufficient_data', 'insufficient', 'Sin CR histórico ni supuesto'); });

      rows.forEach((r) => {
        if (!r.cells.orders) r.cells.orders = cell(null, 'insufficient_data', 'insufficient_data', 'insufficient');
        if (!r.cells.trafficVolume) r.cells.trafficVolume = cell(null, 'insufficient_data', 'insufficient_data', 'insufficient');
        r.values.conversionRate = M().calculateConversionRate(r.values.orders, r.values.trafficVolume);
        r.values.aov = M().calculateAOV(r.values.revenue, r.values.orders);
        r.cells.conversionRate = r.values.conversionRate === null ? cell(null, 'insufficient_data', 'insufficient_data', 'insufficient')
          : cell(r.values.conversionRate, 'calculated', crA.status, crA.confidence, 'pedidos ÷ volumen');
        r.cells.aov = r.values.aov === null ? cell(null, 'insufficient_data', 'insufficient_data', 'insufficient')
          : cell(r.values.aov, 'calculated', aovA.status, aovA.confidence, 'venta ÷ pedidos');
      });
    });
  }

  /** Suma venta/pedidos/volumen y recalcula CR/AOV de las sumas. null si no hay ningún valor. */
  function aggregate(blocks) {
    const sum = (k) => {
      const v = blocks.map((b) => b[k]).filter((x) => x !== null && x !== undefined);
      return v.length ? D().exactSum(v, k === 'revenue' ? 2 : 0) : null;
    };
    const revenue = sum('revenue'), orders = sum('orders'), trafficVolume = sum('trafficVolume');
    return { revenue, orders, trafficVolume,
      conversionRate: M().calculateConversionRate(orders, trafficVolume), aov: M().calculateAOV(revenue, orders) };
  }

  /* ---------- Semanal ---------- */

  /**
   * Plan semanal = suma de días por semana ISO. Una semana que cruza meses se reporta
   * completa y con su desglose por mes (`byMonth`), así nunca se asigna a dos meses.
   * @param {object} channelPlan  plan.channels[ch] (o null para total digital con `plan`)
   */
  function generateWeeklyPlan(plan, ch = null) {
    const rows = ch ? plan.channels[ch].days.map((r) => ({ ...r, channel: ch }))
      : C().channelIds.flatMap((c) => plan.channels[c].days.map((r) => ({ ...r, channel: c })));
    const weeks = new Map();
    rows.forEach((r) => {
      const cd = Cal().getCalendarDay(r.date);
      if (!weeks.has(cd.weekKey)) weeks.set(cd.weekKey, { weekKey: cd.weekKey, week: cd.week, weekStart: cd.weekStart, weekEnd: cd.weekEnd, rows: [], months: new Map() });
      const w = weeks.get(cd.weekKey);
      w.rows.push(r.values);
      const mKey = r.date.slice(0, 7);
      if (!w.months.has(mKey)) w.months.set(mKey, []);
      w.months.get(mKey).push(r.values);
    });
    return [...weeks.values()].map((w) => ({
      weekKey: w.weekKey, week: w.week, weekStart: w.weekStart, weekEnd: w.weekEnd,
      crossesMonths: w.months.size > 1,
      plan: aggregate(w.rows),
      byMonth: [...w.months.entries()].map(([k, v]) => ({ month: k, days: v.length / (ch ? 1 : C().channelIds.length), plan: aggregate(v) }))
    }));
  }

  /* ---------- Validación de cierre ---------- */

  function validatePlanClosure(plan) {
    const checks = [];
    const tol = C().tolerances;
    const add = (id, scope, label, expected, actual, pass, severity = 'error', note = null) =>
      checks.push({ id, scope, label, expected, actual, diff: expected === null || actual === null ? null : Math.round((actual - expected) * 100) / 100, pass, severity, note });

    C().channelIds.forEach((ch) => {
      const c = plan.channels[ch];
      const label = FP.dataModel.getChannel(ch).label;
      if (c.annualTarget.value === null) { add('channel_target', ch, `${label}: meta anual`, null, null, false, 'warning', 'Sin meta'); return; }
      const sumMonths = D().exactSum(c.months.map((m) => m.target));
      add('annual_months', ch, `${label}: Σ meses = meta anual`, c.annualTarget.value, sumMonths, M().isApproximatelyEqual(sumMonths, c.annualTarget.value));
      add('channel_plan', ch, `${label}: Σ plan diario = meta del canal`, c.annualTarget.value, c.annual.revenue, M().isApproximatelyEqual(c.annual.revenue, c.annualTarget.value));
      c.months.forEach((m) => {
        const sumDays = D().exactSum(c.days.filter((r) => r.month === m.month).map((r) => r.values.revenue));
        add('month_days', `${ch}:${m.key}`, `${label} ${m.key}: Σ días = meta mensual`, m.target, sumDays, m.target !== null && M().isApproximatelyEqual(sumDays, m.target));
        const a = m.assumptions;
        if (a && a.aov.value && m.plan.orders !== null) {
          const exp = m.plan.revenue / a.aov.value;
          add('orders_coherence', `${ch}:${m.key}`, `${label} ${m.key}: pedidos ≈ venta ÷ AOV`, round(exp, 2), m.plan.orders,
            M().isClose(m.plan.orders, exp, tol.orders) === true || m.explicitDays > 0, 'warning');
        }
        if (a && a.conversionRate.value && m.plan.trafficVolume !== null && m.plan.orders !== null) {
          const exp = m.plan.orders / a.conversionRate.value;
          add('traffic_coherence', `${ch}:${m.key}`, `${label} ${m.key}: volumen ≈ pedidos ÷ CR`, round(exp, 2), m.plan.trafficVolume,
            M().isClose(m.plan.trafficVolume, exp, tol.orders) === true || m.explicitDays > 0, 'warning');
        }
      });
      const idOk = c.days.every((r) => r.values.conversionRate === null ||
        M().isApproximatelyEqual(r.values.orders / r.values.trafficVolume, r.values.conversionRate));
      add('daily_identity', ch, `${label}: pedidos ÷ volumen = CR y venta ÷ pedidos = AOV en cada día`, null, null,
        idOk && c.days.every((r) => r.values.aov === null || M().isApproximatelyEqual(r.values.revenue / r.values.orders, r.values.aov)));
    });

    const withTarget = C().channelIds.filter((ch) => plan.channels[ch].annualTarget.value !== null);
    const sumChannels = D().exactSum(withTarget.map((ch) => plan.channels[ch].annual.revenue));
    const sumTargets = D().exactSum(withTarget.map((ch) => plan.channels[ch].annualTarget.value));
    if (plan.targets.total) {
      add('digital_total', 'total', 'Σ canales = meta digital total', plan.targets.total.value, sumChannels,
        withTarget.length === C().channelIds.length && M().isApproximatelyEqual(sumChannels, plan.targets.total.value), 'error',
        M().isApproximatelyEqual(sumTargets, plan.targets.total.value) ? null : 'Las metas por canal no suman la meta total: el plan respeta las metas de canal y no las ajusta.');
    } else {
      add('digital_total', 'total', 'Σ canales = Σ metas de canal (sin meta total capturada)', sumTargets, sumChannels, M().isApproximatelyEqual(sumChannels, sumTargets), 'warning');
    }

    const byChannel = {};
    C().channelIds.forEach((ch) => {
      const own = checks.filter((k) => k.scope === ch || k.scope.startsWith(`${ch}:`));
      byChannel[ch] = plan.channels[ch].annualTarget.value === null ? 'no_target'
        : own.filter((k) => k.severity === 'error').every((k) => k.pass) ? 'closed' : 'not_closed';
    });
    const errors = checks.filter((k) => k.severity === 'error' && !k.pass).length;
    const warnings = checks.filter((k) => k.severity === 'warning' && !k.pass).length;
    return { checks, byChannel, errors, warnings, closed: errors === 0 && withTarget.length > 0 };
  }

  const round = (n, d) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);

  /* ---------- Auditoría ---------- */

  function buildAudit(plan, cfg, method, histCount, p) {
    const prof = Object.values(plan.profiles);
    const periods = prof.map((x) => x.period);
    const usedConf = C().channelIds.filter((ch) => plan.channels[ch].annualTarget.value !== null).map((ch) => {
      const x = plan.profiles[ch];
      const levels = [];
      if (method.components.includes('monthly')) levels.push(x.monthly.confidence);
      if (method.components.includes('dayOfWeek')) levels.push(x.dayOfWeek.confidence);
      return levels.length ? W().worstConfidence(levels) : null;
    });
    const firstDates = periods.map((x) => x.firstDate).filter(Boolean).sort();
    const lastDates = periods.map((x) => x.lastDate).filter(Boolean).sort();
    return {
      generatedAt: new Date().toISOString(),
      algorithmVersion: cfg.algorithmVersion,
      year: plan.year,
      historicalPeriod: {
        mode: periods[0].mode, from: periods[0].from, to: periods[0].to,
        firstDate: firstDates[0] || null, lastDate: lastDates[lastDates.length - 1] || null,
        completeYears: [...new Set(prof.flatMap((x) => x.monthly.yearsUsed))].sort(),
        historicalRecords: histCount
      },
      channels: C().channelIds,
      distributionMethod: { id: plan.methodId, label: method.label, description: method.description, components: method.components, componentWeights: cfg.componentWeights },
      assumptions: Object.fromEntries(C().channelIds.map((ch) => [ch, plan.channels[ch].months.map((m) => ({
        month: m.key,
        aov: m.assumptions ? { value: m.assumptions.aov.value, source: m.assumptions.aov.source } : null,
        conversion_rate: m.assumptions ? { value: m.assumptions.conversionRate.value, source: m.assumptions.conversionRate.source } : null
      }))])),
      confidence: W().worstConfidence(usedConf),
      settings: { smoothing: cfg.smoothing, outlierMadK: cfg.outlierMadK, minSamples: cfg.minSamples, shrinkageK: cfg.shrinkageK,
        calendarEvidenceZ: cfg.calendarEvidenceZ, eventFactorBounds: cfg.eventFactorBounds, monthMinCoverage: cfg.monthMinCoverage,
        historicalPeriod: cfg.historicalPeriod },
      dataSources: {
        explicitPlanDays: C().channelIds.reduce((a, ch) => a + plan.channels[ch].days.filter((r) => r.explicit).length, 0),
        configuredEvents: (p.events || []).length
      }
    };
  }

  /* ---------- Comparación de métodos ---------- */

  /**
   * Compara A–D sin elegir ganador. "Diferencia vs histórico" = ajuste dentro de muestra:
   * se reparte el total real del último año completo con cada método y se mide el error
   * absoluto ponderado (WAPE) diario y mensual contra lo que realmente ocurrió.
   */
  function compareMethods({ store, settings, year }) {
    const cfg = S().effectiveConfig(settings);
    const hist = FP.dataStore.records(store, 'historical');
    const profiles = S().buildProfiles(hist, cfg, year);
    const out = {};
    C().channelIds.forEach((ch) => {
      const prof = profiles[ch];
      const testYear = prof.monthly.yearsUsed[prof.monthly.yearsUsed.length - 1] || null;
      out[ch] = { testYear, methods: {} };
      let actual = null, tags = null;
      if (testYear) {
        const series = S().dailySeries(hist, ch, { from: `${testYear}-01-01`, to: `${testYear}-12-31` });
        actual = new Map(series.map((d) => [d.date, d.value]));
        tags = { [ch]: new Map(series.filter((d) => d.event || d.holiday || d.season).map((d) => [d.date, { event: d.event, holiday: d.holiday, season: d.season }])) };
      }
      Object.keys(cfg.methods).forEach((id) => {
        const comps = cfg.methods[id].components;
        const levels = comps.map((c) => (c === 'monthly' ? prof.monthly.confidence : c === 'dayOfWeek' ? prof.dayOfWeek.confidence
          : c === 'calendar' ? prof.calendar.confidence : null)).filter(Boolean);
        const avail = comps.filter((c) => (c === 'monthly' ? prof.monthly.available : c === 'dayOfWeek' ? prof.dayOfWeek.available
          : c === 'calendar' ? prof.calendar.available : c === 'events' ? Object.values(prof.events).some((e) => e.applied)
            : Object.values(prof.seasons).some((e) => e.applied)));
        const row = {
          id, label: cfg.methods[id].label, components: comps,
          coverage: comps.length ? avail.length / comps.length : 1,
          confidence: W().worstConfidence(levels),
          wapeDaily: null, wapeMonthly: null
        };
        if (testYear) {
          const total = D().exactSum([...actual.values()]);
          const tgt = FP.dataModel.createTargets(testYear);
          tgt.byChannel[ch].revenue = total;
          const empty = {}; C().channelIds.forEach((c) => { empty[c] = new Map(); });
          const allTags = {}; C().channelIds.forEach((c) => { allTags[c] = new Map(); });
          Object.assign(allTags, tags);
          const p = generatePlan({ year: testYear, targets: tgt, settings, method: id, profiles, tags: allTags, explicit: empty });
          const days = p.channels[ch].days.filter((r) => actual.has(r.date));
          const act = days.reduce((a, r) => a + actual.get(r.date), 0);
          row.wapeDaily = act ? days.reduce((a, r) => a + Math.abs(r.values.revenue - actual.get(r.date)), 0) / act : null;
          const mAct = Array(12).fill(0), mPlan = Array(12).fill(0);
          days.forEach((r) => { mAct[r.month - 1] += actual.get(r.date); mPlan[r.month - 1] += r.values.revenue; });
          row.wapeMonthly = act ? mAct.reduce((a, v, i) => a + Math.abs(mPlan[i] - v), 0) / act : null;
        }
        out[ch].methods[id] = row;
      });
    });
    return { year, inSample: true, results: out };
  }

  /* ---------- Registro de planes guardados ----------
   * plans:<año> = { year, originalPlanId, currentId, versions: [PlanVersion] }
   * La primera versión guardada es el PLAN DISTRIBUIDO ORIGINAL: se congela y nunca se sobrescribe.
   * Las siguientes son revisiones ('plan_revision'). El módulo de reforecast leerá originalPlan.
   */
  const SRC = { explicit_plan: 'e', user_target: 'u', historical_average: 'h', historical_seasonality: 's', calculated: 'c', user_assumption: 'a', fallback: 'f', insufficient_data: 'x' };
  const SRC_R = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [v, k]));
  const ST_CODE = { loaded: 'l', calculated: 'c', calculated_with_assumption: 'a', insufficient_data: 'x' };
  const ST_R = Object.fromEntries(Object.entries(ST_CODE).map(([k, v]) => [v, k]));
  const CF = { excellent: 'E', sufficient: 'S', limited: 'L', insufficient: 'I' };
  const CF_R = Object.fromEntries(Object.entries(CF).map(([k, v]) => [v, k]));

  function createPlanRegistry(year) { return { year, originalPlanId: null, currentId: null, versions: [] }; }

  function deepFreeze(o) {
    Object.getOwnPropertyNames(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
    return Object.freeze(o);
  }

  /** Plan (vista previa) → versión almacenable compacta. */
  function toVersion(plan, { id, label, type }) {
    return {
      id, label, type, savedAt: new Date().toISOString(), locked: type === 'original_distributed_plan',
      year: plan.year, methodId: plan.methodId, audit: plan.audit, targets: plan.targets,
      seasonality: plan.profiles && FP.planningExport ? FP.planningExport.seasonalityOut(plan.profiles) : plan.seasonalitySnapshot || null,
      validation: { byChannel: plan.validation.byChannel, errors: plan.validation.errors, warnings: plan.validation.warnings, closed: plan.validation.closed },
      channels: Object.fromEntries(C().channelIds.map((ch) => {
        const c = plan.channels[ch];
        return [ch, {
          annualTarget: c.annualTarget, status: c.status, issues: c.issues,
          months: c.months.map((m) => ({ month: m.month, key: m.key, target: m.target, source: m.source, share: m.share, histShare: m.histShare, confidence: m.confidence, explicitDays: m.explicitDays,
            assumptions: m.assumptions ? { aov: m.assumptions.aov, conversionRate: m.assumptions.conversionRate } : null })),
          // Días: [venta, pedidos, volumen, códigos origen (5), códigos status (5), códigos confianza (5)]
          days: c.days.map((r) => {
            const ks = C().metricKeys;
            return [r.values.revenue, r.values.orders, r.values.trafficVolume,
              ks.map((k) => SRC[r.cells[k].source] || 'x').join(''), ks.map((k) => ST_CODE[r.cells[k].status] || 'x').join(''),
              ks.map((k) => CF[r.cells[k].confidence] || 'I').join('')];
          })
        }];
      }))
    };
  }

  /** Versión guardada → forma de plan navegable por las vistas (sin perfiles). */
  function fromVersion(v) {
    const channels = {};
    C().channelIds.forEach((ch) => {
      const c = v.channels[ch];
      const dates = Cal().daysOfYear(v.year);
      const days = c.days.map((a, i) => {
        const values = { revenue: a[0], orders: a[1], trafficVolume: a[2],
          conversionRate: M().calculateConversionRate(a[1], a[2]), aov: M().calculateAOV(a[0], a[1]) };
        const cells = {};
        C().metricKeys.forEach((k, j) => { cells[k] = cell(values[k], SRC_R[a[3][j]], ST_R[a[4][j]], CF_R[a[5][j]]); });
        return { date: dates[i], month: +dates[i].slice(5, 7), values, cells, explicit: a[3][0] === 'e' ? {} : null, tag: null };
      });
      const months = c.months.map((m) => ({ ...m, plan: aggregate(days.filter((r) => r.month === m.month).map((r) => r.values)) }));
      channels[ch] = { channel: ch, annualTarget: c.annualTarget, months, days, annual: aggregate(days.map((r) => r.values)), issues: c.issues, status: c.status };
    });
    const plan = { schema: 'distributed_plan', year: v.year, methodId: v.methodId, status: 'saved', versionId: v.id, versionLabel: v.label,
      targets: v.targets, channels, total: aggregate(C().channelIds.map((ch) => channels[ch].annual)), audit: v.audit, profiles: null,
      seasonalitySnapshot: v.seasonality || null };
    plan.validation = validatePlanClosure(plan);
    return plan;
  }

  /** Guarda una vista previa. Nunca reemplaza: la primera es el original congelado; las demás, revisiones. */
  function savePlan(registry, plan) {
    const isFirst = !registry.originalPlanId;
    const n = registry.versions.length + 1;
    const v = toVersion(plan, isFirst
      ? { id: `distributed-plan-${plan.year}-original`, label: 'Plan distribuido original', type: 'original_distributed_plan' }
      : { id: `distributed-plan-${plan.year}-r${String(n).padStart(2, '0')}`, label: `Revisión ${String(n - 1).padStart(2, '0')}`, type: 'plan_revision' });
    registry.versions.push(isFirst ? deepFreeze(v) : v);
    if (isFirst) registry.originalPlanId = v.id;
    registry.currentId = v.id;
    return v;
  }

  function getOriginalPlan(registry) {
    return registry && registry.originalPlanId ? registry.versions.find((v) => v.id === registry.originalPlanId) : null;
  }

  function hydratePlanRegistry(raw) {
    if (!raw || !Array.isArray(raw.versions)) return null;
    return { year: raw.year, originalPlanId: raw.originalPlanId, currentId: raw.currentId,
      versions: raw.versions.map((v) => (v.id === raw.originalPlanId ? deepFreeze(v) : v)) };
  }

  /** Valores del plan original por 'fecha|canal' (para la vista consolidada de Fase 0). */
  function planValuesMap(version) {
    const map = new Map();
    if (!version) return map;
    const dates = Cal().daysOfYear(version.year);
    C().channelIds.forEach((ch) => version.channels[ch].days.forEach((a, i) => {
      if (a[0] !== null) map.set(`${dates[i]}|${ch}`, { revenue: a[0], orders: a[1], trafficVolume: a[2] });
    }));
    return map;
  }

  FP.planning = {
    buildTags, explicitPlan, dayWeight, monthWeights, metricAssumption,
    generatePlan, generateAnnualPlan, generateMonthlyPlan, generateDailyPlan, generateWeeklyPlan,
    aggregate, validatePlanClosure, compareMethods,
    createPlanRegistry, toVersion, fromVersion, savePlan, getOriginalPlan, hydratePlanRegistry, planValuesMap,
    distributeTarget: (...a) => D().distributeTarget(...a), normalizeDistribution: (...a) => D().normalizeDistribution(...a)
  };
})(typeof window !== 'undefined' ? window : globalThis);
