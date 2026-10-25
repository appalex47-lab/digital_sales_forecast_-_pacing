// Pruebas de oportunidades (js/promotions/opportunityEngine.js). Uso: node tools/test-opportunities.js
global.window = global; global.FP = {};
require('../js/promotions/opportunityEngine.js');
require('../js/export/promotionExport.js');
const OP = FP.opportunities; let n = 0, fails = 0;
const ok = (name, c, d) => { n++; if (!c) { fails++; console.log('✘', name, d !== undefined ? JSON.stringify(d).slice(0, 300) : ''); } };

const m = (value, extra) => Object.assign({ value, status: value === null ? 'missing' : 'available', coverage: 1, excluded: 0 }, extra || {});
const acc = (o) => ({ days: o.days === undefined ? 40 : o.days, revenue: m(o.revenue), orders: m(o.orders === undefined ? Math.round(o.revenue / 100) : o.orders), units: m(o.units === undefined ? Math.round(o.revenue / 50) : o.units),
  views: o.noFunnel ? { value: null, status: 'unavailable' } : m(o.views, { coverage: o.cov === undefined ? 1 : o.cov, excluded: o.exc || 0 }), conversionRate: o.noFunnel ? { value: null } : { value: o.conv }, aov: { value: o.revenue / Math.max(1, Math.round(o.revenue / 100)) } });
const row = (sku, cur, base) => ({ key: sku, status: base ? 'stable' : 'new', current: acc(cur), baseline: base ? acc(base) : null, revenue: { current: cur.revenue, baseline: base ? base.revenue : null, deltaPct: base ? cur.revenue / base.revenue - 1 : null } });
const catalog = (sku) => ({ product: `Prod ${sku}`, productCode: `EAN${sku}`, category: sku.startsWith('B') ? 'Cat B' : 'Cat A', brand: 'Marca' });

// Categoría A: 6 SKU con funnel; mediana de vistas = 500, de conversión = 2 %
const A = [['A1', 500, 0.02], ['A2', 400, 0.025], ['A3', 600, 0.015], ['A4', 800, 0.005], ['A5', 100, 0.04], ['A6', 450, 0.02]];
const rowsA = A.map(([s, v, cv]) => row(s, { revenue: 1000, views: v, conv: cv }, { revenue: 1000, views: v, conv: cv }));
let r = OP.analyze(rowsA, { catalog });
const by = (res, sku) => res.items.find((i) => i.sku === sku);
ok('O1 vistas altas y conversión baja: demanda no convertida', by(r, 'A4') && by(r, 'A4').types.some((t) => t.id === 'unconverted'), r.items.map((i) => [i.sku, i.types.map((t) => t.id)]));
ok('O2 vistas bajas y conversión alta: visibilidad baja', by(r, 'A5') && by(r, 'A5').types.some((t) => t.id === 'lowVisibility'));
ok('O3 un SKU promedio no es oportunidad por conversión', !by(r, 'A1') || !by(r, 'A1').types.some((t) => ['unconverted', 'lowVisibility'].includes(t.id)));
ok('O4 el tamaño de la demanda no convertida es vistas × (mediana − conversión) × venta por compra', Math.abs(by(r, 'A4').size - 800 * (0.02 - 0.005) * 100) < 1e-6, by(r, 'A4').size);
ok('O5 la razón cita números reales', /800 vistas/.test(by(r, 'A4').types[0].reason) && /0,5 %|0.5 %/.test(by(r, 'A4').types[0].reason), by(r, 'A4').types[0].reason);
ok('O6 lista lo que falta para decidir', by(r, 'A4').missing.join() === 'Precio promocional,Mecánica negociable,Apoyo del laboratorio,Disponibilidad');
ok('O7 la oportunidad más grande va primero', r.items[0].sku === 'A4');

// Tendencia y peso
{ const rows = [row('A1', { revenue: 1300, views: 500, conv: 0.02 }, { revenue: 1000, views: 500, conv: 0.02 }),
    row('A2', { revenue: 700, views: 410, conv: 0.025 }, { revenue: 1000, views: 400, conv: 0.025 }),
    row('A3', { revenue: 700, views: 300, conv: 0.015 }, { revenue: 1000, views: 600, conv: 0.015 }),
    row('A5', { revenue: 1000, views: 100, conv: 0.04 }, { revenue: 1000, views: 100, conv: 0.04 })];
  const rr = OP.analyze(rows.concat(rowsA.filter((x) => !['A1', 'A2', 'A3', 'A5'].includes(x.key))), { catalog });
  ok('T1 venta y unidades suben ≥ umbral: en crecimiento', by(rr, 'A1').types.some((t) => t.id === 'growing'), by(rr, 'A1'));
  ok('T2 venta baja con vistas estables: en caída', by(rr, 'A2').types.some((t) => t.id === 'declining'));
  ok('T3 venta baja pero vistas también bajan: NO es «en caída»', !(by(rr, 'A3') && by(rr, 'A3').types.some((t) => t.id === 'declining')));
}
{ const big = [row('B1', { revenue: 9000, views: 100, conv: 0.01 }, { revenue: 9000, views: 100, conv: 0.01 }), row('B2', { revenue: 1000, views: 100, conv: 0.01 }, { revenue: 1000, views: 100, conv: 0.01 })];
  const rb = OP.analyze(big, { catalog });
  ok('W1 peso alto en su categoría se marca «sostener o proteger», no candidato a descuento', by(rb, 'B1').types.some((t) => t.id === 'highWeight' && t.objective === 'Sostener o proteger') && !by(rb, 'B1').types.some((t) => t.id === 'unconverted'));
  ok('W2 con pocos SKU no hay medianas y lo dice', rb.notes.length === 1 && /Cat B/.test(rb.notes[0]), rb.notes);
}
// Evidencia
{ const mk = (o) => OP.analyze(A.map(([s, v, cv]) => row(s, s === 'A4' ? Object.assign({ revenue: 1000, views: v, conv: cv }, o) : { revenue: 1000, views: v, conv: cv }, { revenue: 1000, views: v, conv: cv, days: 40 })), { catalog });
  ok('V1 evidencia alta: ≥ 60 días en las dos ventanas, funnel ≥ 80 % y sin cuarentena', by(mk({ days: 40 }), 'A4').evidence.level === 'high', by(mk({}), 'A4').evidence);
  ok('V2 falta una condición: media', by(mk({ days: 5 }), 'A4').evidence.level === 'medium');
  ok('V3 faltan dos: baja', by(mk({ days: 5, cov: 0.5 }), 'A4').evidence.level === 'low');
  ok('V4 celdas en cuarentena bajan la evidencia', by(mk({ exc: 3 }), 'A4').evidence.level === 'medium' && /cuarentena/.test(by(mk({ exc: 3 }), 'A4').evidence.notes.join()));
}
// Sin funnel / SKU nuevo
{ const rows = [row('A1', { revenue: 1500, noFunnel: true }, { revenue: 1000, noFunnel: true }), row('A2', { revenue: 500, noFunnel: true }, { revenue: 1000, noFunnel: true }), row('A3', { revenue: 1200, views: 100, conv: 0.01 }, null)];
  const rn = OP.analyze(rows, { catalog });
  ok('N1 sin funnel solo salen tipos que no lo necesitan y evidencia baja', by(rn, 'A1').types.every((t) => ['growing', 'highWeight'].includes(t.id)) && by(rn, 'A1').evidence.level === 'low');
  ok('N2 sin funnel no se puede afirmar «en caída»', !by(rn, 'A2') || !by(rn, 'A2').types.some((t) => t.id === 'declining'));
  ok('N3 SKU nuevo: evidencia baja y lo dice', by(rn, 'A3') && by(rn, 'A3').evidence.level === 'low' && /nuevo/.test(by(rn, 'A3').evidence.notes.join()));
}
// Ofertas recibidas
{ const rr = OP.analyze(rowsA, { catalog, offers: [{ offerId: 'OF-0001', sku: 'A4', discount: 0.25, state: 'received' }, { offerId: 'OF-0002', sku: 'A4', discount: 0.3, state: 'discarded' }, { offerId: 'OF-0003', sku: 'EANA5', discount: 0.2, state: 'selected' }] });
  ok('F1 liga ofertas recibidas por SKU (sin las descartadas)', by(rr, 'A4').offers.length === 1 && by(rr, 'A4').offers[0].offerId === 'OF-0001', by(rr, 'A4').offers);
  ok('F2 también por código de producto', by(rr, 'A5').offers.length === 1 && by(rr, 'A5').offers[0].offerId === 'OF-0003', by(rr, 'A5').offers);
  ok('F3 contadores por tipo y evidencia', rr.counts.byType.unconverted === 2 && rr.counts.total === rr.items.length);
}
ok('E1 sin filas no truena', OP.analyze([], { catalog }).items.length === 0 && OP.analyze(null).items.length === 0);

// Agrupar por subcategoría y laboratorio
{ const it = (sku, sub, brand, size, rev, base, offers, ev) => ({ sku, subcategory: sub, brand, size, sortKey: size === null ? rev : size, revenue: rev, revenueBase: base, offers: offers ? [{ offerId: 'O' + sku }] : [], evidence: { level: ev || 'low' }, types: [{ id: 'unconverted' }], category: 'C' });
  const items = [it('A', 'Vit', 'Lab1', 500, 1000, 800, true, 'high'), it('B', 'Vit', 'Lab2', null, 300, 400, false), it('C', 'Ant', 'Lab1', 100, 5000, 5000, true), it('D', '', '', null, 10, 0, false)];
  const g = OP.groupItems(items, 'subcat'), l = OP.groupItems(items, 'lab', (i) => i.brand);
  ok('G1 agrupa por subcategoría y deja «Sin subcategoría»', g.length === 3 && g.some((x) => x.label === 'Sin subcategoría' && x.count === 1), g.map((x) => x.label));
  ok('G2 suma SKU, con oferta, evidencia alta', g.find((x) => x.key === 'Vit').count === 2 && g.find((x) => x.key === 'Vit').withOffer === 1 && g.find((x) => x.key === 'Vit').evHigh === 1);
  ok('G3 tamaño suma solo los SKU que lo tienen y cuenta cuántos', g.find((x) => x.key === 'Vit').size === 500 && g.find((x) => x.key === 'Vit').sizeSkus === 1);
  ok('G4 venta y cambio contra referencia', g.find((x) => x.key === 'Vit').revenue === 1300 && Math.abs(g.find((x) => x.key === 'Vit').deltaPct - (1300 / 1200 - 1)) < 1e-9 && g.find((x) => x.label === 'Sin subcategoría').deltaPct === null);
  ok('G5 orden de mayor a menor (clave de orden)', g[0].key === 'Ant' || g[0].sortKey >= g[1].sortKey, g.map((x) => [x.key, x.sortKey]));
  ok('G6 por laboratorio usa la función dada y «Sin laboratorio»', l.length === 3 && l.find((x) => x.key === 'Lab1').count === 2 && l.some((x) => x.label === 'Sin laboratorio'));
  ok('G7 la suma de los grupos cuadra con la lista', g.reduce((t, x) => t + x.count, 0) === 4 && g.reduce((t, x) => t + x.revenue, 0) === 6310);
  ok('G8 lista vacía no truena', OP.groupItems([], 'lab').length === 0);
}


// Exportar agrupado
{ const it = (sku, sub, size, rev, base) => ({ sku, name: 'P' + sku, category: 'C', subcategory: sub, brand: 'L', size, sortKey: size || rev, revenue: rev, revenueBase: base, offers: [], evidence: { level: 'high', notes: [] }, types: [{ id: 'unconverted', label: 'Demanda no convertida', reason: 'x' }], missing: [] });
  const rows = OP.groupItems([it('A', 'Vit', 500, 1000, 800), it('B', 'Vit', null, 300, 400), it('C', 'Ant', 100, 5000, 5000)], 'subcat');
  const csv = FP.promotionExport.buildGroupsCsv(rows, 'Subcategoría'), lines = csv.replace('\ufeff', '').trim().split('\r\n');
  ok('X1 CSV agrupado: encabezado con la dimensión y una fila por grupo', lines.length === 3 && lines[0].startsWith('Subcategoría,SKU,') , lines.slice(0, 2));
  ok('X2 CSV agrupado lista los SKU de cada grupo', lines.some((l) => l.includes('A | B')), lines);
  const book = FP.promotionExport.buildOpportunitiesBook([it('A', 'Vit', 500, 1000, 800)], { name: 'N', groups: { label: 'Subcategoría', rows } });
  ok('X3 el Excel agrega la hoja «Por subcategoría» solo cuando hay grupos', book.sheets.length === 2 && book.sheets[1].name === 'Por subcategoría' && FP.promotionExport.buildOpportunitiesBook([it('A', 'Vit', 1, 1, 1)], { name: 'N' }).sheets.length === 1, book.sheets.map((x) => x.name));
  ok('X4 la hoja de grupos trae encabezado y una fila por grupo', book.sheets[1].rows.length === 4 + rows.length);
}

console.log(`${n - fails}/${n} pruebas OK${fails ? ` — ${fails} FALLAN` : ''}`);
process.exit(fails ? 1 : 0);
