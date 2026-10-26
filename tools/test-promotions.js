// Pruebas del registro de promociones (js/promotions/promotionStore.js). Uso: node tools/test-promotions.js
global.window = global; global.FP = {};
require('../js/promotions/promotionStore.js');
const P = FP.promotions; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };

const mk = (reg, o = {}) => P.createPromotion(reg, Object.assign({ name: 'Demo otoño', createdBy: 'Persona A', plannedStart: '2026-11-05', plannedEnd: '2026-11-18' }, o));

// identificador
{ const reg = P.createRegistry();
  const r = mk(reg);
  ok('P1 crea con identificador PRM-AAAA-NNNN-NOMBRE', r.ok && r.promotion.promoId === 'PRM-2026-0001-DEMO-OTONO', r.promotion && r.promotion.promoId);
  const r2 = mk(reg, { name: 'Vitaminas Q4' });
  ok('P2 el consecutivo sube', r2.promotion.promoId === 'PRM-2026-0002-VITAMINAS-Q4', r2.promotion.promoId);
  const id1 = r.promotion.promoId;
  const u = P.updatePromotion(reg, id1, { name: 'Otro nombre' }, 'Persona A');
  ok('P3 editar el nombre NO cambia el identificador', u.ok && r.promotion.promoId === id1 && r.promotion.name === 'Otro nombre');
  ok('P4 el identificador no es editable', !P.updatePromotion(reg, id1, { promoId: 'X' }).ok);
  P.setStatus(reg, r2.promotion.promoId, 'cancelled', { note: 'prueba', by: 'Persona A' });
  const r3 = mk(reg, { name: 'Tercera' });
  ok('P5 tras cancelar no se repite el consecutivo', r3.promotion.promoId === 'PRM-2026-0003-TERCERA', r3.promotion.promoId);
  ok('P6 slug sin acentos ni símbolos y máx. 16', P.slugOf('  ¡Día de las Madres 2026: súper oferta!  ') === 'DIA-DE-LAS-MADRE', P.slugOf('  ¡Día de las Madres 2026: súper oferta!  '));
  ok('P7 nombre vacío rechazado', !mk(P.createRegistry(), { name: '  ' }).ok);
  ok('P8 sin quien crea, rechazado', !mk(P.createRegistry(), { createdBy: '' }).ok);
  ok('P9 fechas invertidas rechazadas', !mk(P.createRegistry(), { plannedStart: '2026-11-18', plannedEnd: '2026-11-05' }).ok);
  ok('P10 fecha imposible rechazada', !mk(P.createRegistry(), { plannedStart: '2026-02-30' }).ok);
}
// aviso de nombre repetido (no bloquea)
{ const reg = P.createRegistry(); mk(reg);
  const r = mk(reg);
  ok('P11 mismo nombre, mes y canal: avisa pero crea', r.ok && r.warnings.length === 1, r.warnings);
}
// SKU
{ const reg = P.createRegistry(); const p = mk(reg).promotion; const id = p.promoId;
  ok('P12 agrega SKU de oportunidad digital', P.addSku(reg, id, { sku: 'DEMO-001', origin: 'digital', mechanic: '2 x 1' }).ok);
  ok('P13 SKU repetido rechazado', !P.addSku(reg, id, { sku: 'DEMO-001', origin: 'digital' }).ok);
  ok('P14 SKU manual sin razón rechazado', !P.addSku(reg, id, { sku: 'DEMO-009', origin: 'manual' }).ok);
  ok('P15 SKU manual con razón aceptado', P.addSku(reg, id, { sku: 'DEMO-009', origin: 'manual', reason: 'Pedido por dirección' }).ok);
  ok('P16 SKU sin código rechazado', !P.addSku(reg, id, { sku: ' ' }).ok);
  ok('P17 quitar SKU', P.removeSku(reg, id, 'DEMO-009').ok && p.skus.length === 1);
  ok('P18 el historial conserva alta y baja de SKU', p.history.some((h) => h.field === 'sku+' && h.to === 'DEMO-009') && p.history.some((h) => h.field === 'sku-' && h.from === 'DEMO-009'));
}
// estados
{ const reg = P.createRegistry(); const p = mk(reg).promotion; const id = p.promoId;
  ok('S1 borrador sin SKU no pasa a propuesta', !P.setStatus(reg, id, 'proposed', { by: 'Persona A' }).ok);
  P.addSku(reg, id, { sku: 'DEMO-001', origin: 'digital' });
  ok('S2 con SKU pasa a propuesta', P.setStatus(reg, id, 'proposed', { by: 'Persona A' }).ok && p.status === 'proposed');
  ok('S3 saltar a publicada se rechaza y no cambia nada', !P.setStatus(reg, id, 'published').ok && p.status === 'proposed');
  ok('S4 aprobar sin nombre de aprobador se rechaza', !P.setStatus(reg, id, 'approved', {}).ok);
  ok('S5 sin nombre de quien aprueba no se aprueba', !P.setStatus(reg, id, 'approved', { approvedBy: '  ' }).ok && p.status === 'proposed');
  ok('S6 quien crea también puede aprobar (misma persona)', P.setStatus(reg, id, 'approved', { approvedBy: 'Persona A' }).ok && p.status === 'approved' && p.approvedBy === 'Persona A');
  ok('S7 el SKU ya no se edita tras aprobar', !P.addSku(reg, id, { sku: 'DEMO-002', origin: 'digital' }).ok);
  ok('S8 fechas reales no se registran antes de publicar', !P.updateSku(reg, id, 'DEMO-001', { realStart: '2026-11-05' }).ok);
  const pub = P.setStatus(reg, id, 'published', { by: 'Persona C' });
  ok('S9 publicar avisa de SKU sin fecha real y sin activaciones', pub.ok && pub.warnings.length === 2, pub.warnings);
  ok('S10 registra fechas reales', P.updateSku(reg, id, 'DEMO-001', { realStart: '2026-11-06', realEnd: '2026-11-18' }).ok);
  ok('S11 fin real anterior al inicio rechazado', !P.updateSku(reg, id, 'DEMO-001', { realEnd: '2026-11-01' }).ok);
  ok('S12 no se mide antes de que termine la vigencia', !P.setStatus(reg, id, 'measuring', { today: '2026-11-18' }).ok);
  ok('S13 se mide cuando ya hay días posteriores', P.setStatus(reg, id, 'measuring', { today: '2026-11-19' }).ok);
  ok('S14 cerrar exige conclusión', !P.setStatus(reg, id, 'closed', { recommendation: 'repeat' }).ok);
  ok('S15 cerrar exige recomendación válida', !P.setStatus(reg, id, 'closed', { conclusion: 'x', recommendation: 'otra' }).ok);
  ok('S16 cierra con conclusión y recomendación', P.setStatus(reg, id, 'closed', { conclusion: 'Funcionó en piel', recommendation: 'adjust', by: 'Persona B' }).ok && p.status === 'closed');
  ok('S17 cerrada ya no se edita ni cancela', !P.updatePromotion(reg, id, { plannedEnd: '2026-12-01' }).ok && !P.setStatus(reg, id, 'cancelled', { note: 'x' }).ok);
  ok('S18 el historial solo crece (>= 1 por estado)', p.history.length >= 6 && p.history[0].to === 'draft', p.history.length);
  ok('S19 cancelar exige motivo', !P.setStatus(reg, mk(reg, { name: 'Otra' }).promotion.promoId, 'cancelled', {}).ok);
}
// nombre solo editable al inicio
{ const reg = P.createRegistry(); const p = mk(reg).promotion; P.addSku(reg, p.promoId, { sku: 'A', origin: 'digital' });
  P.setStatus(reg, p.promoId, 'proposed', {}); P.setStatus(reg, p.promoId, 'approved', { approvedBy: 'Persona B' });
  ok('N1 tras aprobar el nombre no se edita', !P.updatePromotion(reg, p.promoId, { name: 'Nuevo' }).ok);
  ok('N2 tras aprobar las fechas planeadas sí (con historial)', P.updatePromotion(reg, p.promoId, { plannedEnd: '2026-11-20' }, 'Persona B').ok && p.history.some((h) => h.field === 'plannedEnd'));
}
// activaciones e incidencias
{ const reg = P.createRegistry(); const p = mk(reg).promotion; const id = p.promoId;
  ok('A1 activación sin espacio rechazada', !P.addActivation(reg, id, {}).ok);
  const a = P.addActivation(reg, id, { space: 'banner', start: '2026-11-05', end: '2026-11-18' });
  ok('A2 activación creada como planeada', a.ok && a.activation.status === 'planned' && a.activation.id === 'ACV_001');
  ok('A3 cambio de estado de la activación queda en historial', P.setActivationStatus(reg, id, 'ACV_001', 'live', 'Persona C').ok && p.history.some((h) => h.field === 'activation:ACV_001:status' && h.to === 'live'));
  ok('A4 incidencia sin texto rechazada', !P.addIncident(reg, id, ' ').ok);
  ok('A5 incidencia registrada', P.addIncident(reg, id, 'El banner entró un día tarde', '2026-11-06', 'Persona C').ok && p.incidents.length === 1);
}
// traslapes y vigencia activa
{ const reg = P.createRegistry();
  const a = mk(reg, { name: 'Uno' }).promotion, b = mk(reg, { name: 'Dos', plannedStart: '2026-11-15', plannedEnd: '2026-11-30' }).promotion;
  [a, b].forEach((p) => { P.addSku(reg, p.promoId, { sku: 'DEMO-001', origin: 'digital' }); P.setStatus(reg, p.promoId, 'proposed', {}); P.setStatus(reg, p.promoId, 'approved', { approvedBy: 'Persona B' }); });
  const o = P.overlaps(reg, a.promoId);
  ok('O1 detecta el SKU compartido y los días', o.length === 1 && o[0].from === '2026-11-15' && o[0].to === '2026-11-18' && o[0].other === b.promoId, o);
  ok('O2 activeIn encuentra ambas en una ventana que toca las dos', P.activeIn(reg, { start: '2026-11-16', end: '2026-11-17' }).length === 2);
  ok('O3 activeIn por SKU distinto no encuentra', P.activeIn(reg, { start: '2026-11-16', end: '2026-11-17', sku: 'OTRO' }).length === 0);
  ok('O4 activeIn fuera de fechas no encuentra', P.activeIn(reg, { start: '2026-12-10', end: '2026-12-12' }).length === 0);
  ok('O5 un borrador no cuenta como activo', P.activeIn(Object.assign(P.createRegistry(), { promotions: [mk(P.createRegistry()).promotion] }), { start: '2026-11-06' }).length === 0);
  ok('O6 activeIn con registro vacío o nulo devuelve []', P.activeIn(null, { start: '2026-11-06' }).length === 0 && P.activeIn(P.createRegistry(), { start: '2026-11-06' }).length === 0);
}
// hidratación
{ ok('H1 hydrate de basura devuelve registro vacío', P.hydrate(null).promotions.length === 0 && P.hydrate({ promotions: 'x' }).promotions.length === 0);
  const reg = P.createRegistry(); mk(reg);
  const back = P.hydrate(JSON.parse(JSON.stringify(reg)));
  ok('H2 ida y vuelta por JSON conserva todo', back.promotions.length === 1 && back.promotions[0].promoId === reg.promotions[0].promoId && back.promotions[0].history.length === 1);
}
// notas aditivas para otras pantallas
{ const N = FP.promotionNotes; const reg = P.createRegistry();
  ok('NT1 sin proveedor devuelve null y no falla', N.forRange(['2026-11-06', '2026-11-07']) === null && N.hasAny() === false);
  N.provider = () => reg;
  ok('NT2 registro vacío: null', N.forRange(['2026-11-06', '2026-11-07']) === null && N.hasAny() === false);
  const p = mk(reg).promotion; P.addSku(reg, p.promoId, { sku: 'DEMO-001', origin: 'digital' });
  ok('NT3 un borrador no genera nota', N.forRange(['2026-11-06', '2026-11-07']) === null && N.hasAny() === false);
  P.setStatus(reg, p.promoId, 'proposed', {}); P.setStatus(reg, p.promoId, 'approved', { approvedBy: 'Persona B' });
  const t = N.forRange(['2026-11-06', '2026-11-07'], 'ecommerce');
  ok('NT4 aprobada y en fechas: la nombra con su identificador', /Demo otoño \(PRM-2026-0001-DEMO-OTONO\)/.test(t || ''), t);
  ok('NT5 no afirma causa', !/caus|explica|por culpa/i.test(t || ''), t);
  ok('NT6 fuera de fechas: null', N.forRange(['2026-12-20', '2026-12-21']) === null);
  ok('NT7 otro canal: null', N.forRange(['2026-11-06', '2026-11-07'], 'app') === null);
  ok('NT8 canal total la incluye', N.forRange(['2026-11-06', '2026-11-07'], 'total') !== null);
  ok('NT9 hasAny verdadero con una aprobada', N.hasAny() === true);
  N.provider = () => { throw new Error('boom'); };
  ok('NT10 un proveedor que falla no rompe nada', N.forRange(['2026-11-06', '2026-11-07']) === null);
}

// línea base congelada (registro)
{ const reg = P.createRegistry(); const r = mk(reg); const id = r.promotion.promoId;
  P.addSku(reg, id, { sku: 'S1', origin: 'manual', reason: 'x' }, 'Persona A');
  const fz = { frozenAt: '2026-10-01T00:00:00Z', dataMax: '2026-09-30', rows: 3, skus: { S1: { from: 'a', to: 'b', rows: [] } } };
  ok('B1 no se congela en borrador', !P.setBaseline(reg, id, fz, { by: 'A' }).ok);
  P.setStatus(reg, id, 'proposed', { by: 'Persona A' });
  P.setStatus(reg, id, 'approved', { by: 'Persona A', approvedBy: 'Persona B' });
  ok('B2 se congela al aprobar y queda en el historial', P.setBaseline(reg, id, fz, { by: 'Persona B' }).ok && r.promotion.baseline === fz && r.promotion.history.some((h) => h.field === 'baseline'));
  ok('B3 no se acepta una base vacía', !P.setBaseline(reg, id, null, {}).ok);
  ok('B4 reemplazarla también se anota', P.setBaseline(reg, id, fz, { by: 'Persona B' }).ok && r.promotion.history.filter((h) => h.field === 'baseline').length === 2);
  P.setStatus(reg, id, 'proposed', { by: 'Persona A' });
  ok('B5 al regresar a propuesta se quita la base', !r.promotion.baseline && r.promotion.history.some((h) => h.field === 'baseline' && h.to === null));
  P.setStatus(reg, id, 'approved', { by: 'Persona A', approvedBy: 'Persona B' }); P.setBaseline(reg, id, fz, {}); P.setStatus(reg, id, 'published', { by: 'Persona A' });
  ok('B6 publicada aún se puede congelar', P.setBaseline(reg, id, fz, {}).ok);
  const h = P.hydrate(JSON.parse(JSON.stringify(reg)));
  ok('B7 la base sobrevive a guardar y cargar', h.promotions[0].baseline && h.promotions[0].baseline.rows === 3);
}

// flujo simplificado: aprobar directo, misma persona, regresar un paso y avance automático por fechas
{ const reg = P.createRegistry(); const p = mk(reg).promotion; const id = p.promoId; P.addSku(reg, id, { sku: 'DEMO-001', origin: 'digital' });
  ok('F1 Borrador pasa directo a Aprobada, aprobada por la misma persona', P.setStatus(reg, id, 'approved', { approvedBy: 'Persona A', by: 'Persona A' }).ok && p.status === 'approved' && p.approvedBy === 'Persona A');
  ok('F2 Aprobada regresa a Borrador y quita la línea base', P.setStatus(reg, id, 'draft', { by: 'Persona A' }).ok && p.status === 'draft' && !p.baseline);
  P.setStatus(reg, id, 'approved', { approvedBy: 'Persona A' }); P.setStatus(reg, id, 'published', { by: 'Persona A' });
  ok('F3 En marcha regresa a Aprobada solo con motivo', !P.setStatus(reg, id, 'approved', { by: 'Persona A' }).ok && P.setStatus(reg, id, 'approved', { by: 'Persona A', note: 'Se movió la fecha' }).ok && p.status === 'approved');
  P.setStatus(reg, id, 'published', { by: 'Persona A' });
  ok('F4 el avance automático no mueve una promoción cuya vigencia no ha terminado', P.autoAdvance(reg, '2026-11-10').length === 0 && p.status === 'published');
  ok('F5 al terminar la vigencia pasa sola a medición, por «Automático»', P.autoAdvance(reg, '2026-11-20').length === 1 && p.status === 'measuring' && p.history[p.history.length - 1].by === 'Automático');
  ok('F6 En medición regresa a En marcha con motivo y ya no se vuelve a mover sola', !P.setStatus(reg, id, 'published', { by: 'Persona A' }).ok && P.setStatus(reg, id, 'published', { by: 'Persona A', note: 'Faltaba un SKU' }).ok && P.autoAdvance(reg, '2026-11-25').length === 0 && p.status === 'published');
  ok('F7 Cerrada y Cancelada no regresan', P.NEXT.closed.length === 0 && P.NEXT.cancelled.length === 0);
}

console.log(`${n - fails}/${n} pruebas OK${fails ? ` — ${fails} FALLAN` : ''}`);
process.exit(fails ? 1 : 0);
