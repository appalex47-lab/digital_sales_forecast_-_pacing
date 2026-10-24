// Calidad de datos paso a paso (Fase 3.2): estados de los cinco pasos y «Qué hacer ahora».  node tools/test-quality-steps.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, JSON }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/quality/qualitySteps.js', 'utf8'), ctx);
const QS = ctx.FP.qualitySteps; let bad = 0, n = 0;
const t = (name, c, d) => { n++; console.log((c ? '✔ ' : '✘ ') + name + (!c && d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!c) bad++; };
const ok = { loaded: ['Venta real', 'Plan'], gaps: [], missingDates: 0, rejected: 0, errors: 0, warnings: 0, duplicates: 0, quarantined: 0,
  health: { score: 94, worst: null }, analyses: { total: 12, available: 12, firstMissing: null }, forecast: { closedMonths: 14, min: 12 } };
const by = (r, k) => r.steps.find((s) => s.n === k);

let r = QS.build(ok);
t('cinco pasos, en orden, con su pregunta', r.steps.length === 5 && r.steps.map((s) => s.n).join() === '1,2,3,4,5' && r.steps[1].question === '¿Se cargó bien?', r.steps.map((s) => s.question));
t('todo en orden: pasos 1 a 4 en Listo y nada que hacer ahora', [1, 2, 3, 4].every((k) => by(r, k).status === 'listo') && r.now === null, r.steps.map((s) => s.status));
t('paso 5 con 14 meses cerrados: historial suficiente', by(r, 5).status === 'listo' && /14 meses/.test(by(r, 5).label), by(r, 5));
t('cada paso trae «qué mirar» y «qué hacer»', r.steps.every((s) => s.look && s.todo), r.steps);

r = QS.build({ ...ok, warnings: 1, quarantined: 1 });
t('2 avisos en la carga: paso 2 en Revisar con el conteo y es lo que hay que hacer ahora', by(r, 2).status === 'revisar' && /2 avisos/.test(by(r, 2).label) && r.now && r.now.n === 2 && /2 avisos/.test(r.now.text), { s: by(r, 2), now: r.now });
t('el aviso nombra de qué es cada uno', /1 advertencia/.test(by(r, 2).note) && /1 valor en cuarentena/.test(by(r, 2).note), by(r, 2).note);
t('un solo aviso va en singular', /1 aviso\b/.test(QS.build({ ...ok, warnings: 1 }).steps[1].label), QS.build({ ...ok, warnings: 1 }).steps[1].label);

r = QS.build({ ...ok, gaps: ['Venta real: 3 fechas con algún canal faltante (WhatsApp 3 días).'], warnings: 2 });
t('hueco de cobertura y avisos a la vez: «ahora» va al primero (paso 1)', by(r, 1).status === 'revisar' && r.now.n === 1 && /WhatsApp 3 días/.test(r.now.text) && r.now.view === 'carga', r.now);
t('fechas sin registro también abren el paso 1', QS.build({ ...ok, missingDates: 4 }).steps[0].status === 'revisar' && /4 fechas sin ningún registro/.test(QS.build({ ...ok, missingDates: 4 }).steps[0].note));

r = QS.build({ ...ok, health: { score: 82, worst: 'Cobertura 70: faltan 5 días' } });
t('salud bajo 90: paso 3 en Revisar con el componente que más bajó', by(r, 3).status === 'revisar' && /82\/100/.test(by(r, 3).label) && /Cobertura 70/.test(by(r, 3).note) && r.now.n === 3, by(r, 3));
t('salud de exactamente 90 → Listo', QS.build({ ...ok, health: { score: 90, worst: null } }).steps[2].status === 'listo');

r = QS.build({ ...ok, analyses: { total: 12, available: 9, firstMissing: { label: 'Embudo GA4', todo: 'Carga el archivo de embudo' } } });
t('9 de 12 análisis: paso 4 «Parcial» y dice cuál falta y qué cargar', by(r, 4).status === 'revisar' && /Parcial · 9 de 12/.test(by(r, 4).label) && /Embudo GA4: Carga el archivo de embudo/.test(by(r, 4).note) && r.now.n === 4, by(r, 4));

r = QS.build({ ...ok, forecast: { closedMonths: 9, min: 12 } });
t('9 de 12 meses cerrados: paso 5 «Aprendiendo», sin pedirle nada a la persona', by(r, 5).status === 'aprendiendo' && /9 de 12/.test(by(r, 5).label) && r.now === null, by(r, 5));
t('el paso 5 nunca es «lo que hay que hacer ahora»', QS.build({ ...ok, forecast: { closedMonths: 0, min: 12 } }).now === null);
t('con 12 meses justos ya es historial suficiente', QS.build({ ...ok, forecast: { closedMonths: 12, min: 12 } }).steps[4].status === 'listo');

r = QS.build({ empty: true });
t('sin datos: paso 1 pendiente y manda a Carga; los demás en Pendiente', by(r, 1).status === 'pendiente' && r.now.n === 1 && r.now.view === 'carga' && [2, 3, 4].every((k) => by(r, k).status === 'pendiente'), r.steps.map((s) => s.status));
t('sin datos, el paso 5 sigue contando meses (0 de 12)', by(r, 5).status === 'aprendiendo' && /0 de 12/.test(by(r, 5).label), by(r, 5));
t('entrada vacía o rara no lanza', QS.build().steps.length === 5 && QS.build(null).steps.length === 5 && QS.build({ health: {}, analyses: null, forecast: null }).steps.length === 5);
t('los tonos de color salen del estado', by(QS.build({ ...ok, warnings: 1 }), 2).tone === 'warning' && by(QS.build(ok), 1).tone === 'ok' && by(QS.build({ ...ok, forecast: { closedMonths: 1, min: 12 } }), 5).tone === 'na');

console.log(bad ? `\n✘ ${bad} de ${n} pruebas fallaron` : `\n✔ ${n}/${n} pruebas de Calidad de datos paso a paso`);
process.exit(bad ? 1 : 0);
