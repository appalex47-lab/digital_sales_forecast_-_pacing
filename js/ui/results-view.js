/**
 * results-view.js — pestaña «Resultados e historial» dentro de Promociones (propuesta B, etapa POST).
 * Pinta la evaluación que calcula FP.promotionEvaluation (en app.js) y el historial consultable de promociones.
 * Toda cifra dice si es real (leída de la venta cargada) o estimada (línea base). No afirma causalidad.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const P = () => FP.promotions;
  const $ = (id) => document.getElementById(id);
  const val = (id) => { const el = $(id); return el ? String(el.value).trim() : ''; };
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const money = (v) => (fin(v) ? v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) : '—');
  const signedMoney = (v) => (fin(v) ? `${v > 0 ? '+' : ''}${money(v)}` : '—');
  const pct = (v) => (fin(v) ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace(/\.0$/, '')} %` : '—');
  const int = (v) => (fin(v) ? Math.round(v).toLocaleString('es-MX') : '—');
  function field(id, label, html, hint) { const esc = H().esc; return `<div class="field"><label for="${id}" class="field__label">${esc(label)}</label>${html}${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`; }
  const input = (id, v, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${H().esc(v === null || v === undefined ? '' : v)}" ${extra}>`;
  function selectHtml(id, items, cur, extra = '') { const esc = H().esc; return `<select id="${id}" ${extra}>${items.map(([k, l]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`; }
  const catOf = (sku) => { try { const m = FP.productStore.catalog.bySku.get(sku); return m ? m.category : ''; } catch (e) { return ''; } };
  const lastCut = (p) => (p.evaluations && p.evaluations.length ? p.evaluations[p.evaluations.length - 1] : null);

  /** Promociones del historial con los filtros aplicados (estado, objetivo, mecánica, espacio, recomendación, categoría, fechas, texto). */
  function filtered(state) {
    const f = state.rs.f, reg = state.pm.reg, q = FP.offers ? FP.offers.norm(f.q) : String(f.q || '').toLowerCase();
    const n = (t) => (FP.offers ? FP.offers.norm(t) : String(t || '').toLowerCase());
    return reg.promotions.filter((p) => {
      if (f.status ? p.status !== f.status : !['published', 'measuring', 'closed'].includes(p.status)) return false;
      if (f.objective && p.objective !== f.objective) return false;
      if (f.rec && p.recommendation !== f.rec) return false;
      if (f.space && !(p.activations || []).some((a) => a.space === f.space)) return false;
      if (f.mechanic && !(p.skus || []).some((s) => n(s.mechanic).includes(n(f.mechanic)))) return false;
      if (f.category && !(p.skus || []).some((s) => catOf(s.sku) === f.category)) return false;
      if (f.from && (p.plannedEnd || p.plannedStart || '') < f.from) return false;
      if (f.to && (p.plannedStart || p.plannedEnd || '') > f.to) return false;
      if (q && !n(`${p.promoId} ${p.name} ${p.conclusion || ''} ${(p.skus || []).map((s) => `${s.sku} ${s.name || ''}`).join(' ')}`).includes(q)) return false;
      return true;
    });
  }

  /** Tarjeta «Cumplimiento del objetivo»: avance de la meta de la campaña de la promoción (venta real de sus promociones), o por qué no hay meta. */
  function goalCard(goal, p, card) {
    const esc = H().esc, pill = H().pill;
    if (!p || !p.campaign) return card('Cumplimiento del objetivo', pill('na', 'Sin campaña'), '<strong class="metric-card__value">Sin campaña</strong>', 'La promoción no tiene campaña, así que no hay meta contra qué medir. Asígnala en su detalle (pestaña Promociones).');
    if (!goal) return card('Cumplimiento del objetivo', pill('na', 'Sin meta'), '<strong class="metric-card__value">Sin meta</strong>', `La campaña «${p.campaign}» no tiene meta numérica. Fíjala en Promociones → Metas por campaña.`);
    const pr = goal.progress, g = goal.goal, main = g.revenue ? pr.pctRevenue : pr.pctUnits;
    const parts = [g.revenue ? `venta ${money(pr.revenue)} de ${money(g.revenue)} (${fin(pr.pctRevenue) ? Math.round(pr.pctRevenue * 100) + ' %' : '—'})` : '', g.units ? `unidades ${int(pr.units)} de ${int(g.units)} (${fin(pr.pctUnits) ? Math.round(pr.pctUnits * 100) + ' %' : '—'})` : ''].filter(Boolean).join(' · ');
    const miss = pr.missing.length ? ` ${pr.missing.length} promoción(es) de la campaña sin evaluación ni corte guardado no suman: el avance es parcial.` : '';
    const dup = pr.dupes.length || pr.partial.length ? ` ${pr.dupes.length ? `${pr.dupes.length} SKU repetido(s) con las mismas fechas en otra promoción cuentan una vez. ` : ''}${pr.partial.length ? `${pr.partial.length} SKU se traslapan solo en parte con otra promoción: pueden contar doble.` : ''}` : '';
    const src = pr.cutoffMin ? ` Datos ${pr.allLive ? 'al día, hasta' : 'hasta'} ${pr.cutoffMin === pr.cutoffMax ? pr.cutoffMax : `${pr.cutoffMin} a ${pr.cutoffMax}`}${pr.allLive ? '' : ' (alguna promoción usa su último corte guardado)'}.` : '';
    return card(`Meta de la campaña «${p.campaign}»`, pill('ok', 'Real'), `<strong class="metric-card__value num">${fin(main) ? Math.round(main * 100) + ' %' : '—'}</strong><span class="cell-sub">${esc(parts)}</span>`, `Suma la venta real durante las promociones de la campaña. No es incremental.${src}${miss}${dup}`);
  }

  function concepts(r, goal, p) {
    const esc = H().esc, pill = H().pill, c = r.concepts;
    const card = (title, tag, body, hint) => `<div class="metric-card"><span class="metric-card__label">${esc(title)} ${tag}</span>${body}${hint ? `<span class="field__hint">${esc(hint)}</span>` : ''}</div>`;
    const est = pill('warning', 'Estimado');
    return `<div class="metric-grid">
      ${card('Crecimiento observado', est, `<strong class="metric-card__value num">${pct(c.observedGrowth.revenue)}</strong><span class="cell-sub">venta · unidades ${pct(c.observedGrowth.units)}</span>`, c.observedGrowth.note)}
      ${goalCard(goal, p, card)}
      ${card('Venta incremental estimada', est, `<strong class="metric-card__value num">${signedMoney(c.incremental.revenue)}</strong><span class="cell-sub">${c.incremental.range ? `rango ${signedMoney(c.incremental.range[0])} a ${signedMoney(c.incremental.range[1])}` : 'un solo periodo comparable'} · unidades ${c.incremental.units === null ? '—' : (c.incremental.units > 0 ? '+' : '') + int(c.incremental.units)}</span>`, c.incremental.note)}
      ${card('Efecto causal demostrado', pill('error', 'No demostrado'), `<strong class="metric-card__value">No demostrado</strong>`, 'Sin grupo de control definido antes de la campaña, esta herramienta no establece causalidad.')}
    </div>
    <p class="field__hint">Venta durante la promoción (real): <strong>${money(r.totals.actual.revenue)}</strong> · línea base (estimada): <strong>${money(r.totals.expected.revenue)}</strong> · ${r.counts.evaluable} de ${r.counts.total} SKU evaluables. Corte de datos: ${esc(r.dataMax || '—')}.</p>`;
  }

  /** Seguimiento durante la vigencia: avance de la venta real contra la línea base, acumulado día a día. */
  function trackPanel(r) {
    const esc = H().esc, pill = H().pill, T = FP.promotionEvaluation.track(r);
    if (!T.days.length) return '';
    const g = T.progress, W = 600, Hh = 150, pad = 8, n = T.days.length, maxV = Math.max(...T.days.map((d) => Math.max(d.cumActual, d.cumExpected)), 1);
    const px = (i) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (n - 1)), py = (v) => Hh - pad - (v / maxV) * (Hh - 2 * pad);
    const line = (k) => T.days.map((d, i) => `${px(i).toFixed(1)},${py(d[k]).toFixed(1)}`).join(' ');
    const chart = `<svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Venta acumulada real contra línea base acumulada, ${n} días con dato" style="max-width:640px;display:block">
      <polyline points="${line('cumExpected')}" fill="none" stroke="var(--ds-text-muted,#6b7280)" stroke-width="2" stroke-dasharray="5 4"/>
      <polyline points="${line('cumActual')}" fill="none" stroke="var(--ds-accent,#1F5FE0)" stroke-width="2.5"/></svg>
      <p class="field__hint"><span style="color:var(--ds-accent,#1F5FE0)">━</span> Venta real acumulada · <span style="color:var(--ds-text-muted,#6b7280)">╌</span> Línea base acumulada (estimada).</p>`;
    const rows = T.days.slice().reverse().slice(0, 31).map((d) => `<tr><td class="num">${esc(d.date)}</td><td class="num">${money(d.actual)}</td><td class="num">${money(d.expected)}</td><td class="num">${signedMoney(d.actual - d.expected)}</td><td class="num">${money(d.cumActual)}</td><td class="num">${signedMoney(d.cumIncremental)}</td></tr>`).join('');
    return `<h3>Seguimiento durante la vigencia</h3>
      <div class="metric-grid">
        <div class="metric-card"><span class="metric-card__label">Avance de la vigencia</span><strong class="metric-card__value num">${g.withData} de ${g.total} días</strong><span class="metric-card__period">${esc(g.start)} a ${esc(g.end)} · venta cargada hasta ${esc(g.dataMax || '—')}</span></div>
        <div class="metric-card"><span class="metric-card__label">Ritmo contra la base ${pill('warning', 'Estimado')}</span><strong class="metric-card__value num">${pct(T.pace)}</strong><span class="metric-card__period">venta acumulada ÷ base acumulada − 1</span></div>
        <div class="metric-card"><span class="metric-card__label">Incremental acumulado ${pill('warning', 'Estimado')}</span><strong class="metric-card__value num">${signedMoney(T.cum.incremental)}</strong><span class="metric-card__period">hasta el último día con dato</span></div>
      </div>
      ${T.alerts.length ? `<ul class="plain-list">${T.alerts.map((a) => `<li>${pill(a.level === 'warn' ? 'warning' : 'na', a.level === 'warn' ? 'Atención' : 'Nota')} ${esc(a.text)}</li>`).join('')}</ul>` : ''}
      ${chart}
      <details class="disclosure"><summary>Detalle por día (los últimos ${Math.min(31, n)})</summary><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Día</th><th>Venta real</th><th>Línea base</th><th>Diferencia</th><th>Real acumulada</th><th>Incremental acumulado</th></tr></thead><tbody>${rows}</tbody></table></div></details>
      <p class="field__hint">El seguimiento no proyecta el cierre: solo muestra cómo va lo que ya tiene dato. Si la promoción tiene línea base congelada, compara contra ella.</p>`;
  }

  function skuTable(r) {
    const esc = H().esc, pill = H().pill;
    const rows = r.items.map((i) => i.status !== 'ok'
      ? `<tr><td class="num">${esc(i.sku)}</td><td>${esc(i.name || '')}</td><td colspan="6">${pill('error', 'No evaluable')} ${esc(i.reason || '')}</td></tr>`
      : `<tr><td class="num">${esc(i.sku)}</td><td>${esc(i.name || '')}</td>
        <td>${esc(i.window.start)} a ${esc(i.window.end)}<span class="cell-sub">${i.window.source === 'real' ? 'fechas reales' : 'fechas planeadas'} · ${i.daysWithData} de ${i.days} días con dato</span></td>
        <td class="num">${money(i.actual.revenue)}<span class="cell-sub">real</span></td><td class="num">${money(i.expected.revenue)}<span class="cell-sub">estimada</span></td>
        <td class="num">${pct(i.growth.revenue)}</td><td class="num">${signedMoney(i.incremental.revenue)}${i.incremental.range ? `<span class="cell-sub">${signedMoney(i.incremental.range[0])} a ${signedMoney(i.incremental.range[1])}</span>` : ''}</td>
        <td>${i.warnings.length ? i.warnings.map((w) => `<span class="cell-sub">${esc(w.text)}</span>`).join('') : '—'}</td></tr>`).join('');
    return `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>SKU</th><th>Producto</th><th>Durante</th><th>Venta durante</th><th>Línea base</th><th>Crecimiento</th><th>Incremental</th><th>Avisos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function evaluationPanel(state) {
    const esc = H().esc, pill = H().pill, rs = state.rs, reg = state.pm.reg;
    const noData = !(FP.productStore && FP.productStore.available() && (FP.productStore.meta || {}).batches);
    const cands = reg.promotions.filter((p) => ['published', 'measuring', 'closed'].includes(p.status));
    const p = rs.promoId ? P().find(reg, rs.promoId) : null, r = rs.result && p && rs.result.promoId === p.promoId ? rs.result : null;
    const ctl = noData ? '<div class="empty"><strong>Todavía no hay datos de producto</strong>La evaluación lee la venta por SKU y día: carga la venta en «Carga de datos».</div>'
      : !cands.length ? '<div class="empty"><strong>Ninguna promoción está publicada, en medición o cerrada</strong>Cuando una promoción se publique y tenga fechas reales, aparecerá aquí para evaluarla.</div>'
        : `<div class="field-grid">${field('rs-promo', 'Promoción', selectHtml('rs-promo', [['', 'Elige una promoción'], ...cands.map((x) => [x.promoId, `${x.promoId} · ${x.name} (${P().STATUS[x.status]})`])], rs.promoId || '', 'data-action="rs-pick"'))}</div>
          <div class="btn-row"><button type="button" class="btn btn--primary" data-action="rs-run"${rs.loading || !rs.promoId ? ' disabled' : ''}>${rs.loading ? 'Calculando…' : 'Calcular evaluación'}</button></div>`;
    let body = '';
    if (r) {
      const cuts = (p.evaluations || []).slice().reverse().map((c) => `<tr><td class="num">${esc(c.id)}</td><td>${esc(c.at.slice(0, 10))}</td><td>${esc(c.cutoff || '—')}</td><td>${esc(c.by)}</td><td class="num">${pct(c.concepts.observedGrowth.revenue)}</td><td class="num">${signedMoney(c.concepts.incremental.revenue)}</td><td>${c.counts.evaluable} de ${c.counts.total}</td></tr>`).join('');
      const goal = p.campaign && FP.goals && state.cg ? (() => { const g = FP.goals.find(state.cg.reg, p.campaign); return g ? { goal: g, progress: FP.goals.progress(g, reg.promotions, Object.assign({}, state.cg.live, { [p.promoId]: r })) } : null; })() : null;
      body = `${concepts(r, goal, p)}
        ${['published', 'measuring'].includes(p.status) ? trackPanel(r) : ''}
        <p><strong>Método.</strong> ${esc(r.method)}</p>
        <h3>Avisos</h3><ul class="plain-list">${r.warnings.map((w) => `<li>${pill(w.level === 'warn' ? 'warning' : 'na', w.level === 'warn' ? 'Atención' : 'Nota')} ${esc(w.text)}</li>`).join('')}</ul>
        <h3>Por SKU</h3>${skuTable(r)}
        <div class="btn-row"><button type="button" class="btn btn--small btn--primary" data-action="rs-save"${r.counts.evaluable ? '' : ' disabled'}>Guardar este corte</button>
          <button type="button" class="btn btn--small" data-action="rs-export-csv">Exportar evaluación (CSV)</button></div>
        <p class="field__hint">Guardar un corte lo agrega al historial de la promoción con sus cifras y método; nunca se edita ni se reemplaza.</p>
        ${cuts ? `<h3>Cortes guardados</h3><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Corte</th><th>Guardado</th><th>Datos hasta</th><th>Por</th><th>Crecimiento</th><th>Incremental</th><th>SKU</th></tr></thead><tbody>${cuts}</tbody></table></div>` : ''}
        <h3>Conclusión</h3>${p.status === 'closed' ? `<p>${esc(p.conclusion || '')}</p><p class="field__hint">Recomendación para la siguiente campaña: <strong>${esc(P().RECOMMENDATIONS[p.recommendation] || '—')}</strong></p>`
          : '<p class="field__hint">La conclusión y la recomendación (repetir, ajustar, no repetir) se escriben al cerrar la promoción en la pestaña Promociones. Cerrar exige la conclusión.</p>'}`;
    }
    return `<section class="panel" aria-labelledby="rs-t"><div class="panel__head"><div><h2 class="panel__title" id="rs-t">Evaluar una promoción</h2>
      <p class="panel__desc">Compara la venta de cada SKU durante la promoción contra su propia línea base: los 28 días anteriores, lunes con lunes, sin días de otras promociones ni eventos. Muestra cuatro conceptos por separado y no afirma causalidad.</p></div></div>
      <div class="panel__body">${ctl}${rs.msg ? `<div class="note note--${rs.msg.kind === 'bad' ? 'warn' : 'ok'}" role="status">${esc(rs.msg.text)}</div>` : ''}${body}</div></section>`;
  }

  /** «Medir una exposición»: venta real de los SKU expuestos contra su línea base, con las fechas de la exposición. */
  function exposurePanel(state) {
    const esc = H().esc, pill = H().pill, ex = state.rs.ex, E = FP.exposures; if (!E || !state.ex || !state.ex.reg || !state.ex.reg.items.length) return '';
    const noData = !(FP.productStore && FP.productStore.available() && (FP.productStore.meta || {}).batches);
    const bs = E.batches(state.ex.reg), meas = bs.filter((b) => b.measurable.length), r = ex.result && ex.result.promoId === ex.batchId ? ex.result : null;
    const ctl = noData ? '<div class="empty"><strong>Todavía no hay datos de producto</strong>La medición lee la venta por SKU y día: carga la venta en «Carga de datos».</div>'
      : !meas.length ? '<div class="empty"><strong>Ninguna exposición tiene fecha de inicio</strong>Al ponerla en exposición desde Qué impulsar, escribe «Desde» (y «Hasta» si sabes cuándo termina) para poder medirla.</div>'
        : `<div class="field-grid">${field('rs-ex-batch', 'Exposición', selectHtml('rs-ex-batch', [['', 'Elige un folio'], ...meas.map((b) => [b.batchId, `${b.batchId} · ${b.measurable.length} SKU · desde ${b.measurable.map((e) => e.start).sort()[0]}`])], ex.batchId || '', 'data-action="rs-ex-pick"'))}</div>
          <div class="btn-row"><button type="button" class="btn btn--primary" data-action="rs-ex-run"${ex.loading || !ex.batchId ? ' disabled' : ''}>${ex.loading ? 'Calculando…' : 'Medir exposición'}</button></div>`;
    let body = '';
    if (r) {
      const c = r.concepts, est = pill('warning', 'Estimado'), card = (t, tag, b, h) => `<div class="metric-card"><span class="metric-card__label">${esc(t)} ${tag}</span>${b}${h ? `<span class="field__hint">${esc(h)}</span>` : ''}</div>`;
      body = `<div class="metric-grid">
        ${card('Crecimiento observado', est, `<strong class="metric-card__value num">${pct(c.observedGrowth.revenue)}</strong><span class="cell-sub">venta · unidades ${pct(c.observedGrowth.units)}</span>`, c.observedGrowth.note)}
        ${card('Venta incremental estimada', est, `<strong class="metric-card__value num">${signedMoney(c.incremental.revenue)}</strong><span class="cell-sub">${c.incremental.range ? `rango ${signedMoney(c.incremental.range[0])} a ${signedMoney(c.incremental.range[1])}` : 'un solo periodo comparable'}</span>`, c.incremental.note)}
        ${card('Efecto causal demostrado', pill('error', 'No demostrado'), '<strong class="metric-card__value">No demostrado</strong>', 'Sin grupo de control, esta herramienta no establece que la exposición causó el cambio.')}
      </div>
      <p class="field__hint">Venta durante la exposición (real): <strong>${money(r.totals.actual.revenue)}</strong> · línea base (estimada): <strong>${money(r.totals.expected.revenue)}</strong> · ${r.counts.evaluable} de ${r.counts.total} SKU evaluables. Corte de datos: ${esc(r.dataMax || '—')}.</p>
        ${trackPanel(r)}
        <h3>Avisos</h3><ul class="plain-list">${r.warnings.filter((w) => w.code !== 'planned_dates').map((w) => `<li>${pill(w.level === 'warn' ? 'warning' : 'na', w.level === 'warn' ? 'Atención' : 'Nota')} ${esc(w.text)}</li>`).join('')}</ul>
        <h3>Por SKU</h3>${skuTable(r)}
        <p class="field__hint">Una exposición no es una promoción: no tiene descuento, así que el cambio de venta puede venir del lugar que se le dio, de la temporada o de otras acciones. Los días de promociones registradas del mismo SKU se sacan de la base. No se guarda el corte: se calcula cada vez con la venta cargada.</p>`;
    }
    const nos = bs.filter((b) => b.noStart).reduce((a, b) => a + b.noStart, 0);
    return `<section class="panel" aria-labelledby="rs-t-x"><div class="panel__head"><div><h2 class="panel__title" id="rs-t-x">Medir una exposición</h2>
      <p class="panel__desc">Compara la venta de los SKU expuestos, desde su fecha de inicio, contra su propia línea base (28 días anteriores, lunes con lunes). Sin fecha de fin se mide hasta la última venta cargada.${nos ? ` ${nos} exposición(es) sin fecha de inicio no se pueden medir.` : ''}</p></div></div>
      <div class="panel__body">${ctl}${ex.msg ? `<div class="note note--${ex.msg.kind === 'bad' ? 'warn' : 'ok'}" role="status">${esc(ex.msg.text)}</div>` : ''}${body}</div></section>`;
  }

  function historyPanel(state) {
    const esc = H().esc, pill = H().pill, rs = state.rs, f = rs.f, reg = state.pm.reg;
    const list = filtered(state).sort((a, b) => ((b.plannedStart || '') > (a.plannedStart || '') ? 1 : -1));
    const cats = [...new Set(reg.promotions.flatMap((p) => (p.skus || []).map((s) => catOf(s.sku)).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'es'));
    const filt = `<div class="field-grid">
      ${field('rs-f-q', 'Buscar', input('rs-f-q', f.q, 'search', 'data-action="rs-filter" placeholder="Nombre, SKU, conclusión…"'))}
      ${field('rs-f-status', 'Estado', selectHtml('rs-f-status', [['', 'Publicadas, en medición y cerradas'], ['published', 'Publicada'], ['measuring', 'En medición'], ['closed', 'Cerrada']], f.status, 'data-action="rs-filter"'))}
      ${field('rs-f-obj', 'Objetivo', selectHtml('rs-f-obj', [['', 'Todos'], ...Object.entries(P().OBJECTIVES)], f.objective, 'data-action="rs-filter"'))}
      ${field('rs-f-space', 'Espacio', selectHtml('rs-f-space', [['', 'Todos'], ...Object.entries(P().SPACES)], f.space, 'data-action="rs-filter"'))}
      ${field('rs-f-mech', 'Mecánica contiene', input('rs-f-mech', f.mechanic, 'search', 'data-action="rs-filter" placeholder="Ej. 3+1, 2x1…"'))}
      ${field('rs-f-cat', 'Categoría', selectHtml('rs-f-cat', [['', 'Todas'], ...cats.map((c) => [c, c])], f.category, 'data-action="rs-filter"'))}
      ${field('rs-f-rec', 'Recomendación', selectHtml('rs-f-rec', [['', 'Cualquiera'], ...Object.entries(P().RECOMMENDATIONS)], f.rec, 'data-action="rs-filter"'))}
      ${field('rs-f-from', 'Desde', input('rs-f-from', f.from, 'date', 'data-action="rs-filter"'))}
      ${field('rs-f-to', 'Hasta', input('rs-f-to', f.to, 'date', 'data-action="rs-filter"'))}
    </div>`;
    const rows = list.map((p) => {
      const c = lastCut(p), mech = [...new Set((p.skus || []).map((s) => s.mechanic).filter(Boolean))].join(', '), sp = [...new Set((p.activations || []).map((a) => P().SPACES[a.space] || a.space))].join(', ');
      return `<tr><td><span class="num">${esc(p.promoId)}</span></td><td>${esc(p.name)}<span class="cell-sub">${esc(P().OBJECTIVES[p.objective] || '')} · ${(p.skus || []).length} SKU</span></td>
        <td>${pill(p.status === 'closed' ? 'ok' : 'warning', P().STATUS[p.status])}</td><td>${esc(p.plannedStart || '—')} a ${esc(p.plannedEnd || '—')}</td><td>${esc(mech || '—')}<span class="cell-sub">${esc(sp || '')}</span></td>
        <td>${c ? `${pct(c.concepts.observedGrowth.revenue)}<span class="cell-sub">incremental ${signedMoney(c.concepts.incremental.revenue)} · corte ${esc(c.cutoff || '')}</span>` : '<span class="cell-sub">sin corte guardado</span>'}</td>
        <td>${esc(P().RECOMMENDATIONS[p.recommendation] || '—')}<span class="cell-sub">${esc((p.conclusion || '').slice(0, 140))}</span></td>
        <td><button type="button" class="btn btn--small" data-action="rs-open" data-id="${esc(p.promoId)}">Evaluar</button></td></tr>`;
    }).join('');
    return `<section class="panel" aria-labelledby="rs-t-h"><div class="panel__head"><div><h2 class="panel__title" id="rs-t-h">Historial de promociones</h2>
      <p class="panel__desc">Promociones publicadas, en medición y cerradas, con su último corte guardado, conclusión y recomendación. No hay laboratorio en los datos, así que no se filtra por laboratorio.</p></div></div>
      <div class="panel__body">${filt}<div class="btn-row"><button type="button" class="btn btn--small" data-action="rs-export-history">Exportar historial (CSV)</button><span class="field__hint">${list.length} promociones con estos filtros.</span></div></div>
      <div class="panel__body panel__body--flush">${list.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Identificador</th><th>Promoción</th><th>Estado</th><th>Vigencia</th><th>Mecánica y espacio</th><th>Último corte</th><th>Recomendación</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<div class="empty"><strong>Ninguna promoción coincide</strong>Cuando una promoción se publique o se cierre aparecerá aquí.</div>'}</div></section>`;
  }

  function html(state) { return `${evaluationPanel(state)}${exposurePanel(state)}${historyPanel(state)}`; }
  FP.resultsView = { html, val, filtered };
})(typeof window !== 'undefined' ? window : globalThis);
