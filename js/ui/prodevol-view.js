/**
 * prodevol-view.js — «Producto y evolución»: Categoría → Producto y Evolución y patrones en una sola página, escrita como una lectura
 * de arriba abajo, de lo más importante a lo menos. Solo compone HTML de las dos vistas existentes (FP.productView, FP.trendView);
 * no calcula nada propio salvo las frases de conclusión de cada capítulo.
 * Producto manda en canal, periodo, comparación y ruta (los filtros de Evolución se derivan de ahí en app.js · peSync).
 *
 *   1 ¿Qué pasó?  2 ¿Contra la meta?  3 ¿Quién lo mueve? (una sola tabla: participación + contribución + tendencia + patrón)
 *   4 ¿Desde cuándo y hacia dónde?  5 ¿Por qué se mueve?  6 Evidencia y detalle
 * Etapa 3 de la fusión: Categoría → Producto y Evolución y patrones siguen disponibles.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const $ = (id) => document.getElementById(id);
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const nw = (t) => `<span class="nw">${esc(t)}</span>`;
  const F = () => FP.format;
  const money = (v) => F().currency(Math.abs(v), 0);
  const sg = (v) => (v < 0 ? '−' : '+') + money(v);
  const DASH = '—';

  function chapter(n, id, question, take, body) {
    return `<section class="chap" id="pe-${id}" aria-labelledby="pe-h-${id}"><header class="chap__h"><span class="chap__n" aria-hidden="true">${n}</span><div><span class="chap__q">${esc(question)}</span><h3 class="chap__t" id="pe-h-${id}">${take || esc(question)}</h3></div></header>${body}</section>`;
  }

  /* ---------- Conclusiones (escritas con las cifras de la selección) ---------- */
  function take1(state) {
    const r = state.pa.result;
    if (!r || !r.total) return '';
    const tc = r.total.current.revenue, tb = r.total.baseline.revenue;
    if (!tc || !tb || !fin(tc.value) || !fin(tb.value)) return '';
    const net = tc.value - tb.value;
    return `La venta ${net < 0 ? 'cae' : net > 0 ? 'sube' : 'no cambia'}${net ? ` ${nw(money(net))}` : ''} (${nw(F().signedPercent(tb.value ? net / tb.value : null, 1))}) contra ${esc(r.baseline.label)}.`;
  }
  function take2(state) {
    const b = state.an.bridge;
    if (!b) return '';
    if (b.status === 'not_applicable') return 'La meta existe por canal, no por categoría o producto: con esta selección este capítulo no aplica.';
    if (b.status !== 'available' && b.status !== 'partial') return '';
    if (b.gap >= 0) return `El periodo superó la meta por ${nw(money(b.gap))} (${nw(F().signedPercent(b.gapPct, 1))}).`;
    const chans = (b.channels || []).filter((c) => fin(c.gap)), worstC = chans.slice().sort((x, y) => x.gap - y.gap)[0];
    const worstE = (b.rows || []).slice().sort((x, y) => x.contribution - y.contribution)[0];
    const lbl = (c) => (FP.analysisContext ? FP.analysisContext.channelLabel(c) : c);
    return `El periodo quedó ${nw(money(b.gap))} (${nw(F().signedPercent(b.gapPct, 1))}) bajo la meta${worstC && chans.length > 1 ? `; ${esc(lbl(worstC.channel))} concentra ${nw(Math.round(worstC.gap / b.gap * 100) + ' %')} de la brecha` : ''}${worstE && worstE.contribution < 0 ? `, y por ${esc((FP.trendView && state.an.level ? '' : '') + 'entidad')}, ${esc(worstE.entity)} aporta ${nw(sg(worstE.contribution))} bajo el supuesto de crecimiento parejo` : ''}.`;
  }
  function take3(state) {
    const a = state.an, c = a.contribution;
    if (!c || c.status !== 'available') return '';
    const all = [...c.positive, ...c.negative].filter((r) => fin(r.delta) && r.delta !== 0);
    if (!all.length) return '';
    const top = all.slice().sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0];
    const pos = all.filter((r) => r.delta > 0 && r !== top).sort((x, y) => y.delta - x.delta);
    const losers = ((a.share && a.share.rows) || []).filter((r) => r.status === 'losing').slice(0, 2).map((r) => r.entity);
    const pct = fin(top.contributionPct) ? ` y explica ${nw(F().percent(Math.abs(top.contributionPct), 0))} del cambio neto` : '';
    const comp = pos.length && top.delta < 0 ? `; ${esc(pos.slice(0, 2).map((r) => r.entity).join(' y '))} compensa${pos.length > 1 ? 'n' : ''} ${nw(sg(pos.slice(0, 2).reduce((s, r) => s + r.delta, 0)))}` : '';
    return `${esc(top.entity)} ${top.delta < 0 ? 'baja' : 'sube'} ${nw(money(top.delta))}${pct}${comp}${losers.length ? `. Pierde${losers.length > 1 ? 'n' : ''} participación ${esc(losers.join(' y '))}` : ''}.`;
  }
  function take4(state) {
    const a = state.an, rows = a.rows || [];
    if (!rows.length) return '';
    const g = rows.filter((r) => r.direction === 'growth').length, d = rows.filter((r) => r.direction === 'decline').length, an = rows.filter((r) => r.anomaly).length;
    const PL = { category: ['categoría', 'categorías'], subcategory: ['subcategoría', 'subcategorías'], product: ['producto', 'productos'], sku: ['SKU', 'SKU'], region: ['región', 'regiones'], state: ['estado', 'estados'], city: ['ciudad', 'ciudades'], branch: ['sucursal', 'sucursales'], delivery: ['tipo de entrega', 'tipos de entrega'], channel: ['canal', 'canales'] };
    const lvl = (PL[a.level] || ['entidad', 'entidades'])[rows.length === 1 ? 0 : 1];
    return `De ${nw(rows.length)} ${esc(lvl)}${rows.length === 1 ? ', ' : ' analizadas, '}${nw(g)} ${g === 1 ? 'crece' : 'crecen'} y ${nw(d)} ${d === 1 ? 'cae' : 'caen'}${an ? `, ${nw(an)} con anomalía` : ''}.`;
  }
  function take5(state) {
    const p = state.an.pvm;
    if (!p || !p.total || (p.status !== 'available' && p.status !== 'partial')) return '';
    const t = p.total;
    return `De la variación de ${nw(sg(t.delta))}: volumen ${nw(sg(t.volume))}, precio ${nw(sg(t.price))} y mezcla ${nw(sg(t.mix))}. Es una descomposición matemática, no una causa.`;
  }

  /** Columnas que Evolución suma a la tabla de Producto: una sola tabla para «cuánto pesa» y «cuánto explica». */
  function extraCols(state) {
    const ex = FP.trendView.extras(state);
    const pct = (v) => (v === null || v === undefined || !fin(v) ? DASH : `${(v * 100).toFixed(1)} %`);
    return {
      sub: (x) => { const e = ex(x.key); return e.role ? `<span class="cell-sub">${esc(e.role)}${e.rank ? ` · #${e.rank}` : ''}</span>` : ''; },
      cols: [
        { head: 'Peso del movimiento', cls: 'num', cell: (x) => pct(ex(x.key).movementShare) },
        { head: 'Δ participación', cls: 'num', cell: (x) => { const v = ex(x.key).shareChangePp; return fin(v) ? `${v > 0 ? '+' : ''}${v.toFixed(1)} pp` : DASH; } },
        { head: 'Tendencia', cell: (x) => ex(x.key).spark || DASH },
        { head: 'Patrón / inicio', cell: (x) => { const e = ex(x.key); return e.pattern ? `${e.pattern}<span class="cell-sub">Inicio ${esc(e.since || DASH)}</span>` : DASH; } },
        { head: 'Persist.', cls: 'num', cell: (x) => { const v = ex(x.key).persist; return v === null ? DASH : `${v} per.`; } },
        { head: 'Primera pista', cell: (x) => ex(x.key).clue || DASH }
      ]
    };
  }

  function render(state, opts) {
    const el = $('pe-body'); if (!el) return;
    const PV = FP.productView, TV = FP.trendView;
    if (!FP.productStore || !FP.productStore.available()) {
      el.innerHTML = '<section class="panel"><div class="panel__body"><div class="empty"><strong>Todavía no hay datos de productos</strong>Carga el archivo de venta por producto (y, si quieres CR y embudo, el de funnel de GA4) en Carga de datos. <a class="btn btn--small btn--primary" href="#carga">Ir a Carga de datos</a></div></div></section>';
      return;
    }
    const ef = TV.filters(state, true);
    const controls = PV.controlsHtml(state, { groups: ef.groups, chips: ef.chips });
    const res = PV.resultParts(state, extraCols(state));
    const A = TV.build(state, true), early = A.early !== undefined;
    const rangeNote = opts && opts.range ? '<p class="note note--warning"><strong>La evolución necesita periodos de calendario.</strong> El rango libre solo aplica a la foto del periodo: elige Año, Mes, Semana o Día en Granularidad para actualizar la evolución.</p>' : '';
    const tools = early ? '' : '<div class="chap__tools"><button type="button" class="btn btn--small btn--ghost" data-action="an-diagnose">Diagnosticar este periodo</button><button type="button" class="btn btn--small btn--ghost" data-action="an-export-contrib">Descargar CSV</button></div>';
    const chips = [['pe-que', 'Qué pasó'], ['pe-meta', 'Contra la meta'], ['pe-quien', 'Quién lo mueve'], ['pe-evolucion', 'Desde cuándo'], ['pe-porque', 'Por qué'], ['pe-evidencia', 'Evidencia']]
      .map(([id, l]) => `<button type="button" class="chip" data-action="pe-jump" data-target="${id}">${esc(l)}</button>`).join('');
    el.innerHTML = `
      <section class="panel">
        <div class="panel__head"><div data-own-head>
          <h2 class="panel__title" id="t-pe">Producto y evolución</h2>
          <p class="panel__desc">Versión en construcción (etapa 3 de 4): Categoría → Producto y Evolución y patrones siguen disponibles en este mismo menú.</p>
        </div></div>
        <div class="panel__body">${controls}
          <div class="pe-jump" role="navigation" aria-label="Secciones de la página">${chips}</div>
        </div>
      </section>
      ${chapter(1, 'que', '¿Qué pasó?', take1(state), `${early ? '' : A.context + A.narrative}${res.kpis}`)}
      ${chapter(2, 'meta', '¿Contra la meta?', take2(state), early ? A.early : A.bridge)}
      ${chapter(3, 'quien', '¿Quién lo mueve?', take3(state), `${early ? '' : TV.contributionKpis(state)}${tools}<div class="chap__block">${res.table}</div>${early ? '' : A.mix}`)}
      ${chapter(4, 'evolucion', '¿Desde cuándo y hacia dónde?', take4(state), early ? A.early : `${rangeNote}${A.kpis}${A.table}${A.reading}${A.forecast}`)}
      ${chapter(5, 'porque', '¿Por qué se mueve?', take5(state), `${early ? '' : A.pvm}${res.signals ? `<div class="chap__block">${res.signals}</div>` : ''}`)}
      ${chapter(6, 'evidencia', 'Evidencia y detalle', 'Todo lo anterior se puede rastrear hasta el SKU, el archivo y la fila de origen.', `<div class="chap__block" id="pe-trace">${res.trace}</div>${early ? '' : A.assistant}`)}`;
  }

  FP.prodevolView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
