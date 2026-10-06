/**
 * cohortEngine.js — Cohortes + ciclo de vida descriptivo de entidades.
 * No infiere clientes: una cohorte es el primer período observado de una entidad.
 * El ciclo de vida usa únicamente períodos completos comparables.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const DEFAULTS = { minActivity: 0 };
  const cfg = (o = {}) => ({ ...DEFAULTS, ...(o || {}) });
  const valueAt = (series, period) => {
    const p = (series || []).find((x) => String(x.period) === String(period));
    return p && finite(p.value) ? p.value : 0;
  };
  const activeAt = (series, period, minActivity) => valueAt(series, period) > minActivity;

  function lifecycleStatus(points, periods, index, firstIndex, minActivity) {
    const current = activeAt(points, periods[index], minActivity);
    if (!current) return index > 0 && activeAt(points, periods[index - 1], minActivity) ? 'lost' : 'inactive';
    if (index === firstIndex) return 'new';
    const previous = activeAt(points, periods[index - 1], minActivity);
    if (previous) return 'retained';
    for (let i = firstIndex; i < index - 1; i += 1) {
      if (!activeAt(points, periods[i], minActivity)) return 'reactivated';
    }
    return 'reactivated';
  }

  function analyze(seriesMap, periods, options = {}) {
    const c = cfg(options);
    const periodsSafe = Array.isArray(periods) ? periods.map(String) : [];
    const cohorts = new Map();
    const entities = [];
    const source = seriesMap && typeof seriesMap.forEach === 'function' ? seriesMap : new Map();

    source.forEach((series, entity) => {
      const points = Array.isArray(series) ? series : [];
      const firstIndex = periodsSafe.findIndex((period) => activeAt(points, period, c.minActivity));
      if (firstIndex < 0) return;
      const firstPeriod = periodsSafe[firstIndex];
      const item = { entity, firstPeriod, firstIndex, series: points };
      entities.push(item);
      if (!cohorts.has(firstPeriod)) cohorts.set(firstPeriod, []);
      cohorts.get(firstPeriod).push(item);
    });

    const rows = [...cohorts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cohortPeriod, members]) => {
      const size = members.length;
      const cells = periodsSafe.map((period, index) => {
        const age = index - periodsSafe.indexOf(cohortPeriod);
        if (age < 0) return null;
        const active = members.filter((m) => activeAt(m.series, period, c.minActivity)).length;
        const revenue = members.reduce((sum, m) => sum + valueAt(m.series, period), 0);
        const initialRevenue = members.reduce((sum, m) => sum + valueAt(m.series, cohortPeriod), 0);
        return {
          period, age, active,
          retention: size ? active / size : null,
          revenue,
          revenueRetention: initialRevenue > 0 ? revenue / initialRevenue : null
        };
      }).filter(Boolean);
      return { cohortPeriod, size, cells, latest: cells[cells.length - 1] || null };
    });

    const retentionAges = (age) => {
      const eligible = rows.filter((r) => r.cells.some((c0) => c0.age === age));
      if (!eligible.length) return null;
      const vals = eligible.map((r) => r.cells.find((c0) => c0.age === age)).filter(Boolean).map((x) => x.retention).filter(finite);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    const latestIndex = periodsSafe.length - 1;
    const previousIndex = latestIndex - 1;
    const lifecycle = { new: [], retained: [], reactivated: [], lost: [], inactive: [] };
    if (latestIndex >= 0) {
      entities.forEach((item) => {
        const status = lifecycleStatus(item.series, periodsSafe, latestIndex, item.firstIndex, c.minActivity);
        lifecycle[status].push(item.entity);
      });
    }

    const latestActive = entities.filter((item) => activeAt(item.series, periodsSafe[latestIndex], c.minActivity));
    const latestActiveSet = new Set(latestActive.map((x) => x.entity));
    const previousActive = previousIndex >= 0
      ? entities.filter((item) => activeAt(item.series, periodsSafe[previousIndex], c.minActivity))
      : [];
    const previousActiveSet = new Set(previousActive.map((x) => x.entity));
    const retainedCount = latestActive.filter((item) => previousActiveSet.has(item.entity)).length;
    const reactivatedCount = lifecycle.reactivated.length;
    const newCount = lifecycle.new.length;
    const lostCount = lifecycle.lost.length;
    const latestActiveCount = latestActive.length;
    const previousActiveCount = previousActive.length;

    const maxAge = rows.reduce((m, r) => Math.max(m, ...r.cells.map((x) => x.age)), -1);
    const total = entities.length;
    const firstPeriod = rows[0] ? rows[0].cohortPeriod : null;
    const latestPeriod = periodsSafe[latestIndex] || null;
    return {
      status: total ? 'available' : 'insufficient_history',
      schema: 'product-cohorts', schemaVersion: 2,
      level: options.level || 'product', firstPeriod, latestPeriod, periods: periodsSafe,
      entityCount: total, cohortCount: rows.length, maxAge, rows,
      summary: {
        newEntities: rows.reduce((sum, r) => sum + r.size, 0),
        retentionAge1: retentionAges(1),
        retentionAge3: retentionAges(3),
        latestCohortSize: rows.length ? rows[rows.length - 1].size : 0,
        latestActiveCount, previousActiveCount,
        newCount, retainedCount, reactivatedCount, lostCount,
        retentionRate: previousActiveCount ? retainedCount / previousActiveCount : null,
        reactivationRate: previousActiveCount ? reactivatedCount / previousActiveCount : null,
        lossRate: previousActiveCount ? lostCount / previousActiveCount : null
      },
      lifecycle: {
        latestPeriod,
        previousPeriod: previousIndex >= 0 ? periodsSafe[previousIndex] : null,
        new: lifecycle.new,
        retained: lifecycle.retained,
        reactivated: lifecycle.reactivated,
        lost: lifecycle.lost,
        inactive: lifecycle.inactive
      },
      caveat: 'Cohorte por primer período observado de la entidad. Ciclo de vida calculado sobre períodos completos comparables; no representa retención, recompra ni churn de clientes.'
    };
  }

  FP.cohortEngine = { DEFAULTS, analyze };
})(typeof window !== 'undefined' ? window : globalThis);
