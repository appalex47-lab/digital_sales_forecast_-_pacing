// Calibración de la confianza del forecast (Fase 3.3).  node tools/test-forecast-calibration.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, Date, JSON, Promise, Set, String, Error }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
['js/forecast/forecastConfidence.js', 'js/forecast/forecastCalibration.js'].forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const FC = ctx.FP.forecastConfidence, CAL = ctx.FP.forecastCalibration; let bad = 0, n = 0;
const t = (name, c, d) => { n++; console.log((c ? '✔ ' : '✘ ') + name + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const iso = (d) => d.toISOString().slice(0, 10);
const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort().reduce((a, kk) => { a[kk] = v[kk]; return a; }, {}) : v));
const pad = (x) => String(x).padStart(2, '0');
const dim = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 0)).getUTCDate();

/* ---------- Mundo sintético: 14 meses cerrados (2025-07 … 2026-08); el error del cierre estimado baja a medida que avanza el mes ---------- */
const KEYS = []; for (let y = 2025, m = 7; KEYS.length < 14; m++) { if (m > 12) { m = 1; y++; } KEYS.push(`${y}-${pad(m)}`); }
const ACTUAL = {}; KEYS.forEach((k, i) => { ACTUAL[k] = 1000000 + i * 10000; });
const ERR = { 5: 0.12, 10: 0.09, 15: 0.06, 20: 0.04, 25: 0.02 };
const sign = (k, c) => ((+k.slice(5, 7) + c) % 2 ? 1 : -1);
/** Corrida falsa: venta real hasta el corte, mes en curso, cierre estimado con el error del mundo. */
function fakeRun(key, cut, { estimate, recent = 1, err } = {}) {
  const days = dim(key), rows = [], first = new Date(`${key}-01T00:00:00Z`);
  for (let b = 28; b >= 1; b--) { const dt = new Date(first.getTime() - b * 86400000); rows.push({ date: iso(dt), counted: true, closed: true, actual: { revenue: 100 } }); }   // el mes anterior ya cerrado
  for (let d = 1; d <= days; d++) { const date = `${key}-${pad(d)}`, counted = d <= cut; rows.push({ date, counted, closed: counted, actual: counted ? { revenue: d > cut - 7 ? 100 * recent : 100 } : null }); }
  const est = estimate !== undefined ? estimate : ACTUAL[key] * (1 + sign(key, cut) * (err !== undefined ? err : ERR[cut]));
  const month = { key, days, countedDays: cut, status: 'current', missingActualDays: 0, forecast: { revenue: est }, actualToDate: { revenue: cut * 100 } };
  const series = { days: rows, months: [month], weeks: [], annual: { days: 365, countedDays: 200, status: 'current', missingActualDays: 0 }, confidence: 'excellent' };
  return { total: series, channels: {} };
}
const advisor = { advise: () => ({ range: { spreadPct: 0.01 } }) };
const sampleOf = (key, cut) => {
  const run = fakeRun(key, cut), a = FC.assess({ run, channel: 'total', period: { type: 'month', key }, advisor, thresholds: FC.INITIAL });
  const est = run.total.months[0].forecast.revenue, err = (est - ACTUAL[key]) / ACTUAL[key];
  return { month: key, year: +key.slice(0, 4), cut, estimate: est, actual: ACTUAL[key], err, abs: Math.abs(err), label: a.level, factors: a.factors.map((f) => ({ id: f.id, value: f.value, miss: f.miss || 0, fixed: Boolean(f.fixed), level: f.level })) };
};
/** Mundo B: el error depende de qué tan estable venía la última semana (calma, media, agitada), no del día del corte. */
const VOL = [{ recent: 1.02, err: 0.02 }, { recent: 1.18, err: 0.05 }, { recent: 1.45, err: 0.15 }];
const sampleB = (key, cut, i) => {
  const v = VOL[i % 3], run = fakeRun(key, cut, v), a = FC.assess({ run, channel: 'total', period: { type: 'month', key }, advisor, thresholds: FC.INITIAL });
  const est = run.total.months[0].forecast.revenue, err = (est - ACTUAL[key]) / ACTUAL[key];
  return { month: key, year: +key.slice(0, 4), cut, estimate: est, actual: ACTUAL[key], err, abs: Math.abs(err), label: a.level, factors: a.factors.map((f) => ({ id: f.id, value: f.value, miss: f.miss || 0, fixed: Boolean(f.fixed), level: f.level })) };
};
const SB = []; KEYS.forEach((k, i) => CAL.CUTS.forEach((c) => SB.push(sampleB(k, c, i))));
const allSamples = (keys = KEYS) => { const o = []; keys.forEach((k) => CAL.CUTS.forEach((c) => o.push(sampleOf(k, c)))); return o; };

/* ---------- Percentiles y resúmenes ---------- */
t('percentil 0.8 por rango más cercano (10 valores → el 8.º)', CAL.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.8) === 8);
t('mediana de 1..5 = 3 y de vacío = null', CAL.median([5, 4, 3, 2, 1]) === 3 && CAL.median([]) === null);
t('ignora valores no numéricos', CAL.percentile([NaN, 2, undefined, 4], 0.5) === 2);
const S = allSamples();
t('70 muestras (14 meses × 5 cortes)', S.length === 70 && CAL.monthsOf(S).length === 14);
const sm = CAL.summarize(S, null);
t('resumen: los casos suman el total y cada etiqueta trae n, típico y p80', sm.n === 70 && ['alta', 'media', 'baja'].reduce((s, l) => s + sm.labels[l].n, 0) === 70 && sm.labels.alta.p80 !== null);
t('con umbrales iniciales: los cortes 15, 20 y 25 salen Alta y el p80 de Alta (6 %) rebasa el 3 % esperado', sm.labels.alta.n === 43 && Math.abs(sm.labels.alta.p80 - 0.06) < 1e-9, sm.labels.alta);
const bc = CAL.byCut(S);
t('error por corte: baja a medida que avanza el mes', bc[5].typical > bc[10].typical && bc[10].typical > bc[15].typical && bc[15].typical > bc[20].typical && bc[20].typical > bc[25].typical && bc[25].n === 14, bc);

/* ---------- Calibrar ---------- */
const few = CAL.calibrate(allSamples(KEYS.slice(0, 11)));
t('con 11 meses no calibra: dice cuántos tiene y cuántos faltan', few.status === 'insufficient' && few.monthsUsed === 11 && few.needed === 12 && !few.thresholds, few);
const cal = CAL.calibrate(S);
t('con 14 meses calibra', cal.status === 'ok' && cal.monthsUsed === 14 && cal.cases === 70, cal.status);
t('solo mueve umbrales conocidos (6) y respeta el orden Alta/Media', Object.keys(cal.thresholds).sort().join() === CAL.TUNABLE.slice().sort().join() && cal.thresholds.cobAlta >= cal.thresholds.cobMedia && cal.thresholds.estAlta <= cal.thresholds.estMedia && cal.thresholds.rngAlta <= cal.thresholds.rngMedia, cal.thresholds);
const smB = CAL.summarize(SB, null), calB = CAL.calibrate(SB);
t('mundo B con umbrales iniciales: Alta rebasa el 3 % (hay meses de estabilidad «Media» que igual salen Alta)', smB.labels.alta.p80 > 0.03, smB.labels.alta);
t('mundo B calibrado: Alta pasa a ≤ 3 % con casos suficientes y lo dice', calB.after.labels.alta.n >= CAL.MIN_CASES && calB.after.labels.alta.p80 <= 0.03 && calB.meets.alta === true, { a: calB.after.labels.alta, m: calB.meets });
t('hubo cambios y el p80 de Alta después es menor que antes', calB.changes.length > 0 && calB.after.labels.alta.p80 < calB.before.labels.alta.p80, calB.changes);
t('«se cumple» es coherente con el p80 medido (no es un texto aparte)', calB.meets.alta === (calB.after.labels.alta.p80 <= calB.targets.alta) && calB.meets.media === (calB.after.labels.media.p80 <= calB.targets.media));
t('mundo A (error solo por día de corte, sin factor que lo explique): no inventa que cumple', cal.meets.media !== true, cal.meets);
t('cada cambio trae texto legible «Días con venta real Alta: ≥ 60 % → ≥ 90 %»', calB.changes.every((c) => /^.+ (Alta|Media): .+ → .+$/.test(c.text) && c.from !== c.to), calB.changes);
t('no toca pesos ni cortes del puntaje ni historia', !('cutAlta' in cal.thresholds) && !('hisAlta' in cal.thresholds) && FC.WEIGHTS.cobertura === 0.30);
const cal2 = CAL.calibrate(S);
t('es determinista: mismos datos, mismo resultado', JSON.stringify(cal2.thresholds) === JSON.stringify(cal.thresholds));
// Mundo ya bien calibrado → no cambia nada
const flat = S.map((s) => ({ ...s, err: 0.01, abs: 0.01 }));
const calFlat = CAL.calibrate(flat);
t('si todo ya cumple con los iniciales, no propone cambios', calFlat.status === 'ok' && calFlat.changes.length === 0 && calFlat.meets.alta === true, calFlat.changes);
// Mundo imposible: todo con 15 % de error → no cumple y lo dice con honestidad
const bad15 = S.map((s) => ({ ...s, err: 0.15, abs: 0.15 }));
const calBad = CAL.calibrate(bad15);
t('si ningún umbral logra la banda, dice que NO se cumple (no maquilla)', calBad.status === 'ok' && calBad.meets.alta !== true && calBad.meets.media !== true, calBad.meets);
t('los umbrales nunca salen de sus límites', CAL.TUNABLE.every((k) => cal.thresholds[k] > 0) && CAL.TUNABLE.every((k) => calBad.thresholds[k] > 0));
t('objetivos propios (6 %/10 %) se respetan', CAL.calibrate(S, { targets: { alta: 0.06, media: 0.1 } }).targets.alta === 0.06);

/* ---------- Muestras desde el motor (inyectado) ---------- */
(async () => {
  const closed = KEYS.map((k) => ({ key: k, year: +k.slice(0, 4), actual: ACTUAL[k], days: dim(k) }));
  const refs = []; let prog = 0, last = null;
  const runAt = (year, ref) => { refs.push(ref); const k = ref.slice(0, 7), cut = +ref.slice(8, 10); return fakeRun(k, cut); };
  let r = await CAL.collectSamples({ closed, runAt, advisor, onProgress: (d, tt) => { prog++; last = [d, tt]; }, yieldFn: async () => {} });
  t('recorre mes × corte: 70 corridas y 70 muestras', r.total === 70 && r.samples.length === 70 && r.skipped === 0 && !r.stopped, { total: r.total, n: r.samples.length });
  t('la fecha de referencia es el corte (día 5, 10, 15, 20, 25)', refs.slice(0, 5).join() === `${KEYS[0]}-05,${KEYS[0]}-10,${KEYS[0]}-15,${KEYS[0]}-20,${KEYS[0]}-25`, refs.slice(0, 5));
  t('avisa el avance hasta 70 de 70', prog === 70 && last[0] === 70 && last[1] === 70);
  t('una muestra trae error con signo, valor absoluto, etiqueta y factores medidos', r.samples.every((s) => Math.abs(s.abs - Math.abs(s.err)) < 1e-12 && ['alta', 'media', 'baja'].includes(s.label) && s.factors.length === 4));
  t('las muestras de collectSamples coinciden con las armadas a mano', JSON.stringify(r.samples[3]) === JSON.stringify(sampleOf(KEYS[0], 20)));
  refs.length = 0;
  r = await CAL.collectSamples({ closed: closed.slice(0, 1), runAt: (y, ref) => { refs.push(ref); const cut = +ref.slice(8, 10) - 1; return fakeRun(ref.slice(0, 7), cut); }, todayStatus: 'in_progress', advisor });
  t('con «día en curso» la referencia es el día siguiente al corte (el motor usa hasta el día anterior)', refs.join() === `${KEYS[0]}-06,${KEYS[0]}-11,${KEYS[0]}-16,${KEYS[0]}-21,${KEYS[0]}-26`, refs);
  r = await CAL.collectSamples({ closed: closed.slice(0, 2), runAt: (y, ref) => { const k = ref.slice(0, 7), cut = +ref.slice(8, 10); return fakeRun(k, cut, { estimate: cut === 10 ? null : undefined }); }, advisor });
  t('si el motor no da cierre estimado, la muestra se salta y se cuenta (también por año)', r.skipped === 2 && r.samples.length === 8 && r.skippedByYear[2025] === 2, { s: r.skipped, n: r.samples.length, y: r.skippedByYear });
  r = await CAL.collectSamples({ closed: closed.slice(0, 2), runAt: (y, ref) => { if (ref.endsWith('-15')) throw new Error('boom'); return fakeRun(ref.slice(0, 7), +ref.slice(8, 10)); }, advisor });
  t('si una corrida falla no tumba todo: se cuenta como saltada', r.skipped === 2 && r.samples.length === 8);
  let calls = 0;
  r = await CAL.collectSamples({ closed, runAt, advisor, shouldStop: () => ++calls > 7 });
  t('se puede cancelar a la mitad (devuelve lo hecho y stopped)', r.stopped === true && r.samples.length === 7, r.samples.length);
  r = await CAL.collectSamples({ closed: [{ key: '2026-02', year: 2026, actual: 1, days: 28 }], runAt: (y, ref) => fakeRun('2026-02', +ref.slice(8, 10)), advisor });
  t('febrero (28 días) usa los 5 cortes; ningún corte cae fuera del mes', r.total === 5);

  /* ---------- Meses cerrados desde las corridas ---------- */
  const mon = (key, o = {}) => ({ key, status: 'closed', days: 30, countedDays: 30, missingActualDays: 0, actualToDate: { revenue: 5 }, ...o });
  const cm = CAL.closedMonthsOf({ 2025: { total: { months: [mon('2025-11'), mon('2025-12', { missingActualDays: 1 }), mon('2025-10', { status: 'current' }), mon('2025-09', { countedDays: 29 }), mon('2025-08', { actualToDate: { revenue: 0 } })] } }, 2026: { total: { months: [mon('2026-01')] } }, 2027: null });
  t('closedMonthsOf: solo cerrados completos con venta real y ordenados', cm.map((x) => x.key).join() === '2025-11,2026-01', cm);

  /* ---------- Estado, historial, deshacer ---------- */
  t('estado vacío: auto apagado, sin calibración', (() => { const s = CAL.emptyState(); return s.auto === false && s.active === null && s.history.length === 0; })());
  t('normalize tolera basura sin lanzar', [null, 5, 'x', {}, { active: { thresholds: { cobAlta: 'a' } }, history: [1, null, {}] }, { active: { thresholds: { cobAlta: 0.1, cobMedia: 0.5, estAlta: 0.1, estMedia: 0.25, rngAlta: 0.02, rngMedia: 0.05 } } }].every((x) => { const s = CAL.normalize(x); return s.active === null && s.history.length === 0; }));
  const ok = CAL.normalize({ auto: true, active: { thresholds: cal.thresholds, at: '2026-10-01T00:00:00Z', monthsUsed: 14 } });
  t('normalize conserva un estado válido', ok.auto === true && ok.active && ok.active.thresholds.cobAlta === cal.thresholds.cobAlta);
  let st = CAL.emptyState();
  st = CAL.applyResult(st, cal, { at: '2026-10-05T10:00:00Z', trigger: 'manual' });
  t('aplicar una calibración la deja activa y la anota con fecha, meses y cambios', st.active && st.active.thresholds.cobAlta === cal.thresholds.cobAlta && st.history.length === 1 && st.history[0].monthsUsed === 14 && st.history[0].text.length === cal.changes.length && st.history[0].from.cobAlta === FC.INITIAL.cobAlta, st.history);
  t('lo guardado es serializable y se lee igual', canon(CAL.normalize(JSON.parse(JSON.stringify(st)))) === canon(st));
  t('applyResult con «insufficient» no cambia nada', CAL.applyResult(st, few) === st);
  const st2 = CAL.applyResult(CAL.emptyState(), calFlat, { at: '2026-10-05T10:00:00Z' });
  t('si no hay cambios queda anotado como «sin cambios» y no activa umbrales distintos', st2.history[0].text[0].startsWith('Sin cambios') && TUN(st2.active.thresholds));
  function TUN(th) { return CAL.TUNABLE.every((k) => th[k] === FC.INITIAL[k]); }
  const st3 = CAL.undo(st, { at: '2026-10-06T10:00:00Z' });
  t('deshacer vuelve a los umbrales anteriores (aquí los iniciales) y lo anota', st3.active === null && st3.history.length === 2 && st3.history[0].undone === true && st3.history[1].kind === 'undo', st3.history);
  t('no se puede deshacer dos veces lo mismo', CAL.undo(st3) === st3 || CAL.undo(st3).history.length === st3.history.length);
  let stA = CAL.applyResult(CAL.emptyState(), cal, { at: '2026-10-05T10:00:00Z' });
  const cal3 = { ...cal, thresholds: { ...cal.thresholds, estAlta: 0.12 }, changes: [{ text: 'x' }] };
  stA = CAL.applyResult(stA, cal3, { at: '2026-11-05T10:00:00Z', trigger: 'auto', month: '2026-10' });
  t('segunda calibración: guarda desde cuáles venía, marca auto y el último mes', stA.history[1].trigger === 'auto' && stA.history[1].from.cobAlta === cal.thresholds.cobAlta && stA.lastAutoMonth === '2026-10');
  const stB = CAL.undo(stA, { at: '2026-11-06T10:00:00Z' });
  t('deshacer la segunda deja activa la primera', stB.active && stB.active.thresholds.estAlta === cal.thresholds.estAlta && stB.history[1].undone === true);
  const stR = CAL.reset(stA, { at: '2026-11-07T10:00:00Z' });
  t('volver a los iniciales: sin calibración activa y queda en el historial', stR.active === null && stR.history[stR.history.length - 1].kind === 'reset' && CAL.reset(stR) === stR);
  t('el historial se limita a 50 entradas', (() => { let s = CAL.emptyState(); for (let i = 0; i < 60; i++) s = CAL.applyResult(s, cal, { at: `2026-10-05T10:${pad(i % 60)}:00Z` }); return s.history.length === 50; })());
  t('thrOf: iniciales si no hay calibración', TUN(CAL.thrOf(CAL.emptyState())));

  /* ---------- Recalibrar sola ---------- */
  const keys = KEYS;
  t('auto apagado → no toca', CAL.autoDue({ ...CAL.emptyState(), auto: false }, keys).due === false);
  t('auto encendido con < 12 meses → no toca', CAL.autoDue({ ...CAL.emptyState(), auto: true }, keys.slice(0, 11)).reason === 'pocos_meses');
  t('auto encendido y mes nuevo → toca', CAL.autoDue({ ...CAL.emptyState(), auto: true }, keys).due === true && CAL.autoDue({ ...CAL.emptyState(), auto: true }, keys).month === KEYS[13]);
  t('auto encendido pero ya se hizo con ese mes → no repite', CAL.autoDue({ ...CAL.emptyState(), auto: true, lastAutoMonth: KEYS[13] }, keys).reason === 'ya_hecho');
  t('al cerrar un mes más, vuelve a tocar', CAL.autoDue({ ...CAL.emptyState(), auto: true, lastAutoMonth: KEYS[12] }, keys).due === true);

  /* ---------- Frase para Pacing ---------- */
  const ph = CAL.phrase(cal.after ? { after: { media: { n: 28, p80: 0.0612, typical: 0.04 } } } : null, 'media');
  t('frase de Pacing con cifras y número de casos', ph && /cuando salió Media/.test(ph.text) && /6\.1 %/.test(ph.text) && /8 de cada 10/.test(ph.text) && /28 casos/.test(ph.text), ph);
  t('sin casos suficientes no hay frase', CAL.phrase({ after: { alta: { n: 3, p80: 0.01 } } }, 'alta') === null && CAL.phrase(null, 'alta') === null);
  t('también se puede armar desde un resumen directo', CAL.phrase(sm, 'alta') && /Alta/.test(CAL.phrase(sm, 'alta').text));

  const an = CAL.analysisOf(CAL.emptyState(), S);
  t('analysisOf con muestras: casos, meses y error por corte', an.source === 'live' && an.cases === 70 && an.months === 14 && an.byCut[25].n === 14 && an.labels.alta.n === sm.labels.alta.n);
  const anSaved = CAL.analysisOf(CAL.applyResult(CAL.emptyState(), calB, { at: '2026-10-05T10:00:00Z' }), null);
  t('analysisOf sin muestras usa el resumen guardado (con error por corte)', anSaved.source === 'saved' && anSaved.byCut && anSaved.byCut[5].n === 14 && anSaved.labels.alta.n === calB.after.labels.alta.n && anSaved.months === 14);
  t('analysisOf sin nada devuelve null', CAL.analysisOf(CAL.emptyState(), null) === null);

  /* ---------- Sin efectos en el motor: relabel con los umbrales calibrados concuerda con assess ---------- */
  const s0 = S[0], r1 = FC.relabel(s0.factors, cal.thresholds), a1 = FC.assess({ run: fakeRun(s0.month, s0.cut), channel: 'total', period: { type: 'month', key: s0.month }, advisor, thresholds: { ...FC.INITIAL, ...cal.thresholds } });
  t('relabel con umbrales calibrados = assess con esos umbrales', r1.level === a1.level && Math.abs(r1.score - a1.score) < 1e-12);

  console.log(`\n${n - bad}/${n} pruebas pasan`); process.exit(bad ? 1 : 0);
})();
