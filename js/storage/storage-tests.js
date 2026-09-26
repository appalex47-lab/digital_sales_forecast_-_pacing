/**
 * storage-tests.js — Pruebas asíncronas de almacenamiento (Fase 8.1).
 *
 * Corren en el navegador real (botón "Pruebas de almacenamiento" en Categoría → Producto), también en
 * GitHub Pages. Usan bases y localStorage AISLADOS (nombres fp-test-*, adaptador en memoria): no tocan los
 * datos de la app. Al final se restaura la capa de productos con el repositorio de la app.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const PS = () => FP.productStore;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  async function run({ volume = true } = {}) {
    const results = [];
    const t = async (name, fn) => {
      try { const r = await fn(); results.push({ name, pass: r === true || (r && r.pass === true), detail: r && r.detail ? r.detail : null }); }
      catch (e) { results.push({ name, pass: false, detail: String(e && e.message || e) }); }
    };
    const stamp = Date.now().toString(36);
    const dbName = `fp-test-${stamp}`;
    const mkRepo = (name = dbName) => FP.repository.createRepository({ name, version: C().storageDb.version });
    const IDB = FP.idb;
    let repo;

    await t('IndexedDB disponible', async () => IDB.available());
    await t('Crear base, stores e índices', async () => {
      repo = await mkRepo().init();
      const names = [...repo.db.objectStoreNames];
      const tx = repo.db.transaction(['productDays', 'productRollups', 'productCatalog'], 'readonly');
      const idx = [...tx.objectStore('productDays').indexNames, ...tx.objectStore('productRollups').indexNames, ...tx.objectStore('productCatalog').indexNames];
      return { pass: repo.ready && FP.repository.STORES.every((s) => names.includes(s)) && ['channel_date', 'level_key_date', 'category', 'product'].every((i) => idx.includes(i)), detail: `${names.join(', ')} · índices ${idx.join(', ')}` };
    });
    await t('Escribir, leer y actualizar (kv)', async () => {
      await repo.kvPut('historicalData', { schemaVersion: 'x', savedAt: '2026-01-01T00:00:00Z', data: { records: [1, 2, 3] } });
      const a = await repo.kvRead('historicalData');
      await repo.kvPut('historicalData', { schemaVersion: 'x', savedAt: '2026-01-02T00:00:00Z', data: { records: [1, 2, 3, 4] } });
      const b = await repo.kvRead('historicalData');
      return a.data.records.length === 3 && b.data.records.length === 4;
    });
    await t('Persistencia al cerrar y reabrir', async () => {
      repo.close();
      repo = await mkRepo().init();
      const b = repo.kvGet('historicalData');
      return Boolean(b && b.data.records.length === 4);
    });

    // Migración aislada: localStorage en memoria con el mismo namespace
    const memAdapter = FP.storage.memoryAdapter();
    const ls = FP.storage.createStorage(memAdapter);
    const packed = { format: 'packed-v1', batches: [{ id: 'b1' }], records: [['2025-01-01', 'app', 'regular'], ['2025-01-02', 'ecommerce', 'regular']] };
    ls.save('historicalData', packed);
    ls.save('plans:2026', { versions: [{ id: 'v1' }] });
    ls.save('settings', { tolerance: 0.01 });
    const migRepoName = `${dbName}-mig`;
    let migRepo;
    await t('Migración: copia y verifica solo datos grandes', async () => {
      migRepo = await mkRepo(migRepoName).init();
      const st = await FP.storageMigration.migrate({ ls, lsAdapter: memAdapter, repo: migRepo });
      const keys = migRepo.kvKeys().sort();
      return { pass: st.status === 'verified' && keys.join() === 'historicalData,plans:2026' && st.keys.every((k) => k.verified),
        detail: `estado ${st.status}; claves ${keys.join(', ')}; registros ${st.keys.map((k) => `${k.key}:${k.source.records ?? k.source.versions}`).join(', ')}` };
    });
    await t('Migración: localStorage se conserva', async () => Boolean(ls.load('historicalData') && ls.load('plans:2026') && ls.load('settings')));
    await t('Migración: idempotente (repetirla no duplica)', async () => {
      const st = await FP.storageMigration.migrate({ ls, lsAdapter: memAdapter, repo: migRepo, force: true });
      const all = await IDB.getAll(migRepo.db, 'kv');
      return st.status === 'verified' && all.length === 2 && all.find((x) => x.key === 'historicalData').envelope.data.records.length === 2;
    });
    await t('Migración: no sobrescribe datos más recientes en IndexedDB', async () => {
      await migRepo.kvPut('historicalData', { schemaVersion: 'x', savedAt: '2999-01-01T00:00:00Z', data: { records: [] } });
      const st = await FP.storageMigration.migrate({ ls, lsAdapter: memAdapter, repo: migRepo, force: true });
      const k = st.keys.find((x) => x.key === 'historicalData');
      return k.action === 'kept_newer' && (await migRepo.kvRead('historicalData')).data.records.length === 0;
    });
    await t('Migración: falla controlada y reintento', async () => {
      const failing = { ...migRepo, ready: true, kvRead: async () => null, kvPut: async () => { throw new Error('cuota simulada'); } };
      const st1 = await FP.storageMigration.migrate({ ls, lsAdapter: memAdapter, repo: failing, force: true });
      const st2 = await FP.storageMigration.migrate({ ls, lsAdapter: memAdapter, repo: migRepo, force: true });
      return { pass: st1.status === 'failed' && st2.status === 'verified' && st2.attempts === st1.attempts + 1, detail: `${st1.status} → ${st2.status} (intentos ${st2.attempts})` };
    });
    await t('Enrutado: datos a IndexedDB, preferencias a localStorage', async () => {
      const routed = FP.repository.createRoutedStorage({ ls, repo: migRepo });
      routed.save('actualData', { records: [9] });
      routed.save('uxSettings', { mode: 'exec' });
      await migRepo.flush();
      return Boolean((await migRepo.kvRead('actualData')) && !migRepo.kvHas('uxSettings') && ls.load('uxSettings') && !ls.load('actualData'));
    });

    // Migración de esquema v1 → v2: base con un store productDays "antiguo" (versión 1), reabrir en v2
    await t('Esquema de producto v1 → v2: separa venta y funnel sin perder datos', async () => {
      const v1Name = `${dbName}-v1`;
      const dbv1 = await new Promise((res, rej) => { const r = indexedDB.open(v1Name, 1); r.onupgradeneeded = () => { const d = r.result;
        const s2 = d.createObjectStore('productDays', { keyPath: ['date', 'channel'] }); s2.createIndex('channel_date', ['channel', 'date']);
        d.createObjectStore('productRollups', { keyPath: ['date', 'channel', 'level', 'key'] }).createIndex('level_key_date', ['level', 'key', 'date']);
        d.createObjectStore('productCatalog', { keyPath: 'sku' }); d.createObjectStore('productBatches', { keyPath: 'id' }); d.createObjectStore('meta', { keyPath: 'key' }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      await IDB.put(dbv1, 'productCatalog', { sku: 'SKUV1', idx: 0, category: 'A', subcategory: 'A1', product: 'Prod V1' });
      const oldBlock = { date: '2026-09-01', channel: 'app', n: 1, skuIdx: new Uint32Array([0]), row: new Uint32Array([9]), flags: new Uint8Array([0]), src: new Uint16Array([0]), batches: ['v1'],
        revenue: new Float64Array([500]), orders: new Float64Array([5]), units: new Float64Array([6]), views: new Float64Array([80]), state: Uint8Array.from([0, 0, 0, 0]) };
      await IDB.put(dbv1, 'productDays', oldBlock);
      dbv1.close();
      const migRepo2 = FP.repository.createRepository({ name: v1Name, version: 2 });
      await migRepo2.init();
      await PS().init(migRepo2);
      const sales1 = await IDB.get(migRepo2.db, 'productDays', ['2026-09-01', 'app']);
      const funnel1 = await IDB.get(migRepo2.db, 'productFunnel', ['2026-09-01', 'app']);
      const rb = await migRepo2.meta('productRebuild');
      const roll = await IDB.getAll(migRepo2.db, 'productRollups', { index: 'level_key_date', range: IDBKeyRange.bound(['category', 'A', '2026-09-01'], ['category', 'A', '2026-09-01']) });
      migRepo2.close(); await IDB.deleteDatabase(v1Name);
      return { pass: sales1 && sales1.revenue[0] === 500 && sales1.schema === 2 && funnel1 && funnel1.views[0] === 80 && rb && rb.pending === false && roll.length === 1 && roll[0].revenue === 500,
        detail: `venta ${sales1 && sales1.revenue[0]}, funnel vistas ${funnel1 && funnel1.views[0]}, resumen recalculado ${roll.length === 1}` };
    });

    // Productos sobre una base aislada (venta + funnel)
    const prodRepo = await mkRepo(`${dbName}-prod`).init();
    await PS().init(prodRepo);
    const gen = FP.mockProducts.generate({ from: '2026-08-01', to: '2026-09-09', skus: 150 });
    const stagedS = FP.productImport.stage(gen.sales, { fileName: 'venta.csv', kind: 'sales' });
    const resS = await FP.productImport.process(stagedS, {});
    const stagedF = FP.productImport.stage(gen.funnel, { fileName: 'funnel.csv', kind: 'funnel' });
    const resF = await FP.productImport.process(stagedF, {});
    let batchS, batchF;
    await t('Productos: venta (estado, sucursal, entrega) y funnel se guardan por separado', async () => {
      batchS = await PS().commit(resS.draft, { fileName: 'venta.csv' });
      batchF = await PS().commit(resF.draft, { fileName: 'funnel.csv' });
      const c = await PS().counts();
      return { pass: c.salesRows === resS.summary.accepted && c.funnelRows === resF.summary.accepted,
        detail: `${c.salesRows.toLocaleString('es-MX')} renglones de venta, ${c.funnelRows.toLocaleString('es-MX')} de funnel` };
    });
    await t('Consulta por día, canal y rango (venta + funnel cruzados)', async () => {
      const d = await PS().aggregate({ from: '2026-09-01', to: '2026-09-01', groupBy: 'channel' });
      const ch = await PS().aggregate({ from: '2026-08-01', to: '2026-09-09', channel: 'app', groupBy: 'channel' });
      return d.size === 4 && ch.size === 1;
    });
    await t('Consulta por categoría: resumen = recorrido de bloques (venta y funnel)', async () => {
      const t0 = now();
      const roll = await PS().aggregate({ from: '2026-09-01', to: '2026-09-09', groupBy: 'category' });
      const t1 = now();
      const scan = new Map();
      const keys = await PS().keysIn({ from: '2026-09-01', to: '2026-09-09' });
      for (const k of keys) { const [d, ch] = k.split('|'); const s2 = await IDB.get(prodRepo.db, 'productDays', [d, ch]); const f2 = await IDB.get(prodRepo.db, 'productFunnel', [d, ch]); PS().accumulateJoint(scan, s2, f2, { groupBy: 'category' }); }
      const ok = [...roll.keys()].every((k) => Math.abs(roll.get(k).revenue - scan.get(k).revenue) < 0.01);
      return { pass: ok && roll.size === scan.size, detail: `${roll.size} categorías; resumen ${Math.round(t1 - t0)} ms` };
    });
    await t('Consulta por estado y por sucursal (obligatorias en venta)', async () => {
      const byState = await PS().aggregate({ from: '2026-08-01', to: '2026-09-09', groupBy: 'state' });
      const byBranch = await PS().aggregate({ from: '2026-08-01', to: '2026-09-09', groupBy: 'branch' });
      return byState.size === FP.mockProducts.STATES.length && byBranch.size === 100 && ![...byState.keys()].includes('(sin dato)');
    });
    await t('Consulta por producto y por SKU con trazabilidad (venta y funnel separados)', async () => {
      const sku = PS().catalog.list[5];
      const m = await PS().aggregate({ from: '2026-08-01', to: '2026-09-09', groupBy: 'product', filter: { product: sku.product } });
      const trace = await PS().skuTrace({ sku: sku.sku, from: '2026-08-01', to: '2026-09-09' });
      const sales = trace.filter((x) => x.kind === 'sales'), funnel = trace.filter((x) => x.kind === 'funnel');
      return { pass: m.size === 1 && sales.length > 0 && funnel.length === 80 && sales.every((x) => x.state && x.branch && x.delivery && x.fileName === 'venta.csv') && funnel.every((x) => x.fileName === 'funnel.csv'),
        detail: `${sales.length} renglones de venta, ${funnel.length} de funnel` };
    });
    await t('Duplicados contra lo guardado: idénticos se omiten', async () => {
      const again = await FP.productImport.process(stagedS, {});
      const b = await PS().commit(again.draft, { fileName: 'venta.csv' });
      const c = await PS().counts();
      return b.storedMerge.identical === resS.summary.accepted && b.storedMerge.added === 0 && c.salesRows === resS.summary.accepted;
    });
    await t('Conflicto contra lo guardado: se conserva y se marca, o se reemplaza si se elige', async () => {
      // Encabezado real: fecha,canal,sku,codigo_producto,producto,marca,categoria,subcategoria,presentacion,estado,sucursal,tipo_entrega,venta,pedidos,unidades
      const lines = gen.sales.split('\n');
      const header = lines[0], row = lines[1].split(',');
      const col = (n) => header.split(',').indexOf(n); // por nombre de columna, no por posición (la plantilla creció en 8.4)
      const [date, channel, sku] = row;
      row[col('venta')] = '1'; row[col('pedidos')] = '1'; row[col('unidades')] = '1';
      const changed = [header, row.join(',')].join('\n');
      const st = FP.productImport.stage(changed, { fileName: 'correccion.csv', kind: 'sales' });
      const r1 = await FP.productImport.process(st, {});
      const keep = await PS().commit(r1.draft, { fileName: 'correccion.csv', policy: 'keep' });
      const trK = await PS().skuTrace({ sku, from: date, to: date, channel });
      const r2 = await FP.productImport.process(st, {});
      const rep = await PS().commit(r2.draft, { fileName: 'correccion.csv', policy: 'replace' });
      const trR = await PS().skuTrace({ sku, from: date, to: date, channel });
      const kept = trK.find((x) => x.kind === 'sales' && x.branch === row[col('sucursal')]);
      const replaced = trR.find((x) => x.kind === 'sales' && x.branch === row[col('sucursal')] && x.revenue === 1);
      return Boolean(keep.storedMerge.conflicts >= 1 && kept && kept.conflict && kept.revenue !== 1 && rep.storedMerge.replaced >= 1 && replaced && replaced.fileName === 'correccion.csv');
    });
    await t('Faltante e inválido no son cero; geografía inválida se marca sin adivinar (desde 8.4 el renglón se conserva)', async () => {
      const q = FP.productImport.stage(FP.mockProducts.qualityCase(), { fileName: 'q.csv', kind: 'sales' });
      const r = await FP.productImport.process(q, {});
      const hasAll = ['INVALID_STATE', 'MISSING_BRANCH', 'INVALID_DELIVERY', 'EXACT_DUPLICATE', 'CONFLICT', 'NEGATIVE_REVENUE', 'INVALID_REVENUE'].every((k) => r.summary.issuesByType[k]);
      // Solo se rechaza lo que no se puede ubicar en el tiempo o el canal (aquí: canal "marketplace"); la geografía inválida se conserva marcada
      return { pass: hasAll && r.summary.rejected === 1 && r.summary.accepted > 0 && Boolean(r.summary.issuesByType.INVALID_CHANNEL), detail: `${r.summary.rejected} rechazadas, ${r.summary.accepted} aceptadas` };
    });
    await t('CR y funnel no disponibles al filtrar por estado, sucursal o entrega', async () => {
      const byCat = await PS().aggregate({ from: '2026-08-01', to: '2026-09-09', channel: 'ecommerce', groupBy: 'category' });
      const byState = await PS().aggregate({ from: '2026-08-01', to: '2026-09-09', channel: 'ecommerce', groupBy: 'state' });
      const c1 = PS().finalize([...byCat.values()][0]), c2 = PS().finalize([...byState.values()][0]);
      return c1.conversionRate.status !== 'unavailable' && c2.conversionRate.status === 'unavailable' && /antes de elegir/.test(c2.conversionRate.note);
    });
    await t('Análisis sobre IndexedDB: participación, contribución y cobertura de tracking', async () => {
      const r = await FP.productAnalysis.run({ from: '2026-09-01', to: '2026-09-09', comparison: 'previous', level: 'category', channel: 'ecommerce' });
      const share = r.rows.reduce((a, x) => a + (x.share || 0), 0);
      const trk = r.total.current.trackingCoverage;
      return { pass: Math.abs(share - 1) < 1e-9 && r.rows.some((x) => x.signals.length) && trk.status === 'available',
        detail: `${r.rows.length} categorías en ${r.elapsedMs} ms, cobertura de tracking ${(trk.value * 100).toFixed(0)}%` };
    });

    // ---------- Fase 8.4: geografía de productos sobre IndexedDB ----------
    await t('Geografía: modelo, ciudades y resúmenes por ciudad persisten al reabrir', async () => {
      const g = FP.productImport.stage(FP.mockProducts.geoCase(), { fileName: 'geo.csv' });
      const r = await FP.productImport.process(g, {});
      await PS().commit(r.draft, { fileName: 'geo.csv' });
      await PS().init(prodRepo);
      const b = PS().entity('branch', '025');
      const cities = await PS().aggregate({ from: '2026-09-20', to: '2026-09-20', groupBy: 'city' });
      const rolls = await IDB.getAll(prodRepo.db, 'productRollups', { index: 'level_key_date', range: IDBKeyRange.bound(['city', '', '2026-09-20'], ['city', '\uffff', '2026-09-20']) });
      return { pass: Boolean(b && b.path.map((x) => x.id).join('>') === 'OCCIDENTE>JAL>JAL-GUADALAJARA>025') && cities.get('Guadalajara, JAL').revenue === 1400 && rolls.length > 0 && PS().geo.issues.length >= 4,
        detail: `${rolls.length} resúmenes por ciudad · ${PS().geo.issues.length} avisos de consistencia` };
    });
    await t('Geografía: filtros y desgloses sobre IndexedDB (región → estado → sucursal, entrega)', async () => {
      const reg = await PS().aggregate({ from: '2026-09-20', to: '2026-09-20', groupBy: 'state', filter: { region: 'Occidente' } });
      const br = await PS().aggregate({ from: '2026-09-20', to: '2026-09-20', groupBy: 'branch', filter: { state: 'Jalisco', delivery: 'Recolección en sucursal' } });
      const sku = await PS().aggregate({ from: '2026-09-20', to: '2026-09-20', groupBy: 'sku', filter: { city: 'Guadalajara, JAL' } });
      return [...reg.keys()].join() === 'Jalisco' && br.get('025').revenue === 1000 && !br.has('(sin dato)') && sku.get('G1').revenue === 1000 && sku.get('G2').revenue === 300;
    });
    await t('Geografía: bloque anterior sin ciudad se enriquece al recargar el periodo con ciudad (sin duplicar)', async () => {
      const H0 = 'fecha,canal,sku,estado,sucursal,tipo_entrega,venta,pedidos,unidades';
      const r0 = await FP.productImport.process(FP.productImport.stage(`${H0}\n2026-09-21,app,E1,Jalisco,025,domicilio,300,3,3`, { fileName: 'viejo.csv' }), {});
      await PS().commit(r0.draft, { fileName: 'viejo.csv' });
      const blk = await IDB.get(prodRepo.db, 'productDays', ['2026-09-21', 'app']);
      delete blk.cityIdx; delete blk.geoFlags;
      await IDB.put(prodRepo.db, 'productDays', blk);
      const H1 = 'fecha,canal,sku,estado,ciudad,sucursal,tipo_entrega,venta,pedidos,unidades';
      const r1 = await FP.productImport.process(FP.productImport.stage(`${H1}\n2026-09-21,app,E1,Jalisco,Guadalajara,025,domicilio,200,2,2\n2026-09-21,app,E1,Jalisco,Zapopan,025,domicilio,100,1,1`, { fileName: 'nuevo.csv' }), {});
      const b = await PS().commit(r1.draft, { fileName: 'nuevo.csv' });
      const m = await PS().aggregate({ from: '2026-09-21', to: '2026-09-21', channel: 'app', groupBy: 'sku' });
      return { pass: b.storedMerge.enriched === 1 && m.get('E1').revenue === 300, detail: `enriquecidos ${b.storedMerge.enriched}, venta del SKU ${m.get('E1').revenue}` };
    });
    await t('Geografía: resúmenes por ciudad se reconstruyen una vez en instalaciones anteriores', async () => {
      await prodRepo.setMeta('productGeoRollups', { key: 'productGeoRollups', removed: true });
      await IDB.del(prodRepo.db, 'meta', 'productGeoRollups');
      const tx = prodRepo.db.transaction('productRollups', 'readwrite');
      tx.objectStore('productRollups').clear();
      await new Promise((res2) => { tx.oncomplete = res2; });
      await PS().init(prodRepo);
      const m = await prodRepo.meta('productGeoRollups');
      const n = await IDB.count(prodRepo.db, 'productRollups');
      return { pass: Boolean(m && m.version === 1) && n > 0, detail: `${n} resúmenes reconstruidos en ${m ? m.blocks : 0} bloques` };
    });

    if (volume) {
      await t('Volumen: 4.38 millones de SKU-días (365 × 3,000 × 4) sin congelar la interfaz', async () => {
        const vRepo = await mkRepo(`${dbName}-vol`).init();
        const nS = 3000, chs = ['ecommerce', 'app', 'whatsapp', 'llamadas'];
        const cat = Array.from({ length: nS }, (_, i) => ({ sku: `S${i}`, idx: i, category: `Cat ${i % 12}`, subcategory: `Sub ${i % 36}`, product: `P${i}` }));
        let gap = 0, last = now();
        const timer = setInterval(() => { const x = now(); gap = Math.max(gap, x - last); last = x; }, 16);
        const t0 = now();
        let d = '2025-01-01';
        for (let day = 0; day < 365; day++, d = FP.calendar.addDays(d, 1)) {
          const parts = [], rolls = [];
          chs.forEach((ch) => {
            const p = { schema: 2, kind: 'sales', date: d, channel: ch, n: nS, skuIdx: new Uint32Array(nS), row: new Uint32Array(nS), flags: new Uint8Array(nS),
              state: new Uint8Array(nS * 3), src: new Uint16Array(nS), batches: ['vol'], stateIdx: new Uint8Array(nS), branchIdx: new Uint16Array(nS), deliveryIdx: new Uint8Array(nS) };
            ['revenue', 'orders', 'units'].forEach((m) => { p[m] = new Float64Array(nS); });
            for (let i = 0; i < nS; i++) { p.skuIdx[i] = i; p.orders[i] = 2 + (i % 5); p.units[i] = 3 + (i % 5); p.revenue[i] = p.orders[i] * (100 + (i % 300)); p.stateIdx[i] = 1 + (i % 10); p.branchIdx[i] = 1 + (i % 50); p.deliveryIdx[i] = 1 + (i % 2); }
            parts.push(p);
            PS().rollupsOf(p, null, cat).forEach((x) => rolls.push(x));
          });
          const tx = vRepo.db.transaction(['productDays', 'productRollups'], 'readwrite');
          parts.forEach((p) => tx.objectStore('productDays').put(p));
          rolls.forEach((x) => tx.objectStore('productRollups').put(x));
          await new Promise((res2, rej) => { tx.oncomplete = res2; tx.onerror = () => rej(tx.error); });
          await IDB.yieldToUI();
        }
        const tWrite = now() - t0;
        let t1 = now();
        const day = await IDB.getAll(vRepo.db, 'productDays', { range: IDBKeyRange.bound(['2025-06-15', ''], ['2025-06-15', '\uffff']) });
        const tDay = now() - t1; t1 = now();
        const cat30 = await IDB.getAll(vRepo.db, 'productRollups', { index: 'level_key_date', range: IDBKeyRange.bound(['category', 'Cat 3', '2025-06-01'], ['category', 'Cat 3', '2025-06-30']) });
        const tCat = now() - t1; t1 = now();
        let skuDays = 0;
        await IDB.iterate(vRepo.db, 'productDays', { index: 'channel_date', range: IDBKeyRange.bound(['app', '2025-06-01'], ['app', '2025-06-30']) }, (p) => { skuDays += p.n; });
        const tCh = now() - t1; t1 = now();
        let series = 0;
        await IDB.iterate(vRepo.db, 'productDays', {}, (p) => { if (p.skuIdx[1500] === 1500) series++; });
        const tSku = now() - t1;
        clearInterval(timer);
        const est = await IDB.estimate();
        vRepo.close();
        await IDB.deleteDatabase(`${dbName}-vol`);
        const ok = day.length === 4 && cat30.length === 30 * 4 && skuDays === 30 * nS && series === 365 * 4 && gap < 250;
        return { pass: ok, detail: `escritura ${(tWrite / 1000).toFixed(1)} s · día ${Math.round(tDay)} ms · categoría 30 días ${Math.round(tCat)} ms · canal 30 días ${Math.round(tCh)} ms · serie de un SKU en el año ${Math.round(tSku)} ms · pausa máxima de la interfaz ${Math.round(gap)} ms${est ? ` · uso ${(est.usage / 1048576).toFixed(0)} MB` : ''}` };
      });
    }

    // Limpieza: bases de prueba fuera y capa de productos de vuelta al repositorio de la app
    try { repo.close(); migRepo.close(); prodRepo.close(); } catch (e) { /* nada */ }
    for (const n of [dbName, migRepoName, `${dbName}-prod`]) await IDB.deleteDatabase(n);
    if (FP.app && FP.app.repo) await PS().init(FP.app.repo); else PS().reset();
    const passed = results.filter((r) => r.pass).length;
    return { passed, total: results.length, failed: results.length - passed, results, origin: typeof location !== 'undefined' ? `${location.protocol}//${location.host}` : 'node' };
  }

  FP.storageTests = { run };
})(typeof window !== 'undefined' ? window : globalThis);
