// Pruebas del motor del embudo de ficha (sin navegador).
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const c = { console }; vm.createContext(c); c.window = c;
for (const f of ['js/analytics/trafficConversionEngine.js', 'js/analytics/funnelEngine.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), c, { filename: f });
const E = c.FP.funnelEngine;
const checks = []; const t = (n, ok, d) => checks.push({ n, ok: !!ok, d });
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const cur = { views: 1284000, cart: 107900, checkout: 65800, purchase: 38200, revenue: 4820000 };
const base = { views: 1190000, cart: 105900, checkout: 66400, purchase: 40100, revenue: 5310000 };
const cmp = E.compare(cur, base);
t('4 pasos y 3 transiciones', cmp.steps.length === 4 && cmp.steps.filter((s) => s.transition).length === 3);
t('tasa vista→carrito = carrito ÷ vistas', near(cmp.steps[1].rateCur, 107900 / 1284000));
t('tasa checkout→compra = compras ÷ checkout', near(cmp.steps[3].rateCur, 38200 / 65800));
t('cambio en pp contra la referencia', near(cmp.steps[3].deltaPp, (38200 / 65800 - 40100 / 66400) * 100));
t('conversión de ficha = compras ÷ vistas', near(cmp.cr.cur, 38200 / 1284000) && near(cmp.cr.base, 40100 / 1190000));
t('el paso más débil es checkout → compra', cmp.weakest && cmp.weakest.label === 'Checkout → compra' && cmp.weakest.deltaPp < -0.3, cmp.weakest);
t('vistas suben (+7.9 %) y la conversión baja: lectura «views_up_cr_down»', E.reading(cmp).kind === 'views_up_cr_down' && near(cmp.steps[0].deltaPct, 1284000 / 1190000 - 1));
const d = E.decompose(cur, base);
t('el reparto vistas × conversión × venta por compra suma exactamente el cambio de venta', d && d.ok && near(d.traffic + d.cr + d.aov, 4820000 - 5310000, 1e-6), d);
t('vistas suben: efecto de tráfico positivo; conversión y venta por compra restan', d.traffic > 0 && d.cr < 0 && d.aov < 0, d);
// sin referencia
const sb = E.compare(cur, null);
t('sin referencia no hay cambios, pero sí tasas', sb && sb.steps[1].rateCur > 0 && sb.steps[1].deltaPp === null && sb.weakest === null);
// datos incompletos
t('faltan pasos: pick devuelve null', E.pick({ views: { value: 10 }, addToCart: { value: null }, beginCheckout: { value: 1 }, purchasesGa4: { value: 1 } }) === null);
t('pick toma los valores de las métricas', E.pick({ views: { value: 10 }, addToCart: { value: 4 }, beginCheckout: { value: 3 }, purchasesGa4: { value: 2 }, revenue: { value: 99 } }).purchase === 2);
t('sin vistas no hay embudo', E.pick({ views: { value: 0 }, addToCart: { value: 0 }, beginCheckout: { value: 0 }, purchasesGa4: { value: 0 } }) === null);
t('sin checkout en la referencia: la tasa de compra es nula, sin NaN', (() => { const x = E.compare(cur, { views: 100, cart: 10, checkout: 0, purchase: 0, revenue: 10 }); return x.steps[3].rateBase === null && x.steps[3].deltaPp === null; })());
t('caída de vistas: lectura «views_down»', E.reading(E.compare({ views: 800, cart: 80, checkout: 40, purchase: 20, revenue: 1 }, { views: 1000, cart: 100, checkout: 50, purchase: 25, revenue: 1 })).kind === 'views_down');
let fail = 0; checks.forEach((x) => { console.log((x.ok ? 'PASS ' : 'FAIL ') + x.n + (x.ok ? '' : ' ' + JSON.stringify(x.d))); if (!x.ok) fail++; });
console.log(fail ? fail + ' fallas' : checks.length + '/' + checks.length + ' PASS'); process.exit(fail ? 1 : 0);
