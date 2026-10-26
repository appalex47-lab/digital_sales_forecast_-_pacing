// Calibración de la proyección del año siguiente.  node tools/test-projection-calibration.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, Date, JSON, Set, String, Error, Map }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
const IDS = ['ecommerce', 'app', 'whatsapp'];
ctx.FP = { config: { channelIds: IDS, channels: IDS.map((id) => ({ id, label: id })) }, calendar: { toISODate: (d) => d.toISOString().slice(0, 10) } };
let STORE = null;
ctx.FP.dataStore = { cached: (store, key, deps, fn) => fn(), resolveLatest: (store, type) => (type === 'historical' ? store.rows : []) };
['js/calculations/weights.js', 'js/forecast/distribution.js', 'js/projection/projectionCalibration.js', 'js/projection/projection.js'].forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const PC = ctx.FP.projectionCalibration, PJ = ctx.FP.projection; let bad = 0, n = 0;
const t = (name, c, d) => { n++; console.log((c ? '✔ ' : '✘ ') + name + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

/* ---------- Generador determinista ---------- */
let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const SEAS = [0.8, 0.75, 0.9, 0.95, 1.0, 0.95, 0.9, 0.95, 1.0, 1.1, 1.35, 1.35];     // forma mensual fija
/** serie[idx] para `months` meses desde 2022-01: nivel × estacionalidad × (1 + ruido), con crecimiento anual g */
function make(months, { level = 1e6, g = 0.1, noise = 0.0, shock = null, seas = SEAS, start = 2022 * 12 } = {}) {
  const s = {};
  for (let i = 0; i < months; i++) {
    const idx = start + i, m = idx % 12, yearsIn = i / 12;
    let v = level * Math.pow(1 + g, yearsIn) * seas[m] * (1 + (rnd() * 2 - 1) * noise);
    if (shock && i >= shock.from && i < shock.from + shock.len) v *= shock.mult;
    s[idx] = v;
  }
  return s;
}

/* ---------- 1) Aritmética básica ---------- */
{
  const s = make(36, { g: 0.1 });
  const T = 2022 * 12 + 26;
  t('ritmo de la ventana: crecimiento exacto cuando no hay ruido', near(PC.growthAt(s, T, 6), 0.1, 1e-9) || near(PC.growthAt(s, T, 6), Math.pow(1.1, 1 / 12 * 12) - 1, 0.02), PC.growthAt(s, T, 6));
  t('ritmo: sin los meses del año anterior no hay ritmo', PC.growthAt(make(10), 2022 * 12 + 9, 2) === null);
  const g = PC.growthAt(s, T, 3), p = PC.projectAt(s, T, 6, g), a = s[T + 1] + s[T + 2] + s[T + 3] + s[T + 4] + s[T + 5] + s[T + 6];
  t('proyección usa el año anterior × (1 + ritmo); sin ruido queda cerca de lo real', p !== null && Math.abs(p - a) / a < 0.05, [p, a]);
  t('proyectar sin los meses del año anterior devuelve null', PC.projectAt(s, 2022 * 12 + 5, 12, 0.1) === null);
}

/* ---------- 2) Pocos meses: no calibra ---------- */
{
  const series = { ecommerce: make(20), app: make(20), whatsapp: make(20) };
  const r = PC.calibrate(series, IDS);
  t('con 20 meses no calibra y dice cuántos hacen falta', r.status === 'insufficient' && r.needed === 24 && r.monthsUsed === 20);
  t('con 20 meses los parámetros son los iniciales', PC.isDefault(r.params, IDS));
}

/* ---------- 3) Sin mirar el futuro ---------- */
{
  const s = make(48, { g: 0.08, noise: 0.05 }), last = 2022 * 12 + 47;
  const a = PC.windowCases(s, 3, last);
  const s2 = { ...s }; s2[last] = s[last] * 5;                       // se altera SOLO el último mes
  const b = PC.windowCases(s2, 3, last);
  const same = a.filter((c) => c.T + c.H < last).every((c) => { const d = b.find((x) => x.T === c.T && x.H === c.H); return d && d.pred === c.pred && d.act === c.act; });
  t('alterar el último mes no cambia ningún caso que termina antes (sin fuga de futuro)', same && a.some((c) => c.T + c.H < last));
  const changedAfter = b.filter((c) => c.T + c.H === last).every((c) => { const d = a.find((x) => x.T === c.T && x.H === c.H); return d && d.act !== c.act; });
  t('y sí cambia el real de los casos que lo incluyen', changedAfter);
  const hist = PC.windowCases(s, 3, last), earliest = Math.min(...hist.map((c) => c.T));
  t('el primer origen deja 12 + w meses de historia', earliest >= 2022 * 12 + 12 + 2, earliest - 2022 * 12);
}

/* ---------- 4) Ventana: ruido mensual alto con crecimiento constante → ventana larga; sin ruido → se queda la inicial ---------- */
{
  seed = 11;
  const noisy = { ecommerce: make(60, { g: 0.12, noise: 0.25 }), app: make(60, { g: 0.12, noise: 0.25 }), whatsapp: make(60, { g: 0.12, noise: 0.25 }) };
  const r = PC.calibrate(noisy, IDS);
  t('con ruido alto y crecimiento constante la ventana de 2 meses deja de ser la mejor', r.status === 'ok' && IDS.some((id) => r.channels[id].chosen > 2), IDS.map((id) => [id, r.channels[id].chosen, r.channels[id].status]));
  IDS.forEach((id) => { const c = r.channels[id]; if (c.chosen !== 2) { const def = c.rows.find((x) => x.w === 2), best = c.rows.find((x) => x.w === c.chosen); t(`${id}: el cambio mejora ≥ 10 % y ≥ 0.5 pp sobre la regla inicial`, def.score - best.score >= 0.005 && (def.score - best.score) >= 0.1 * def.score, [def.score, best.score]); } });
  seed = 12;
  const clean = { ecommerce: make(48, { g: 0.1 }), app: make(48, { g: 0.1 }), whatsapp: make(48, { g: 0.1 }) };
  const q = PC.calibrate(clean, IDS);
  t('sin ruido la regla inicial ya es buena: no cambia nada', q.status === 'ok' && IDS.every((id) => q.channels[id].chosen === 2) && q.shares.chosen === 'base' && q.shape.chosen === 'base', IDS.map((id) => q.channels[id].chosen));
  t('sin cambios la lista de cambios queda vacía', q.changes.length === 0);
  t('la calibración es determinista', JSON.stringify(PC.calibrate(noisy, IDS).params) === JSON.stringify(r.params));
}

/* ---------- 5) Un solo canal con un choque grande reciente: la ventana larga lo amortigua ---------- */
{
  seed = 21;
  const ch = (shock) => make(60, { g: 0.05, noise: 0.03, shock });
  const mk = (shock) => { seed = 22; const e = ch(null), a = ch(shock), w = ch(null); return PC.calibrate({ ecommerce: e, app: a, whatsapp: w }, IDS); };
  const r = mk({ from: 30, len: 3, mult: 1.9 }), r0 = mk(null);
  t('cada canal se calibra por separado: un choque en app no cambia lo elegido para ecommerce ni whatsapp', r.channels.ecommerce.chosen === r0.channels.ecommerce.chosen && r.channels.whatsapp.chosen === r0.channels.whatsapp.chosen);
  t('el choque del canal app se refleja en un error mayor que el de ecommerce', r.channels.app.h12.p80 !== null && r.channels.ecommerce.h12.p80 !== null && r.channels.app.h12.p80 > r.channels.ecommerce.h12.p80, [r.channels.app.h12, r.channels.ecommerce.h12]);
}

/* ---------- 6) Reparto entre canales ---------- */
{
  seed = 31;
  // participación que cambia con el tiempo: ecommerce crece 25 %/año, app cae, whatsapp estable
  const drift = { ecommerce: make(60, { level: 1.0e6, g: 0.25, noise: 0.01 }), app: make(60, { level: 1.2e6, g: -0.05, noise: 0.01 }), whatsapp: make(60, { level: 0.5e6, g: 0.05, noise: 0.01 }) };
  const r = PC.calibrate(drift, IDS);
  t('con participaciones que se mueven, alguna alternativa a la base mide mejor', r.shares.status === 'changed' && r.shares.chosen !== 'base', [r.shares.chosen, r.shares.rows]);
  seed = 32;
  const flat = { ecommerce: make(60, { level: 1.0e6, g: 0.1, noise: 0.01 }), app: make(60, { level: 1.2e6, g: 0.1, noise: 0.01 }), whatsapp: make(60, { level: 0.5e6, g: 0.1, noise: 0.01 }) };
  const f = PC.calibrate(flat, IDS);
  t('con participaciones estables se queda la de la base', f.shares.chosen === 'base');
  const sug = PC.suggestShares(drift, IDS, 'trend');
  t('el reparto sugerido suma exactamente 100 y todos son ≥ 0', sug && near(IDS.reduce((a, id) => a + sug[id], 0), 100, 1e-9) && IDS.every((id) => sug[id] >= 0), sug);
  t('la tendencia empuja al canal que crece por encima de su participación reciente', PC.suggestShares(drift, IDS, 'trend').ecommerce > PC.suggestShares(drift, IDS, 'base').ecommerce);
}

/* ---------- 7) Forma de los meses ---------- */
{
  seed = 41;
  // la forma es la misma cada año pero con ruido mensual grande: promediar años debe medir mejor que usar solo el último
  const ser = () => make(72, { g: 0.05, noise: 0.18 });
  const r = PC.calibrate({ ecommerce: ser(), app: ser(), whatsapp: ser() }, IDS);
  t('con ruido mensual y forma estable, promediar años mide mejor que el último año solo', r.shape.status === 'changed' && ['avg2', 'avg3'].includes(r.shape.chosen), [r.shape.chosen, r.shape.rows]);
  seed = 42;
  const short = PC.calibrate({ ecommerce: make(30, { noise: 0.1 }), app: make(30, { noise: 0.1 }), whatsapp: make(30, { noise: 0.1 }) }, IDS);
  t('con 30 meses no hay casos para comparar la forma: se queda con la del año base', short.shape.status === 'insufficient' && short.shape.chosen === 'base' && PC.defaultParams(IDS).shapeMethod === 'base');
  const w = PC.shapeWeights('avg2', [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0], null]);
  t('shapeWeights promedia las participaciones de los años', near(w.weights.reduce((a, b) => a + b, 0), 1, 1e-9) && w.used === 'avg2');
  t('shapeWeights sin año anterior completo cae a la forma del año base', PC.shapeWeights('avg2', [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], null, null]).used === 'base');
}

/* ---------- 8) Estado, historial, deshacer ---------- */
{
  const d = PC.defaultParams(IDS);
  t('parámetros iniciales: ritmo de 2 meses, reparto y forma de la base', IDS.every((id) => d.windows[id] === 2) && d.shareMethod === 'base' && d.shapeMethod === 'base');
  t('normalize tolera basura sin lanzar', (() => { try { return PC.normalize(7, IDS).auto === true && PC.normalize({ active: { params: { windows: { app: 99 }, shareMethod: 'xx' } }, history: [null, 5] }, IDS).active.params.windows.app === 2; } catch (e) { return false; } })());
  t('el interruptor de calibrar sola viene encendido por defecto y se respeta apagado', PC.emptyState().auto === true && PC.normalize({ auto: false }, IDS).auto === false);
  const res = { status: 'ok', monthsUsed: 48, params: { windows: { ecommerce: 6, app: 2, whatsapp: 2 }, shareMethod: 'trend', shapeMethod: 'base' }, changes: ['ecommerce: ritmo de los últimos 6 meses (antes 2).'], channels: { ecommerce: { chosen: 6, status: 'changed', h12: { n: 8 }, verdict: 'si', band: 0.12, months: 48 }, app: { chosen: 2, status: 'kept', h12: { n: 8 }, verdict: 'si', band: 0.12, months: 48 }, whatsapp: { chosen: 2, status: 'kept', h12: { n: 8 }, verdict: 'casi', band: 0.2, months: 48 } }, total: { after: {}, before: {}, verdict: 'si' }, shares: { chosen: 'trend', status: 'changed' }, shape: { chosen: 'base', status: 'kept' } };
  let st = PC.emptyState();
  st = PC.applyResult(st, res, IDS, { at: '2026-10-25T10:00:00Z', trigger: 'auto', month: '2026-09' });
  t('aplicar una calibración deja los parámetros activos, el historial y el último mes automático', st.active.params.windows.ecommerce === 6 && st.history.length === 1 && st.lastAutoMonth === '2026-09' && st.history[0].trigger === 'auto');
  t('paramsOf devuelve lo activo', PC.paramsOf(st, IDS).windows.ecommerce === 6 && PC.paramsOf(PC.emptyState(), IDS).windows.ecommerce === 2);
  t('autoDue: no repite el mismo mes y exige 24 meses', !PC.autoDue(st, '2026-09', 48).due && PC.autoDue(st, '2026-10', 48).due && !PC.autoDue(st, '2026-10', 20).due && !PC.autoDue({ ...st, auto: false }, '2026-10', 48).due);
  const un = PC.undo(st, IDS, { at: '2026-10-25T11:00:00Z' });
  t('deshacer vuelve a la regla inicial y lo anota', un.active === null && un.history.length === 2 && un.history[0].undone === true && un.history[1].kind === 'undo');
  t('deshacer dos veces seguidas no hace nada más', PC.undo(un, IDS) === un);
  const rs = PC.reset(st, IDS, { at: '2026-10-25T12:00:00Z' });
  t('volver a la regla inicial queda en el historial y se puede deshacer', rs.active === null && rs.history[rs.history.length - 1].kind === 'reset' && PC.undo(rs, IDS).active !== null);
  t('reset sin nada activo no cambia el estado', PC.reset(PC.emptyState(), IDS) !== null && (() => { const e = PC.emptyState(); return PC.reset(e, IDS) === e; })());
  const same = PC.applyResult(PC.emptyState(), { ...res, params: d, changes: [] }, IDS, { at: '2026-10-25T10:00:00Z' });
  t('sin cambios se anota «sin cambios» y los parámetros siguen siendo los iniciales', PC.isDefault(PC.paramsOf(same, IDS), IDS) && /Sin cambios/.test(same.history[0].text[0]));
  t('guardar y volver a leer no pierde nada', JSON.stringify(PC.normalize(JSON.parse(JSON.stringify(st)), IDS)) === JSON.stringify(PC.normalize(st, IDS)));
}

/* ---------- 9) Integración con la proyección ---------- */
{
  seed = 51;
  const rows = [], chS = { ecommerce: make(46, { g: 0.1, noise: 0.15, start: 2022 * 12 }), app: make(46, { g: 0.2, noise: 0.15, start: 2022 * 12 }), whatsapp: make(46, { g: 0.0, noise: 0.15, start: 2022 * 12 }) };
  // 2022-01 … 2025-10 en días (cada mes: venta repartida en sus días, todos los días con dato)
  IDS.forEach((ch) => Object.keys(chS[ch]).forEach((k) => {
    const idx = +k, y = Math.floor(idx / 12), m = (idx % 12) + 1, dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) rows.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, channel: ch, metrics: { revenue: { source: 'observed', value: chS[ch][k] / dim }, orders: null, trafficVolume: null } });
  }));
  STORE = { rows };
  const today = '2025-11-05';
  const plain = PJ.build(STORE, { baseYear: 2025, growth: 0.16, today });
  const defaults = PJ.build(STORE, { baseYear: 2025, growth: 0.16, today, calibration: PC.defaultParams(IDS) });
  t('sin calibración y con parámetros iniciales la proyección es idéntica', plain.projection.total === defaults.projection.total && JSON.stringify(plain.rows.map((r) => r.proj)) === JSON.stringify(defaults.rows.map((r) => r.proj)));
  t('la calibración no toca la meta', plain.meta.total === defaults.meta.total && plain.rows.every((r, i) => r.meta === defaults.rows[i].meta));
  const cal = { windows: { ecommerce: 6, app: 12, whatsapp: 3 }, shareMethod: 'trend', shapeMethod: 'base' };
  const c = PJ.build(STORE, { baseYear: 2025, growth: 0.16, today, calibration: cal });
  t('con otra ventana la proyección cambia pero la meta y la base no', c.projection.total !== plain.projection.total && c.meta.total === plain.meta.total && c.base.total === plain.base.total);
  t('cada fila informa la ventana que usó', c.rows.every((r) => r.window === cal.windows[r.id]) && plain.rows.every((r) => r.window === 2));
  t('el ritmo de la ventana corresponde a esos meses contra el año anterior', (() => { const ser = PJ.series(STORE, today), ks = Object.keys(ser.app).map(Number), T = Math.max(...ks); let a = 0, b = 0; for (let i = T - 11; i <= T; i++) { a += ser.app[i]; b += ser.app[i - 12]; } const row = c.rows.find((r) => r.id === 'app'); return near(row.projGrowth, a / b - 1, 1e-9); })());
  t('el reparto sugerido suma 100 y se entrega solo como sugerencia', c.suggestedShares && near(IDS.reduce((a, id) => a + c.suggestedShares[id], 0), 100, 1e-9) && c.sharesCustom === false && c.rows.every((r, i) => r.metaShare === plain.rows[i].metaShare));
  t('el reparto mensual con forma «base» suma lo mismo que el total', c.monthly.reduce((s, m) => s + m.total.proj, 0) === c.projection.total);
  const av = PJ.build(STORE, { baseYear: 2025, growth: 0.16, today, calibration: { ...PC.defaultParams(IDS), shapeMethod: 'avg2' } });
  t('con forma de 2 años el reparto mensual cambia pero el total no', av.projection.total === plain.projection.total && JSON.stringify(av.monthly.map((m) => m.total.proj)) !== JSON.stringify(plain.monthly.map((m) => m.total.proj)) && av.monthly.reduce((s, m) => s + m.total.proj, 0) === av.projection.total);
  t('la meta mensual también suma la meta', av.monthly.reduce((s, m) => s + m.total.meta, 0) === av.meta.total);
  const exp = PJ.toExport(c, {});
  t('el export dice qué calibración se usó', exp.assumptions.calibration && exp.assumptions.calibration.windows.app === 12 && exp.assumptions.calibration.applied === true);
  // calibrar sobre estos datos reales de la prueba
  const r = PC.calibrate(PJ.series(STORE, today), IDS, {});
  t('calibrar sobre la serie de la proyección funciona con 46 meses', r.status === 'ok' && r.monthsUsed === 46 && r.lastClosedKey === '2025-10', [r.status, r.monthsUsed, r.lastClosedKey]);
  t('una ventana sin meses comparables deja la proyección del canal igual a su base y avisa', (() => { const x = PJ.build(STORE, { baseYear: 2023, growth: 0.16, today: '2023-03-05', calibration: { ...PC.defaultParams(IDS), windows: { ecommerce: 12, app: 2, whatsapp: 2 } } }); const r = x.rows.find((q) => q.id === 'ecommerce'); return x.hasData && r.projGrowth === 0 && x.warnings.some((w) => /12 meses cerrados comparables/.test(w)); })());
}


/* ---------- 10) Tope del ritmo y casos a 12 meses ---------- */
{
  t('capGrowth recorta a [−30 %, +50 %] y respeta lo de adentro', PC.capGrowth(1.26) === 0.5 && PC.capGrowth(-0.9) === -0.3 && PC.capGrowth(0.12) === 0.12 && PC.MAX_GROWTH === 0.5 && PC.MIN_GROWTH === -0.3);
  // el backtest proyecta con el ritmo recortado: serie que triplica cada año → la proyección usa +50 %, no +200 %
  const trip = {}; for (let i = 0; i < 40; i++) trip[2022 * 12 + i] = 100 * Math.pow(3, i / 12);
  const T = 2022 * 12 + 30, cs = PC.windowCases(trip, 6, 2022 * 12 + 39).find((c) => c.T === T && c.H === 6);
  const prior = [1, 2, 3, 4, 5, 6].reduce((a, k) => a + trip[T + k - 12], 0);
  t('el backtest también aplica el tope', cs && near(cs.pred, prior * 1.5, 1e-6), [cs && cs.pred, prior * 1.5]);
  // proyección: un canal que crece 126 % se proyecta con +50 % y avisa; la meta no cambia
  seed = 61;
  const rows = [], mk = (g, id) => make(46, { g, noise: 0.01, start: 2022 * 12 });
  const chS = { ecommerce: mk(0.1), app: mk(0.2), whatsapp: mk(0.0) };
  Object.keys(chS.app).forEach((k) => { if (+k >= 2025 * 12 + 3) chS.app[k] *= 2.26; });   // abril–octubre de 2025 explotan contra 2024
  IDS.forEach((ch) => Object.keys(chS[ch]).forEach((k) => { const idx = +k, y = Math.floor(idx / 12), m = (idx % 12) + 1, dim = new Date(Date.UTC(y, m, 0)).getUTCDate(); for (let d = 1; d <= dim; d++) rows.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, channel: ch, metrics: { revenue: { source: 'observed', value: chS[ch][k] / dim }, orders: null, trafficVolume: null } }); }));
  STORE = { rows };
  const r = PJ.build(STORE, { baseYear: 2025, growth: 0.16, today: '2025-11-05' }), a = r.rows.find((x) => x.id === 'app');
  t('un ritmo de +126 % se proyecta con el tope (+50 %) y se informa el medido', a.capped === true && a.projGrowth === 0.5 && a.rawGrowth > 1.0, [a.rawGrowth, a.projGrowth]);
  t('la proyección del canal es su base × 1.5 y avisa con el rango aceptado', a.proj === Math.round(a.base * 1.5) && r.warnings.some((w) => /app.*fuera del rango/.test(w)), r.warnings);
  t('los canales dentro del rango no se tocan', r.rows.filter((x) => x.id !== 'app').every((x) => x.capped === false && x.projGrowth === x.rawGrowth));
  const base = PJ.build(STORE, { baseYear: 2025, growth: 0.16, today: '2025-11-05', calibration: PC.defaultParams(IDS) });
  t('el tope no cambia la meta', r.meta.total === base.meta.total);
  // 33 meses con ruido: ventanas de 6 y 12 no alcanzan 6 casos a 12 meses → no se pueden elegir
  seed = 71;
  const n33 = () => make(33, { g: 0.1, noise: 0.2 });
  const q = PC.calibrate({ ecommerce: n33(), app: n33(), whatsapp: n33() }, IDS);
  t('con 33 meses ninguna ventana de 6 o 12 meses puede ganar (faltan casos a 12 meses)', IDS.every((id) => q.channels[id].chosen <= 3), IDS.map((id) => [id, q.channels[id].chosen, q.channels[id].status]));
}

console.log(`\n${n - bad}/${n} pruebas pasan`);
process.exit(bad ? 1 : 0);
