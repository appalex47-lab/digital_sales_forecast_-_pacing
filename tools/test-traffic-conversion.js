// Pruebas de trafficConversionEngine.  node tools/test-traffic-conversion.js
const path = require('path'); global.FP = {}; require(path.join(__dirname, '../js/analytics/trafficConversionEngine.js'));
let ok = 0, bad = 0; const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); c ? ok++ : bad++; };
const E = FP.trafficConversionEngine, has = { traffic: true, orders: true, revenue: true };
const m = (traffic, orders, revenue) => ({ traffic, orders, revenue, has });
const S = [['Google · orgánico', m(48000, 1056, 462000), m(46500, 1023, 431000)], ['Directo', m(30000, 990, 480000), m(30500, 884, 425000)],
  ['Google · pago', m(22000, 396, 170000), m(26500, 424, 210000)], ['Correo / CRM', m(9000, 495, 285000), m(8800, 484, 290000)], ['Meta · social', m(15000, 180, 70000), m(11000, 121, 52000)]];
const res = { rows: S.map(([label, b, c]) => ({ key: label, label, baseline: b, current: c })) };
let d = E.analyze(res);
const by = (l) => d.allItems.find((x) => x.label === l), r0 = (v) => Math.round(v);
t('estado ok y reconcilia', d.status === 'ok' && d.total.reconciles, d.total);
t('total: tráfico +3,335, CR −86,424, ticket +24,089, Δ −59,000 (calculado aparte en Python)', r0(d.total.traffic) === 3335 && r0(d.total.cr) === -86424 && r0(d.total.aov) === 24089 && r0(d.total.delta) === -59000, d.total);
t('Directo: +8,000 / −59,394 / −3,606', r0(by('Directo').traffic) === 8000 && r0(by('Directo').cr) === -59394 && r0(by('Directo').aov) === -3606);
t('cada segmento suma su Δ venta', d.allItems.every((x) => Math.abs(x.traffic + x.cr + x.aov - x.delta) < 1e-6));
t('orden: mayor pérdida primero (Directo)', d.items[0].label === 'Directo' && d.items[d.items.length - 1].label === 'Google · pago');
t('efecto dominante total = CR', d.dominantEffect === 'cr');
t('mezcla: dentro −0.151 pp, mezcla +0.019 pp, total −0.1325 pp', Math.abs(d.mix.within * 100 + 0.15126) < 1e-4 && Math.abs(d.mix.mix * 100 - 0.018732) < 1e-4 && Math.abs(d.mix.delta * 100 + 0.132526) < 1e-4, d.mix);
t('significancia: Directo CR 3.30→2.90 % con 30k sesiones es significativo', by('Directo').crTest.significant === true, by('Directo').crTest);
t('significancia: Google orgánico (CR igual) no es significativo', by('Google · orgánico').crTest.significant === false);
t('peso: Directo explica 69 % del efecto CR negativo', Math.abs(by('Directo').share.cr - (59394 / 86425)) < 1e-4);
// casos límite
d = E.analyze({ rows: [{ key: 'A', label: 'A', baseline: m(1000, 20, 10000), current: m(1000, 20, 10000) }, { key: 'N', label: 'Nuevo', baseline: null, current: m(2000, 40, 30000) }, { key: 'G', label: 'Gone', baseline: m(1500, 30, 12000), current: null }] });
t('nuevo → todo tráfico; desaparecido → tráfico negativo; reconcilia', d.allItems.find((x) => x.label === 'Nuevo').traffic === 30000 && d.allItems.find((x) => x.label === 'Gone').traffic === -12000 && d.total.reconciles && d.total.delta === 18000, d.total);
d = E.analyze({ rows: [{ key: 'A', label: 'A', baseline: m(1000, 0, 0), current: m(1000, 20, 8000) }] });
t('base sin pedidos → el Δ es conversión', d.allItems[0].cr === 8000 && d.allItems[0].traffic === 0 && d.allItems[0].aov === 0 && d.total.reconciles, d.allItems[0]);
d = E.analyze({ rows: [{ key: 'A', label: 'A', baseline: m(1000, 20, 9000), current: m(1200, 0, 0) }] });
t('hoy sin pedidos → reconcilia (conversión absorbe)', d.total.reconciles && d.total.delta === -9000 && d.allItems[0].aov === 0, d.allItems[0]);
d = E.analyze({ rows: [{ key: 'A', label: 'A', baseline: m(5000, 100, 50000), current: m(5000, 100, 50000) }, { key: 'x', label: 'x', baseline: m(100, 2, 900), current: m(80, 1, 400) }, { key: 'y', label: 'y', baseline: m(50, 1, 300), current: m(60, 3, 1200) }] }, { minSessions: 500 });
t('poco volumen se agrupa en «Otros (2 de poco volumen)» y reconcilia', d.allItems.length === 2 && /Otros \(2/.test(d.allItems[1].label) && d.total.reconciles, d.allItems.map((x) => x.label));
t('sin periodo base → no_baseline', E.analyze({ rows: [{ key: 'A', label: 'A', baseline: null, current: m(10, 1, 100) }] }).status === 'no_baseline');
t('sin datos → no_data', E.analyze({ rows: [] }).status === 'no_data');
d = E.analyze({ rows: [{ key: 'A', label: 'A', baseline: m(1000, 20, 9000), current: { traffic: 900, has: { traffic: true } } }] });
t('segmento sin pedidos/venta en un periodo se excluye y se avisa', d.status === 'no_data' && d.excluded.includes('A'), d);
// frases
d = E.analyze(res); const money = (n) => (n < 0 ? '−' : '+') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'), pct = (v, k = 1) => (v * 100).toFixed(k) + ' %';
const f = E.findings(d, { money, pct });
t('frases: primera = Directo conversión −$59,394 (69 %)', f[0].kind === 'cr' && /Directo/.test(f[0].title) && /69 %/.test(f[0].body) && /−\$59,394/.test(f[0].body), f[0]);
t('frases: hay mezcla de Google · pago (+tráfico, peor CR)', f.some((x) => x.kind === 'mixed' && /Google · pago/.test(x.title)), f.map((x) => x.kind));
t('frases ordenadas por monto absoluto', f.every((x, i) => i === 0 || Math.abs(f[i - 1].amount) >= Math.abs(x.amount)));

// Calidad del tráfico (posible bots / campaña sin intención): umbral mín. sesiones = 500
d = E.analyze({ rows: [
  { key: 'A', label: 'Orgánico', baseline: m(10000, 300, 150000), current: m(10000, 300, 150000) },
  { key: 'B', label: 'Pico', baseline: m(2000, 60, 30000), current: m(6000, 60, 30000) },              // x3 tráfico, CR 3 % → 1 %
  { key: 'C', label: 'Nuevo bajo', baseline: null, current: m(3000, 30, 12000) },                        // nuevo, CR 1 % < 50 % del total
  { key: 'D', label: 'Sin pedidos', baseline: m(900, 9, 4500), current: m(1500, 0, 0) },
  { key: 'E', label: 'Normal', baseline: m(2000, 60, 30000), current: m(2600, 78, 39000) }] });
const q = d.quality.map((x) => x.label + ':' + x.type).sort();
t('calidad: marca pico con CR a la baja, nuevo de baja conversión y sesiones sin pedidos; no marca lo normal', JSON.stringify(q) === JSON.stringify(['Nuevo bajo:new_low_cr', 'Pico:spike_low_cr', 'Sin pedidos:zero_orders']), q);
t('calidad: sin marcas en el caso base', E.analyze(res).quality.length === 0, E.analyze(res).quality);
t('calidad: el aviso no rompe el cuadre', d.total.reconciles);

// «Otros»: cuánto del tráfico actual queda agrupado
d = E.analyze({ rows: [{ key: 'A', label: 'A', baseline: m(6000, 120, 60000), current: m(6000, 120, 60000) }, { key: 'x', label: 'x', baseline: m(300, 6, 900), current: m(300, 6, 900) }, { key: 'y', label: 'y', baseline: m(200, 4, 800), current: m(100, 2, 400) }] });
t('otros: 2 segmentos, 400 sesiones de 6,400 (6.25 %)', d.others && d.others.segments === 2 && d.others.sessions === 400 && Math.abs(d.others.share - 400 / 6400) < 1e-9, d.others);
t('otros: sin agrupar → null', E.analyze(res).others === null);

// Hallazgos triviales: un segmento con CR a la baja pero monto ínfimo frente al movimiento total no genera frase
d = E.analyze({ rows: [{ key: 'A', label: 'Grande', baseline: m(50000, 500, 500000), current: m(50000, 600, 700000) }, { key: 'B', label: 'Minúsculo', baseline: m(1000, 3, 3000), current: m(1000, 2, 2000) }], }, { minSessions: 500 });
const fT = E.findings(d, { money: (n) => String(Math.round(n)), pct: (v) => (v * 100).toFixed(1) + ' %' });
t('hallazgos: el CR a la baja de «Minúsculo» (−$1,000 frente a +$200,000) no sale como frase', !fT.some((x) => /Minúsculo/.test(x.title)), fT.map((x) => x.title));
console.log(`\n${ok} ok, ${bad} fallan`); process.exit(bad ? 1 : 0);
