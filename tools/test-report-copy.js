// Presentación ejecutiva (PDF): títulos con conclusión generados desde las cifras.  node tools/test-report-copy.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Number, Object, Array, Date, JSON, Intl, String, Map, Set, RegExp }; ctx.globalThis = ctx; ctx.window = undefined; vm.createContext(ctx);
ctx.FP = { config: { currency: 'MXN', confidenceLabels: { excellent: 'Excelente', sufficient: 'Suficiente', limited: 'Limitada', insufficient: 'Insuficiente' } } };
['js/forecast/methodAdvisor.js', 'js/report/reportBuilder.js', 'js/report/reportCopy.js'].forEach((f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx));
const RC = ctx.FP.reportCopy; let bad = 0;
const t = (n, c, d) => { console.log((c ? '✔ ' : '✘ ') + n + (!c && d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 300) : '')); if (!c) bad++; };
const inc = (id, o = {}) => ({ id, status: 'included', ...o });
const cover = inc('cover', { facts: [{ id: 'period', value: 'Septiembre 2026' }] });
const pac = (c, plan, fc, cut = 21) => inc('pacing', { kpis: [{ id: 'compliance', value: c }], charts: [{ plan: plan || [1, 2, 3], forecast: fc || [null, null, 3], cutIndex: cut }] });
const rep = (...pages) => ({ pages: [cover, ...pages] });
const T = (p, r) => RC.title(p, r);

let r = rep(pac(0.999), inc('summary', { focus: { entity: 'Cardio' } }));
t('resumen: en línea + foco', T(r.pages[2], r) === 'Septiembre va en línea con el plan; la atención está en Cardio', T(r.pages[2], r));
r = rep(pac(0.999), inc('summary'));
t('resumen: sin foco no inventa atención', T(r.pages[2], r) === 'Septiembre va en línea con el plan', T(r.pages[2], r));
t('umbrales de cumplimiento', ['1.05|supera el plan', '1.0|va en línea con el plan', '0.95|va por debajo del plan', '0.8|se aleja del plan'].every((s) => { const [v, e] = s.split('|'); return RC.standing(+v).text === e; }));
t('sin cumplimiento: título neutro (null)', T(inc('summary'), rep(inc('pacing', { kpis: [] }), inc('summary'))) === null);
const pc = pac(1.0, [1, 2, 3], [null, null, null], 2); t('pacing: mes cerrado (sin cierre estimado) no habla de cierre', T(pc, rep(pc)) === 'Septiembre llega al plan comparable', T(pc, rep(pc)));
const p1 = pac(1.0, [10, 20, 30], [null, null, 30.1], 1); t('pacing: período abierto confirma el ritmo', /el cierre estimado confirma el ritmo$/.test(T(p1, rep(p1)) || ''), T(p1, rep(p1)));
const p2 = pac(0.93, [10, 20, 30], [null, null, 25], 1); t('pacing: por debajo y cierre por debajo', /queda por debajo del plan comparable; el cierre estimado queda por debajo/.test(T(p2, rep(p2)) || ''), T(p2, rep(p2)));
const dr = (c) => inc('drivers', { kpis: [{ id: 'gap', value: -13126 }], tables: [{ id: 'drivers', rows: c.map(([driver, contribution]) => ({ driver, contribution })) }] });
let d = dr([['Volumen', 110172], ['CR', -49124], ['AOV', -74174]]);
t('drivers: mezcla de signos', T(d, rep(d)) === 'Volumen suma y conversión y ticket restan; la brecha neta es −$13.1K', T(d, rep(d)));
d = dr([['Volumen', -1], ['CR', -5], ['AOV', -3]]); t('drivers: todos restan → el que más pesa', /^Conversión es el componente que más pesa/.test(T(d, rep(d)) || ''), T(d, rep(d)));
let m = inc('movers', { minus: [{ type: 'Palanca', name: 'AOV', value: -74174 }, { type: 'Canal', name: 'Ecommerce', value: -38316 }], plus: [{ type: 'Canal', name: 'WhatsApp', value: 46337 }] });
t('movers: prefiere canal', T(m, rep(m)) === 'Ecommerce es lo que más resta y WhatsApp lo que más suma', T(m, rep(m)));
m = inc('movers', { minus: [], plus: [] }); t('movers vacío: neutro', T(m, rep(m)) === null);
let tr = inc('trends', { kpis: [{ id: 'drag', value: -13239 }, { id: 'comp', value: 0 }], tables: [{ rows: [{ entity: 'Theta Cae' }] }] });
t('evolución: caída sin compensación', T(tr, rep(tr)) === 'Theta Cae concentra la mayor caída (total −$13.2K); nada lo compensa', T(tr, rep(tr)));
let ca = inc('categories', { charts: [{ items: [{ label: 'Cardio', value: -7840 }, { label: 'Diabetes', value: -3189 }] }] });
t('categorías: mayor descenso', T(ca, rep(ca)) === 'Cardio concentra el mayor descenso (−$7.8K)', T(ca, rep(ca)));
let cu = inc('customers', { lapsed: { count: 12, base: 50, month: '2026-09' } }); t('clientes: no regresaron', /^12 de 50 clientes del mes anterior/.test(T(cu, rep(cu)) || ''), T(cu, rep(cu)));
cu = inc('customers', { lapsed: { count: 0, base: 50, month: '2026-09' } }); t('clientes: nadie dejó de comprar', T(cu, rep(cu)) === 'Ninguno de los 50 clientes del mes anterior dejó de comprar en 2026-09', T(cu, rep(cu)));
cu = inc('customers', { kpis: [{ id: 'customers', value: 50 }] }); t('clientes: sin ventana usa el total', T(cu, rep(cu)) === '50 clientes identificados compran en el período');
let tf = inc('traffic', { scope: { dimension: 'Campaña' }, tables: [{ rows: [{ segment: 'a', crChg: 0.06 }, { segment: 'b', crChg: -0.02 }] }] });
t('tráfico: mejor y peor conversión', T(tf, rep(tf)) === 'La conversión sube más en a y cae más en b', T(tf, rep(tf)));
tf = inc('traffic', { scope: { dimension: 'Campaña' }, tables: [{ rows: [{ segment: 'aw_fesa_ecomm_do_pla_general', crChg: 0.06 }, { segment: 'b', crChg: -0.02 }] }] }); t('tráfico: nombre técnico largo → título neutro', T(tf, rep(tf)) === 'Tráfico y conversión por campaña', T(tf, rep(tf)));
tf = inc('traffic', { scope: { dimension: 'Campaña' }, tables: [{ rows: [{ segment: 'a', crChg: 0.01 }] }] }); t('tráfico: un solo segmento → título por dimensión', T(tf, rep(tf)) === 'Tráfico y conversión por campaña');
let rc = inc('recovery', { kpis: [{ id: 'remaining', value: 22100000 }, { id: 'days', value: 24 }, { id: 'daily', value: 922000 }] });
t('recuperación: faltante y requerimiento', T(rc, rep(rc)) === 'Faltan $22.1M en 24 días: se requieren $922K por día', T(rc, rep(rc)));
rc = inc('recovery', { kpis: [{ id: 'remaining', value: 0 }, { id: 'days', value: 3 }] }); t('recuperación: meta cubierta', T(rc, rep(rc)) === 'La meta del período ya está cubierta');
let cl = inc('closing', { blocks: [{ title: 'Qué resta', list: [{ name: 'Ecommerce', value: -1 }] }] });
t('cierre: cumplimiento + atención', T(cl, rep(pac(0.999), cl)) === 'Septiembre va en línea con el plan; Ecommerce merece atención', T(cl, rep(pac(0.999), cl)));
t('nombres largos se acortan', T(inc('categories', { charts: [{ items: [{ label: 'x'.repeat(80), value: -5 }] }] }), rep()).length < 70);
t('datos rotos (undefined/NaN) → null, nunca texto roto', T(inc('drivers', { kpis: [{ id: 'gap', value: NaN }], tables: [] }), rep()) === null && T(inc('movers'), rep()) === null && T(null, rep()) === null);
t('lámina sin regla (anexo/estacionalidad) → null', T(inc('annex'), rep()) === null && T(inc('seasonality'), rep()) === null);

const ov = { totals: { traffic: 100000, cr: 0.022, trafficChg: -0.01, crChg: 0.029, crDiffPp: 0.0006 }, mix: [{ id: 'medium', rows: [{ label: 'Orgánico', crChg: 0.06, share: 0.5, baseShare: 0.5, cr: 0.026 }, { label: 'Pago (cpc)', crChg: -0.02, share: 0.5, baseShare: 0.5, cr: 0.018 }] }, { id: 'device', rows: [{ label: 'Escritorio', share: 0.52, baseShare: 0.5, cr: 0.025 }, { label: 'Móvil', share: 0.48, baseShare: 0.5, cr: 0.019 }] }] };
const tfo = inc('traffic', { overview: ov, scope: { comparison: 'Actual vs periodo anterior' } });
t('tráfico con panorama: título con tráfico y conversión', T(tfo, rep(tfo)) === 'El tráfico baja 1.0 % y la conversión sube 2.9 % frente al período anterior', T(tfo, rep(tfo)));
const rd = RC.reading(tfo, rep(tfo));
t('lectura de tráfico menciona canal y dispositivo', /Por canal/.test(rd) && /En dispositivo/.test(rd) && /\*\*Orgánico\*\*/.test(rd) && /\*\*Escritorio\*\*/.test(rd), rd);
const tfs = inc('traffic', { overview: { ...ov, totals: { ...ov.totals, trafficChg: 0.001, crChg: -0.002 } }, scope: {} }); t('tráfico estable', /^El tráfico y la conversión se mantienen estables frente a la referencia$/.test(T(tfs, rep(tfs)) || ''), T(tfs, rep(tfs)));
const cmp = inc('campaigns', { campaigns: { rows: [{ name: 'alfa', quadrant: 'star' }, { name: 'beta', quadrant: 'review' }], opportunity: [] } });
t('campañas: estrella y sin oportunidad concluyente', T(cmp, rep(cmp)) === 'alfa lidera en tráfico y convierte sobre el total' && /no son concluyentes/.test(RC.reading(cmp, rep(cmp))), RC.reading(cmp, rep(cmp)));
const cmo = inc('campaigns', { campaigns: { rows: [{ name: 'beta', quadrant: 'conversion' }], opportunity: [{ name: 'beta', value: 250000 }] } });
t('campañas: oportunidad concluyente', /^beta concentra la mayor oportunidad/.test(T(cmo, rep(cmo))) && /\$250K/.test(RC.reading(cmo, rep(cmo))), RC.reading(cmo, rep(cmo)));
t('lectura sin datos → null', RC.reading(inc('traffic'), rep()) === null && RC.reading(inc('campaigns'), rep()) === null);

{ const o = inc('customers', { lapsed: { count: 6786, base: 8489, month: '2026-10', monthLabel: 'octubre', prevLabel: 'septiembre', inProgress: true, dayShare: 19 / 31 } });
  t('clientes (mes abierto): título prudente', T(o, rep(o)) === '8 de cada 10 clientes que compraron en septiembre todavía no han vuelto a comprar en octubre', T(o, rep(o)));
  const c2 = inc('customers', { lapsed: { count: 2000, base: 8000, month: '2026-09', monthLabel: 'septiembre', prevLabel: 'agosto', inProgress: false, dayShare: 1 } });
  t('clientes (mes cerrado): título con porcentaje', T(c2, rep(c2)) === '2,000 de 8,000 clientes de agosto no volvieron a comprar en septiembre (25 %)', T(c2, rep(c2))); }
{ const rn = inc('recovery', { kpis: [{ id: 'remaining', value: 35900000 }, { id: 'days', value: 73 }, { id: 'daily', value: 492000 }], net: { gap: 11000000, shortfall: 35900000, surplus: 24900000 } });
  t('recuperación: con excedente en otros canales el título separa neto y canales rezagados', T(rn, rep(rn)) === 'En neto faltan $11.0M a la meta; los canales rezagados necesitan $35.9M', T(rn, rep(rn))); }
console.log(bad ? `\n${bad} FALLAS` : '\nTODO OK'); process.exit(bad ? 1 : 0);
