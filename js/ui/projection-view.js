/**
 * projection-view.js — «Proyección del año siguiente» (Planear). Pinta FP.projection.build(); no calcula nada propio.
 * Tarjetas con encabezado como Diagnóstico, Pacing y Tráfico y conversión.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const money = (v) => F().currency(v, 0);
  const pct = (v, d = 1) => (typeof v === 'number' && isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(d)} %` : '—');
  const plain = (v, d = 1) => (typeof v === 'number' && isFinite(v) ? `${(v * 100).toFixed(d)} %` : '—');

  const SRC = { real: ['ok', 'Real'], prior_year: ['warning', 'Año anterior'], missing: ['error', 'Sin dato'] };

  function compute(state) {
    const p = state.proj;
    const forecastRun = state.fc && state.fc.run && state.fc.run.channels ? state.fc.run : null;
    return FP.projection.build(state.store, { baseYear: state.year, growth: p.growth, shares: p.shares, forecastRun });
  }

  const card = (id, title, desc, body) => `<section class="panel sgcard" aria-labelledby="${id}"><div class="panel__head"><div>
      <h2 class="panel__title" id="${id}">${title}</h2>${desc ? `<p class="panel__desc">${desc}</p>` : ''}</div></div><div class="panel__body stack">${body}</div></section>`;
  const kpi = (label, value, ref, tone = '') => `<dl class="metric-card${tone ? ` metric-card--${tone}` : ''}"><div class="metric-card__group"><dt class="metric-card__label">${label}</dt>
      <dd class="metric-card__value num">${value}</dd><dd class="metric-card__period">${ref}</dd></div></dl>`;

  function render(state) {
    const esc = H().esc, el = $('projection-view'); if (!el) return;
    const p = state.proj, res = compute(state), by = res.baseYear, ty = res.targetYear;
    const head = `<section class="panel" aria-labelledby="t-proj"><div class="panel__head"><div>
        <h2 class="panel__title" id="t-proj">Proyección de ${ty}</h2>
        <p class="panel__desc">Qué meta proponer para ${ty} y qué esperamos que pase, a partir del cierre estimado de ${by}. Dos números distintos: la meta es a dónde queremos llegar; la proyección es lo que esperamos si el ritmo reciente se mantiene.</p></div></div>`;
    if (!res.hasData) {
      el.innerHTML = head + `<div class="panel__body"><div class="empty"><strong>Todavía no hay datos para proyectar</strong>${res.noBase ? (res.partialMonths && res.partialMonths.length ? `Hay venta de ${by}, pero ningún mes cerrado con al menos ${Math.round(FP.projection.MIN_COVERAGE * 100)} % de sus días, y no hay histórico de ${by - 1} para completarlo. ` : `No hay venta con fecha de ${by} ni de ${by - 1}. `) : ''}Carga la venta real de ${by} y el histórico de ${by - 1} en Carga de datos; la proyección usa los meses cerrados de ${by} y, para los que faltan, los mismos meses de ${by - 1}.</div></div></section>`;
      return;
    }
    const ch = p.channel || 'total';
    const gInput = `<div class="field"><label for="proj-g" class="field__hint">Crecimiento de la meta total</label>
        <div class="field__inline"><input id="proj-g" type="number" inputmode="decimal" min="0" max="200" step="0.5" value="${(p.growth * 100).toFixed(1).replace(/\.0$/, '')}" data-action="proj-growth" aria-describedby="proj-g-h"><span aria-hidden="true">%</span></div>
        <span class="field__hint" id="proj-g-h">Sobre el monto total de la base de ${by}. Por canal es un resultado, no un dato.</span></div>`;
    const chSel = `<div class="field"><label for="proj-ch" class="field__hint">Canal del reparto mensual</label><select id="proj-ch" data-action="proj-channel">
        ${[['total', 'Total digital'], ...res.rows.map((r) => [r.id, r.label])].map(([k, l]) => `<option value="${esc(k)}" ${k === ch ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    const top = `${head}<div class="panel__body stack">
        <div class="filters">${gInput}${chSel}</div>
        <div class="metric-grid metric-grid--4 projkpis">
          ${kpi(`Base ${by} (cierre estimado)`, money(res.base.total), `${res.channels.reduce((s, c) => s + c.nReal, 0)} meses reales y ${res.channels.reduce((s, c) => s + c.nPrior, 0)} del año anterior (canal × mes)`)}
          ${kpi(`Meta propuesta ${ty}`, money(res.meta.total), `${pct(res.meta.growth)} sobre la base`, 'plan')}
          ${kpi(`Proyección ${ty}`, money(res.projection.total), `${pct(res.projection.growth)} con el ritmo de los últimos 2 meses`, 'forecast')}
          ${kpi('Brecha (meta − proyección)', `${res.gap.total >= 0 ? '+' : '−'}${money(Math.abs(res.gap.total))}`, res.gap.uplift === null ? '—' : res.gap.total > 0 ? `la meta pide ${pct(res.gap.uplift)} sobre lo proyectado` : res.gap.total < 0 ? `la proyección supera la meta en ${plain(-res.gap.uplift)}` : 'la meta y la proyección coinciden')}
        </div>
        <div class="projbtns btn-row"><button type="button" class="btn" data-action="proj-reset">Restablecer 16 % y participación de la base</button>
          <button type="button" class="btn" data-action="proj-download-json">Descargar proyección (JSON)</button><button type="button" class="btn" data-action="proj-download-csv">Descargar reparto mensual (CSV)</button></div>
      </div></section>`;

    // ---- lectura en frases ----
    const lines = [];   // [etiqueta, tono, texto]: la etiqueta dice de qué clase de dato es la frase
    lines.push(['Base', 'na', `La base de ${by} es ${money(res.base.total)}: ${res.channels.reduce((s, c) => s + c.nReal, 0)} meses salen del real y ${res.channels.reduce((s, c) => s + c.nPrior, 0)} del mismo mes de ${by - 1} (canal × mes).`]);
    lines.push(['Meta', 'info', `Meta propuesta: ${money(res.meta.total)} (${pct(res.meta.growth)}). Proyección con el ritmo reciente: ${money(res.projection.total)} (${pct(res.projection.growth)}).`]);
    lines.push(res.gap.total > 0 ? ['Brecha', 'warning', `Para llegar a la meta faltarían ${money(res.gap.total)} sobre lo que se proyecta.`] : res.gap.total < 0 ? ['Brecha', 'ok', `La proyección ya supera la meta por ${money(-res.gap.total)}: la meta podría ser más ambiciosa.`] : ['Brecha', 'ok', 'La meta y la proyección coinciden.']);
    const reading = card('pj-r', 'Lectura', 'Frases calculadas de los datos, sin IA.', `<ul class="sghl">${lines.map(([lbl, tone, t]) => `<li class="sghl__item"><span class="sghl__tag">${H().pill(tone, lbl)}</span><span class="sghl__text">${esc(t)}</span></li>`).join('')}</ul>
      ${res.warnings.length ? `<div class="note note--warn" role="status"><strong>Revisa antes de usar estos números</strong><ul>${res.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
      ${res.notes.length ? `<ul class="field__hint projnotes">${res.notes.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`);

    // ---- por canal ----
    const shareSum = Math.round(res.rows.reduce((s, r) => s + (p.shares ? (p.shares[r.id] || 0) : r.metaShare * 100), 0) * 10) / 10;
    const shareErr = p.shares && Math.abs(shareSum - 100) >= 0.05;
    const chRows = res.rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td class="num">${money(r.base)}</td>
        <td class="num"><label class="visually-hidden" for="proj-s-${esc(r.id)}">Participación de ${esc(r.label)} en la meta, en porcentaje</label><input id="proj-s-${esc(r.id)}" class="input--compact" type="number" inputmode="decimal" min="0" max="100" step="0.1" value="${((p.shares ? p.shares[r.id] : r.metaShare * 100) || 0).toFixed(1)}" data-action="proj-share" data-channel="${esc(r.id)}"> %</td>
        <td class="num">${money(r.meta)}</td><td class="num">${pct(r.metaGrowth)}</td>
        <td class="num">${r.last2 ? `${pct(r.last2.yoy)}<span class="cell-sub">${esc(r.last2.labels.join(' y '))}</span>` : '<span class="cell-sub">sin comparación</span>'}</td>
        <td class="num">${money(r.proj)}</td><td class="num">${r.gap >= 0 ? '+' : '−'}${money(Math.abs(r.gap))}</td></tr>`).join('');
    const tot = `<tr class="row--total"><th scope="row">Total digital</th><td class="num">${money(res.base.total)}</td><td class="num">${shareErr ? `<strong>${shareSum.toFixed(1)} %</strong>` : '100.0 %'}</td><td class="num">${money(res.meta.total)}</td><td class="num">${pct(res.meta.growth)}</td><td class="num">—</td><td class="num">${money(res.projection.total)}</td><td class="num">${res.gap.total >= 0 ? '+' : '−'}${money(Math.abs(res.gap.total))}</td></tr>`;
    const byChannel = card('pj-c', 'Por canal', `La meta crece ${plain(res.growth)} sobre el total y se reparte por la participación que elijas (por defecto, la de la base). La proyección aplica a cada canal el ritmo de sus últimos 2 meses cerrados contra ${by - 1}.`,
      `<div class="table-wrap"><table class="table ds-table" aria-label="Meta y proyección por canal"><thead><tr><th scope="col">Canal</th><th scope="col" class="num">Base ${by}</th><th scope="col" class="num">Participación en la meta</th><th scope="col" class="num">Meta ${ty}</th><th scope="col" class="num">Crecimiento de la meta</th><th scope="col" class="num">Ritmo últimos 2 meses</th><th scope="col" class="num">Proyección ${ty}</th><th scope="col" class="num">Brecha</th></tr></thead><tbody>${chRows}${tot}</tbody></table></div>
       ${shareErr ? `<div class="note note--error" role="alert"><strong>Las participaciones suman ${shareSum.toFixed(1)} %, no 100 %.</strong> Mientras no sumen 100 %, la meta se reparte según la base y no se pueden guardar las metas.</div>` : ''}
       ${p.shares ? '<p class="field__hint">Participaciones editadas por ti. «Restablecer» las vuelve a la base.</p>' : ''}`);

    // ---- cómo se armó la base ----
    const baseRows = res.channels.map((c) => `<tr><th scope="row">${esc(c.label)}</th><td>${c.months.map((m) => { const s = SRC[m.source]; return `<span class="projchip projchip--${m.source}" title="${esc(`${m.label}: ${s[1]}${m.note ? ` · ${m.note}` : ''}`)}">${esc(m.label.slice(0, 3))}</span>`; }).join('')}</td>
        <td class="num">${money(c.revenue)}</td><td class="num">${res.forecastClose && res.forecastClose.byChannel[c.id] !== null && res.forecastClose.byChannel[c.id] !== undefined ? money(res.forecastClose.byChannel[c.id]) : '<span class="cell-sub">sin forecast</span>'}</td></tr>`).join('');
    const baseCard = card('pj-b', `Cómo se armó la base de ${by}`, `Cada mes cerrado sale del real; el que falta o no tiene cobertura (menos de 90 % de sus días) se toma del mismo mes de ${by - 1}. Pasa el cursor por un mes para ver el motivo.`,
      `<div class="table-wrap"><table class="table ds-table" aria-label="Meses de la base por canal"><thead><tr><th scope="col">Canal</th><th scope="col">Meses (verde: real · naranja: año anterior · rojo: sin dato)</th><th scope="col" class="num">Base ${by}</th><th scope="col" class="num">Forecast de cierre en Pacing</th></tr></thead><tbody>${baseRows}</tbody></table></div>
       <p class="field__hint">El forecast de cierre de Pacing se muestra solo para comparar: usa el plan y otro método, así que puede diferir de esta base.</p>`);

    // ---- qué tendría que pasar ----
    const needRows = res.rows.filter((r) => r.needs).map((r) => `<tr><th scope="row">${esc(r.label)}</th><td class="num">${pct(r.needs.volumePct)}</td><td class="num">${r.needs.crPp === null ? '—' : `+${r.needs.crPp.toFixed(2)} pp`}<span class="cell-sub">${r.cr === null ? '' : `desde ${plain(r.cr, 2)}`}</span></td><td class="num">${pct(r.needs.aovPct)}</td></tr>`).join('');
    const need = card('pj-n', 'Qué tendría que pasar para cerrar la brecha', 'Para cada canal con brecha: cuánto tendría que subir, por separado, el volumen, el CR o el AOV sobre lo proyectado (los otros dos sin cambio). Es aritmética, no un plan: lo realista suele ser una combinación.',
      needRows ? `<div class="table-wrap"><table class="table ds-table" aria-label="Qué tendría que pasar"><thead><tr><th scope="col">Canal</th><th scope="col" class="num">Volumen (tráfico o contactos)</th><th scope="col" class="num">CR</th><th scope="col" class="num">AOV</th></tr></thead><tbody>${needRows}</tbody></table></div>` : '<p>Ningún canal tiene brecha: la proyección ya alcanza la meta.</p>');

    // ---- reparto mensual ----
    const mrows = res.monthly.map((m) => { const v = ch === 'total' ? m.total : m.byChannel[ch]; const src = ch === 'total' ? null : SRC[v.source];
      return `<tr><th scope="row">${esc(m.label)}</th><td class="num">${money(v.base)}${src && v.source !== 'real' ? `<span class="cell-sub">${esc(src[1])}</span>` : ''}</td><td class="num">${money(v.meta)}</td><td class="num">${money(v.proj)}</td></tr>`; }).join('');
    const mt = ch === 'total' ? res.monthly.reduce((s, m) => ({ b: s.b + m.total.base, m: s.m + m.total.meta, p: s.p + m.total.proj }), { b: 0, m: 0, p: 0 }) : res.monthly.reduce((s, m) => ({ b: s.b + m.byChannel[ch].base, m: s.m + m.byChannel[ch].meta, p: s.p + m.byChannel[ch].proj }), { b: 0, m: 0, p: 0 });
    const monthly = card('pj-m', 'Reparto mensual de referencia', `Reparte la meta y la proyección con la forma de los meses de la base. Es una referencia: el plan diario lo genera Planear con su propia estacionalidad cuando guardes las metas de ${ty}.`,
      `<div class="table-wrap"><table class="table ds-table" aria-label="Reparto mensual"><thead><tr><th scope="col">Mes</th><th scope="col" class="num">Base ${by}</th><th scope="col" class="num">Meta ${ty}</th><th scope="col" class="num">Proyección ${ty}</th></tr></thead><tbody>${mrows}<tr class="row--total"><th scope="row">Año</th><td class="num">${money(mt.b)}</td><td class="num">${money(mt.m)}</td><td class="num">${money(mt.p)}</td></tr></tbody></table></div>`);

    // ---- sensibilidad ----
    const srows = res.sensitivity.map((s) => `<tr${s.current ? ' class="row--current"' : ''}><th scope="row">${plain(s.growth, 1)}${s.current ? ' <span class="cell-sub">el que usas</span>' : ''}</th><td class="num">${money(s.meta)}</td><td class="num">${s.gap >= 0 ? '+' : '−'}${money(Math.abs(s.gap))}</td><td class="num">${pct(s.uplift)}</td></tr>`).join('');
    const sens = card('pj-s', 'Si el crecimiento fuera otro', 'La misma base con distintos crecimientos de la meta total, contra la misma proyección.',
      `<div class="table-wrap"><table class="table ds-table" aria-label="Sensibilidad al crecimiento"><thead><tr><th scope="col">Crecimiento de la meta</th><th scope="col" class="num">Meta ${ty}</th><th scope="col" class="num">Brecha contra la proyección</th><th scope="col" class="num">La meta pide sobre lo proyectado</th></tr></thead><tbody>${srows}</tbody></table></div>`);

    // ---- guardar como metas ----
    const saved = state.proj.savedAt ? `<p class="note note--ok" role="status">Metas de ${ty} guardadas (${money(state.proj.savedTotal)}). Ábrelas en Planear con el botón de abajo.</p>` : '';
    const save = card('pj-g', `Usar la meta como metas de ${ty}`, `Guarda la venta meta total y por canal de ${ty} en Planear → Metas, sin tocar las metas de ${by}. Después genera el plan mensual y diario de ${ty} con el motor de Planear (estacionalidad, festivos y eventos).`,
      `${saved}<div class="btn-row"><button type="button" class="btn btn--primary" data-action="proj-save-targets" ${shareErr ? 'disabled' : ''}>Guardar metas de ${ty} (${money(res.meta.total)})</button>
        <button type="button" class="btn" data-action="proj-open-plan">Ver metas de ${ty} en Planear</button></div>
       <p class="field__hint">Guardar reemplaza las metas de ${ty} que ya tengas escritas; la app te pide confirmar si existen.</p>`);

    el.innerHTML = top + reading + byChannel + baseCard + need + monthly + sens + save;
  }

  FP.projectionView = { render, compute };
})(typeof window !== 'undefined' ? window : globalThis);
