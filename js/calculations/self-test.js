/**
 * self-test.js — Pruebas del motor que corren en el navegador al iniciar.
 *
 * Alimentan el indicador "Estado del motor". Cada fase nueva debe AGREGAR
 * pruebas aquí (nunca borrar las existentes): es la red de no-regresión.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  function run() {
    const M = FP.metrics, Cal = FP.calendar, DM = FP.dataModel, F = FP.forecast;
    const results = [];
    const test = (group, name, fn) => {
      try {
        const ok = fn();
        results.push({ group, name, pass: ok === true, error: ok === true ? null : 'Resultado inesperado' });
      } catch (e) {
        results.push({ group, name, pass: false, error: e.message });
      }
    };
    const near = (a, b, eps = 1e-9) => a !== null && b !== null && Math.abs(a - b) <= eps;

    // Matemáticas
    test('Matemáticas', 'CR = Pedidos ÷ Volumen', () => near(M.calcConversionRate(25, 1000), 0.025));
    test('Matemáticas', 'AOV = Venta ÷ Pedidos', () => near(M.calcAov(12500, 25), 500));
    test('Matemáticas', 'Pedidos = Volumen × CR', () => near(M.calcOrders(1000, 0.025), 25));
    test('Matemáticas', 'Venta = Pedidos × AOV', () => near(M.calcRevenueFromOrders(25, 500), 12500));
    test('Matemáticas', 'Venta = Volumen × CR × AOV', () => near(M.calcRevenue(1000, 0.025, 500), 12500));
    test('Matemáticas', 'Identidades cierran entre sí', () => {
      const t = 3456, cr = 0.0173, aov = 911.4;
      const o = M.calcOrders(t, cr), r = M.calcRevenue(t, cr, aov);
      return near(M.calcConversionRate(o, t), cr) && near(M.calcAov(r, o), aov, 1e-6);
    });

    // Robustez
    test('Robustez', 'División entre cero devuelve null', () => M.safeDivide(10, 0) === null);
    test('Robustez', 'null / undefined / vacío devuelven null', () =>
      M.calcAov(null, 5) === null && M.calcAov(undefined, 5) === null && M.calcConversionRate('', 5) === null);
    test('Robustez', 'NaN e Infinity se convierten en null', () =>
      M.toNumberOrNull(NaN) === null && M.toNumberOrNull(Infinity) === null && M.safeDivide(1e308, 1e-308) === null);
    test('Robustez', 'Texto con formato se interpreta', () =>
      M.toNumberOrNull('$1,250.50') === 1250.5 && near(M.toNumberOrNull('1.25%'), 0.0125));
    test('Robustez', 'Texto no numérico se rechaza', () => M.toNumberOrNull('abc') === null && M.toNumberOrNull('12abc') === null);
    test('Robustez', 'Suma con nulos ignora nulos', () => M.sumNullable([1, null, undefined, '2']) === 3 && M.sumNullable([null]) === null);

    // Observado vs calculado
    test('Observado vs calculado', 'Deriva CR y AOV y los marca como calculados', () => {
      const d = M.deriveBlock({ revenue: 9000, orders: 10, trafficVolume: 1000 });
      return near(d.values.conversionRate, 0.01) && d.sources.conversionRate === 'calculated' && d.sources.revenue === 'observed';
    });
    test('Observado vs calculado', 'No sobrescribe un CR cargado', () => {
      const d = M.deriveBlock({ revenue: 9000, orders: 10, trafficVolume: 1000, conversionRate: 0.02 });
      return d.values.conversionRate === 0.02 && d.sources.conversionRate === 'observed';
    });
    test('Observado vs calculado', 'CR cargado inconsistente genera advertencia', () => {
      const d = M.deriveBlock({ revenue: 9000, orders: 10, trafficVolume: 1000, conversionRate: 0.02 });
      const v = M.validateBlock(d.values, d.sources, d.rejected);
      return v.status === 'warning' && v.checks.find((c) => c.id === 'cr_identity').status === 'warning';
    });

    // Agregación
    test('Agregación', 'CR agregado se recalcula, no se promedia', () => {
      const a = M.aggregateBlocks([
        { revenue: 1000, orders: 1, trafficVolume: 100 },   // CR 1 %
        { revenue: 9000, orders: 9, trafficVolume: 100 }    // CR 9 %
      ]);
      return near(a.conversionRate, 0.05) && near(a.aov, 1000);
    });
    test('Agregación', 'Suma de canales vs total detecta diferencias', () =>
      M.validateHierarchy(100, [40, 60]).status === 'pass' && M.validateHierarchy(100, [40, 50]).status === 'warning');

    // Calendario
    test('Calendario', '2026-09-23 es semana ISO 39, miércoles', () => {
      const a = Cal.getDateAttributes('2026-09-23');
      return a.week === 39 && a.dayOfWeek === 'Wednesday' && a.weekOfMonthLabel === 'W4';
    });
    test('Calendario', '2027-01-01 pertenece a 2026-W53', () => Cal.getWeekInfo('2027-01-01').weekKey === '2026-W53');
    test('Calendario', 'Fechas imposibles se rechazan', () => Cal.parseDate('2026-02-30') === null && Cal.parseDate('23/09/2026') === null);
    test('Calendario', 'Septiembre 2026 tiene 30 días', () => Cal.daysOfMonth(2026, 9).length === 30);

    // Modelo
    test('Modelo', 'Registro rechaza canal inválido', () => {
      try { DM.createDailyRecord({ date: '2026-09-23', channel: 'tienda' }); return false; } catch (e) { return true; }
    });
    test('Modelo', 'Plan, real y forecast viven separados', () => {
      const r = DM.createDailyRecord({ date: '2026-09-23', channel: 'app', plan: { revenue: 100, orders: 1, trafficVolume: 10 } });
      return r.plan.revenue === 100 && r.actual.revenue === null && r.forecast.revenue === null;
    });
    test('Versionado', 'El Original Plan es inmutable', () => {
      const ds = DM.createDataset(2026);
      DM.upsertRecord(ds, DM.createDailyRecord({ date: '2026-09-01', channel: 'app', plan: { revenue: 100, orders: 1, trafficVolume: 10 } }));
      const reg = F.createRegistry(2026);
      const op = F.lockOriginalPlan(reg, ds);
      try { op.values['2026-09-01|app'].revenue = 999; } catch (e) { /* modo estricto lanza */ }
      let secondLockFails = false;
      try { F.lockOriginalPlan(reg, ds); } catch (e) { secondLockFails = true; }
      return op.values['2026-09-01|app'].revenue === 100 && Object.isFrozen(op) && secondLockFails;
    });

    /* ---------------- Fase 1 ---------------- */
    const Nz = FP.normalize, IMP = FP.importer, ST = FP.dataStore, COV = FP.coverage;
    const settings = IMP.defaultSettings();

    test('Fase 1: CSV', 'Lee comillas, comas internas y BOM', () => {
      const p = FP.csv.parse('\uFEFFfecha,canal,venta\r\n2026-09-21,app,"$1,250.50"\r\n');
      return p.headers[0] === 'fecha' && p.rows.length === 1 && p.rows[0].values.venta === '$1,250.50';
    });
    test('Fase 1: CSV', 'Detecta punto y coma como separador', () => FP.csv.parse('fecha;canal\n2026-09-21;app').delimiter === ';');

    test('Fase 1: fechas', 'Normaliza ISO y rechaza imposibles', () =>
      Nz.normalizeDate('2026-9-1').value === '2026-09-01' && Nz.normalizeDate('2026-15-20').status === 'invalid' &&
      Nz.normalizeDate('32/01/2026').status === 'invalid' && Nz.normalizeDate('abc').status === 'invalid' && Nz.normalizeDate('').status === 'missing');
    test('Fase 1: fechas', 'No adivina fechas ambiguas', () =>
      Nz.normalizeDate('03/04/2026').status === 'ambiguous' && Nz.normalizeDate('03/04/2026', { dateFormat: 'DMY' }).value === '2026-04-03' &&
      Nz.normalizeDate('21/09/2026').value === '2026-09-21');

    test('Fase 1: números', 'Limpia moneda y separadores', () =>
      Nz.normalizeNumber('$500,000.50').value === 500000.5 && Nz.normalizeNumber('500,000').value === 500000 && Nz.normalizeNumber('500000').value === 500000);
    test('Fase 1: números', 'Inválido no se vuelve cero', () =>
      Nz.normalizeNumber('abc').status === 'invalid' && Nz.normalizeNumber('1,5').status === 'invalid' && Nz.normalizeNumber('').status === 'missing');
    test('Fase 1: números', 'Formato 1.234,56 y negativos contables', () =>
      Nz.normalizeNumber('1.234,56', { numberFormat: 'comma' }).value === 1234.56 && Nz.normalizeNumber('(2,500)').value === -2500);

    test('Fase 1: canales', 'Normaliza variantes y rechaza desconocidos', () =>
      ['Ecommerce', 'ECOMMERCE', 'e-commerce'].every((c) => Nz.normalizeChannel(c).value === 'ecommerce') &&
      Nz.normalizeChannel('CALLS').value === 'llamadas' && Nz.normalizeChannel('WhatsApp').value === 'whatsapp' &&
      ['marketplace', 'tienda', 'facebook'].every((c) => Nz.normalizeChannel(c).status === 'invalid'));

    test('Fase 1: mapeo', 'Sugiere columnas por sinónimos', () => {
      const m = IMP.suggestMapping(['Fecha', 'CANAL', 'Ventas', 'Órdenes', 'Sessions', 'meta_aov', 'otra']);
      return m.Fecha === 'date' && m.CANAL === 'channel' && m.Ventas === 'revenue' && m['Órdenes'] === 'orders' &&
        m.Sessions === 'trafficVolume' && m.meta_aov === 'aov' && m.otra === null;
    });

    const run1 = (text, dataType = 'actual', existing = []) => {
      const stg = IMP.stage(text, { fileName: 't.csv', dataType });
      return { stg, res: IMP.process(stg, { settings, existing, today: '2026-09-23' }) };
    };

    test('Fase 1: registros', 'Observado vs calculado por celda', () => {
      const r = run1('fecha,canal,venta,pedidos,traffic_volume\n2026-09-21,ecommerce,820000,410,24500').res.rows[0].record.metrics;
      return r.revenue.source === 'observed' && r.conversionRate.source === 'calculated' && near(r.aov.value, 2000);
    });
    test('Fase 1: registros', 'Falta de dato ≠ cero', () => {
      const rows = run1('fecha,canal,venta,pedidos,traffic_volume\n2026-09-21,app,,10,100\n2026-09-21,whatsapp,0,0,100').res.rows;
      return rows[0].record.metrics.revenue.source === 'missing' && rows[1].record.metrics.revenue.source === 'observed' &&
        rows[1].record.metrics.revenue.value === 0 && rows[0].issues.some((i) => i.type === 'MISSING_VALUE');
    });
    test('Fase 1: validación', 'CR cargado inconsistente se conserva y advierte', () => {
      const row = run1('fecha,canal,venta,pedidos,traffic_volume,conversion_rate\n2026-09-21,app,570000,330,18000,0.03').res.rows[0];
      return row.record.metrics.conversionRate.value === 0.03 && row.issues.some((i) => i.type === 'MATHEMATICAL_INCONSISTENCY');
    });
    test('Fase 1: validación', 'Errores estructurados con fila y campo', () => {
      const i = run1('fecha,canal,venta,pedidos,traffic_volume\n2026-09-21,app,-5,1,10').res.issues.find((x) => x.type === 'NEGATIVE_REVENUE');
      return i && i.severity === 'error' && i.row === 2 && i.field === 'venta' && i.value === '-5';
    });
    test('Fase 1: validación', 'Cero pedidos y cero tráfico no rompen', () => {
      const res = run1('fecha,canal,venta,pedidos,traffic_volume\n2026-09-20,app,5000,5,0\n2026-09-20,ecommerce,0,0,0').res;
      return res.rows[0].status === 'error' && res.rows[1].status === 'valid' && res.rows[1].record.metrics.conversionRate.value === null;
    });
    test('Fase 1: duplicados', 'Se detectan y no se eliminan', () => {
      const { stg, res } = run1('fecha,canal,venta,pedidos,traffic_volume\n2026-09-21,app,1,1,10\n2026-09-21,app,2,1,10');
      const store = ST.createStore();
      ST.commitBatch(store, stg, res, { settings });
      return res.summary.duplicates === 1 && store.actual.records.length === 2 && ST.findDuplicates(store, 'actual').length === 1 &&
        ST.resolveLatest(store, 'actual').get('2026-09-21|app|actual').metrics.revenue.value === 2;
    });
    test('Fase 1: importación', 'Filas con llave inválida nunca entran', () => {
      const { stg, res } = run1('fecha,canal,venta,pedidos,traffic_volume\n2026-09-21,tienda,1,1,10\nabc,app,1,1,10\n2026-09-21,app,1,1,10');
      const store = ST.createStore();
      const b = ST.commitBatch(store, stg, res, { settings, includeErrorRows: true });
      return b.accepted === 1 && b.rejected === 2 && b.issues.length >= 2;
    });
    test('Fase 1: cobertura', 'Cuenta días y canales faltantes', () => {
      const { stg, res } = run1('fecha,canal,venta,pedidos,traffic_volume\n2026-09-01,app,1,1,10\n2026-09-03,app,1,1,10\n2026-09-03,ecommerce,1,1,10', 'historical');
      const store = ST.createStore();
      ST.commitBatch(store, stg, res, { settings });
      const c = COV.computeCoverage(store.historical.records);
      return c.expectedDays === 3 && c.availableDays === 2 && c.missingDates[0] === '2026-09-02' &&
        c.byChannel.find((x) => x.channel === 'ecommerce').days === 1 && c.missingChannels.length === 2;
    });
    test('Fase 1: storage', 'Empaquetado ida y vuelta sin pérdida', () => {
      const { stg, res } = run1('fecha,canal,venta,pedidos,traffic_volume,aov\n2026-09-21,app,"$1,000",2,10,abc');
      const store = ST.createStore();
      ST.commitBatch(store, stg, res, { settings, includeErrorRows: true });
      const back = ST.hydrateCollection(JSON.parse(JSON.stringify(ST.packCollection(store.actual))), 'actual');
      return JSON.stringify(back.records) === JSON.stringify(store.actual.records);
    });
    test('Fase 1: consolidación', 'Plan y actual llegan al modelo de Fase 0', () => {
      const store = ST.createStore();
      [['fecha,canal,meta_venta\n2026-09-21,app,1000', 'plan'], ['fecha,canal,venta,pedidos,traffic_volume\n2026-09-21,app,900,3,100', 'actual']]
        .forEach(([t, dt]) => { const { stg, res } = run1(t, dt); ST.commitBatch(store, stg, res, { settings }); });
      const r = DM.getRecord(ST.consolidate(store, 2026), '2026-09-21', 'app');
      return r.plan.revenue === 1000 && r.actual.revenue === 900 && near(r.actual.aov, 300);
    });

    /* ---------------- Fase 2: planeación ---------------- */
    const PL = FP.planning, DIST = FP.distribution, C = FP.config;
    const obs = (v) => ({ value: v, source: 'observed' });
    /** Histórico sintético: canónico directo (rápido), con factor por día de semana. */
    function synthHistory(years, { channels = C.channelIds, extra = null } = {}) {
      const store = ST.createStore();
      years.forEach((y) => Cal.daysOfYear(y).forEach((date) => channels.forEach((ch) => {
        const dow = Cal.getDateAttributes(date).dayOfWeekIndex;
        let rev = 1000 * (dow >= 6 ? 0.8 : 1.08);
        const tags = extra ? extra(date, ch) : {};
        if (tags.mult) rev *= tags.mult;
        const orders = rev / 500;
        store.historical.records.push({ key: `${date}|${ch}|historical`, dataType: 'historical', date, channel: ch,
          dayType: tags.event ? 'event' : 'regular', holiday: null, event: tags.event || null, season: null, notes: null,
          metrics: { revenue: obs(rev), orders: obs(orders), trafficVolume: obs(orders / 0.02), conversionRate: { value: 0.02, source: 'calculated' }, aov: { value: 500, source: 'calculated' } },
          status: 'valid', issueCounts: { error: 0, warning: 0 }, provenance: { batchId: 'b', fileName: 'synth', row: 1 } });
      })));
      return store;
    }
    const tgt = (year, total, split) => {
      const t = DM.createTargets(year);
      t.annual.revenue = total;
      C.channelIds.forEach((ch, i) => { t.byChannel[ch].revenue = split[i]; });
      return t;
    };
    const cents = (x) => Math.round(x * 100);
    const histStore = synthHistory([2024, 2025]);
    const plan26 = PL.generatePlan({ year: 2026, targets: tgt(2026, 100000000, [40000000, 30000000, 20000000, 10000000]), store: histStore, settings: {} });

    test('Fase 2: distribución', 'Reparto exacto por mayor residuo', () => {
      const parts = DIST.distributeTarget(100, [1, 1, 1], { decimals: 2 });
      return cents(parts.reduce((a, b) => a + b, 0)) === 10000 && parts.join() === '33.34,33.33,33.33';
    });
    test('Fase 2: cierre', 'Caso 1: meta anual $100M → Σ meses exacta', () => {
      const t = tgt(2026, 100000000, [100000000, null, null, null]);
      const p = PL.generatePlan({ year: 2026, targets: t, store: histStore, settings: {} });
      return cents(DIST.exactSum(p.channels.ecommerce.months.map((m) => m.target))) === cents(100000000);
    });
    test('Fase 2: cierre', 'Caso 2: cada mes Σ días = meta mensual', () =>
      C.channelIds.every((ch) => plan26.channels[ch].months.every((m) =>
        cents(DIST.exactSum(plan26.channels[ch].days.filter((r) => r.month === m.month).map((r) => r.values.revenue))) === cents(m.target))));
    test('Fase 2: cierre', 'Caso 3: cada canal Σ plan = meta del canal', () =>
      C.channelIds.every((ch) => cents(plan26.channels[ch].annual.revenue) === cents(plan26.channels[ch].annualTarget.value)));
    test('Fase 2: cierre', 'Caso 4: Σ canales = meta digital', () =>
      cents(plan26.total.revenue) === cents(100000000) && plan26.validation.closed === true);
    test('Fase 2: métricas', 'Caso 5: pedidos ÷ volumen = CR en cada día', () =>
      plan26.channels.app.days.every((r) => M.isApproximatelyEqual(r.values.orders / r.values.trafficVolume, r.values.conversionRate)) &&
      M.isClose(plan26.channels.app.annual.conversionRate, 0.02, { relative: 0.01 }));
    test('Fase 2: métricas', 'Caso 6: venta ÷ pedidos = AOV en cada día', () =>
      plan26.channels.whatsapp.days.every((r) => M.isApproximatelyEqual(r.values.revenue / r.values.orders, r.values.aov)) &&
      M.isClose(plan26.channels.whatsapp.annual.aov, 500, { relative: 0.01 }));
    test('Fase 2: datos faltantes', 'Caso 7: sin histórico → insufficient_data, nunca 0', () => {
      const p = PL.generatePlan({ year: 2026, targets: tgt(2026, null, [1000000, null, null, null]), store: ST.createStore(), settings: {} });
      const d = p.channels.ecommerce.days[0];
      return d.cells.orders.status === 'insufficient_data' && d.values.orders === null && d.values.trafficVolume === null &&
        d.cells.revenue.source === 'fallback' && cents(p.channels.ecommerce.annual.revenue) === cents(1000000) &&
        p.channels.app.annualTarget.source === 'insufficient_data' && p.channels.app.days[0].values.revenue === null;
    });
    test('Fase 2: calendario', 'Caso 8: año bisiesto, febrero con 29 días', () => {
      const p = PL.generatePlan({ year: 2028, targets: tgt(2028, null, [12000000, null, null, null]), store: histStore, settings: {} });
      const feb = p.channels.ecommerce.days.filter((r) => r.month === 2);
      return feb.length === 29 && p.channels.ecommerce.days.length === 366 && feb[28].date === '2028-02-29' && feb[28].values.revenue > 0 &&
        cents(DIST.exactSum(feb.map((r) => r.values.revenue))) === cents(p.channels.ecommerce.months[1].target);
    });
    test('Fase 2: calendario', 'Caso 9: meses de 28, 29, 30 y 31 días cierran', () => {
      const p27 = PL.generatePlan({ year: 2027, targets: tgt(2027, null, [5000000.03, null, null, null]), store: histStore, settings: {} });
      const p28 = PL.generatePlan({ year: 2028, targets: tgt(2028, null, [5000000.03, null, null, null]), store: histStore, settings: {} });
      const lens = (p, m) => p.channels.ecommerce.days.filter((r) => r.month === m).length;
      return lens(p27, 2) === 28 && lens(p28, 2) === 29 && lens(p27, 4) === 30 && lens(p27, 1) === 31 &&
        p27.validation.closed && p28.validation.closed;
    });
    test('Fase 2: eventos', 'Caso 10: evento con pocos datos no genera factor extremo sin marcarlo', () => {
      const store = synthHistory([2025], { channels: ['ecommerce'], extra: (date) => (date === '2025-06-10' ? { event: 'Evento raro', mult: 6 } : {}) });
      const cfg = FP.seasonality.effectiveConfig({});
      const g = FP.seasonality.buildChannelProfile(store.historical.records, 'ecommerce', cfg, 2026).events['event:evento raro'];
      const store2 = synthHistory([2025], { channels: ['ecommerce'], extra: (date) => (['2025-06-10', '2025-06-11', '2025-06-12'].includes(date) ? { event: 'Evento corto', mult: 6 } : {}) });
      const g2 = FP.seasonality.buildChannelProfile(store2.historical.records, 'ecommerce', cfg, 2026).events['event:evento corto'];
      return g.confidence === 'insufficient' && g.factor === 1 && !g.applied &&
        g2.confidence === 'limited' && g2.factor < g2.raw && g2.factor <= cfg.eventFactorBounds[1];
    });
    test('Fase 2: estacionalidad', 'Detecta día de semana por canal', () => {
      const f = plan26.profiles.ecommerce.dayOfWeek.factors;
      return f[0] > 1 && f[6] < 1 && M.isClose(f[0] / f[6], 1.08 / 0.8, { relative: 0.01 });
    });
    test('Fase 2: estacionalidad', 'No inventa efecto de quincena sin evidencia', () =>
      plan26.profiles.ecommerce.calendar.significantDays === 0 && plan26.profiles.ecommerce.calendar.factors.every((x) => M.isClose(x, 1, { relative: 1e-9 })));
    test('Fase 2: prioridad', 'El plan explícito nunca se reemplaza', () => {
      const store = synthHistory([2025], { channels: ['ecommerce'] });
      store.plan.records.push({ key: '2026-03-10|ecommerce|plan', dataType: 'plan', date: '2026-03-10', channel: 'ecommerce', dayType: 'regular',
        metrics: { revenue: obs(777777.77), orders: { value: null, source: 'missing' }, trafficVolume: { value: null, source: 'missing' },
          conversionRate: { value: null, source: 'missing' }, aov: { value: null, source: 'missing' } }, status: 'valid', issueCounts: { error: 0, warning: 0 }, provenance: {} });
      const p = PL.generatePlan({ year: 2026, targets: tgt(2026, null, [90000000, null, null, null]), store, settings: {} });
      const d = p.channels.ecommerce.days.find((r) => r.date === '2026-03-10');
      return d.values.revenue === 777777.77 && d.cells.revenue.source === 'explicit_plan' && p.validation.byChannel.ecommerce === 'closed';
    });
    test('Fase 2: integridad', 'El plan distribuido original no se sobrescribe', () => {
      const reg = PL.createPlanRegistry(2026);
      const v1 = PL.savePlan(reg, plan26);
      const v2 = PL.savePlan(reg, plan26);
      let threw = false;
      try { 'use strict'; PL.getOriginalPlan(reg).channels.ecommerce.days[0][0] = 1; } catch (e) { threw = true; }
      return reg.originalPlanId === v1.id && v2.type === 'plan_revision' && reg.versions.length === 2 &&
        Object.isFrozen(PL.getOriginalPlan(reg)) && threw;
    });
    test('Fase 2: semanas', 'Σ semanas ISO = Σ días (semanas que cruzan meses)', () => {
      const w = PL.generateWeeklyPlan(plan26, 'llamadas');
      return cents(DIST.exactSum(w.map((x) => x.plan.revenue))) === cents(plan26.channels.llamadas.annual.revenue) &&
        w.some((x) => x.crossesMonths);
    });

    /* ---------------- Fase 3: pacing y forecast ---------------- */
    const FE = FP.forecastEngine, GAP = FP.gap, FV = FP.forecastVersioning;
    const planReg = PL.createPlanRegistry(2026);
    const planV = PL.savePlan(planReg, plan26); // plan original congelado: ecommerce 40M, app 30M, whatsapp 20M, llamadas 10M
    const planMap = PL.planValuesMap(planV);
    /** Real = plan × factor por canal, hasta `until`. */
    function actualStore(factors, until = '2026-09-22') {
      const store = ST.createStore();
      planMap.forEach((v, k) => {
        const [date, ch] = k.split('|');
        if (date > until || factors[ch] === undefined) return;
        const f = factors[ch];
        store.actual.records.push({ key: `${date}|${ch}|actual`, dataType: 'actual', date, channel: ch, dayType: 'regular',
          holiday: null, event: null, season: null, notes: null,
          metrics: { revenue: obs(Math.round(v.revenue * f * 100) / 100), orders: obs(Math.round(v.orders * f)), trafficVolume: obs(v.trafficVolume),
            conversionRate: { value: null, source: 'missing' }, aov: { value: null, source: 'missing' } },
          status: 'valid', issueCounts: { error: 0, warning: 0 }, provenance: { batchId: 'b', fileName: 'synth', row: 1 } });
      });
      return store;
    }
    const all = { ecommerce: 0.9, app: 1, whatsapp: 1.05, llamadas: 1 };
    const run3 = (store, settings = {}) => FE.runForecast({ year: 2026, store, planVersion: planV,
      settings: { referenceDate: '2026-09-22', todayStatus: 'completed', ...settings } });
    const runA = run3(actualStore(all));
    const runB = run3(actualStore(all), { method: 'B' });
    const approx = (a, b, t = 0.005) => a !== null && b !== null && Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

    test('Fase 3: gap', 'Caso 1: plan = actual → gap 0, cumplimiento 100 %', () => {
      const g = GAP.calculateGap(100, 100); return g.gap === 0 && g.compliance === 1;
    });
    test('Fase 3: gap', 'Caso 2: actual debajo → gap −10, cumplimiento 90 %', () => {
      const g = GAP.calculateGap(100, 90); return g.gap === -10 && near(g.compliance, 0.9) && near(g.gapPct, -0.1);
    });
    test('Fase 3: gap', 'Caso 3: actual arriba → gap +10, cumplimiento 110 %', () => {
      const g = GAP.calculateGap(100, 110); return g.gap === 10 && near(g.compliance, 1.1);
    });
    test('Fase 3: periodos', 'Caso 4: mes cerrado → forecast = actual', () => {
      const jan = runB.channels.ecommerce.months[0];
      return jan.status === 'closed' && jan.forecast.revenue === jan.actualToDate.revenue && approx(jan.actualToDate.revenue, jan.plan.revenue * 0.9);
    });
    test('Fase 3: periodos', 'Caso 5: mes futuro → forecast = plan × índice (con su estacionalidad)', () => {
      const nov = runB.channels.ecommerce.months[10];
      const novA = runA.channels.ecommerce.months[10];
      return nov.status === 'future' && nov.countedDays === 0 && approx(nov.forecast.revenue, nov.plan.revenue * 0.9) &&
        approx(novA.forecast.revenue, novA.plan.revenue);
    });
    test('Fase 3: periodos', 'Caso 6: mes actual = actual acumulado + forecast restante', () => {
      const sep = runB.channels.ecommerce.months[8];
      const rest = runB.channels.ecommerce.days.filter((d) => d.month === '2026-09' && !d.counted).reduce((a, d) => a + d.forecast.revenue, 0);
      return sep.status === 'current' && sep.countedDays === 22 && approx(sep.forecast.revenue, sep.actualToDate.revenue + rest, 1e-9);
    });
    test('Fase 3: canales', 'Caso 7: el forecast de Ecommerce no modifica App', () => {
      const other = run3(actualStore({ ...all, ecommerce: 0.5 }), { method: 'B' });
      return other.channels.app.annual.forecast.revenue === runB.channels.app.annual.forecast.revenue &&
        other.channels.ecommerce.annual.forecast.revenue < runB.channels.ecommerce.annual.forecast.revenue;
    });
    test('Fase 3: robustez', 'Caso 8: división entre cero sin NaN ni Infinity', () => {
      const g = GAP.calculateGap(0, 50);
      let bad = 0;
      const walk = (o) => { if (typeof o === 'number' && !Number.isFinite(o)) bad++; else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
      walk(runA.total.annual); walk(runA.channels.ecommerce.months); walk(runA.channels.ecommerce.indices);
      return g.gapPct === null && g.compliance === null && bad === 0;
    });
    test('Fase 3: datos faltantes', 'Caso 9: sin real → datos insuficientes, no cero', () => {
      const r = run3(ST.createStore(), { method: 'B' });
      const d = r.channels.ecommerce.days.find((x) => x.date === '2026-09-10');
      return d.status === 'insufficient_data' && d.actual === null && r.channels.ecommerce.indices.ytd.revenue.value === null &&
        r.channels.ecommerce.indices.ytd.revenue.status === 'insufficient_data' && GAP.pacingStatus(null) === 'insufficient_data';
    });
    test('Fase 3: integridad', 'Caso 10: correr el forecast no modifica el plan', () => {
      const before = JSON.stringify(planV);
      const r = run3(actualStore({ ecommerce: 0.95, app: 0.95, whatsapp: 0.95, llamadas: 0.95 }), { method: 'B' });
      return JSON.stringify(planV) === before && cents(r.total.annual.plan.revenue) === cents(100000000) &&
        cents(r.total.annual.forecast.revenue) !== cents(100000000);
    });
    test('Fase 3: pacing', 'El acumulado usa el plan diario ponderado, no días ÷ días', () => {
      const sep = runA.channels.ecommerce.months[8];
      const days = runA.channels.ecommerce.days.filter((d) => d.month === '2026-09' && d.counted);
      const weighted = days.reduce((a, d) => a + d.plan.revenue, 0);
      const uniform = sep.plan.revenue * 22 / 30;
      return approx(sep.planToDate.revenue, weighted, 1e-9) && Math.abs(weighted - uniform) > 1;
    });
    test('Fase 3: índices', 'Índices por ventana: acumulado y recientes por separado', () => {
      const ix = runA.channels.ecommerce.indices;
      return ['ytd', 'month', 'last7', 'last14', 'last28'].every((w) => approx(ix[w].revenue.value, 0.9));
    });
    test('Fase 3: drivers', 'Método D: venta = volumen × CR × AOV en días futuros', () => {
      const r = run3(actualStore(all), { method: 'D' });
      return r.channels.whatsapp.days.filter((d) => !d.counted).every((d) =>
        approx(d.forecast.revenue, d.forecast.trafficVolume * d.forecast.conversionRate * d.forecast.aov, 1e-6));
    });
    test('Fase 3: versionado', 'Cada snapshot es una versión nueva e inmutable', () => {
      const reg = FV.createForecastRegistry(2026);
      const v1 = FV.createSnapshot(reg, runA);
      const v2 = FV.createSnapshot(reg, runB);
      const ch = FV.forecastChange(reg, runB);
      return v1.forecastVersion === 'v1' && v2.forecastVersion === 'v2' && Object.isFrozen(v1) && reg.versions.length === 2 &&
        v1.referenceDate === '2026-09-22' && ch.total && ch.total.previous !== undefined;
    });

    /* ---------------- Fase 4: reforecast ---------------- */
    const RF = FP.reforecastEngine, RV = FP.reforecastVersioning;
    const rf4 = (store, settings = {}, fcSettings = {}) => RF.runReforecast({ run: run3(store, fcSettings), planVersion: planV, store, settings });
    const mixed = { ecommerce: 0.9, app: 1.1, whatsapp: 1, llamadas: 1 };
    const rfYear = rf4(actualStore(mixed));

    test('Fase 4: pendiente', 'Test 1: meta $100M, actual $60M → pendiente $40M', () => {
      const r = RF.calculateRemaining(100000000, 60000000); return r.remaining === 40000000 && r.surplus === 0 && r.met === false;
    });
    test('Fase 4: redistribución', 'Test 2: pesos 20/30/50 % de $40M → 8M, 12M, 20M', () => {
      const r = RF.generateReforecast({ target: 100000000, accumulated: 60000000,
        futureDays: [{ date: 'a', futureWeight: 0.2 }, { date: 'b', futureWeight: 0.3 }, { date: 'c', futureWeight: 0.5 }] });
      return r.reforecastDays.map((d) => d.reforecast).join() === '8000000,12000000,20000000' && r.method === 'future_weighted_distribution';
    });
    test('Fase 4: pendiente', 'Test 3: meta alcanzada → pendiente 0', () => {
      const r = RF.calculateRemaining(100000000, 100000000); return r.remaining === 0 && r.surplus === 0 && r.met === true;
    });
    test('Fase 4: pendiente', 'Test 4: meta superada → pendiente 0 y surplus $5M', () => {
      const r = RF.calculateRemaining(100000000, 105000000); return r.remaining === 0 && r.surplus === 5000000;
    });
    test('Fase 4: pesos', 'Test 5: sin pesos → fallback uniforme y confianza limitada', () => {
      const r = RF.generateReforecast({ target: 90, accumulated: 0, futureDays: [{ date: 'a', futureWeight: null }, { date: 'b', futureWeight: 0 }, { date: 'c' }] });
      return r.method === 'uniform_future_distribution' && r.confidence === 'limited' && r.reforecastDays.every((d) => d.reforecast === 30);
    });
    test('Fase 4: canales', 'Test 6: un canal debajo y otro arriba, cálculos independientes', () => {
      const other = rf4(actualStore({ ...mixed, ecommerce: 0.5 }));
      const e = rfYear.channels.ecommerce.horizon, a = rfYear.channels.app.horizon;
      return e.remaining > 0 && a.remaining < rfYear.channels.app.days.filter((d) => !d.closed).reduce((x, d) => x + d.plan.revenue, 0) &&
        other.channels.app.horizon.remaining === a.remaining && other.channels.ecommerce.horizon.remaining > e.remaining;
    });
    test('Fase 4: actualización', 'Test 7: nuevo real actualiza el reforecast y el plan no cambia', () => {
      const before = JSON.stringify(planV);
      const r1 = rf4(actualStore(mixed, '2026-09-21'), {}, { referenceDate: '2026-09-21' });
      const r2 = rf4(actualStore(mixed, '2026-09-22'), {}, { referenceDate: '2026-09-22' });
      return r1.channels.ecommerce.horizon.remaining !== r2.channels.ecommerce.horizon.remaining &&
        r2.channels.ecommerce.days.find((d) => d.date === '2026-09-22').kind === 'actual' && JSON.stringify(planV) === before;
    });
    test('Fase 4: versionado', 'Test 8: rf_v1, rf_v2, rf_v3 sin sobrescribir', () => {
      const reg = RV.createReforecastRegistry(2026);
      const v1 = RV.createSnapshot(reg, rfYear), v2 = RV.createSnapshot(reg, rfYear), v3 = RV.createSnapshot(reg, rf4(actualStore(mixed), { horizon: 'month' }));
      const evo = RV.evolution(reg);
      return [v1, v2, v3].map((v) => v.reforecastVersion).join() === 'rf_v1,rf_v2,rf_v3' && Object.isFrozen(v1) &&
        reg.versions[0] === v1 && evo.length === 3 && evo[2].change !== null && evo[0].change === null;
    });
    test('Fase 4: día parcial', 'Test 9: día en curso no se congela: recibe requerimiento y su parcial no se descuenta', () => {
      const store = actualStore(mixed, '2026-09-22');
      const r = rf4(store, {}, { referenceDate: '2026-09-22', todayStatus: 'in_progress' });
      const d = r.channels.ecommerce.days.find((x) => x.date === '2026-09-22');
      return d.kind === 'required' && !d.closed && d.partialActual !== null && r.channels.ecommerce.horizon.countedDays === 264;
    });
    test('Fase 4: periodos', 'Test 10: mes cerrado → reforecast = actual', () =>
      ['year', 'month'].every((hz) => {
        const r = hz === 'year' ? rfYear : rf4(actualStore(mixed), { horizon: 'month' });
        const jan = r.channels.ecommerce.months[0];
        return jan.status === 'closed' && cents(jan.reforecast.revenue) === cents(jan.actualToDate.revenue);
      }));
    test('Fase 4: cierre', 'Actual + reforecast restante = meta original (año y mes, exacto al centavo)', () => {
      const m = rf4(actualStore(mixed), { horizon: 'month' });
      const okY = C.channelIds.every((ch) => { const h = rfYear.channels[ch].horizon;
        return cents(rfYear.channels[ch].annual.reforecast.revenue) === cents(Math.max(h.target, h.actualToDate)) && h.closes === true; });
      const sep = m.channels.ecommerce.months[8];
      const future = m.channels.ecommerce.months[10];
      return okY && cents(sep.reforecast.revenue) === cents(sep.plan.revenue) && cents(future.reforecast.revenue) === cents(future.plan.revenue) &&
        rfYear.validation.closed && m.validation.closed;
    });
    test('Fase 4: surplus', 'Canal arriba de la meta: requerido 0, surplus registrado, días futuros conservados', () => {
      const r = rf4(actualStore({ ...mixed, llamadas: 1.6 }));
      const h = r.channels.llamadas.horizon;
      const fut = r.channels.llamadas.days.filter((d) => !d.closed);
      return h.met && h.remaining === 0 && h.surplus > 0 && fut.length === 100 && fut.every((d) => d.required && d.required.revenue === 0);
    });
    test('Fase 4: drivers', 'Venta → pedidos (÷ AOV) → volumen (÷ CR) y escenarios coherentes', () => {
      const d = rfYear.channels.ecommerce.drivers;
      const ch = d.chain;
      const f = d.forecast;
      return approx(ch.orders * ch.aov, ch.revenue, 1e-9) && approx(ch.trafficVolume * ch.conversionRate, ch.orders, 1e-9) &&
        approx(d.scenarios.A.required * f.conversionRate * f.aov, ch.revenue, 1e-9) &&
        approx(f.trafficVolume * d.scenarios.B.required * f.aov, ch.revenue, 1e-9) &&
        approx(f.trafficVolume * f.conversionRate * d.scenarios.C.required, ch.revenue, 1e-9);
    });
    test('Fase 4: pesos', 'Peso futuro 0 no recibe dinero salvo mínimo explícito', () => {
      const a = RF.redistribute(100, [1, 0, 1]), b = RF.redistribute(100, [1, 0, 1], { zeroWeightFloor: 0.5 });
      return a.amounts.join() === '50,0,50' && b.amounts[1] > 0 && cents(b.amounts.reduce((x, y) => x + y, 0)) === 10000;
    });

    /* ---------------- Fase 5: diagnóstico ---------------- */
    const AT = FP.attribution, DX = FP.driverEngine, DG = FP.diagnosticEngine, SG = FP.signalEngine, HY = FP.hypothesisEngine, CO = FP.cohereDiagnostic;
    const blk = (t, o, r, extra = {}) => ({ trafficVolume: t, orders: o, revenue: r, conversionRate: o / t, aov: r / o, ...extra });
    const mkPairs = (n, cur, base, extra = {}) => Array.from({ length: n }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, baselineDate: `2026-09-${String(i + 1).padStart(2, '0')}`,
      channel: 'ecommerce', current: cur, baseline: base, tag: null, weekKey: '2026-W37', dayOfWeekIndex: (i % 7) + 1, ...extra }));
    const runD = run3(actualStore(mixed));
    const rfD = RF.runReforecast({ run: runD, planVersion: planV, store: actualStore(mixed) });
    const diagArgs = { comparison: 'actual_vs_plan', channel: 'total', period: { type: 'month', key: '2026-09' }, run: runD, rf: rfD, store: actualStore(mixed) };

    test('Fase 5: identidad', 'Test 1: venta = volumen × CR × AOV', () => {
      const a = DX.aggregate([blk(1000, 20, 20000), blk(500, 12, 11000)]);
      return near(a.trafficVolume * a.conversionRate * a.aov, a.revenue) && a.revenue === 31000;
    });
    test('Fase 5: brecha', 'Test 2: actual − plan = brecha', () => {
      const l1 = DX.level1(mkPairs(10, blk(900, 16.2, 15390), blk(1000, 20, 20000)));
      return near(l1.gap.abs, 10 * (15390 - 20000)) && near(l1.gap.pct, 15390 / 20000 - 1);
    });
    test('Fase 5: atribución', 'Test 3: Σ contribuciones = brecha (secuencial y Shapley)', () => {
      const b = { trafficVolume: 1000, conversionRate: 0.02, aov: 1000 }, c = { trafficVolume: 900, conversionRate: 0.018, aov: 950 };
      const sq = AT.attribute(b, c, { method: 'sequential' }), sh = AT.attribute(b, c, { method: 'shapley' });
      const sum = (a) => Object.values(a.contributions).reduce((x, y) => x + y, 0);
      return sq.closes && sh.closes && near(sum(sq), -4610) && near(sum(sh), -4610) && sq.contributions.trafficVolume === -2000;
    });
    test('Fase 5: drivers', 'Test 4: un driver positivo aparece como offset', () => {
      const l1 = DX.level1(mkPairs(10, blk(800, 18, 18000), blk(1000, 20, 20000))); // volumen −20 %, CR +12.5 %
      return l1.positives.some((d) => d.driver === 'conversionRate') && l1.drivers.find((d) => d.driver === 'conversionRate').contribution > 0;
    });
    test('Fase 5: drivers', 'Test 5: un driver negativo aparece como contribución negativa', () => {
      const l1 = DX.level1(mkPairs(10, blk(800, 18, 18000), blk(1000, 20, 20000)));
      return l1.negatives.some((d) => d.driver === 'trafficVolume') && l1.mainDriver === 'trafficVolume' && /mayor contribución matemática/.test(l1.statement);
    });
    test('Fase 5: señales', 'Test 6: AOV como driver principal y caída de clientes nuevos, ambos visibles', () => {
      const pNew = mkPairs(10, blk(385, 7.7, 6776, { newCustomers: 70 }), blk(450, 9, 8100, { newCustomers: 85 }), { seg: 'new' });
      const pRet = mkPairs(10, blk(605, 12.1, 10648, { newCustomers: 0 }), blk(550, 11, 11000, { newCustomers: 0 }), { seg: 'returning' });
      const all = [...pNew, ...pRet];
      const l1 = DX.level1(all);
      const groups = DX.groupLevel(all, (p) => p.seg, (k) => (k === 'new' ? 'Nuevo' : 'Recurrente'), { metric: 'revenue', method: 'sequential', parent: l1 });
      const sigs = SG.detectSignals({ level1: l1, dims: [{ dimension: 'customer_type', label: 'Tipo de cliente', source: 'segments', reference: 'same', groups, mix: null }], pairs: all });
      const hyps = HY.generateHypotheses({ level1: l1, signals: sigs });
      return l1.mainDriver === 'aov' && sigs.some((s) => s.metric === 'newCustomers' && s.direction === 'deterioration') &&
        hyps.some((h) => h.driver === 'aov') && hyps.some((h) => /clientes nuevos/i.test(h.hypothesis));
    });
    const diagNoSeg = DG.runDiagnostic(diagArgs);
    test('Fase 5: datos faltantes', 'Test 7: no se crean dimensiones que no existen en los datos', () =>
      diagNoSeg.status === 'ok' && !diagNoSeg.level2.some((d) => d.source === 'segments') &&
      diagNoSeg.availability.unavailable.some((d) => d.dimension === 'device') &&
      !diagNoSeg.hypotheses.some((h) => /dispositivo|mobile|nuevo/i.test(h.hypothesis)));
    test('Fase 5: IA', 'Test 8: sin Cohere el diagnóstico matemático sigue completo', () => {
      const pr = CO.generateWithCohere(diagNoSeg, { apiKey: '' });
      return typeof pr.then === 'function' && diagNoSeg.level1Drivers.length === 3 && diagNoSeg.hypotheses.every((h) => h.source === 'rules');
    });
    test('Fase 5: IA', 'Test 9: JSON inválido o con señales inventadas no rompe nada', () => {
      const ids = new Set(['s1', 's2']);
      const a = CO.parseAndValidate('esto no es json', ids);
      const b = CO.parseAndValidate('{"hypotheses":[{"id":"x","hypothesis":"H","priority":"altísima","justification":"","relatedSignals":["s9"],"mechanism":"","investigation":[]}]}', ids);
      const c = CO.parseAndValidate('{"hypotheses":[{"id":"x","hypothesis":"H","priority":"HIGH","justification":"","relatedSignals":["s1","s9"],"mechanism":"m","investigation":["v"]}]}', ids);
      return !a.ok && !b.ok && c.ok && c.hypotheses[0].relatedSignals.join() === 's1' && c.hypotheses[0].priority === 'high';
    });
    test('Fase 5: integridad', 'Test 10: el diagnóstico no modifica plan, actual, forecast ni reforecast', () => {
      const snap = [JSON.stringify(planV), JSON.stringify(runD.channels.ecommerce.months), JSON.stringify(rfD.channels.app.annual)];
      ['actual_vs_plan', 'forecast_vs_plan', 'actual_vs_previous', 'actual_vs_yoy', 'reforecast_vs_forecast'].forEach((c) =>
        DG.runDiagnostic({ ...diagArgs, comparison: c, period: { type: 'year', key: '2026' } }));
      return snap[0] === JSON.stringify(planV) && snap[1] === JSON.stringify(runD.channels.ecommerce.months) && snap[2] === JSON.stringify(rfD.channels.app.annual);
    });
    test('Fase 5: relevancia', 'Caída grande en segmento chico pesa menos que caída moderada en segmento grande', () => {
      const small = mkPairs(10, blk(50, 1, 500), blk(100, 2, 1000), { seg: 'a' });            // ~1 % de la base, −50 %
      const big = mkPairs(10, blk(2850, 57, 57000), blk(3000, 60, 60000), { seg: 'b' });     // ~60 % de la base, −5 %
      const flat = mkPairs(10, blk(1950, 39, 39000), blk(1950, 39, 39000), { seg: 'c' });
      const all = [...small, ...big, ...flat];
      const l1 = DX.level1(all);
      const groups = DX.groupLevel(all, (p) => p.seg, (k) => k, { metric: 'revenue', method: 'sequential', parent: l1 });
      const sigs = SG.detectSignals({ level1: l1, dims: [{ dimension: 'source', label: 'Fuente', source: 'segments', reference: 'same', groups, mix: null }], pairs: all, settings: { signals: { minExposure: 0 } } });
      const a = sigs.find((s) => s.value === 'a' && s.metric === 'revenue'), b = sigs.find((s) => s.value === 'b' && s.metric === 'revenue');
      return a && b && a.deltaPct < b.deltaPct && b.relevance.score > a.relevance.score;
    });
    test('Fase 5: hipótesis', 'Sin señales localizadas la hipótesis de CR es genérica (no nombra causas)', () => {
      const l1 = DX.level1(mkPairs(10, blk(1000, 16, 16000), blk(1000, 20, 20000)));
      const sigs = SG.detectSignals({ level1: l1, dims: [], pairs: mkPairs(10, blk(1000, 16, 16000), blk(1000, 20, 20000)) });
      const h = HY.generateHypotheses({ level1: l1, signals: sigs });
      return h.length === 1 && /requiere localizarse/.test(h[0].hypothesis) && !/checkout/i.test(h[0].hypothesis) && h[0].status === 'requires_investigation';
    });

    /* ---------------- Fase 6: escenarios, recuperación y acciones ---------------- */
    const SE = FP.scenarioEngine, RE = FP.recoveryEngine, AP = FP.actionPlan, ATK = FP.actionTracking;
    const st6 = actualStore({ ecommerce: 0.9, app: 1, whatsapp: 1, llamadas: 0.95 });
    const run6 = run3(st6);
    const rf6 = RF.runReforecast({ run: run6, planVersion: planV, store: st6 });
    const ctxE = SE.buildContext({ run: run6, rf: rf6, channel: 'ecommerce', period: { type: 'year', key: '2026' }, store: st6 });
    const editableDays = (r, ch = 'ecommerce') => r.byChannel[ch].days.filter((d) => d.editable && d.base);
    const perDay = (r, fn) => editableDays(r).every((d) => fn(d.base, d.scenario));

    test('Fase 6: escenarios', 'Escenario de volumen: venta = volumen × CR × AOV', () => {
      const r = SE.simulate(ctxE, { changes: { trafficPct: 0.1 } });
      return r.valid && perDay(r, (b, x) => approx(x.revenue, x.trafficVolume * x.conversionRate * x.aov, 1e-9) && approx(x.revenue, b.revenue * 1.1, 1e-9));
    });
    test('Fase 6: escenarios', 'Escenario de CR (+0.10 pp): suben pedidos y venta, no el volumen', () => {
      const r = SE.simulate(ctxE, { changes: { crMode: 'pp', crValue: 0.001 } });
      return r.valid && perDay(r, (b, x) => approx(x.orders - b.orders, b.trafficVolume * 0.001, 1e-6) && approx(x.revenue - b.revenue, b.trafficVolume * 0.001 * b.aov, 1e-6) &&
        approx(x.trafficVolume, b.trafficVolume, 1e-12)) && r.incremental.orders > 0;
    });
    test('Fase 6: escenarios', 'Escenario de AOV (+5 %): sube la venta, pedidos iguales', () => {
      const r = SE.simulate(ctxE, { changes: { aovMode: 'pct', aovValue: 0.05 } });
      return r.valid && perDay(r, (b, x) => approx(x.revenue, b.revenue * 1.05, 1e-9) && approx(x.orders, b.orders, 1e-9));
    });
    test('Fase 6: escenarios', 'Escenario combinado aplica los tres cambios', () => {
      const r = SE.simulate(ctxE, { changes: { trafficPct: 0.05, crMode: 'pp', crValue: 0.001, aovMode: 'pct', aovValue: 0.03 } });
      return r.valid && perDay(r, (b, x) => approx(x.revenue, b.trafficVolume * 1.05 * (b.conversionRate + 0.001) * b.aov * 1.03, 1e-9));
    });
    test('Fase 6: recuperación', 'gapBefore − venta incremental = gapAfter', () => {
      const r = SE.simulate(ctxE, { changes: { crMode: 'pp', crValue: 0.0005 } });
      return r.valid && r.gap.gapBefore > 0 && approx(r.gap.gapBefore - r.incremental.revenue, r.gap.gapAfter, 1e-9) &&
        approx(r.gap.recoveryPercent, r.incremental.revenue / r.gap.gapBefore, 1e-12);
    });
    test('Fase 6: recuperación', 'Cálculo inverso: cada alternativa recupera el objetivo', () => {
      const ro = RE.recoveryOptions(ctxE, { targetPct: 0.5 });
      return ro.ok && ro.alternatives.length === 7 && ro.alternatives.every((a) => a.feasible && approx(a.simulated.recoveryPercent, 0.5, 1e-6));
    });
    test('Fase 6: canales', 'Un escenario de App no modifica Ecommerce', () => {
      const ctxA = SE.buildContext({ run: run6, rf: rf6, channel: 'app', period: { type: 'month', key: '2026-10' } });
      const r = SE.simulate(ctxA, { changes: { crMode: 'pp', crValue: 0.002 } });
      return r.valid && Object.keys(r.byChannel).join() === 'app' && approx(r.digital.incremental.revenue, r.incremental.revenue, 1e-9) &&
        cents(r.digital.base.revenue - r.base.revenue) === cents(r.digital.scenario.revenue - r.scenario.revenue);
    });
    test('Fase 6: integridad', 'Escenarios, acciones y mediciones no modifican plan, forecast ni reforecast', () => {
      const snap = [JSON.stringify(planV), JSON.stringify(run6.channels.ecommerce.months), JSON.stringify(rf6.channels.ecommerce.annual), JSON.stringify(st6.actual.records.length)];
      const store = SE.createScenarioStore(2026);
      const r = SE.simulate(ctxE, { changes: { trafficPct: 0.2, crMode: 'pp', crValue: 0.002 } });
      const sc = SE.saveScenario(store, { ctx: ctxE, result: r, name: 't', links: { hypothesisId: 'h1', hypothesis: 'x' } });
      const plan = AP.createPlan(2026);
      const a = AP.createAction(plan, { title: 'A', scenarioId: sc.scenarioId, hypothesisId: 'h1', driver: 'conversionRate', channel: 'ecommerce' });
      ATK.recordMeasurement(plan, { actionId: a.actionId, scenarios: store.scenarios, store: st6, run: run6 });
      RE.runRecoveryAnalysis({ ctx: ctxE, scenarioStore: store, actionPlan: plan });
      return snap.join('|') === [JSON.stringify(planV), JSON.stringify(run6.channels.ecommerce.months), JSON.stringify(rf6.channels.ecommerce.annual), JSON.stringify(st6.actual.records.length)].join('|');
    });
    test('Fase 6: datos faltantes', 'No se simulan variables ni segmentos inexistentes', () => {
      const r = SE.simulate(ctxE, { changes: { crMode: 'pp', crValue: 0.001 }, target: { type: 'segment', dimension: 'device', segment: 'mobile' } });
      const noCR = SE.applyChanges({ revenue: 100, orders: 1, trafficVolume: null, conversionRate: null, aov: 100 }, { crMode: 'pp', crValue: 0.001 });
      return !r.valid && SE.availableTargets(ctxE).length === 0 && noCR === null;
    });
    test('Fase 6: validación', 'Rechaza CR > 100 %, negativos, NaN e Infinity', () => {
      const bad = [{ crMode: 'pp', crValue: 1.5 }, { trafficPct: -2 }, { trafficPct: NaN }, { aovMode: 'pct', aovValue: Infinity }, { crMode: 'pp', crValue: 0.99 }];
      return bad.every((c) => !SE.simulate(ctxE, { changes: c }).valid);
    });
    test('Fase 6: validación', 'Restricciones: el exceso se advierte', () => {
      const r = SE.simulate(ctxE, { changes: { crMode: 'pp', crValue: 0.005 }, constraints: { maxCRIncrease: 0.002 } });
      return r.valid && r.warnings.some((w) => /restricción/.test(w));
    });
    test('Fase 6: IA', 'Falla o JSON inválido de Cohere no rompe el módulo', () => {
      const pr = FP.cohereActions.suggestActions({ hypothesis: { id: 'h1', hypothesis: 'x', driver: 'conversionRate' } }, { apiKey: '' });
      const a = FP.cohereActions.parseAndValidate('no es json', { knownSignals: new Set(['s1']) });
      const b = FP.cohereActions.parseAndValidate('{"actions":[{"actionId":"ai_1","action":"Revisar","rationale":"r","relatedDriver":"precio","relatedSignals":[],"informationNeeded":[]},{"actionId":"ai_2","action":"Auditar checkout","rationale":"r","relatedDriver":"conversionRate","relatedSignals":["s1","s9"],"informationNeeded":["funnel"]}]}', { knownSignals: new Set(['s1']) });
      return typeof pr.then === 'function' && !a.ok && b.ok && b.actions.length === 1 && b.actions[0].relatedSignals.join() === 's1';
    });
    test('Fase 6: persistencia', 'Escenarios se guardan, se recuperan y editar crea versión nueva', () => {
      const store = SE.createScenarioStore(2026);
      const r = SE.simulate(ctxE, { changes: { trafficPct: 0.03 } });
      const v1 = SE.saveScenario(store, { ctx: ctxE, result: r, name: 'Tráfico', type: 'conservative' });
      const v2 = SE.saveScenario(store, { ctx: ctxE, result: SE.simulate(ctxE, { changes: { trafficPct: 0.05 } }), name: 'Tráfico', supersedes: v1.scenarioId });
      const back = SE.hydrateScenarioStore(JSON.parse(JSON.stringify(store)), 2026);
      return v1.scenarioId === 'SC_001_v1' && v2.scenarioId === 'SC_001_v2' && v2.supersedes === 'SC_001_v1' && Object.isFrozen(back.scenarios[0]) &&
        JSON.stringify(back.scenarios) === JSON.stringify(store.scenarios) && back.scenarios[0].inputs.trafficPct === 0.03;
    });
    test('Fase 6: seguimiento', 'Medición guarda baseline, escenario y observado sin afirmar causalidad', () => {
      const early = SE.buildContext({ run: run3(st6, { referenceDate: '2026-09-15' }), channel: 'ecommerce', period: { type: 'month', key: '2026-09' } });
      const store = SE.createScenarioStore(2026);
      const sc = SE.saveScenario(store, { ctx: early, result: SE.simulate(early, { changes: { crMode: 'pp', crValue: 0.001 } }), links: { hypothesisId: 'h1', driver: 'conversionRate' } });
      const plan = AP.createPlan(2026);
      const a = AP.createAction(plan, { title: 'A', scenarioId: sc.scenarioId, hypothesisId: 'h1', driver: 'conversionRate', channel: 'ecommerce', startDate: '2026-09-16', endDate: '2026-09-22' });
      AP.updateAction(plan, a.actionId, { status: 'measuring' });
      const m = ATK.recordMeasurement(plan, { actionId: a.actionId, scenarios: store.scenarios, store: st6, run: run6 }).measurement;
      return m.observedDays === 7 && m.baseline && m.scenario && m.actual && m.consistency === 'not_consistent' &&
        !/caus/i.test(m.statement) && a.history.length === 2 && plan.measurements.length === 1 && !AP.updateAction(plan, a.actionId, { status: 'ganadora' }).ok;
    });

    /* ---------------- Fase 7: guía, navegación y contexto (presentación) ---------------- */
    const GC = FP.guidanceConfig, CE = FP.contextEngine;
    const deepFreeze7 = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze7(v); }); return Object.freeze(o); };
    const baseStatus = (o = {}) => deepFreeze7({
      currentModule: 'inicio', channel: 'total', period: null,
      data: { historical: 0, plan: 0, actual: 0, segments: 0, quality: 'empty', qualityText: null },
      targets: { defined: false }, plan: { original: false, imported: false },
      actual: { countedDays: 0 }, forecast: { available: false }, reforecast: { available: false },
      diagnostic: { visited: false, hypotheses: null }, scenarios: { count: 0, withHypothesis: 0 },
      actions: { count: 0, open: 0, withoutMeasurement: 0 }, measurements: { count: 0 }, visited: {}, ...o
    });
    const withData = { data: { historical: 700, plan: 0, actual: 88, segments: 0, quality: 'warnings', qualityText: 'Datos con advertencias' } };
    const fcGap = { available: true, compliance: 0.93, gapToDate: -100, gapToDatePct: -0.068, forecastGap: -50, forecastGapPct: -0.042 };

    test('Fase 7: navegación', 'Cada vista pertenece a un grupo y los grupos cubren todas las vistas', () => {
      const appViews = ['resumen', 'carga', 'calidad', 'datos', 'estacionalidad', 'plan', 'configuracion', 'pacing', 'reforecast', 'diagnostico', 'recovery', 'inicio', 'medir'];
      const inGroups = GC.GROUPS.flatMap((g) => g.views);
      return appViews.every((v) => inGroups.filter((x) => x === v).length === 1 && GC.VIEWS[v]) &&
        ['planear', 'monitorear', 'diagnosticar', 'recuperar', 'medir'].every((id) => GC.GROUPS.some((g) => g.id === id)) &&
        CE.breadcrumbs('pacing').join(' › ') === 'Inicio › Monitorear › Pacing & Forecast';
    });
    test('Fase 7: siguiente paso', 'Sin hipótesis no se sugiere simular: primero buscar evidencia', () => {
      const st = { ...withData, targets: { defined: true }, plan: { original: true }, actual: { countedDays: 265 }, forecast: fcGap, visited: { pacing: true, diagnostico: true } };
      return CE.getNextStep(baseStatus({ ...st, diagnostic: { visited: true, hypotheses: 0 } })).id === 'more_evidence' &&
        CE.getNextStep(baseStatus({ ...st, diagnostic: { visited: true, hypotheses: 2 } })).id === 'simulate';
    });
    test('Fase 7: siguiente paso', 'Orden determinista: datos → meta → plan → real → pacing → drivers → escenario → acción → medición', () => {
      const seq = [
        [baseStatus(), 'load_data'],
        [baseStatus(withData), 'set_targets'],
        [baseStatus({ ...withData, targets: { defined: true } }), 'build_plan'],
        [baseStatus({ ...withData, targets: { defined: true }, plan: { original: true } }), 'load_actual'],
        [baseStatus({ ...withData, targets: { defined: true }, plan: { original: true }, actual: { countedDays: 265 }, forecast: fcGap }), 'review_pacing'],
        [baseStatus({ ...withData, targets: { defined: true }, plan: { original: true }, actual: { countedDays: 265 }, forecast: fcGap, visited: { pacing: true } }), 'review_drivers'],
        [baseStatus({ ...withData, targets: { defined: true }, plan: { original: true }, actual: { countedDays: 265 }, forecast: fcGap, visited: { pacing: true, diagnostico: true } }), 'simulate'],
        [baseStatus({ ...withData, targets: { defined: true }, plan: { original: true }, actual: { countedDays: 265 }, forecast: fcGap, visited: { pacing: true, diagnostico: true }, scenarios: { count: 1, withHypothesis: 1 } }), 'plan_action'],
        [baseStatus({ ...withData, targets: { defined: true }, plan: { original: true }, actual: { countedDays: 265 }, forecast: fcGap, visited: { pacing: true, diagnostico: true }, scenarios: { count: 1, withHypothesis: 1 }, actions: { count: 1, open: 1, withoutMeasurement: 1 } }), 'measure'],
        [baseStatus({ ...withData, data: { ...withData.data, quality: 'invalid' } }), 'fix_quality']
      ];
      return seq.every(([st, id]) => CE.getNextStep(st).id === id);
    });
    test('Fase 7: contexto', 'Maneja estados vacíos, no muta el estado y no inventa scores', () => {
      const st = baseStatus({ ...withData, targets: { defined: true }, plan: { original: true }, actual: { countedDays: 265 }, forecast: fcGap,
        reforecast: { available: true, pressure: 0.141 } });
      const before = JSON.stringify(st);
      const d = CE.describe('pacing', st);
      const h = CE.headline(st);
      const empty = CE.describe('inicio', baseStatus());
      const keys = ['whereAmI', 'whatAmISeeing', 'whatDoesItMean', 'whatShouldIInvestigate', 'nextStep', 'availableActions'];
      return JSON.stringify(st) === before && keys.every((k) => k in d && k in empty) &&
        h.some((x) => x.includes('6.8 %') && x.includes('por debajo')) && h.some((x) => x.includes('4.2 %')) && h.some((x) => x.includes('14.1 %')) &&
        !h.join(' ').match(/\/100|score|salud/i) && CE.requirements('pacing', baseStatus()).every((r) => !r.done && r.view);
    });
    test('Fase 7: ayuda', 'Glosario mínimo y métricas con explicación y fórmula', () => {
      const need = ['revenue', 'orders', 'trafficVolume', 'conversionRate', 'aov', 'plan', 'actual', 'forecast', 'reforecast', 'gap', 'pacing',
        'driver', 'senal', 'hipotesis', 'escenario', 'accion', 'impactoEsperado', 'impactoObservado', 'baseline', 'recoveryPressure'];
      const byId = (id) => GC.HELP.find((e) => e.id === id);
      const fields = ['id', 'title', 'shortDescription', 'detailedDescription', 'howToRead', 'formula', 'interpretation', 'caveats', 'nextStep'];
      return need.every((id) => byId(id) && byId(id).glossary) && C.metricKeys.every((k) => byId(k).formula && byId(k).caveats) &&
        GC.HELP.every((e) => fields.every((f) => f in e)) && /No demuestra/.test(byId('conversionRate').caveats);
    });
    test('Fase 7: ayuda', 'Forecast y reforecast están diferenciados (el reforecast no es un pronóstico)', () => {
      const f = GC.HELP.find((e) => e.id === 'forecast'), r = GC.HELP.find((e) => e.id === 'reforecast');
      return f.shortDescription !== r.shortDescription && /no es el objetivo/i.test(f.caveats) && /requerimiento/i.test(r.caveats) &&
        !/pron[oó]stico/i.test(`${r.title} ${r.shortDescription} ${r.detailedDescription}`) && Object.keys(GC.STATES).length === 6 &&
        GC.TOUR.length === 10 && GC.TOUR.every((s) => GC.VIEWS[s.view]);
    });
    test('Fase 7: trazabilidad', 'La cadena se recorre en orden y no altera datos', () => {
      const sc = { scenarioId: 'SC_001_v1', name: 'CR', createdAt: '2026-09-24T00:00:00Z', inputs: { crValue: 0.001 },
        context: { period: { label: 'Septiembre 2026' }, forecastMethod: { id: 'A' } }, links: { driver: 'conversionRate', signalIds: ['s1'] },
        outputs: { plan: { revenue: 100 }, base: { revenue: 90 }, gap: { gapBefore: 10, noGap: false } } };
      const act = { actionId: 'ACT_001', title: 'Checkout', scenarioId: 'SC_001_v1', hypothesisId: 'h1', hypothesis: 'x', driver: 'conversionRate',
        status: 'measuring', expectedImpact: { incrementalValue: 5, recoveryPercent: 0.5 } };
      const ms = [{ actionId: 'ACT_001', statement: 'El resultado observado es consistente con el escenario.', observedImpact: { value: 4 }, observedDays: 7, windowDays: 7, measurementDate: '2026-10-01' }];
      const snap = JSON.stringify([sc, act, ms]);
      const nodes = FP.traceability.chain(act, { scenarios: [sc], measurements: ms, signals: [{ id: 's1', evidence: 'e' }] });
      const order = ['plan', 'forecast', 'gap', 'driver', 'signal', 'hypothesis', 'scenario', 'action', 'impact', 'observed'];
      return nodes.map((n) => n.id).join() === order.join() && nodes.every((n, i) => n.linkedTo === (order[i + 1] || null)) &&
        nodes[0].value === 100 && nodes[9].value === 4 && JSON.stringify([sc, act, ms]) === snap;
    });

    test('Fase 7: inicio', 'Recorrido: visitar una vista sin datos no la marca como hecha', () => {
      if (!FP.homeView || !FP.homeView.journey) return true; // módulo de vista no cargado (pruebas fuera del navegador)
      const empty = { plan: {}, forecast: { available: false }, visited: { diagnostico: true }, diagnostic: { hypotheses: null },
        scenarios: { count: 0 }, measurements: { count: 0 } };
      const withData = { ...empty, plan: { original: true }, forecast: { available: true }, diagnostic: { hypotheses: 2 } };
      const j1 = FP.homeView.journey(empty), j2 = FP.homeView.journey(withData);
      return j1.every((x) => !x[2]) && j2[0][2] && j2[1][2] && j2[2][2] && !j2[3][2];
    });

    test('Metas', 'Asistente: propone metas desde la venta real sin guardar nada', () => {
      const store = actualStore({ ecommerce: 1, app: 1, whatsapp: 1, llamadas: 1 });
      const before = JSON.stringify(store.actual.records.length);
      const base = FP.targetAssistant.yearActuals(store, 2026);
      const s = FP.targetAssistant.suggest({ store, baseYear: 2026, growth: 0.1 });
      const sum = C.channelIds.reduce((a, ch) => a + s.byChannel[ch], 0);
      const bad = FP.targetAssistant.suggest({ store, baseYear: 2026, mix: { ecommerce: 0.5, app: 0.3, whatsapp: 0.1, llamadas: 0.05 } });
      const fixed = FP.targetAssistant.suggest({ store, baseYear: 2026, total: 100000000, mix: { ecommerce: 0.4, app: 0.3, whatsapp: 0.2, llamadas: 0.1 } });
      return s.ok && s.total === Math.round(base.total * 1.1) && sum === s.total && s.warnings.length === 1 &&
        !bad.ok && /suma/.test(bad.errors[0]) && fixed.byChannel.ecommerce === 40000000 &&
        !FP.targetAssistant.suggest({ store, baseYear: 2020 }).ok && JSON.stringify(store.actual.records.length) === before;
    });

    /* ---------------- Fase 8.1 / 8.1.1: productos (lógica pura; IndexedDB en storage-tests) ---------------- */
    if (FP.productStore && FP.productAnalysis) {
      const PSx = FP.productStore, PA = FP.productAnalysis;
      const savedCat = { list: PSx.catalog.list, bySku: PSx.catalog.bySku };
      const withCatalog = (fn) => () => { PSx._resetCatalog(); try { return fn(); } finally { PSx.catalog.list = savedCat.list; PSx.catalog.bySku = savedCat.bySku; } };
      const HS = ['fecha', 'canal', 'categoria', 'subcategoria', 'producto', 'sku', 'estado', 'sucursal', 'tipo_entrega', 'fuente', 'venta', 'pedidos', 'unidades'];
      const HF = ['fecha', 'canal', 'sku', 'vistas_ficha', 'agregados_carrito', 'inicio_checkout', 'compras_ga4'];
      const draftOf = (rows, kind = 'sales', headers = kind === 'sales' ? HS : HF) => { const m = PSx.suggestMapping(headers, kind); const d = PSx.createDraft(headers, m, { kind }); rows.forEach((r, i) => d.addRow(i + 2, r)); return d; };
      const partsOf = (d, batch = 'b') => { const out = []; d.catalog.forEach((e) => { const c = PSx.catalog.bySku.get(e.sku); if (c) Object.assign(c, e); });
        d.parts.forEach((cells, pk) => { const [dt, ch] = pk.split('|'); out.push(PSx.toPartition(dt, ch, cells, batch, d.kind).part); });
        d.catalog.forEach((e) => { const c = PSx.catalog.bySku.get(e.sku); if (c) ['product', 'category', 'subcategory'].forEach((k) => { if (e[k]) c[k] = e[k]; }); }); return out; };
      const rowS = (date, ch, cat, sku, state, branch, delivery, rev, ord, un, src = 'org') => [date, ch, cat, `${cat} 1`, `Prod ${sku}`, sku, state, branch, delivery, src, rev, ord, un];
      const rowF = (date, ch, sku, views, cart, chk, buy) => [date, ch, sku, views, cart, chk, buy];
      const agg = (parts, groupBy, filter) => { const m = new Map(); const byKey = new Map(); parts.forEach((p) => { const k = `${p.date}|${p.channel}|${p.kind}`; byKey.set(k, p); });
        const pairs = new Map(); parts.forEach((p) => { const k = `${p.date}|${p.channel}`; if (!pairs.has(k)) pairs.set(k, {}); pairs.get(k)[p.kind] = p; });
        pairs.forEach((pr) => PSx.accumulateJoint(m, pr.sales || null, pr.funnel || null, { groupBy, filter })); return m; };

      test('Fase 8.1.1: contrato', 'Mapeo, tipo de archivo detectado y columnas obligatorias por archivo', () => {
        const ms = PSx.suggestMapping(['Fecha', 'Canal', 'SKU', 'Estado', 'Sucursal', 'Tipo_entrega', 'Venta'], 'sales');
        const mf = PSx.suggestMapping(['fecha', 'canal', 'sku', 'vistas_ficha', 'compras_ga4'], 'funnel');
        return ms.Estado === 'state' && ms.Sucursal === 'branch' && ms.Tipo_entrega === 'delivery' && mf.vistas_ficha === 'views' &&
          PSx.detectKind(['fecha', 'canal', 'sku', 'vistas_ficha', 'agregados_carrito']) === 'funnel' && PSx.detectKind(['fecha', 'canal', 'sku', 'venta', 'pedidos']) === 'sales' &&
          PSx.validateMapping({ a: 'date', b: 'channel', c: 'sku' }, 'sales').some((i) => i.field === 'state') &&
          !PSx.validateMapping({ a: 'date', b: 'channel', c: 'sku', d: 'views' }, 'funnel').some((i) => i.field === 'state');
      });
      test('Fase 8.1.1: datos', 'Estado, sucursal y entrega obligatorios; catálogo fijo, sin adivinar', withCatalog(() => {
        const d = draftOf([
          rowS('2026-09-01', 'app', 'A', 'S1', '', 'SUC1', 'domicilio', 1, 1, 1),
          rowS('2026-09-01', 'app', 'A', 'S1', 'Narnia', 'SUC1', 'domicilio', 1, 1, 1),
          rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', '', 'domicilio', 1, 1, 1),
          rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'dron', 1, 1, 1),
          rowS('2026-09-01', 'app', 'A', 'S1', 'edo. mex.', 'SUC1', 'Recoger en sucursal', 1, 1, 1)
        ]);
        return d.summary.rejected === 4 && d.summary.accepted === 1 && Boolean(d.issues.byType.MISSING_STATE && d.issues.byType.INVALID_STATE && d.issues.byType.MISSING_BRANCH && d.issues.byType.INVALID_DELIVERY);
      }));
      test('Fase 8.1.1: duplicados', 'Llave con estado + sucursal + entrega: exacto, conflicto y multiplicidad', withCatalog(() => {
        const d = draftOf([
          rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 100, 1, 1),
          rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 100, 1, 1),
          rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 999, 9, 9),
          rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'recoleccion', 50, 1, 1),
          rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 20, 1, 1, 'paid')
        ]);
        const p = partsOf(d)[0];
        return d.summary.exactDuplicates === 1 && d.summary.conflicts === 1 && p.n === 2 &&
          [...Array(p.n)].map((_, i) => PSx.cellAt(p, i)).some((c) => c.delivery === 'Recolección en sucursal' && c.revenue === 50) &&
          [...Array(p.n)].map((_, i) => PSx.cellAt(p, i)).some((c) => c.delivery === 'Envío a domicilio' && c.revenue === 120 && c.conflict);
      }));
      test('Fase 8.1.1: funnel antes del checkout', 'Funnel no tiene estado/sucursal/entrega; se cruza solo sin esos filtros', withCatalog(() => {
        const s = partsOf(draftOf([rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 300, 3, 3)]))[0];
        const f = partsOf(draftOf([rowF('2026-09-01', 'app', 'S1', 60, 10, 6, 3)], 'funnel'))[0];
        const byCat = PSx.accumulateJoint(new Map(), s, f, { groupBy: 'category' });
        const byState = PSx.accumulateJoint(new Map(), s, f, { groupBy: 'state' });
        const fz1 = PSx.finalize(byCat.get('A')), fz2 = PSx.finalize(byState.get('Ciudad de México'));
        return near(fz1.conversionRate.value, 3 / 60) && fz1.cartRate.status === 'available' && fz2.conversionRate.status === 'unavailable' && /antes de elegir/.test(fz2.conversionRate.note);
      }));
      test('Fase 8.1.1: CR con pedidos reales', 'SKU con vistas y sin ventas ese día cuenta como 0 pedidos, no se descarta', withCatalog(() => {
        const s = partsOf(draftOf([rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 100, 1, 1)]))[0];
        const f = partsOf(draftOf([rowF('2026-09-01', 'app', 'S1', 50, 5, 3, 1), rowF('2026-09-01', 'app', 'S2', 40, 4, 2, 1)], 'funnel'))[0];
        const m = PSx.accumulateJoint(new Map(), s, f, { groupBy: 'total' });
        const fz = PSx.finalize(m.get('Total'));
        return near(fz.conversionRate.value, 1 / 90) && m.get('Total').impliedZero === 1;
      }));
      test('Fase 8.1.1: cobertura de tracking', 'Compras GA4 ÷ unidades reales detecta pérdida de medición', withCatalog(() => {
        const s = partsOf(draftOf([rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 100, 2, 10)]))[0];
        const f = partsOf(draftOf([rowF('2026-09-01', 'app', 'S1', 50, 5, 3, 6)], 'funnel'))[0];
        const m = PSx.accumulateJoint(new Map(), s, f, { groupBy: 'total' });
        const fz = PSx.finalize(m.get('Total'));
        return near(fz.trackingCoverage.value, 0.6) && fz.trackingCoverage.status === 'available';
      }));
      test('Fase 8.1.1: métricas', 'AOV solo con pedidos > 0; estados de disponibilidad no confunden faltante con inválido', withCatalog(() => {
        const d = draftOf([rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 100, 0, 0), rowS('2026-09-01', 'app', 'A', 'S2', 'CDMX', 'SUC1', 'domicilio', 300, 3, 3)]);
        const m = PSx.accumulatePartition(new Map(), partsOf(d)[0], { groupBy: 'sku' });
        const s1 = PSx.finalize(m.get('S1')), s2 = PSx.finalize(m.get('S2'));
        return s1.aov.status === 'not_calculable' && s1.aov.value === null && near(s2.aov.value, 100) && s2.revenue.source === 'observed' && s2.aov.source === 'calculated';
      }));
      test('Fase 8.1.1: persistencia', 'Fusión con lo guardado por estado + sucursal + entrega: idéntico, conflicto y nuevo', withCatalog(() => {
        const a = partsOf(draftOf([rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 100, 1, 1)]), 'b1')[0];
        const b = partsOf(draftOf([rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 100, 1, 1), rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'recoleccion', 40, 1, 1)]), 'b2')[0];
        const k = PSx.mergePartitions(a, b, 'keep', 'b2');
        return k.report.identical === 1 && k.report.added === 1 && k.part.n === 2;
      }));
      test('Fase 8.1.1: consultas', 'Resumen por estado y por sucursal = suma de renglones', withCatalog(() => {
        const rows = [['CDMX', 'SUC1'], ['CDMX', 'SUC2'], ['Jalisco', 'SUC3']].map(([st, br], i) => rowS('2026-09-01', 'app', 'A', `S${i}`, st, br, 'domicilio', 10 * (i + 1), i + 1, i + 1));
        const p = partsOf(draftOf(rows))[0];
        const scanState = PSx.accumulatePartition(new Map(), p, { groupBy: 'state' });
        const rollState = PSx.rollupsOf(p, null).filter((x) => x.level === 'state');
        return rollState.length === 2 && rollState.every((x) => near(x.revenue, scanState.get(x.key).revenue));
      }));
      test('Fase 8.1.1: análisis', 'Participación ≠ contribución; crecimiento, deterioro y compensación (venta + funnel)', withCatalog(() => {
        const curS = partsOf(draftOf([rowS('2026-09-02', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 200, 2, 2), rowS('2026-09-02', 'app', 'B', 'S2', 'CDMX', 'SUC1', 'domicilio', 900, 9, 9), rowS('2026-09-02', 'app', 'C', 'S3', 'CDMX', 'SUC1', 'domicilio', 100, 1, 1)]));
        const baseS = partsOf(draftOf([rowS('2026-09-01', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 100, 1, 1), rowS('2026-09-01', 'app', 'B', 'S2', 'CDMX', 'SUC1', 'domicilio', 1000, 10, 10), rowS('2026-09-01', 'app', 'C', 'S3', 'CDMX', 'SUC1', 'domicilio', 100, 1, 1)]));
        const r = PA.compare(agg(curS, 'category'), agg(baseS, 'category'), { level: 'category' });
        const g = (k) => r.rows.find((x) => x.key === k);
        const shareSum = r.rows.reduce((a, x) => a + x.share, 0);
        return near(shareSum, 1) && g('A').contribution === null && g('A').status === 'growth' && g('B').status === 'decline' && g('C').status === 'stable' &&
          r.compensation.compensated && r.compensation.negative === -100 && r.compensation.positive === 100;
      }));
      test('Fase 8.1.1: señales', 'Patrones A–D (tráfico/CR) y E–G (funnel) son señales, no causas', () => {
        const mkS = (rev, ord) => { const a = PSx.newAcc(); a.revenue = rev; a.orders = ord; a.units = ord; a.obs = [1, 1, 1]; a.cells = 1; a.aovRevenue = rev; a.aovOrders = ord; return a; };
        const withFunnel = (a, views, cart, chk, buy) => { a.fcells = 1; a.fobs = [1, 1, 1, 1]; a.views = views; a.addToCart = cart; a.beginCheckout = chk; a.purchasesGa4 = buy;
          a.crOrders = a.orders; a.crViews = views; a.cartNum = cart; a.cartDen = views; a.chkNum = chk; a.chkDen = cart; a.buyNum = buy; a.buyDen = chk; return a; };
        const X = withFunnel(mkS(800, 8), 1200, 120, 66, 33), Xb = withFunnel(mkS(1000, 10), 1000, 100, 60, 30);
        const F1 = withFunnel(mkS(800, 8), 1000, 90, 55, 28), F1b = withFunnel(mkS(1000, 10), 1000, 100, 60, 30);
        const F2 = withFunnel(mkS(800, 8), 1000, 100, 48, 26), F2b = withFunnel(mkS(1000, 10), 1000, 100, 60, 30);
        const r = PA.compare(new Map([['X', X], ['F1', F1], ['F2', F2]]), new Map([['X', Xb], ['F1', F1b], ['F2', F2b]]));
        const pat = (k) => r.rows.find((x) => x.key === k).signals.map((s) => s.pattern).join();
        return pat('X').includes('A') && pat('F1').includes('E') && pat('F2').includes('F') && r.signals.every((s) => s.kind === 'signal' && /no indica la causa/.test(s.note));
      });
      test('Fase 8.1.1: periodos', 'Referencia: periodo anterior y año anterior (29 de febrero)', () => {
        const a = PA.baselinePeriod({ from: '2026-09-01', to: '2026-09-22' }, 'previous'), b = PA.baselinePeriod({ from: '2028-02-01', to: '2028-02-29' }, 'yoy');
        return a.from === '2026-08-10' && a.to === '2026-08-31' && b.from === '2027-02-01' && b.to === '2027-02-28';
      });
      test('Fase 8.1.1: migración de esquema', 'Bloque v1 se separa en venta + funnel sin perder valores', () => {
        const old = { schema: undefined, kind: undefined, date: '2026-09-01', channel: 'app', n: 1, skuIdx: new Uint32Array([0]), row: new Uint32Array([5]),
          flags: new Uint8Array([0]), src: new Uint16Array([0]), batches: ['v1'],
          revenue: new Float64Array([100]), orders: new Float64Array([2]), units: new Float64Array([2]), views: new Float64Array([40]),
          state: Uint8Array.from([0, 0, 0, 0]) };
        const up = PSx.upgradeV1Block(old);
        return up.sales.n === 1 && up.sales.revenue[0] === 100 && up.sales.state[0] === 0 && up.sales.stateIdx[0] === 0 && up.sales.deliveryIdx[0] === 0 &&
          up.funnel.n === 1 && up.funnel.views[0] === 40 && up.funnel.state[0] === 0 && up.funnel.state[1] === 1;
      });
      test('Fase 8.1.1: integración', 'Contexto del diagnóstico, export y enrutado de almacenamiento', withCatalog(() => {
        const x = PA.fromDiagnosis({ period: { type: 'month', key: '2026-09' }, channel: { id: 'app' }, comparison: { id: 'actual_vs_plan' } });
        const s = partsOf(draftOf([rowS('2026-09-02', 'app', 'A', 'S1', 'CDMX', 'SUC1', 'domicilio', 200, 2, 2)]));
        const r = { ...PA.compare(agg(s, 'category'), new Map(), { level: 'category' }), period: { from: '2026-09-02', to: '2026-09-02' }, baseline: { from: '2026-09-01', to: '2026-09-01' }, comparison: 'previous', channel: 'app', filter: {}, next: 'subcategory', mappedMetrics: { sales: C.products.metrics, funnel: [] } };
        const ex = FP.categoryProductExport.buildCategoryProductExport(r, { batches: [] });
        return x.from === '2026-09-01' && x.to === '2026-09-30' && x.channel === 'app' && x.comparison === 'previous' && /no existe plan/i.test(x.note) &&
          ex.schema === 'category_product_analysis_export' && ex.rows[0].status === 'new' && ex.rules.share &&
          FP.repository.isDataKey('plans:2026') && FP.repository.isDataKey('historicalData') && !FP.repository.isDataKey('uxSettings') &&
          FP.storageMigration.summarize({ records: [['2026-01-02', 'app'], ['2026-01-01', 'web']], batches: [1] }).dateMin === '2026-01-01';
      }));
    }

    const passed = results.filter((r) => r.pass).length;
    return { results, passed, total: results.length, ok: passed === results.length };
  }

  FP.selfTest = { run };
})(typeof window !== 'undefined' ? window : globalThis);
