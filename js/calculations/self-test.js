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

    const passed = results.filter((r) => r.pass).length;
    return { results, passed, total: results.length, ok: passed === results.length };
  }

  FP.selfTest = { run };
})(typeof window !== 'undefined' ? window : globalThis);
