// Confianza del cierre estimado (4 factores + regla fija).  node tools/test-forecast-confidence.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, Date, JSON }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/forecast/forecastConfidence.js', 'utf8'), ctx);
const FC = ctx.FP.forecastConfidence; let bad = 0, n = 0;
const t = (name, c, d) => { n++; console.log((c ? '✔ ' : '✘ ') + name + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };

const iso = (d) => d.toISOString().slice(0, 10);
/** Serie diaria del 1 ago al 30 sep de 2026 con venta real hasta `lastCounted`; `recent` multiplica los últimos 7 días. */
function mk({ lastCounted = '2026-09-22', recent = 1, counted = 22, status = 'current', missing = 0, confidence = 'excellent', days = 30 } = {}) {
  const rows = []; for (let d = new Date('2026-08-01T00:00:00Z'); iso(d) <= '2026-09-30'; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d), isCounted = date <= lastCounted;
    const last7 = date > iso(new Date(new Date(`${lastCounted}T00:00:00Z`).getTime() - 7 * 86400000)) && date <= lastCounted;
    rows.push({ date, counted: isCounted, closed: isCounted, actual: isCounted ? { revenue: 100 * (last7 ? recent : 1) } : null });
  }
  const month = { key: '2026-09', days, countedDays: counted, status, missingActualDays: missing };
  const series = { days: rows, months: [month], weeks: [{ key: '2026-W38', days: 7, countedDays: 7, status: 'current', missingActualDays: 0 }], annual: { days: 365, countedDays: 265, status: 'current', missingActualDays: 0 }, confidence };
  return { total: series, channels: { ecommerce: series } };
}
const adv = (spreadPct) => ({ advise: () => (spreadPct === null ? null : { range: { spreadPct } }) });
const P = { type: 'month', key: '2026-09' };
const A = (run, spread, ch = 'total', period = P) => FC.assess({ run, channel: ch, period, advisor: adv(spread) });
const f = (r, id) => r.factors.find((x) => x.id === id);

let r = A(mk(), 0.01);
t('todo sólido → Alta', r.status === 'ok' && r.level === 'alta' && r.label === 'Alta' && r.factors.length === 4, r);
t('cada factor trae etiqueta, nivel y detalle con cifras', r.factors.every((x) => x.label && x.levelLabel && /\d/.test(x.detail)), r.factors);
t('cobertura: 22 de 30 días', /22 de 30 días con venta real/.test(f(r, 'cobertura').detail) && f(r, 'cobertura').level === 'alta');

// El caso de la maqueta: cobertura alta, estabilidad media, rango medio, historia baja → Media
r = A(mk({ recent: 1.15, confidence: 'limited' }), 0.03);
t('maqueta: cobertura Alta, estabilidad Media (+15 %), rango Media, historia Baja → Media', r.level === 'media' && f(r, 'estabilidad').level === 'media' && f(r, 'rango').level === 'media' && f(r, 'historia').level === 'baja' && f(r, 'cobertura').level === 'alta', r);
t('la estabilidad dice cuánto cambió', /\+15\.0 %/.test(f(r, 'estabilidad').detail), f(r, 'estabilidad'));

// Topes
r = A(mk({ counted: 5, lastCounted: '2026-09-05' }), 0.01);
t('cobertura Baja (5 de 30) con lo demás sólido → no pasa de Media', f(r, 'cobertura').level === 'baja' && r.level === 'media', r);
r = A(mk({ confidence: 'limited' }), 0.01);
t('un solo factor Baja (historia) con puntaje 0.80 → el tope lo baja de Alta a Media y lo explica', r.score >= 0.75 && r.level === 'media' && r.reasons.some((x) => /un factor en Baja/.test(x)), r);
r = A(mk({ counted: 5, lastCounted: '2026-09-05', confidence: 'limited' }), 0.01);
t('dos factores Baja → Baja', r.level === 'baja', r);
r = A(mk({ missing: 3 }), 0.01);
t('3 días pasados sin venta real: la cobertura baja de Alta a Media y lo dice', f(r, 'cobertura').level === 'media' && /3 día\(s\) pasados sin venta real/.test(f(r, 'cobertura').detail), f(r, 'cobertura'));
r = A(mk({ recent: 1.4 }), 0.01);
t('últimos 7 días +40 % → estabilidad Baja y el total no pasa de Media', f(r, 'estabilidad').level === 'baja' && r.level === 'media', r);
r = A(mk({ recent: 0.92 }), 0.01);
t('−8 % (dentro de ±10 %) → estabilidad Alta', f(r, 'estabilidad').level === 'alta' && /−8\.0 %/.test(f(r, 'estabilidad').detail), f(r, 'estabilidad'));

// Factores que no aplican
r = A(mk({ confidence: null }), 0.01);
t('método A (sin índices): historia no aplica y los otros se reparten el peso', r.factors.length === 3 && !f(r, 'historia') && r.level === 'alta', r);
r = A(mk(), null);
t('sin comparación de métodos: el rango no se califica', r.factors.length === 3 && !f(r, 'rango'), r.factors.map((x) => x.id));
r = A(mk({ lastCounted: '2026-08-10', counted: 10 }), 0.01);
t('pocos días recientes para medir estabilidad → Baja con motivo', f(r, 'estabilidad') && f(r, 'estabilidad').level === 'baja' && /pocos días/.test(f(r, 'estabilidad').detail), f(r, 'estabilidad'));

// Estados
t('periodo cerrado → no hay estimación que calificar', A(mk({ status: 'closed' }), 0.01).status === 'closed');
t('periodo cerrado pero con 8 días sin venta real cargada → sí es estimación (esos días se proyectan) y la cobertura lo dice', A(mk({ status: 'closed', missing: 8, counted: 22 }), 0.01).status === 'ok' && /8 día\(s\) pasados sin venta real/.test(f(A(mk({ status: 'closed', missing: 8, counted: 22 }), 0.01), 'cobertura').detail));
t('periodo futuro → no hay base', A(mk({ status: 'future' }), 0.01).status === 'future');
t('periodo que no existe → sin datos', A(mk(), 0.01, 'total', { type: 'month', key: '2030-01' }).status === 'no_data');
t('sin corrida → sin datos', FC.assess({ run: null, period: P }).status === 'no_data');
t('semana y año también se califican', A(mk(), 0.01, 'total', { type: 'week', key: '2026-W38' }).status === 'ok' && A(mk(), 0.01, 'total', { type: 'year', key: '2026' }).status === 'ok');
t('un canal usa su propia serie', A(mk(), 0.01, 'ecommerce').status === 'ok' && A(mk(), 0.01, 'app').status === 'no_data');
// No se vende como probabilidad
r = A(mk(), 0.01);
t('la nota aclara que no es una probabilidad', /no la probabilidad/.test(r.note), r.note);
t('los pesos suman 1', Math.abs(Object.values(FC.WEIGHTS).reduce((s, v) => s + v, 0) - 1) < 1e-9);

console.log(bad ? `\n✘ ${bad} de ${n} pruebas fallaron` : `\n✔ ${n}/${n} pruebas de confianza del forecast`);
process.exit(bad ? 1 : 0);
