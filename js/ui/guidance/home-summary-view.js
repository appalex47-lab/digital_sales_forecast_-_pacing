/**
 * home-summary-view.js — Resumen general de Inicio: 4 bloques debajo de «¿Qué está pasando?».
 * Solo presenta lo que calcula homeSummaryEngine; las tarjetas de «¿Qué está pasando?» no se tocan.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const EFFECT = { traffic: 'Tráfico', cr: 'Conversión', aov: 'Ticket' };
  const sMoney = (v) => (Math.abs(v) < 0.5 ? F().currency(0, 0) : (v > 0 ? '+' : '−') + F().currency(Math.abs(v), 0));
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const rangeTxt = (r) => (r && r[0] ? (r[0] === r[1] ? r[0] : `${r[0]} a ${r[1]}`) : '');

  const block = (id, title, src, sub, body, logic) => `<section class="ds-card home-sum" id="hs-${id}" aria-labelledby="hs-t-${id}" data-block="${id}">
      <div class="home__row"><h3 class="ds-section-title" id="hs-t-${id}">${title}</h3><span class="ds-badge ds-badge--driver">${H().esc(src)}</span></div>
      <p class="ds-card__sub">${sub}</p><div class="home__body">${body}</div>
      <details class="ds-accordion home-sum__how"><summary><span class="ds-accordion__n" aria-hidden="true">?</span><span><h4 class="ds-accordion__t">De dónde sale y qué pasa sin datos</h4></span>
        <svg class="ds-accordion__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
        <div class="ds-accordion__body"><ul>${logic.map((l) => `<li>${H().esc(l)}</li>`).join('')}</ul></div></details></section>`;

  const periodWord = (period) => {
    if (period.type === 'month') { const i = +period.key.slice(5, 7) - 1; const p = i === 0 ? 11 : i - 1; return { cur: `${MONTHS[i]} ${period.key.slice(0, 4)}`, base: `${MONTHS[p]}${i === 0 ? ` ${+period.key.slice(0, 4) - 1}` : ''}` }; }
    return { cur: `el año ${period.key}`, base: `el año ${+period.key - 1}` };
  };

  function whyBlock(S, ctx) {
    const { esc } = H(), w = S.why, pw = periodWord(S.period), chLbl = FP.navigation.contextLabel({ channel: S.channel });
    const sub = `${esc(pw.cur.charAt(0).toUpperCase() + pw.cur.slice(1))} contra ${esc(pw.base)} · ${esc(chLbl)} · mismos días en ambos periodos`;
    const logic = ['Mismo motor de «Tráfico y conversión»: Venta = Sesiones × CR × Ticket; los tres efectos suman exactamente el cambio de venta.',
      'Compara días exactos contra días exactos: solo cuentan los días (por canal) con venta en los dos periodos.',
      'Sin sesiones, o con un canal sin sesiones dentro de «Total digital», muestra solo el cambio de venta y dice qué falta.',
      'Sin periodo anterior con venta real, no muestra nada que comparar. Sigue el Canal y el Periodo de arriba.'];
    let body;
    if (w.status !== 'ok') {
      body = `<div class="ds-empty" data-why="no_base"><strong class="ds-empty__t">No hay con qué comparar todavía</strong><p class="ds-empty__d">${esc(w.note || `No hay venta real de ${pw.base} en los mismos días.`)}${S.period.type === 'year' ? ' Elige un mes en «Periodo» para ver el cambio contra el mes anterior.' : ''}</p></div>`;
    } else {
      const cov = w.coverage, up = w.delta >= 0;
      const head = `La venta ${up ? 'subió' : 'bajó'} ${esc(sMoney(Math.abs(w.delta)).replace(/^[+−]/, ''))} (${esc(F().signedPercent(w.baseline ? w.delta / w.baseline : null, 1))}): ${esc(F().currency(w.current, 0))} contra ${esc(F().currency(w.baseline, 0))}.`;
      let eff = '';
      if (w.effects) {
        const e = w.effects;
        eff = `<div class="sgd">${FP.segmentsDecompView.waterfall({ total: { traffic: e.traffic, cr: e.cr, aov: e.aov, delta: e.delta } }, { esc, money: (v) => F().currency(v, 0) })}</div>
          <ul class="headline"><li>Lo que más pesó: ${esc(EFFECT[w.dominant].toLowerCase())} (${esc(sMoney(e[w.dominant]))}).${w.kind === 'noBaseOrders' ? ' Sin pedidos en el periodo anterior, el cambio se atribuye a conversión.' : ''}</li></ul>`;
      } else {
        eff = `<p class="field__hint" data-why="no_traffic">No se puede separar tráfico, conversión y ticket: ${S.channel === 'total' ? 'alguno de los canales no trae sesiones, y sumar canales con y sin sesiones mezclaría cosas distintas. Elige un canal con sesiones (Ecommerce o App).' : 'este canal no trae sesiones en el periodo.'}</p>`;
      }
      const cuadre = cov.paired < cov.expected ? ` Faltan ${cov.expected - cov.paired} de ${cov.expected} días por canal con dato en ambos periodos; esos no cuentan.` : '';
      body = `<ul class="headline"><li>${head}</li></ul>${eff}<p class="field__hint" data-why-cov>Compara ${cov.paired} de ${cov.expected} días por canal (${esc(rangeTxt(cov.currentRange))} contra ${esc(rangeTxt(cov.baselineRange))}).${esc(cuadre)}</p>
        <p><a class="btn btn--ghost" href="#analisis" data-nav="analisis">Ver el análisis completo</a></p>`;
    }
    return block('why', 'Por qué cambió la venta', 'Análisis', sub, body, logic);
  }

  function whereBlock(S, ctx) {
    const { esc } = H(), W = S.where;
    const logic = ['Toma, en cada dimensión de GA4, el segmento con mayor cambio de venta; no calcula nada nuevo (es el motor de «Segmentos»).',
      'Respeta el mínimo de sesiones: lo que cae en «Otros» nunca se recomienda. Se omite la combinación dispositivo × fuente (repite lo que ya dicen las dos).',
      'El aviso de calidad solo aparece si hay segmentos con muchas sesiones y ningún pedido, o tráfico nuevo que casi no convierte; la app lo marca, no lo confirma.',
      'Sin Segmentos cargados, o sin datos en este periodo, lo dice y enlaza a Carga.'];
    let body;
    if (W.status === 'no_segments') body = `<div class="ds-empty" data-where="empty"><strong class="ds-empty__t">Todavía no hay segmentos cargados</strong><p class="ds-empty__d">Carga el export de GA4 en <a href="#carga" data-nav="carga">Carga de datos</a> para ver dónde mirar.</p></div>`;
    else if (W.status !== 'ok') body = `<div class="ds-empty" data-where="empty"><strong class="ds-empty__t">Sin segmentos en este periodo</strong><p class="ds-empty__d">${esc(W.note || '')}</p></div>`;
    else {
      const items = W.picks.map((p) => `<div class="home-sum__item" data-pick="${esc(p.dimension)}"><div><strong>${esc(p.dimensionLabel)} · ${esc(p.segment)}</strong>
        <div class="ds-card__sub">${esc(EFFECT[p.dominant])} ${esc(sMoney(p.effect))} · cambio de venta del segmento ${esc(sMoney(p.delta))} · ${p.delta < 0 ? 'lo que más restó' : 'lo que más sumó'} en esta dimensión</div></div>
        <button type="button" class="btn btn--ghost" data-action="home-seg" data-dim="${esc(p.dimension)}">Diagnosticar</button></div>`).join('');
      const q = W.quality.length ? FP.segmentsDecompView.qualityBlock({ quality: W.quality }, { esc, pct: (v, d = 1) => (fin(v) ? `${(v * 100).toFixed(d)} %` : '—'), F: F() }) : '';
      body = (items || '<p class="field__hint">Ningún segmento sobresale con el mínimo de sesiones actual.</p>') + q;
    }
    return block('where', 'Dónde mirar hoy', 'Segmentos', 'Lo que más explica el movimiento. «Diagnosticar» abre Segmentos con el mismo canal y periodo.', body, logic);
  }

  function channelsBlock(S, ctx) {
    const { esc } = H(), Ch = S.channels;
    const logic = ['Una fila por canal con el mismo cálculo de Pacing y Forecast que las tarjetas de arriba; el estado usa los umbrales de pacing configurados.',
      'Un canal sin plan o sin venta real en el periodo muestra «—» y la razón; no inventa cumplimiento.',
      'Elegir un canal cambia el Canal de todo Inicio. El canal elegido arriba aparece resaltado.'];
    const rows = Ch.rows.map((r) => {
      const sel = S.channel === r.id;
      const state = r.state === 'no_plan' ? '<span class="ds-badge">Sin plan</span>' : r.state === 'no_actual' ? '<span class="ds-badge">Sin venta real</span>' : FP.pacingView.pacePill(r.pacing);
      const fg = r.forecastGapPct;
      return `<tr data-ch="${esc(r.id)}"${sel ? ' aria-current="true" class="is-selected"' : ''}><td><button type="button" class="link-btn" data-action="home-pick-channel" data-ch="${esc(r.id)}">${esc(r.label)}</button></td>
        <td class="num">${r.state === 'ok' && fin(r.actual) ? esc(F().currency(r.actual, 0)) : '—'}</td>
        <td class="num">${r.state === 'ok' && fin(r.compliance) ? esc(F().percent(r.compliance, 1)) : '—'}</td>
        <td class="num ${fin(fg) ? (fg < 0 ? 'is-neg' : fg > 0 ? 'is-pos' : '') : ''}">${r.state !== 'no_plan' && fin(fg) ? esc(F().signedPercent(fg, 1)) : '—'}</td><td>${state}</td></tr>`;
    }).join('');
    const body = `<div class="table-wrap"><table class="table ds-table" aria-label="Resumen por canal"><thead><tr><th scope="col">Canal</th><th scope="col" class="num">Venta acumulada</th><th scope="col" class="num">Cumplimiento</th><th scope="col" class="num">Forecast vs meta</th><th scope="col">Estado</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    return block('channels', 'Cómo va cada canal', 'Pacing · Forecast', `${esc(S.period.type === 'month' ? periodWord(S.period).cur : `Año ${S.period.key}`)} · mismas definiciones que las tarjetas de arriba.`, body, logic);
  }

  function trustBlock(S, ctx) {
    const { esc } = H(), T = S.trust;
    const logic = ['Lee de Calidad de datos y de la cobertura de cada archivo; no calcula nada nuevo.', '«Días comparados» explica el titular de «Por qué» (la nota de cuadre, en una línea).', 'Si falta un archivo, lo dice con un enlace a Carga.'];
    const card = (l, v, s) => `<div class="metric-card"><div class="metric-card__head"><span class="metric-card__label">${esc(l)}</span></div><div class="metric-card__value num">${v}</div>${s ? `<div class="metric-card__compare">${s}</div>` : ''}</div>`;
    const cov = T.coverage;
    const q = T.quality;
    const cards = [
      card('Venta real hasta', T.lastActual ? esc(T.lastActual) : '—', T.lastActual ? 'Último día con venta real cargada' : 'Sin venta real cargada'),
      card('Días comparados', cov ? `${cov.paired} de ${cov.expected}` : '—', cov ? 'Días por canal con venta en ambos periodos' : 'Sin periodo anterior para comparar'),
      card('Calidad de datos', q ? esc(q.text || q.status) : '—', q ? `${q.flagged ? `${esc(F().integer(q.flagged))} registros con aviso o error · ` : 'Sin avisos · '}<a href="#calidad" data-nav="calidad">Revisar</a>` : '<a href="#carga" data-nav="carga">Cargar datos</a>'),
      card('Segmentos y productos', `${(T.segments ? 1 : 0) + (T.products ? 1 : 0)} de 2 cargados`, `${T.segments ? `Segmentos hasta ${esc(T.segments.to || '—')}` : 'Sin segmentos'} · ${T.products ? `Productos hasta ${esc(T.products.to || '—')}` : 'Sin productos'}${T.segments && T.products ? '' : ' · <a href="#carga" data-nav="carga">Cargar</a>'}`)
    ].join('');
    return block('trust', 'Confianza de los datos', 'Calidad de datos', 'Para que nadie lea el titular sin saber qué lo respalda.', `<div class="metric-grid">${cards}</div>`, logic);
  }

  /** HTML de los 4 bloques (cada uno aislado: si uno falla, los demás se muestran). */
  function render(state, h) {
    let S;
    try { S = FP.homeSummaryEngine.compute(state, h); } catch (e) { return `<section class="ds-card home-sum" data-block="error"><p class="field__hint">No se pudo calcular el resumen general: ${H().esc(String(e && e.message || e))}</p></section>`; }
    const safe = (fn) => { try { return fn(S, {}); } catch (e) { return `<section class="ds-card home-sum" data-block="error"><p class="field__hint">No se pudo mostrar este bloque: ${H().esc(String(e && e.message || e))}</p></section>`; } };
    return `<div class="home-sum__sep ds-card__sub"><strong>Resumen general</strong> · el mismo canal y periodo de arriba.</div>${safe(whyBlock)}${safe(whereBlock)}${safe(channelsBlock)}${safe(trustBlock)}`;
  }

  FP.homeSummaryView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
