/**
 * mock-data.js — Datos de prueba controlados (solo Fase 0 / QA).
 *
 * Determinísticos (semilla fija): cada ejecución produce los mismos números,
 * así cualquier cambio de resultado indica un cambio en la lógica.
 * Se pueden eliminar cuando exista carga CSV real; nada del núcleo depende de ellos.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const DM = () => FP.dataModel;
  const Cal = () => FP.calendar;

  /** PRNG determinístico (mulberry32). */
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Perfil base diario por canal (tráfico, CR, AOV en MXN), escalado para ser coherente con las metas de ejemplo. */
  const PROFILES = {
    ecommerce: { traffic: 28000, cr: 0.011, aov: 920 },
    app:       { traffic: 13000, cr: 0.019, aov: 860 },
    whatsapp:  { traffic: 1300,  cr: 0.115, aov: 1080 },
    llamadas:  { traffic: 330,   cr: 0.24,  aov: 1290 }
  };
  /** Factor por día de la semana (lunes … domingo). */
  const DOW = [1.05, 1.03, 1.0, 0.98, 0.95, 0.85, 0.8];

  const round2 = (n) => Math.round(n * 100) / 100;

  function buildObserved(traffic, cr, aov) {
    const t = Math.round(traffic);
    const o = Math.round(t * cr);
    return { trafficVolume: t, orders: o, revenue: round2(o * aov) };
  }

  /**
   * Genera un mes: plan para todos los días y real hasta `actualUntil`.
   * Incluye dos anomalías intencionales para demostrar advertencias.
   */
  function generateMonth({ year = 2026, month = 9, actualUntil = '2026-09-22', seed = 2026 } = {}) {
    const rnd = seeded(seed);
    const jitter = (spread) => 1 + (rnd() * 2 - 1) * spread;
    const ds = DM().createDataset(year, { source: 'mock', label: 'Datos de prueba' });

    Cal().daysOfMonth(year, month).forEach((date) => {
      const a = Cal().getDateAttributes(date);
      const f = DOW[a.dayOfWeekIndex - 1];
      FP.config.channelIds.forEach((channel) => {
        const p = PROFILES[channel];
        const plan = buildObserved(p.traffic * f, p.cr, p.aov);
        let actual = null;
        if (date <= actualUntil) {
          actual = buildObserved(p.traffic * f * jitter(0.1), p.cr * jitter(0.08), p.aov * jitter(0.06));
        }
        const opts = { date, channel, plan, actual };
        if (date === `${year}-09-16`) { opts.dayType = 'holiday'; opts.holiday = 'Día de la Independencia'; }

        // Anomalía 1: CR cargado por el usuario que no cuadra con pedidos/sesiones.
        if (date === `${year}-09-10` && channel === 'ecommerce' && actual) actual.conversionRate = '1.5%';
        // Anomalía 2: AOV cargado que no cuadra con venta/pedidos.
        if (date === `${year}-09-18` && channel === 'llamadas' && actual) actual.aov = 1500;

        DM().upsertRecord(ds, DM().createDailyRecord(opts));
      });
    });
    return ds;
  }

  /** Metas de ejemplo (las del brief). */
  function sampleTargets(year = 2026) {
    const t = DM().createTargets(year);
    t.annual.revenue = 261000000;
    t.byChannel.ecommerce.revenue = 98000000;
    t.byChannel.app.revenue = 74000000;
    t.byChannel.whatsapp.revenue = 54000000;
    t.byChannel.llamadas.revenue = 35000000;
    t.updatedAt = new Date().toISOString();
    return t;
  }

  function sampleEvents() {
    return [FP.events.createEvent({ id: 'hot-sale-2026', name: 'Hot Sale', startDate: '2026-05-25', endDate: '2026-06-02' })];
  }

  function sampleMilestones() {
    return [FP.events.createMilestone({ date: '2026-09-16', title: 'Día de la Independencia', description: 'Festivo nacional', type: 'milestone' })];
  }

  /**
   * Casos límite para la tabla de validación.
   * expected = estado que el motor DEBE devolver.
   */
  const EDGE_CASES = [
    { id: 'coherent', label: 'Datos completos y coherentes', input: { revenue: 10000, orders: 10, trafficVolume: 1000 }, expected: 'ok' },
    { id: 'derive', label: 'Derivar desde volumen, CR y AOV', input: { trafficVolume: 2000, conversionRate: 0.02, aov: 850 }, expected: 'ok' },
    { id: 'formatted', label: 'Números con formato de texto', input: { revenue: '$12,500.00', orders: '25', trafficVolume: '1,000' }, expected: 'ok' },
    { id: 'zeros', label: 'Todo en cero', input: { revenue: 0, orders: 0, trafficVolume: 0 }, expected: 'ok' },
    { id: 'nulls', label: 'Nulos, undefined y vacíos', input: { revenue: null, orders: undefined, trafficVolume: '' }, expected: 'empty' },
    { id: 'zero-traffic', label: 'Pedidos con volumen en cero', input: { revenue: 5000, orders: 5, trafficVolume: 0 }, expected: 'error' },
    { id: 'zero-orders', label: 'Venta con pedidos en cero', input: { revenue: 1200, orders: 0, trafficVolume: 300 }, expected: 'error' },
    { id: 'cr-mismatch', label: 'CR cargado que no cuadra', input: { revenue: 9000, orders: 10, trafficVolume: 1000, conversionRate: '2%' }, expected: 'warning' },
    { id: 'aov-mismatch', label: 'AOV cargado que no cuadra', input: { revenue: 9000, orders: 10, trafficVolume: 1000, aov: 1000 }, expected: 'warning' },
    { id: 'orders-gt-traffic', label: 'Más pedidos que volumen', input: { revenue: 3000, orders: 50, trafficVolume: 20 }, expected: 'error' },
    { id: 'negative', label: 'Venta negativa', input: { revenue: -500, orders: 2, trafficVolume: 100 }, expected: 'error' },
    { id: 'non-numeric', label: 'Texto no numérico', input: { revenue: 'abc', orders: 'N/D', trafficVolume: 500 }, expected: 'error' }
  ];

  FP.mock = { generateMonth, sampleTargets, sampleEvents, sampleMilestones, EDGE_CASES, PROFILES };
})(typeof window !== 'undefined' ? window : globalThis);
