/**
 * promotionExport.js — Exportación del registro de promociones (propuesta B, fase 1): CSV (una fila por promoción-SKU) y JSON.
 * Solo lee el registro: no calcula venta, incremental ni efecto. Las fechas salen como AAAA-MM-DD (texto) para no depender
 * del formato regional de Excel.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const P = () => FP.promotions;

  const COLUMNS = [
    ['promoId', 'Identificador'], ['name', 'Promoción'], ['proposalName', 'Propuesta de origen'], ['channel', 'Canal'], ['objective', 'Objetivo'],
    ['status', 'Estado'], ['plannedStart', 'Inicio planeado'], ['plannedEnd', 'Fin planeado'], ['createdBy', 'Creada por'], ['approvedBy', 'Aprobada por'],
    ['key', 'Clave identificador + SKU'], ['sku', 'SKU'], ['skuName', 'Producto'], ['origin', 'Origen del SKU'], ['offerId', 'Oferta recibida'],
    ['mechanic', 'Mecánica'], ['condition', 'Condición propuesta'], ['reason', 'Razón de inclusión'], ['realStart', 'Inicio real'], ['realEnd', 'Fin real'],
    ['skuNote', 'Nota del SKU'], ['activations', 'Activaciones'], ['incidents', 'Incidencias'], ['recommendation', 'Recomendación'], ['conclusion', 'Conclusión']
  ];

  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Evita que Excel interprete texto como fórmula (=, +, -, @) al abrir el CSV
    const safe = /^[=+\-@]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  function rowsOf(p) {
    const Pm = P();
    const acts = (p.activations || []).map((a) => `${Pm.SPACES[a.space] || a.space}${a.location ? ` (${a.location})` : ''}: ${Pm.ACT_STATUS[a.status] || a.status}${a.start ? `, ${a.start}` : ''}${a.end ? ` a ${a.end}` : ''}`).join(' | ');
    const incs = (p.incidents || []).map((i) => `${i.at}: ${i.text}`).join(' | ');
    const base = {
      promoId: p.promoId, name: p.name, proposalName: p.proposalName, channel: p.channel, objective: Pm.OBJECTIVES[p.objective] || p.objective, status: Pm.STATUS[p.status] || p.status,
      plannedStart: p.plannedStart, plannedEnd: p.plannedEnd, createdBy: p.createdBy, approvedBy: p.approvedBy, activations: acts, incidents: incs,
      recommendation: p.recommendation ? Pm.RECOMMENDATIONS[p.recommendation] : '', conclusion: p.conclusion
    };
    const skus = p.skus && p.skus.length ? p.skus : [null];
    return skus.map((s) => Object.assign({}, base, s ? { key: `${p.promoId} · ${s.sku}`, sku: s.sku, skuName: s.name, origin: Pm.ORIGINS[s.origin] || s.origin, offerId: s.offerId, mechanic: s.mechanic,
      condition: s.condition, reason: s.reason, realStart: s.realStart, realEnd: s.realEnd, skuNote: s.note } : {}));
  }

  /** CSV UTF-8 con BOM (Excel en español lo abre bien) y coma como separador. */
  function buildCsv(reg, { promoId = null } = {}) {
    const list = (reg.promotions || []).filter((p) => !promoId || p.promoId === promoId);
    const lines = [COLUMNS.map((c) => cell(c[1])).join(',')];
    list.forEach((p) => rowsOf(p).forEach((r) => lines.push(COLUMNS.map((c) => cell(r[c[0]])).join(','))));
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  function buildJson(reg, { promoId = null, generatedAt = null } = {}) {
    const list = (reg.promotions || []).filter((p) => !promoId || p.promoId === promoId);
    return {
      schema: 'promotions_export', schemaVersion: 1,
      metadata: { app: FP.config ? FP.config.app.name : 'RevNavigator', generatedAt: generatedAt || new Date().toISOString(), scope: promoId || 'todas', count: list.length,
        note: 'Registro de promociones: lo planeado, aprobado y ejecutado según las personas que lo capturaron. No contiene venta ni resultados medidos.' },
      promotions: list
    };
  }

  /**
   * Datos de las ofertas recibidas de un producto para los archivos de propuesta: laboratorio, origen, descuento y programa.
   * Con varias ofertas se listan todas, de mayor a menor descuento, en el mismo orden en cada columna (separadas con « | »).
   * Las descartadas no salen. El laboratorio sale de la oferta; si no lo trae, del catálogo de producto (columna Marca / Laboratorio).
   */
  function offerInfo(i, regOffers) {
    const by = new Map((regOffers || []).map((o) => [o.offerId, o]));
    const list = (i.offers || []).map((x) => by.get(x.offerId)).filter((o) => o && o.state !== 'discarded')
      .sort((a, b) => (typeof b.discount === 'number' ? b.discount : -1) - (typeof a.discount === 'number' ? a.discount : -1));
    const O = FP.offers ? FP.offers.ORIGINS : {};
    const pc = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(1).replace(/\.0$/, '')} %` : '');
    const lab = (list.find((o) => o.lab) || {}).lab || i.brand || '';
    const progs = list.map((o) => o.program || '');
    return { count: list.length, lab,
      origin: list.map((o) => O[o.origin] || o.origin || '').join(' | '),
      discount: list.length === 1 ? (typeof list[0].discount === 'number' ? list[0].discount : null) : list.map((o) => pc(o.discount)).join(' | '),
      program: list.length > 1 && progs.some(Boolean) ? progs.map((x) => x || '—').join(' | ') : progs.join(' | ') };
  }

  /** Lista de oportunidades del canal (CSV): mismas columnas que el Excel de propuestas. Con laboratorio, y origen, descuento y programa solo si el producto ya tiene oferta recibida. */
  const OPP_COLUMNS = [['sku', 'SKU'], ['name', 'Producto'], ['category', 'Categoría'], ['subcategory', 'Subcategoría'], ['types', 'Tipo de oportunidad'], ['reason', 'Motivo'], ['evidence', 'Evidencia'], ['evidenceNotes', 'Qué limita la evidencia'],
    ['size', 'Tamaño (solo demanda no convertida)'], ['revenue', 'Venta del periodo'], ['revenueBase', 'Venta de referencia'], ['delta', 'Cambio de venta'], ['views', 'Vistas de ficha'], ['conversion', 'Conversión'], ['share', 'Peso en su categoría'],
    ['offers', 'Ya tiene oferta recibida'], ['lab', 'Laboratorio'], ['origin', 'Origen de la oferta'], ['discount', 'Descuento'], ['program', 'Programa'], ['missing', 'Falta para decidir']];
  const num2 = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : '');
  function buildOpportunitiesCsv(items, period, regOffers) {
    const EV = { high: 'Alta', medium: 'Media', low: 'Baja' };
    const lines = [OPP_COLUMNS.map((c) => cell(c[1])).join(',')];
    (items || []).forEach((i) => {
      const oi = offerInfo(i, regOffers);
      const r = { sku: i.sku, name: i.name, category: i.category, subcategory: i.subcategory, types: i.types.map((t) => t.label).join(' | '), reason: i.types.map((t) => `${t.label}: ${t.reason}`).join(' | '), evidence: EV[i.evidence.level], evidenceNotes: i.evidence.notes.join(' | '),
        size: num2(i.size), revenue: num2(i.revenue), revenueBase: num2(i.revenueBase), delta: num2(i.revenueDeltaPct), views: num2(i.views), conversion: num2(i.conversion), share: num2(i.categoryShare),
        offers: i.offers.length ? 'Sí' : 'No', lab: oi.lab, origin: oi.origin, discount: typeof oi.discount === 'number' ? `${(oi.discount * 100).toFixed(1).replace(/\.0$/, '')} %` : oi.discount, program: oi.program, missing: i.missing.join(' | ') };
      lines.push(OPP_COLUMNS.map((c) => cell(r[c[0]])).join(','));
    });
    return `\ufeff${lines.join('\r\n')}\r\n`;
  }

  /**
   * Lista agrupada (CSV y hoja de Excel): una fila por subcategoría o laboratorio, con lo que suman sus SKU. `dimLabel` = «Subcategoría» o «Laboratorio».
   * «Tamaño» suma solo los SKU de demanda no convertida; «SKU con tamaño» dice cuántos son. Es para ordenar, no un pronóstico.
   */
  const groupHead = (dimLabel) => [dimLabel, 'SKU', 'SKU con oferta recibida', 'SKU con evidencia alta', 'Tamaño (solo demanda no convertida)', 'SKU con tamaño', 'Venta del periodo', 'Venta de referencia', 'Cambio de venta', 'Categorías', 'Tipos de oportunidad (SKU)', 'Lista de SKU'];
  function groupRowValues(x) {
    const T = (FP.opportunities && FP.opportunities.TYPES) || {};
    return [x.label, x.count, x.withOffer, x.evHigh, x.sizeSkus ? x.size : null, x.sizeSkus, x.revenue, x.revenueBase, x.deltaPct, x.categories.join(' | '), Object.keys(x.types).map((k) => `${(T[k] || {}).label || k}: ${x.types[k]}`).join(' | '), x.skus.join(' | ')];
  }
  function buildGroupsCsv(rows, dimLabel) {
    const lines = [groupHead(dimLabel).map(cell).join(',')];
    (rows || []).forEach((x) => lines.push(groupRowValues(x).map((v) => cell(typeof v === 'number' ? num2(v) : v)).join(',')));
    return `\ufeff${lines.join('\r\n')}\r\n`;
  }
  function groupsSheet(rows, dimLabel) {
    const head = groupHead(dimLabel), fm = [null, 'int', 'int', 'int', 'money', 'int', 'money', 'money', 'pct', 'wrap', 'wrap', 'wrap'];
    const body = (rows || []).map((x) => groupRowValues(x).map((v, k) => (fm[k] ? { v: v === undefined ? null : v, f: fm[k] } : v)));
    return { name: `Por ${dimLabel.toLowerCase()}`.slice(0, 31), cols: [30, 8, 14, 14, 20, 12, 16, 16, 12, 30, 44, 60], rows: [[{ v: `Productos con oportunidad agrupados por ${dimLabel.toLowerCase()}`, f: 'title' }], [{ v: 'Suma de lo que trae cada SKU. Uso interno: no sale a laboratorios.', f: 'note' }], [], head.map((h) => ({ v: h, f: 'head' })), ...body],
      freeze: { row: 4, col: 1 }, autofilter: `A4:${FP.xlsxWriter ? FP.xlsxWriter.colName(head.length - 1) : 'L'}${Math.max(4 + body.length, 4)}` };
  }

  /** Historial de promociones (CSV): una fila por promoción con su último corte guardado, conclusión y recomendación. Sin laboratorio (no existe en los datos). */
  function buildHistoryCsv(promos) {
    const Pm = P(), head = ['Identificador', 'Promoción', 'Estado', 'Canal', 'Objetivo', 'Inicio planeado', 'Fin planeado', 'SKU', 'Mecánicas', 'Espacios', 'Corte guardado', 'Datos hasta', 'Crecimiento observado (estimado)', 'Venta incremental estimada', 'Recomendación', 'Conclusión'];
    const lines = [head.map(cell).join(',')];
    (promos || []).forEach((p) => {
      const c = p.evaluations && p.evaluations.length ? p.evaluations[p.evaluations.length - 1] : null;
      lines.push([p.promoId, p.name, Pm.STATUS[p.status] || p.status, p.channel, Pm.OBJECTIVES[p.objective] || p.objective, p.plannedStart, p.plannedEnd, (p.skus || []).length,
        [...new Set((p.skus || []).map((s) => s.mechanic).filter(Boolean))].join(' | '), [...new Set((p.activations || []).map((a) => Pm.SPACES[a.space] || a.space))].join(' | '),
        c ? c.id : '', c ? c.cutoff : '', c ? num2(c.concepts.observedGrowth.revenue) : '', c ? num2(c.concepts.incremental.revenue) : '', Pm.RECOMMENDATIONS[p.recommendation] || '', p.conclusion].map(cell).join(','));
    });
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  /** Evaluación de una promoción (CSV): una fila por SKU. Cada cifra indica si es real o estimada. */
  function buildEvaluationCsv(r) {
    const head = ['Promoción', 'SKU', 'Producto', 'Estado de la evaluación', 'Motivo si no es evaluable', 'Inicio', 'Fin', 'Fechas', 'Días con dato', 'Venta durante (real)', 'Unidades durante (real)', 'Venta línea base (estimada)', 'Unidades línea base (estimada)',
      'Crecimiento observado (estimado)', 'Incremental estimado', 'Incremental mínimo', 'Incremental máximo', 'Días compartidos', 'Base desde', 'Base hasta', 'Días utilizables de la base', 'Avisos'];
    const lines = [head.map(cell).join(',')];
    (r.items || []).forEach((i) => {
      const ok = i.status === 'ok';
      lines.push([r.promoId, i.sku, i.name, ok ? 'Evaluado' : 'No evaluable', ok ? '' : i.reason, ok ? i.window.start : (i.window ? i.window.start : ''), ok ? i.window.end : (i.window ? i.window.end : ''), ok ? (i.window.source === 'real' ? 'Reales' : 'Planeadas') : '', ok ? i.daysWithData : '',
        ok ? num2(i.actual.revenue) : '', ok ? num2(i.actual.units) : '', ok ? num2(i.expected.revenue) : '', ok ? num2(i.expected.units) : '', ok ? num2(i.growth.revenue) : '', ok ? num2(i.incremental.revenue) : '', ok && i.incremental.range ? num2(i.incremental.range[0]) : '', ok && i.incremental.range ? num2(i.incremental.range[1]) : '',
        ok ? i.daysShared : '', ok ? i.baseline.from : '', ok ? i.baseline.to : '', ok ? i.baseline.usable : '', (i.warnings || []).map((w) => w.text).join(' | ')].map(cell).join(','));
    });
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  /**
   * Libro de Excel de la propuesta: UNA hoja con los productos de la selección (nada de comprador, laboratorio ni descuentos). Encima de la tabla, cuatro líneas de contexto:
   * nombre de la propuesta, periodo y referencia, filtros aplicados con «N de M», y fecha. Las cifras van como números con formato real.
   * meta = { name, period, baseline, filters: 'texto', total, generatedAt }
   */
  const XLS_HEAD = ['SKU', 'Producto', 'Categoría', 'Subcategoría', 'Tipo de oportunidad', 'Motivo', 'Evidencia', 'Qué limita la evidencia', 'Tamaño (solo demanda no convertida)', 'Venta del periodo', 'Venta de referencia', 'Cambio de venta',
    'Unidades', 'Vistas de ficha', 'Conversión', 'Conversión mediana de su categoría', 'Peso en su categoría', 'Ya tiene oferta recibida', 'Laboratorio', 'Origen de la oferta', 'Descuento', 'Programa', 'Falta para decidir'];
  const XLS_WIDTH = [16, 38, 22, 22, 28, 60, 11, 44, 18, 15, 15, 12, 11, 13, 12, 18, 13, 14, 24, 18, 14, 22, 50];
  function buildOpportunitiesBook(items, meta) {
    const m = meta || {}, EV = { high: 'Alta', medium: 'Media', low: 'Baja' };
    const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const per = m.period && m.period.from ? `${m.period.from} a ${m.period.to}` : '';
    const base = m.baseline && (m.baseline.label || (m.baseline.from ? `${m.baseline.from} a ${m.baseline.to}` : ''));
    const list = items || [];
    const rows = [
      [{ v: m.name || 'Propuesta', f: 'title' }],
      [{ v: `Periodo: ${per}${base ? ` · Referencia: ${base}` : ''}`, f: 'note' }],
      [{ v: `${list.length} de ${m.total === undefined ? list.length : m.total} productos con oportunidad${m.filters ? ` · Filtros: ${m.filters}` : ''}`, f: 'note' }],
      [{ v: `Generado el ${m.generatedAt || fileStamp()}. Lista de productos: laboratorio, origen, descuento y programa salen de las ofertas recibidas (con varias, todas separadas con « | »). No incluye precios ni mecánicas propuestas. Uso interno: no sale a laboratorios.`, f: 'note' }],
      [],
      XLS_HEAD.map((h) => ({ v: h, f: 'head' }))
    ];
    list.forEach((i) => rows.push([
      i.sku, i.name, i.category, i.subcategory || null, i.types.map((t) => t.label).join(' | '), { v: i.types.map((t) => `${t.label}: ${t.reason}`).join(' | '), f: 'wrap' }, EV[i.evidence.level], { v: i.evidence.notes.join(' | ') || null, f: 'wrap' },
      { v: n(i.size), f: 'money' }, { v: n(i.revenue), f: 'money' }, { v: n(i.revenueBase), f: 'money' }, { v: n(i.revenueDeltaPct), f: 'pct' },
      { v: n(i.units), f: 'int' }, { v: n(i.views), f: 'int' }, { v: n(i.conversion), f: 'pct' }, { v: n(i.categoryMedianConversion), f: 'pct' }, { v: n(i.categoryShare), f: 'pct' },
      i.offers.length ? 'Sí' : 'No', ...((oi) => [oi.lab || null, oi.origin || null, { v: oi.discount === '' ? null : oi.discount, f: typeof oi.discount === 'number' ? 'pct' : 'text' }, oi.program || null])(offerInfo(i, m.offers)), { v: i.missing.join(' | '), f: 'wrap' }]));
    const last = 6 + list.length;
    const sheets = [{ name: 'Productos', cols: XLS_WIDTH, rows, freeze: { row: 6, col: 1 }, autofilter: `A6:${FP.xlsxWriter ? FP.xlsxWriter.colName(XLS_HEAD.length - 1) : 'S'}${Math.max(last, 6)}` }];
    if (m.groups && m.groups.rows && m.groups.rows.length) sheets.push(groupsSheet(m.groups.rows, m.groups.label));
    return { sheets };
  }

  /* ---------- Plan de activación (Excel de una hoja y CSV) ---------- */
  const ACT_HEAD = ['SKU', 'Producto', 'Categoría', 'Laboratorio', 'Origen', 'Oferta', 'Programa', 'Activación sugerida', 'Segunda opción', 'Prioridad', 'Confianza', 'Razón', 'Qué falta para decidir', 'Sugerencia cargada', 'Comentario de la sugerencia cargada', 'Coincidencia', 'Estado', 'Responsable', 'Fecha del estado'];
  const ACT_WIDTH = [14, 34, 22, 22, 16, 30, 22, 28, 26, 11, 11, 60, 44, 24, 30, 24, 13, 18, 18];
  /** rows = [{ sku, name, category, lab, origin, offer, program, rec, ext: { space, comment, cmp }, stateLabel, by, at }] */
  function activationRow(r) {
    const rec = r.rec || {};
    return [r.sku, r.name || '', r.category || '', r.lab || '', r.origin || '', r.offer || '', r.program || '', rec.main || '', rec.second && rec.second !== '—' ? rec.second : '', rec.priority && rec.priority !== '—' ? rec.priority : '', rec.confidence || '',
      rec.why || '', (rec.missing || []).join(' | '), r.ext ? r.ext.space : '', r.ext ? r.ext.comment || '' : '', r.ext ? r.ext.cmpLabel || '' : '', r.stateLabel || '', r.by || '', r.at ? String(r.at).slice(0, 10) : ''];
  }
  function buildActivationCsv(rows) {
    return FP.csv.stringify(ACT_HEAD, (rows || []).map((r) => { const o = {}; activationRow(r).forEach((v, i) => { o[ACT_HEAD[i]] = v; }); return o; }), {});
  }
  function buildActivationBook(rows, meta) {
    const m = meta || {}, list = rows || [];
    const out = [
      [{ v: 'Plan de activación', f: 'title' }],
      [{ v: `${m.tabLabel || 'Ofertas y oportunidades'} · ${list.length} de ${m.total === undefined ? list.length : m.total} filas con los filtros aplicados`, f: 'note' }],
      [{ v: `Parámetros: descuento alto desde ${m.params ? m.params.discountHigh : '—'} % · ${m.params ? m.params.bannerSlots : '—'} espacio(s) de banner (${m.params && m.params.bannerMode === 'perTab' ? 'uno por pestaña' : 'compartido'})${m.externalFile ? ` · Sugerencias cargadas de ${m.externalFile}` : ''}`, f: 'note' }],
      [{ v: `Generado el ${m.generatedAt || fileStamp()}. Son sugerencias por reglas, no un efecto medido. Uso interno.`, f: 'note' }],
      [],
      ACT_HEAD.map((h) => ({ v: h, f: 'head' }))
    ];
    list.forEach((r) => out.push(activationRow(r).map((v, i) => ((i === 11 || i === 12 || i === 5) ? { v: v || null, f: 'wrap' } : (v === '' ? null : v)))));
    const last = 6 + list.length;
    return { sheets: [{ name: 'Plan de activación', cols: ACT_WIDTH, rows: out, freeze: { row: 6, col: 1 }, autofilter: `A6:${FP.xlsxWriter ? FP.xlsxWriter.colName(ACT_HEAD.length - 1) : 'S'}${Math.max(last, 6)}` }] };
  }
  /** Plantilla descargable para mandar ofertas: hoja de captura con los encabezados que la carga reconoce y hoja de instrucciones. */
  function buildOfferTemplateBook() {
    const T = FP.offers.TEMPLATE;
    const instr = [
      [{ v: 'Plantilla de ofertas', f: 'title' }],
      [{ v: 'Llena la hoja «Productos finales», una fila por producto, y cárgala en Promociones, Ofertas recibidas, Cargar archivo de ofertas.', f: 'note' }],
      [{ v: 'No cambies los encabezados. Indispensables: Oracle y % DES. Controlados también se pide al capturar a mano, y sin él la activación no puede verificar el tipo de control. Lo demás es opcional, pero ayuda a decidir.', f: 'note' }],
      [],
      ['Columna', 'Obligatoria', 'Qué poner'].map((h) => ({ v: h, f: 'head' }))
    ];
    T.forEach((c) => instr.push([c[0], c[2] ? 'Sí' : 'No', { v: c[3], f: 'wrap' }]));
    return { sheets: [
      { name: 'Productos finales', cols: T.map((c) => Math.max(14, c[0].length + 4)), rows: [T.map((c) => ({ v: c[0], f: 'head' }))], freeze: { row: 1, col: 1 } },
      { name: 'Instrucciones', cols: [28, 12, 90], rows: instr }
    ] };
  }
  /** Excel del resumen: una hoja con la tabla agrupada que se está viendo (la misma que en pantalla). */
  function buildSummaryBook(r, meta) {
    const m = meta || {}, G = FP.summary ? FP.summary.GROUPS : { cat: 'Categoría', lab: 'Laboratorio', prog: 'Programa' };
    const head = [G[r.group] || 'Grupo', 'SKU propuestos', 'Cobertura de ofertas', 'Sin oferta', 'Ofertas recibidas', 'Descuento promedio', 'Seleccionadas', 'En promoción', 'Recibidas fuera de propuesta'];
    const row = (label, x) => [label, x.sp, x.cover === null ? null : { v: x.cover, f: 'pct' }, x.sin, x.of, x.avg === null ? null : { v: x.avg, f: 'pct' }, x.sel, x.pr, x.fuera];
    const p = r.pending, f = r.funnel;
    const out = [
      [{ v: 'Resumen de promociones', f: 'title' }],
      [{ v: `Agrupado por ${(G[r.group] || '').toLowerCase()}${r.campaign ? ` · campaña «${r.campaign}»` : ' · todas las campañas'} · generado el ${m.generatedAt || fileStamp()}`, f: 'note' }],
      [{ v: `Embudo: ${f.detected === null ? 'oportunidades sin calcular' : f.detected + ' oportunidades'} · ${f.proposed} SKU propuestos · ${f.withOffer} con oferta · ${f.validated} validadas o seleccionadas · ${f.inPromo} en promoción`, f: 'note' }],
      [{ v: `Pendientes: ${p.received} ofertas sin validar · ${p.validated} validadas sin seleccionar · ${p.noOffer} SKU propuestos sin oferta · ${p.outside} ofertas fuera de propuesta`, f: 'note' }],
      [{ v: 'Las ofertas descartadas no cuentan. Uso interno: no sale a laboratorios.', f: 'note' }],
      [],
      head.map((h) => ({ v: h, f: 'head' }))
    ];
    r.rows.forEach((x) => out.push(row(x.label, x)));
    out.push(row('Total', r.total));
    return { sheets: [{ name: 'Resumen', cols: [30, 16, 18, 12, 16, 18, 14, 14, 24], rows: out, freeze: { row: 7, col: 1 }, autofilter: `A7:I${7 + r.rows.length}` }] };
  }
  const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

  const fileStamp = (d = new Date()) => d.toISOString().slice(0, 10);
  FP.promotionExport = { COLUMNS, OPP_COLUMNS, buildCsv, buildJson, buildOpportunitiesCsv, buildGroupsCsv, groupsSheet, buildOpportunitiesBook, buildActivationCsv, buildActivationBook, buildSummaryBook, buildOfferTemplateBook, offerInfo, ACT_HEAD, buildHistoryCsv, buildEvaluationCsv, XLS_HEAD, slug, fileStamp, rowsOf };
})(typeof window !== 'undefined' ? window : globalThis);
