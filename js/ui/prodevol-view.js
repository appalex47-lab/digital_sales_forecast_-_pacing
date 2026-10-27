/**
 * prodevol-view.js — «Producto y evolución»: Categoría → Producto y Evolución y patrones en una sola página.
 * Solo compone HTML de las dos vistas existentes (FP.productView, FP.trendView); no calcula nada propio salvo las frases de conclusión.
 * Producto manda en canal, periodo, comparación y ruta (los filtros de Evolución se derivan de ahí en app.js · peSync).
 * Estructura de lectura, de lo más importante a lo menos: qué pesa y qué cambió → desde cuándo y hacia dónde → contribución y mix.
 * Etapa 2 de la fusión: las páginas Categoría → Producto y Evolución y patrones siguen disponibles.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const $ = (id) => document.getElementById(id);
  const esc = (v) => FP.ui.helpers.esc(v);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const nw = (t) => `<span class="nw">${esc(t)}</span>`;

  function chapter(id, question, take, body) {
    return `<section class="chap" id="pe-${id}" aria-labelledby="pe-h-${id}"><header class="chap__h"><div><span class="chap__q">${esc(question)}</span>${take ? `<h3 class="chap__t" id="pe-h-${id}">${take}</h3>` : `<h3 class="chap__t" id="pe-h-${id}">${esc(question)}</h3>`}</div></header>${body}</section>`;
  }

  /** Conclusión de la foto del periodo, con las cifras de la selección. */
  function takeFoto(state) {
    const r = state.pa.result, F = FP.format;
    if (!r || !r.rows || !r.rows.length || !r.total) return '';
    const tc = r.total.current.revenue, tb = r.total.baseline.revenue;
    if (!tc || !tb || !fin(tc.value) || !fin(tb.value)) return '';
    const net = tc.value - tb.value, top = r.rows.filter((x) => fin(x.revenue.delta)).sort((a, b) => Math.abs(b.revenue.delta) - Math.abs(a.revenue.delta))[0];
    const money = (v) => F.currency(Math.abs(v), 0), sg = (v) => (v < 0 ? '−' : '+') + money(v);
    const head = `La venta ${net < 0 ? 'cae' : net > 0 ? 'sube' : 'no cambia'}${net ? ` ${nw(money(net))}` : ''} (${nw(F.signedPercent(tb.value ? net / tb.value : null, 1))}) contra ${esc(r.baseline.label)}`;
    if (!top) return `${head}.`;
    const name = FP.productFilter && r.level === 'branch' ? FP.productFilter.label('branch', top.key) : top.key;
    const share = fin(top.contribution) ? ` y explica ${nw(F.percent(top.contribution, 0))} del cambio neto` : '';
    return `${head}; el mayor movimiento es ${esc(name)} (${nw(sg(top.revenue.delta))})${share}.`;
  }
  function takeEvo(state) {
    const a = state.an, rows = a.rows || [];
    if (!rows.length) return '';
    const g = rows.filter((r) => r.direction === 'growth').length, d = rows.filter((r) => r.direction === 'decline').length, an = rows.filter((r) => r.anomaly).length;
    return `De ${nw(rows.length)} ${esc(FP.productView.LEVEL[a.level] ? FP.productView.LEVEL[a.level].toLowerCase() : 'entidades')}${rows.length === 1 ? '' : ' analizadas'}, ${nw(g)} crecen y ${nw(d)} caen${an ? `, ${nw(an)} con anomalía` : ''}.`;
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
    const res = PV.resultParts(state);
    const A = TV.build(state, true);
    const rangeNote = opts && opts.range ? '<p class="note note--warning"><strong>La evolución necesita periodos de calendario.</strong> El rango libre solo aplica a la foto del periodo: elige Año, Mes, Semana o Día en Granularidad para actualizar la evolución.</p>' : '';
    const evoBody = A.early !== undefined ? A.early : `${rangeNote}${A.context}${A.narrative}${A.kpis}${A.table}${A.reading}${A.forecast}`;
    const mixBody = A.early !== undefined ? '' : `${A.contribution}${A.pvm}${A.bridge}${A.mix}${A.assistant}`;
    el.innerHTML = `
      <section class="panel">
        <div class="panel__head"><div data-own-head>
          <h2 class="panel__title" id="t-pe">Producto y evolución</h2>
          <p class="panel__desc">Versión en construcción (etapa 2 de 4): Categoría → Producto y Evolución y patrones siguen disponibles en este mismo menú.</p>
        </div></div>
        <div class="panel__body">${controls}
          <div class="pe-jump" role="navigation" aria-label="Secciones de la página"><button type="button" class="chip" data-action="pe-jump" data-target="pe-foto">Qué pesa y qué cambió</button><button type="button" class="chip" data-action="pe-jump" data-target="pe-evolucion">Desde cuándo y hacia dónde</button><button type="button" class="chip" data-action="pe-jump" data-target="pe-mix">Contribución y mix</button></div>
        </div>
      </section>
      ${chapter('foto', '¿Qué pesa y qué cambió?', takeFoto(state), `${res.kpis}<div class="chap__block">${res.table}</div>${res.signals ? `<div class="chap__block">${res.signals}</div>` : ''}<div class="chap__block">${res.trace}</div>`)}
      ${chapter('evolucion', '¿Desde cuándo y hacia dónde?', takeEvo(state), evoBody)}
      ${mixBody ? chapter('mix', 'Contribución y mix', '', mixBody) : ''}`;
  }

  FP.prodevolView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
