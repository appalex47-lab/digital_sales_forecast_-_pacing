/** trend-view.js — Análisis → Evolución (Análisis 1). Solo presenta resultados de FP.trendEngine. */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => H().esc(v);
  const LEVEL = { category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto', sku: 'SKU', region: 'Región', state: 'Estado', city: 'Ciudad', branch: 'Sucursal', delivery: 'Tipo de entrega', channel: 'Canal' };
  const PATTERN = {
    growth_sustained: ['ok', 'Crecimiento sostenido'], growth_accelerating: ['ok', 'Crecimiento acelerado'], growth_decelerating: ['ok', 'Crecimiento desacelerando'],
    decline_sustained: ['error', 'Deterioro sostenido'], decline_accelerating: ['error', 'Caída acelerada'], decline_decelerating: ['warning', 'Caída desacelerando'],
    recovery: ['ok', 'Recuperación'], strong_recovery: ['ok', 'Recuperación fuerte'], trend_break: ['warning', 'Ruptura de tendencia'], stable: ['na', 'Estable'],
    volatile: ['warning', 'Volátil'], anomaly: ['error', 'Anomalía'], insufficient_history: ['na', 'Historia insuficiente']
  };
  const PATTERN_HELP = {
    growth_sustained: ['Crecimiento sostenido', 'La venta ha aumentado de forma consistente en varios períodos recientes.', 'No significa que seguirá creciendo ni explica por qué creció.'],
    growth_accelerating: ['Crecimiento acelerado', 'La venta sigue creciendo y los aumentos recientes son cada vez mayores.', 'Mide la velocidad del cambio; no es una predicción.'],
    growth_decelerating: ['Crecimiento desacelerando', 'La venta todavía crece, pero los aumentos recientes son cada vez menores.', 'No significa que ya esté cayendo.'],
    decline_sustained: ['Deterioro sostenido', 'La venta ha caído de forma consistente durante varios períodos recientes.', '“Deterioro” aquí significa caída de la métrica, no una causa del negocio.'],
    decline_accelerating: ['Caída acelerada', 'La venta cae y las caídas recientes se están haciendo mayores.', 'Es una señal de velocidad, no una explicación causal.'],
    decline_decelerating: ['Caída desacelerando', 'La venta todavía cae, pero el ritmo de la caída está disminuyendo.', 'Es una mejora del ritmo de caída; todavía no es recuperación.'],
    recovery: ['Recuperación', 'Después de una caída, la venta registra varios períodos positivos consecutivos.', 'No implica que haya regresado al nivel anterior.'],
    strong_recovery: ['Recuperación fuerte', 'Después de un deterioro, se observan al menos tres períodos de recuperación positiva.', 'Describe el comportamiento observado, no su causa.'],
    trend_break: ['Ruptura de tendencia', 'La dirección reciente cambia respecto de la dirección que venía mostrando.', 'Puede ser un cambio importante o ruido; conviene revisar la evidencia.'],
    stable: ['Estable', 'Las variaciones recientes son pequeñas y no muestran una dirección clara.', 'Estable no significa necesariamente saludable o rentable.'],
    volatile: ['Volátil', 'La serie alterna subidas y bajadas con frecuencia y no mantiene una dirección clara.', 'Una serie corta o con ventas muy bajas puede parecer más volátil.'],
    anomaly: ['Anomalía', 'El último cambio es estadísticamente muy distinto de los cambios anteriores.', 'Es una alerta para investigar, no un error ni una causa confirmada.'],
    insufficient_history: ['Historia insuficiente', 'No hay suficientes períodos válidos para clasificar la tendencia con confianza.', 'No debe interpretarse como estable, crecimiento o caída.']
  };
  function pill(pattern) { const [kind, label] = PATTERN[pattern] || ['na', pattern || 'Sin clasificar']; const help = PATTERN_HELP[pattern]; return `<span class="pill pill--${kind}"${help ? ` title="${esc(help[1])}" aria-label="${esc(help[0])}: ${esc(help[1])}"` : ''}>${esc(label)}</span>`; }
  function patternHelp() {
    const rows = Object.keys(PATTERN).map((key) => { const h = PATTERN_HELP[key]; return `<div class="pattern-help__item"><strong>${esc(h[0])}</strong><span>${esc(h[1])}</span><small>${esc(h[2])}</small></div>`; }).join('');
    return `<details class="disclosure pattern-help"><summary>¿Cómo interpretar los patrones?</summary><div class="pattern-help__grid">${rows}</div><p class="field__hint">Los patrones describen el comportamiento de la serie de ventas. No son causas, diagnósticos del negocio ni garantías de lo que ocurrirá después.</p></details>`;
  }
  const NA = '<span class="na" title="No hay datos comparables: no se muestra 0 % ni −100 %.">N/A</span>';
  function signedPct(v) { return typeof v === 'number' && Number.isFinite(v) ? F().signedPercent(v, 1) : NA; }
  let MK = 'revenue';                                   // métrica vigente del render (revenue | orders | units)
  const MLAB = { revenue: 'Venta', orders: 'Pedidos', units: 'Unidades' };
  const ML = () => MLAB[MK] || 'Venta';
  const D = () => (MK === 'revenue' ? ' $' : '');                // sufijo de unidad en encabezados
  function money(v) { return typeof v === 'number' && Number.isFinite(v) ? (MK === 'revenue' ? F().currency(v, 0) : F().integer(Math.round(v))) : NA; }
  const mny = (v) => (typeof v === 'number' && Number.isFinite(v) ? F().currency(v, 0) : NA);                 // siempre dinero (PVM y puente son de Venta)
  const smny = (v) => (typeof v === 'number' && Number.isFinite(v) ? (Math.abs(v) < 0.5 ? F().currency(0, 0) : (v > 0 ? '+' : '') + F().currency(v, 0)) : NA);
  function spark(series) {
    const vals = series.filter((x) => typeof x.value === 'number' && Number.isFinite(x.value));
    if (vals.length < 2) return '<span class="cell-sub">Sin serie suficiente</span>';
    const min = Math.min(...vals.map((x) => x.value)), max = Math.max(...vals.map((x) => x.value)), span = max - min || 1;
    const pts = vals.map((x, i) => `${(i / Math.max(1, vals.length - 1)) * 100},${28 - ((x.value - min) / span) * 24}`).join(' ');
    return `<svg class="trend-spark" viewBox="0 0 100 30" role="img" aria-label="Evolución histórica"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function filters(state) {
    const a = state.an;
    const levels = Object.entries(LEVEL);
    const availablePatterns = [...new Set((a.rows || []).map(r => r.pattern).filter(Boolean))];
    const patterns = [['all', 'Todos'], ...availablePatterns.map(k => [k, PATTERN[k]?.[1] || k])];
    const signalLabels = { structural_decline:'Deterioro estructural', structural_growth:'Crecimiento estructural', early_warning:'Alerta temprana', trend_break:'Ruptura de tendencia', recovery:'Recuperación', anomaly:'Anomalía' };
    const availableSignals = [...new Set((a.rows || []).map(r => r.advanced?.signal).filter(Boolean))];
    const signals = [['all','Todas'], ...availableSignals.map(k => [k, signalLabels[k] || k])];
    const pt = a.periodType || 'month', count = a.periodCount || a.months || 12;
    const periodLabel = {year:'Año',month:'Mes',week:'Semana',day:'Día'}[pt] || 'Mes';
    const unit = {year:'años',month:'meses',week:'semanas',day:'días'}[pt] || 'meses';
    const comparison = a.comparison === 'year_ago' ? 'mismo período del año anterior' : 'período anterior';
    const sh = a.share || {};
    const t = a.temporal || {};
    const meta = FP.productStore?.meta || {};
    const opts = (meta.dateMin && meta.dateMax && FP.temporalEngine) ? FP.temporalEngine.options(meta.dateMin, meta.dateMax, pt, pt === 'day' ? 90 : 24) : [];
    const defaultFocus = [...opts].reverse().find(x => !x.partial)?.key || opts.at(-1)?.key || '';
    const focusKey = a.focusKey || defaultFocus;
    const focusLabel = t.focus?.label || (opts.find(x => x.key === focusKey)?.label || focusKey || 'Último período completo disponible');
    const ci = a.comparisonInfo || null;
    const comparisonNote = ci && ci.message ? `<div class="note note--warning analysis-comparison-warning"><strong>Comparación no disponible (N/A).</strong> ${esc(ci.message)} Puedes cambiar la comparación o el canal sin recargar la página.</div>`
      : ci && ci.partial ? `<div class="note analysis-comparison-info"><strong>Período en curso.</strong> ${esc(ci.note || '')}</div>`
      : ci && ci.truncated ? `<div class="note analysis-comparison-info">${esc(ci.note || '')}</div>` : '';
    const temporalCards = [t.yoy, t.mom, t.wow, t.dod].filter(Boolean).map(x => `<span class="temporal-chip ${x.available ? '' : 'is-muted'}"${x.text ? ` title="${esc(x.text)}"` : ''}><strong>${esc(x.id.toUpperCase())}</strong> ${x.available ? signedPct(x.change) : 'N/A'}${x.text ? ` <small>${esc(x.text)}</small>` : ''}</span>`).join('');
    const seasonNote = t.seasonality?.status === 'available' ? `<small>Estacionalidad: ${esc(String(t.seasonality.comparablePeriods))} período(s) comparables · índice ${signedPct((t.seasonality.index || 1) - 1)}</small>` : `<small>Estacionalidad: histórico insuficiente para este periodo.</small>`;
    return `<div class="analysis-filter-bar">
      <div class="settings-grid analysis-period-controls">
        <div class="field"><label for="an-channel">Canal</label><select id="an-channel" data-action="an-channel">${FP.analysisContext.channelList().map(c => `<option value="${c}" ${c === (a.channel || 'total') ? 'selected' : ''}>${esc(FP.analysisContext.channelLabel(c))}</option>`).join('')}</select></div>
        <div class="field"><label for="an-metric">Métrica</label><select id="an-metric" data-action="an-metric">${Object.entries(FP.analysisContext.METRICS).map(([k, m]) => `<option value="${k}" ${k === (a.metric || 'revenue') ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></div>
        <div class="field"><label for="an-period-type">Granularidad</label><select id="an-period-type" data-action="an-period-type"><option value="year" ${pt==='year'?'selected':''}>Año</option><option value="month" ${pt==='month'?'selected':''}>Mes</option><option value="week" ${pt==='week'?'selected':''}>Semana</option><option value="day" ${pt==='day'?'selected':''}>Día</option></select></div>
        <div class="field"><label for="an-focus">Periodo focal</label><select id="an-focus" data-action="an-focus">${opts.length ? opts.slice().reverse().map(o => `<option value="${esc(o.key)}" ${o.key===focusKey?'selected':''}>${esc(FP.temporalEngine.label(pt,o.key,o.range))}</option>`).join('') : '<option>Sin periodos</option>'}</select></div>
        <div class="field"><label for="an-period-count">Historia</label><input id="an-period-count" type="number" min="3" max="${pt==='day'?90:24}" step="1" value="${count}" data-action="an-period-count"></div>
        <div class="field"><label for="an-comparison">Comparación principal</label><select id="an-comparison" data-action="an-comparison"><option value="previous" ${a.comparison!=='year_ago'?'selected':''}>Período anterior</option><option value="year_ago" ${a.comparison==='year_ago'?'selected':''}>Mismo periodo año anterior</option></select></div>
        <div class="field"><label for="an-level">Analizar por</label><select id="an-level" data-action="an-level">${levels.map(([v,l])=>`<option value="${v}" ${v===a.level?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
      </div>
      <div class="settings-grid analysis-filter-controls">
        <div class="field"><label for="an-state">Estado actual</label><select id="an-state" data-action="an-state">${STATE_ORDER.map(([v, l]) => `<option value="${v}" ${v === (a.stateFilter || 'all') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="an-entity-query">Buscar</label><input id="an-entity-query" type="search" value="${esc(a.entityQuery || '')}" placeholder="Producto, categoría, SKU…" data-action="an-entity-query"></div>
      </div>
      <details class="disclosure analysis-more-filters"><summary>Más filtros (patrón, señal, anomalía, impacto mínimo, materialidad)</summary><div class="settings-grid analysis-filter-controls">
        <div class="field"><label for="an-pattern">Patrón</label><select id="an-pattern" data-action="an-pattern">${patterns.map(([v,l])=>`<option value="${v}" ${v===a.pattern?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="an-signal">Señal avanzada</label><select id="an-signal" data-action="an-signal">${signals.map(([v,l])=>`<option value="${v}" ${v===a.signal?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="an-anomaly-direction">Anomalía</label><select id="an-anomaly-direction" data-action="an-anomaly-direction"><option value="all" ${a.anomalyDirection==='all'?'selected':''}>Todas</option><option value="increase" ${a.anomalyDirection==='increase'?'selected':''}>Subida inusual</option><option value="decrease" ${a.anomalyDirection==='decrease'?'selected':''}>Caída inusual</option></select></div>
        <div class="field"><label for="an-min-share">Materialidad</label><select id="an-min-share" data-action="an-min-share">${[[0,'Mostrar todas'],[0.1,'Desde 0.1 % del total'],[0.5,'Desde 0.5 % del total'],[1,'Desde 1 % del total'],[2,'Desde 2 % del total']].map(([v,l])=>`<option value="${v}" ${Number(a.minSharePct)===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="an-min-impact">Impacto mínimo${D()}</label><input id="an-min-impact" type="number" min="0" step="100" value="${a.minImpact || ''}" placeholder="0" data-action="an-min-impact"></div>
      </div><p class="field__hint">Patrón y señal clasifican la forma de la serie; «Anomalía» filtra movimientos inusuales; «Impacto mínimo» oculta cambios pequeños; «Materialidad» oculta entidades que pesan menos de ese % del total (por defecto 0.5 %), porque su movimiento suele ser ruido. Contribución y totales siguen incluyéndolas.</p></details>
      ${comparisonNote}
    </div>`;
  }
  /** Contexto vigente: Canal · Período · Comparación · Nivel · Métrica (siempre visible). */
  function contextBar(a) {
    const c = a.context, ci = a.comparisonInfo;
    if (!c || !c.focus) return '';
    const cmp = ci && ci.text ? `${esc(ci.text)} <small>(${esc(ci.idLabel || '')}${ci.comparable ? '' : ' · N/A'})</small>` : 'N/A';
    return `<div class="analysis-context" role="status" aria-label="Contexto del análisis"><span><b>Canal</b> ${esc(c.channelLabel)}</span><span><b>Período</b> ${esc(c.focus.label)}</span><span><b>Comparación</b> ${cmp}</span><span><b>Nivel</b> ${esc(LEVEL[a.level] || a.level)}</span><span><b>Métrica</b> ${esc(c.metricLabel)}</span></div>`;
  }
  function growthChart(series) {
    const vals = (Array.isArray(series) ? series : []).filter((x) => typeof x?.value === 'number' && Number.isFinite(x.value));
    if (vals.length < 2) return '<div class="empty"><strong>Historia insuficiente para la gráfica</strong>Se requieren al menos dos períodos con venta válida.</div>';
    const points = vals.map((x, i) => {
      const prev = i > 0 ? vals[i - 1].value : null;
      const growth = i > 0 && prev !== 0 ? (x.value - prev) / Math.abs(prev) : null;
      return { ...x, growth };
    }).filter(x => x.growth !== null && Number.isFinite(x.growth));
    if (points.length < 1) return '<div class="empty"><strong>No se puede calcular crecimiento</strong>Los valores consecutivos no permiten calcular una variación porcentual.</div>';
    const W=760,H=270,L=72,R=22,T=28,B=58, iw=W-L-R, ih=H-T-B;
    const min=Math.min(0,...points.map(x=>x.growth)), max=Math.max(0,...points.map(x=>x.growth)), span=max-min||1;
    const xy=points.map((x,i)=>({x:L+(i/Math.max(1,points.length-1))*iw,y:T+(max-x.growth)/span*ih,v:x.growth,label:x.period||x.date||String(i+1)}));
    const poly=xy.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const zeroY=T+(max/span)*ih;
    const xAxisY=H-B;
    const xLabels=xy.filter((_,i)=>i===0||i===xy.length-1||i===Math.floor((xy.length-1)/2)).map(p=>`<line x1="${p.x.toFixed(1)}" y1="${xAxisY}" x2="${p.x.toFixed(1)}" y2="${xAxisY+5}" class="trend-chart__tick"/><text x="${p.x.toFixed(1)}" y="${H-22}" text-anchor="middle" class="trend-chart__label">${esc(p.label)}</text>`).join('');
    const yTicks = [max, 0, min].filter((v,i,a)=>a.indexOf(v)===i).map(v=>{
      const y=T+(max-v)/span*ih;
      return `<line x1="${L-5}" y1="${y.toFixed(1)}" x2="${L}" y2="${y.toFixed(1)}" class="trend-chart__tick"/><text x="${L-10}" y="${(y+4).toFixed(1)}" text-anchor="end" class="trend-chart__axis">${signedPct(v)}</text>`;
    }).join('');
    const latest=xy[xy.length-1], latestText=signedPct(latest.v);
    return `<div class="entity-growth-chart" role="img" aria-label="Gráfica de crecimiento por período de ${esc(points[0].label)} a ${esc(points[points.length-1].label)}"><div class="entity-growth-chart__head"><div><strong>Crecimiento por período</strong><span class="cell-sub">X = fecha / período · Y = crecimiento %</span></div><span>Último cambio: ${latestText}</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="${L}" y1="${T}" x2="${L}" y2="${xAxisY}" class="trend-chart__axis-line"/>
      <line x1="${L}" y1="${xAxisY}" x2="${W-R}" y2="${xAxisY}" class="trend-chart__axis-line"/>
      <line x1="${L}" y1="${zeroY.toFixed(1)}" x2="${W-R}" y2="${zeroY.toFixed(1)}" class="trend-chart__zero"/>
      ${yTicks}${xLabels}
      <polyline points="${poly}" class="trend-chart__line" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${xy.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="trend-chart__point"><title>${esc(p.label)} · ${signedPct(p.v)}</title></circle>`).join('')}
      <text x="${L-10}" y="16" text-anchor="end" class="trend-chart__axis-title">Y · crecimiento %</text>
      <text x="${W-R}" y="${H-3}" text-anchor="end" class="trend-chart__axis-title">X · fecha / período</text>
    </svg></div>`;
  }


  function lastClosedLabel(a) { const pl = (a.periodsList || []).filter(p => !p.partial); const p = pl[pl.length - 1]; return p ? p.key : '—'; }
  function reconLine(a) {
    const r = a.reconciliation; if (!r) return '';
    const ok = r.sumContributions !== null && Math.abs(r.sumContributions - r.delta) <= 0.5 && Math.abs(r.current.sumEntities - r.current.total) <= 0.5 && Math.abs(r.baseline.sumEntities - r.baseline.total) <= 0.5;
    return `<p class="note analysis-recon ${ok ? 'analysis-recon--ok' : 'note--warning'}"><strong>${ok ? '✓ Conciliado' : '⚠ No concilia'}:</strong> Σ contribuciones ${money(r.sumContributions)} ${ok ? '=' : '≠'} variación total ${money(r.delta)} (${esc(r.comparison)} · ${esc(a.context.channelLabel)}).</p>`;
  }
  /** Detalle y trazabilidad: Canal → Período → Entidad → Producto/SKU → Período → Registro fuente. Conserva el contexto. */
  function drillPanel(a) {
    const d = a.drill; if (!d) return '';
    const x = d.data;
    const head = `<div class="drill__head"><div><span class="analysis-layer-label">DETALLE Y TRAZABILIDAD</span></div><button type="button" class="btn btn--small btn--ghost" data-action="an-drill-close">Cerrar detalle</button></div>`;
    if (d.error) return `<section class="drill" id="an-drill">${head}<p class="note note--warning">No se pudo cargar el detalle: ${esc(d.error)} <button type="button" class="btn btn--small" data-action="an-drill-retry">Reintentar</button></p></section>`;
    if (d.loading || !x) return `<section class="drill" id="an-drill">${head}<p class="ds-loading" role="status">Cargando detalle…${d.step ? ` <span class="cell-sub">${esc(d.step)}</span>` : ''}</p></section>`;
    const c = x.context, sm = x.summary;
    const crumbs = [`<button type="button" class="btn btn--small btn--ghost" data-action="an-drill-up" data-index="-1">${d.scope === 'total' ? 'Total del análisis' : esc(d.entity)}</button>`,
      ...d.path.map((n, i) => `<span aria-hidden="true">›</span><button type="button" class="btn btn--small btn--ghost" data-action="an-drill-up" data-index="${i}">${esc(LEVEL[n.level] || n.level)}: ${esc(n.key)}</button>`)].join(' ');
    const eq = (p, q) => Number.isFinite(p) && Number.isFinite(q) && Math.abs(p - q) <= 0.5;
    const ppTxt = Number.isFinite(sm.sharePp) ? `${sm.sharePp > 0 ? '+' : ''}${sm.sharePp.toFixed(2)} pp` : null;
    const summary = `<div class="metric-grid"><div class="metric"><span>${ML()} actual</span><strong>${money(sm.current)}</strong></div><div class="metric"><span>${ML()} comparación</span><strong>${money(sm.baseline)}</strong></div><div class="metric"><span>Cambio${D()}</span><strong>${money(sm.delta)}</strong></div><div class="metric"><span>Cambio %</span><strong>${signedPct(sm.deltaPct)}</strong></div>${Number.isFinite(sm.shareCurrent) ? `<div class="metric"><span>Participación</span><strong>${signedPct(sm.shareBaseline).replace('+','')} → ${signedPct(sm.shareCurrent).replace('+','')}</strong><small>${ppTxt || ''}</small></div>` : ''}</div>`;
    const chRows = x.byChannel ? (() => {
      const sc = x.byChannel.reduce((t, r) => t + (r.current || 0), 0), sb = x.byChannel.every(r => r.baseline !== null) ? x.byChannel.reduce((t, r) => t + r.baseline, 0) : null;
      const ok = eq(sc, sm.current) && (sb === null || eq(sb, sm.baseline));
      return `<h4>Por canal</h4><div class="table-wrap"><table class="table ds-table" aria-label="Detalle por canal"><thead><tr><th>Canal</th><th class="num">Actual</th><th class="num">Comparación</th><th class="num">Cambio${D()}</th><th></th></tr></thead><tbody>${x.byChannel.map(r => `<tr><th scope="row">${esc(r.label)}</th><td class="num">${r.current ? money(r.current) : '<span class="cell-sub">Sin ventas</span>'}</td><td class="num">${r.baseline === null ? NA : (r.baseline ? money(r.baseline) : '<span class="cell-sub">Sin ventas</span>')}</td><td class="num">${money(r.delta)}</td><td><button type="button" class="btn btn--small btn--ghost" data-action="an-drill-channel" data-channel="${esc(r.channel)}">Ver solo este canal</button></td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Σ canales</th><td class="num">${money(sc)}</td><td class="num">${sb === null ? NA : money(sb)}</td><td class="num">${sb === null ? NA : money(sc - sb)}</td><td>${ok ? '✓ = total' : '⚠ no concilia'}</td></tr></tfoot></table></div>`;
    })() : '';
    const ch = x.children;
    const childRows = ch && ch.rows.length ? (() => {
      const ok = eq(ch.sumCurrent, sm.current) && (ch.sumBaseline === null || eq(ch.sumBaseline, sm.baseline));
      return `<h4>Por ${esc(ch.level === 'sku' ? 'SKU' : (LEVEL[ch.level] || ch.level).toLowerCase())}</h4><div class="table-wrap"><table class="table ds-table" aria-label="Detalle por ${esc(ch.level)}"><thead><tr><th>${esc(LEVEL[ch.level] || ch.level)}</th><th class="num">Actual</th><th class="num">Comparación</th><th class="num">Cambio${D()}</th><th class="num">Cambio %</th><th></th></tr></thead><tbody>${ch.rows.map(r => `<tr><th scope="row">${esc(r.key)}${r.baseline !== null && r.current === 0 && r.baseline > 0 ? '<span class="tag">sin ventas en el período actual</span>' : (r.baseline === 0 && r.current > 0 ? '<span class="tag">sin ventas en la comparación (nuevo)</span>' : '')}</th><td class="num">${money(r.current)}</td><td class="num">${r.baseline === null ? NA : money(r.baseline)}</td><td class="num">${money(r.delta)}</td><td class="num">${signedPct(r.deltaPct)}</td><td>${ch.level === 'sku' && !(d.path.length && d.path[d.path.length-1].level === 'sku') ? `<button type="button" class="btn btn--small btn--ghost" data-action="an-drill-down" data-level="${esc(ch.level)}" data-key="${esc(r.key)}">Ver registros</button>` : (DRILL_NEXT[ch.level] || ch.level === 'sku' ? `<button type="button" class="btn btn--small btn--ghost" data-action="an-drill-down" data-level="${esc(ch.level)}" data-key="${esc(r.key)}">Abrir</button>` : '')}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Σ ${ch.total} ${esc((LEVEL[ch.level] || ch.level).toLowerCase())}(s)</th><td class="num">${money(ch.sumCurrent)}</td><td class="num">${ch.sumBaseline === null ? NA : money(ch.sumBaseline)}</td><td class="num">${ch.sumBaseline === null ? NA : money(ch.sumCurrent - ch.sumBaseline)}</td><td></td><td>${ok ? '✓ = total' : '⚠ no concilia'}${ch.total > ch.rows.length ? ` · se muestran ${ch.rows.length} de ${ch.total}` : ''}</td></tr></tfoot></table></div>`;
    })() : '';
    const periodRows = x.byPeriod.length ? `<details class="disclosure drill-fold"><summary>Detalle temporal</summary><div class="table-wrap"><table class="table ds-table" aria-label="Detalle por período"><thead><tr><th>Período</th><th>Rango</th><th class="num">${ML()}</th><th>Estado</th></tr></thead><tbody>${x.byPeriod.map(p => `<tr><th scope="row">${esc(p.key)}</th><td>${esc(FP.analysisContext.rangeLabel(p.from, p.to))}</td><td class="num">${p.value === null ? '<span class="cell-sub">Sin dato</span>' : money(p.value)}</td><td>${p.partial ? 'En curso (parcial) · no entra en patrones' : 'Cerrado'}</td></tr>`).join('')}</tbody></table></div></details>` : '';
    const rec = x.records ? `<details class="disclosure drill-fold"><summary>Registros fuente · SKU ${esc(x.records.sku)}</summary><p class="field__hint">${x.records.total} registro(s) de venta en los dos períodos; se muestran los últimos ${x.records.rows.length}. Σ del período actual: ${money(x.records.sumCurrent)} ${eq(x.records.sumCurrent, sm.current) ? '✓ = detalle' : '⚠ difiere del detalle'}.</p><div class="table-wrap"><table class="table ds-table" aria-label="Registros fuente"><thead><tr><th>Fecha</th><th>Canal</th><th class="num">Venta</th><th class="num">Pedidos</th><th class="num">Unidades</th><th>Período</th><th>Archivo · fila</th></tr></thead><tbody>${x.records.rows.map(r => `<tr><th scope="row">${esc(r.date)}</th><td>${esc(FP.analysisContext.channelLabel(r.channel))}</td><td class="num">${money(r.revenue)}</td><td class="num">${r.orders === null ? '—' : F().integer(r.orders)}</td><td class="num">${r.units === null ? '—' : F().integer(r.units)}</td><td>${esc(r.period)}</td><td>${esc(r.file || '—')} · ${r.row === undefined || r.row === null ? '—' : esc(r.row)}</td></tr>`).join('')}</tbody></table></div></details>` : '';
    const own = d.scope === 'entity' && !d.path.length ? (a.rows || []).find(r => r.entity === d.entity) : null;
    const adv = own && own.advanced ? own.advanced : null, ra = own && own.evidence && own.evidence.rulesApplied ? own.evidence.rulesApplied : null;
    const chg = own && own.evidence && Array.isArray(own.evidence.changes) ? own.evidence.changes : [];
    const rule = own ? `<div class="note drill__rule"><strong>Regla que lo señala:</strong> ${esc((PATTERN[own.pattern] || [0, own.pattern])[1])}${adv && adv.signal && adv.signal !== 'normal' ? ` · señal avanzada «${esc(adv.signal)}» (severidad ${esc(adv.severity)}, score ${esc(adv.score)}${adv.regimeChanges ? `, ${adv.regimeChanges} cambio(s) de régimen` : ''})` : ''}.<br><strong>Evidencia:</strong> ${own.consecutivePeriods || 0} período(s) consecutivos; ${own.periodsAnalyzed} períodos cerrados analizados (${esc(own.evidence && own.evidence.periods ? own.evidence.periods[0] + ' → ' + own.evidence.periods[own.evidence.periods.length - 1] : '—')}) en ${esc(c.channel)}; cambios período a período: ${esc(chg.map((x) => (typeof x === 'number' && Number.isFinite(x) ? (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + ' %' : 'N/A')).join(' · ') || 'N/A')}.${ra ? `<br><small>Umbrales usados: cambio relevante ≥ ${(ra.changePct * 100).toFixed(0)} %, estable < ${(ra.stablePct * 100).toFixed(0)} %, mínimo ${ra.minPeriods} períodos, anomalía z ≥ ${ra.anomalyZ}.</small>` : ''}</div>` : '';
    return `<section class="drill" id="an-drill" aria-label="Detalle y trazabilidad">${head}
      <div class="analysis-context analysis-context--drill"><span><b>Canal</b> ${esc(c.channel)}</span><span><b>Período</b> ${esc(c.period)}</span><span><b>Comparación</b> ${esc(c.comparison || 'N/A')}</span><span><b>Nivel</b> ${esc(c.level)}</span><span><b>Métrica</b> ${esc(c.metric)}</span></div>
      <nav class="drill__crumbs" aria-label="Ruta del detalle">${crumbs}</nav>${rule}${summary}${chRows}${childRows}${periodRows}${rec}${d.pending ? `<p class="ds-loading" role="status">${esc(d.step || 'Calculando el detalle temporal y los registros fuente…')}</p>` : ''}</section>`;
  }
  const DRILL_NEXT = { category: true, subcategory: true, product: true, region: true, state: true, city: true };


  /* ---------- La historia de la entidad: fases, estado actual, estabilidad y contexto ---------- */
  const STATE_PILL = { rising: 'ok', falling: 'error', stopped: 'error', in_line: 'na', new: 'ok', reactivated: 'ok', inactive: 'warning', not_comparable: 'na', no_data: 'na' };
  const STATE_ORDER = [['all', 'Todos'], ['stopped', 'Sin ventas ahora'], ['falling', 'Cayendo'], ['rising', 'Subiendo'], ['in_line', 'En línea'], ['new', 'Nuevo'], ['reactivated', 'Reactivado'], ['inactive', 'Inactivo']];
  function statePill(r) {
    const c = r.story && r.story.current; if (!c) return '<span class="cell-sub">—</span>';
    return `<span class="pill pill--${STATE_PILL[c.state] || 'na'}" title="${esc(c.text)}">${esc(c.tag)}</span>${Number.isFinite(c.change) && c.state !== 'stopped' ? `<span class="cell-sub">${signedPct(c.change)}</span>` : ''}`;
  }
  const EP_LABEL = { growth: 'Creció', decline: 'Cayó', stable: 'Estable', no_sales: 'Sin ventas', short: 'Poca historia' };
  function levelChart(r) {
    const st = r.story, ser = Array.isArray(r.series) ? r.series : [];
    const vals = ser.filter((x) => typeof x.value === 'number' && Number.isFinite(x.value));
    if (!st || st.status !== 'available' || vals.length < 2) return '';
    const W = 760, Hh = 250, L = 76, R = 22, T = 26, B = 50, iw = W - L - R, ih = Hh - T - B;
    const ol = st.outlook && st.outlook.status === 'available' ? st.outlook : null, H = ol ? ol.projection.length : 0;
    const max = Math.max(...vals.map((x) => x.value), ...(ol ? ol.projection.map((q) => q.high) : [0])) * 1.08 || 1, n = ser.length, nT = n + H;
    const X = (i) => L + (nT > 1 ? i / (nT - 1) : 0) * iw, Y = (v) => T + (1 - v / max) * ih;
    const idx = new Map(ser.map((x, i) => [x.period, i]));
    const bands = st.episodes.filter((e) => idx.has(e.from) && idx.has(e.to)).map((e) => { const a = X(idx.get(e.from)), b = X(idx.get(e.to)); return `<rect x="${a.toFixed(1)}" y="${T}" width="${Math.max(2, b - a).toFixed(1)}" height="${ih}" class="story-band story-band--${e.type}"><title>${esc(EP_LABEL[e.type] || e.type)} · ${esc(FP.trendStoryEngine.rangeText(e.from, e.to))}${Number.isFinite(e.changePct) && e.type !== 'stable' ? ' · ' + signedPct(e.changePct) : ''}</title></rect>`; }).join('');
    // la línea se corta donde no hubo venta (no se une como si bajara a cero)
    let path = '', pen = false;
    ser.forEach((x, i) => { if (typeof x.value === 'number' && Number.isFinite(x.value) && x.value > 0) { path += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.value).toFixed(1)} `; pen = true; } else pen = false; });
    const pk = idx.get(st.peak.period), tr = idx.get(st.trough.period), la = idx.get(st.lastActive.period);
    const mark = (i, v, cls, label) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="5" class="story-mark story-mark--${cls}"><title>${esc(label)}</title></circle>`;
    const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
    const xl = labelIdx.map((i) => `<text x="${X(i).toFixed(1)}" y="${Hh - 22}" text-anchor="middle" class="trend-chart__label">${esc(FP.trendStoryEngine.pLabel(ser[i].period))}</text>`).join('')
      + (ol ? `<text x="${X(nT - 1).toFixed(1)}" y="${Hh - 22}" text-anchor="end" class="trend-chart__label trend-chart__label--proj">${esc(FP.trendStoryEngine.pLabel(ol.projection[H - 1].period))} (proy.)</text>` : '');
    // tendencia: recta ajustada sobre los últimos períodos + extensión punteada con banda de rango
    let outlookSvg = '';
    if (ol) {
      const i0 = idx.get(ol.fitted[0].period), iL = idx.get(ol.lastPeriod);
      if (i0 !== undefined && iL !== undefined) {
        const fitPath = ol.fitted.map((q, k) => `${k ? 'L' : 'M'}${X(i0 + k).toFixed(1)},${Y(q.value).toFixed(1)}`).join(' ');
        const pts = ol.projection.map((q, k) => ({ x: X(iL + 1 + k), v: q.value, lo: q.low, hi: q.high }));
        const lastFit = ol.fitted[ol.fitted.length - 1];
        const proPath = `M${X(iL).toFixed(1)},${Y(lastFit.value).toFixed(1)} ` + pts.map((q) => `L${q.x.toFixed(1)},${Y(q.v).toFixed(1)}`).join(' ');
        const band = `M${X(iL).toFixed(1)},${Y(lastFit.value).toFixed(1)} ` + pts.map((q) => `L${q.x.toFixed(1)},${Y(q.hi).toFixed(1)}`).join(' ') + ' ' + [...pts].reverse().map((q) => `L${q.x.toFixed(1)},${Y(q.lo).toFixed(1)}`).join(' ') + ' Z';
        outlookSvg = `<path d="${band}" class="story-outlook__band"/><path d="${fitPath}" class="story-outlook__fit" fill="none"/><path d="${proPath}" class="story-outlook__proj" fill="none"/>`
          + pts.map((q, k) => `<circle cx="${q.x.toFixed(1)}" cy="${Y(q.v).toFixed(1)}" r="3.5" class="story-outlook__dot"><title>${esc(FP.trendStoryEngine.pLabel(ol.projection[k].period))} · ≈${money(q.v)} (rango ${money(q.lo)}–${money(q.hi)})</title></circle>`).join('');
      }
    }
    const yl = [max / 1.08, max / 2.16, 0].map((v) => `<text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="trend-chart__axis">${money(v)}</text>`).join('');
    const legend = `<span class="story-legend"><i class="story-sw story-sw--growth"></i>Creció <i class="story-sw story-sw--decline"></i>Cayó <i class="story-sw story-sw--stable"></i>Estable <i class="story-sw story-sw--no_sales"></i>Sin ventas${ol ? ' <i class="story-sw story-sw--proj"></i>Tendencia' : ''}</span>`;
    return `<div class="story-chart entity-growth-chart" role="img" aria-label="Línea de ${esc(ML().toLowerCase())} por período con fases de crecimiento, caída y estabilidad"><div class="entity-growth-chart__head"><div><strong>${esc(ML())} por período y fases</strong><span class="cell-sub">Solo períodos cerrados · la línea se corta donde no hubo venta</span></div>${legend}</div>
      <svg viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true">${bands}<line x1="${L}" y1="${T}" x2="${L}" y2="${Hh - B}" class="trend-chart__axis-line"/><line x1="${L}" y1="${Hh - B}" x2="${W - R}" y2="${Hh - B}" class="trend-chart__axis-line"/>${yl}${xl}
      ${outlookSvg}
      <path d="${path}" class="story-line" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      ${mark(pk, st.peak.value, 'peak', `Máximo · ${FP.trendStoryEngine.pLabel(st.peak.period)} · ${money(st.peak.value)}`)}${st.trough.period !== st.peak.period ? mark(tr, st.trough.value, 'trough', `Mínimo · ${FP.trendStoryEngine.pLabel(st.trough.period)} · ${money(st.trough.value)}`) : ''}${mark(la, st.lastActive.value, 'last', `Último cerrado · ${FP.trendStoryEngine.pLabel(st.lastActive.period)} · ${money(st.lastActive.value)}`)}
      </svg><p class="field__hint">● máximo ${esc(FP.trendStoryEngine.pLabel(st.peak.period))} (${money(st.peak.value)}) · ● mínimo ${esc(FP.trendStoryEngine.pLabel(st.trough.period))} (${money(st.trough.value)}) · ● último cerrado ${esc(FP.trendStoryEngine.pLabel(st.lastActive.period))} (${money(st.lastActive.value)}${Number.isFinite(st.fromPeak) && st.fromPeak < -0.005 ? `, ${signedPct(st.fromPeak)} vs su máximo` : ''}).</p>${outlookNote(st)}</div>`;
  }
  /** Frase de la línea de tendencia: qué muestra, hasta dónde llegaría si sigue igual, qué tan confiable es y qué NO es. */
  function outlookNote(st) {
    const o = st.outlook; if (!o) return '';
    if (o.status !== 'available') return `<p class="field__hint story-outlook-note">Sin línea de tendencia: ${esc(o.message || 'no hay base suficiente')}</p>`;
    const T = FP.trendStoryEngine, pl = T.pLabel, last = o.projection[o.projection.length - 1];
    const unit = o.unit || 'mes';
    const per = Number.isFinite(o.perPeriodPct) ? `${o.perPeriodPct >= 0 ? '+' : '−'}${Math.abs(o.perPeriodPct * 100).toFixed(0)} % por ${unit}` : '';
    const win = `${esc(T.rangeText(o.window.from, o.window.to))} (${o.window.periods} ${unit === 'mes' ? 'meses' : 'períodos'})`;
    const head = o.direction === 'up' ? `Los últimos ${o.window.periods} ${unit === 'mes' ? 'meses' : 'períodos'} (${win.split(' (')[0]}) van <b>al alza</b> (${esc(per)}).`
      : o.direction === 'down' ? `Los últimos ${o.window.periods} ${unit === 'mes' ? 'meses' : 'períodos'} (${win.split(' (')[0]}) van <b>a la baja</b> (${esc(per)}).`
      : `En ${win} <b>no hay una tendencia clara</b>: la recta es casi plana.`;
    const goes = `${o.direction === 'flat' ? 'Si nada cambia' : 'Si sigue así'}: de ${money(o.last)} (${esc(pl(o.lastPeriod))}) a ≈<b>${money(last.value)}</b> en ${esc(pl(last.period))} (rango ${money(last.low)}–${money(last.high)}).`;
    const cf = o.confidence, lvl = { high: 'alta', medium: 'media', low: 'baja' }[cf.level], cls = { high: 'ok', medium: 'warning', low: 'error' }[cf.level];
    const back = Number.isFinite(cf.mape) ? ` En ${cf.tests} prueba(s) hacia atrás esta misma regla se desvió en promedio ${(cf.mape * 100).toFixed(0)} % por ${unit}${Number.isFinite(cf.mapeNaive) ? `, contra ${(cf.mapeNaive * 100).toFixed(0)} % si solo se repitiera el último ${unit}` : ''} (alta: hasta 10 %; media: hasta 20 %).` : '';
    const se = o.seasonal, f1 = se && se.status === 'available' ? se.items[0] : null;
    const seasonTxt = f1 ? `<p class="${se.differs ? 'note note--warning' : 'field__hint'}"><strong>Temporada:</strong> el año pasado, de ${esc(pl(se.baseLabel))} a ${esc(pl(`${+f1.period.slice(0, 4) - 1}${f1.period.slice(4)}`))} la serie ${f1.seasonalChange >= 0 ? 'subió' : 'bajó'} ${Math.abs(f1.seasonalChange * 100).toFixed(0)} %, y la recta proyecta ${f1.projChange >= 0 ? '+' : '−'}${Math.abs(f1.projChange * 100).toFixed(0)} % para ${esc(pl(f1.period))}. Si repitiera la temporada del año pasado: ≈<b>${money(f1.seasonalValue)}</b>.${se.differs ? ' La temporada y la recta no coinciden: no tomes la recta como única referencia.' : ''}</p>` : '';
    return `<div class="story-outlook-note"><p><strong>Hacia dónde va:</strong> ${head} ${goes} <span class="pill pill--${cls}">Confianza ${lvl}</span>${esc(back)}${cf.reasons.length ? ` <em>Ojo: ${esc(cf.reasons.join(', '))}.</em>` : ''}</p>
      ${o.contradiction ? `<p class="note note--warning">${esc(o.contradiction)}</p>` : ''}
      ${seasonTxt}
      <p class="field__hint">Es una extensión de la tendencia reciente, no un pronóstico: la recta no considera estacionalidad (la referencia de temporada de arriba es aparte), promociones, inventario ni cambios de precio.</p></div>`;
  }
  function storyBlock(a, r) {
    const st = r.story; if (!st) return '';
    const cur = st.current || {}, rules = st.rules || {};
    const eps = st.episodes.filter((e) => e.type !== 'short' || st.episodes.length === 1);
    const chips = eps.map((e) => `<li class="story-ep story-ep--${e.type}"><strong>${esc(EP_LABEL[e.type] || e.type)}</strong><span>${esc(FP.trendStoryEngine.rangeText(e.from, e.to))}</span>${Number.isFinite(e.changePct) && !['stable', 'no_sales'].includes(e.type) ? `<b>${signedPct(e.changePct)}</b>` : (e.type === 'no_sales' ? `<small>${e.periods} período(s)${e.ongoing ? ' · sigue sin ventas' : ''}</small>` : '')}</li>`).join('');
    const nowChip = `<li class="story-ep story-ep--now"><strong>Ahora</strong><span>${esc(a.context && a.context.comparison && a.context.comparison.current ? a.context.comparison.current.label : '')}</span><span class="pill pill--${STATE_PILL[cur.state] || 'na'}">${esc(cur.tag || '—')}</span></li>`;
    const stabLabel = { estable: 'Estable', moderada: 'Variación moderada', volatil: 'Volátil', sin_dato: 'Sin dato' }[st.stability];
    const noiseTxt = Number.isFinite(st.noise) ? `variación típica ${(st.noise * 100).toFixed(0)} % por período` : '';
    const rel = (st.relative || []).map((x) => { const v = { better: 'mejor que', worse: 'peor que', similar: 'similar a' }[x.verdict];
      return `<li><strong>${esc(v)} ${esc(x.label)}</strong>: este ${esc((LEVEL[a.level] || 'elemento').toLowerCase())} ${signedPct(x.entityChange)} vs ${signedPct(x.contextChange)} (${esc(FP.trendStoryEngine.pLabel(x.window.from))} → ${esc(FP.trendStoryEngine.pLabel(x.window.to))}) · ${x.diffPp >= 0 ? '+' : '−'}${Math.abs(x.diffPp).toFixed(0)} pp</li>`; }).join('');
    const d = st.drivers;
    const drv = d ? `<p class="note"><strong>Qué se movió en ${esc(cur.state === 'stopped' ? 'el período' : 'el período en curso')}:</strong> de ${smny(d.delta)}, volumen ${smny(d.volume)} (${F().integer(Math.round(d.u1 - d.u0))} unidades) y precio ${smny(d.price)} (${mny(d.p0)} → ${mny(d.p1)} por unidad). Descomposición matemática, no causa.</p>`
      : (a.metric === 'revenue' && ['rising', 'falling', 'in_line'].includes(cur.state) ? '<p class="field__hint">No se separa volumen y precio: faltan unidades válidas en alguno de los dos períodos.</p>' : '');
    return `<div class="story-block">
      <p class="story-headline"><strong>La historia:</strong> ${esc(st.headline)}</p>
      ${st.reliability.level === 'low' ? `<p class="note note--warning story-reliability"><strong>Lectura poco confiable:</strong> ${esc(st.reliability.reasons.join(', '))}. Úsala como orientación, no como conclusión.</p>` : ''}
      <ol class="story-timeline" aria-label="Fases del producto">${chips}${nowChip}</ol>
      <div class="metric-grid story-metrics"><div class="metric"><span>Estabilidad</span><strong>${esc(stabLabel)}</strong><small>${esc(noiseTxt)}</small></div>
        <div class="metric"><span>Ahora</span><strong>${esc(cur.tag || '—')}</strong><small>${Number.isFinite(cur.change) ? signedPct(cur.change) : ''}</small></div>
        <div class="metric"><span>Máximo</span><strong>${esc(FP.trendStoryEngine.pLabel(st.peak.period))}</strong><small>${money(st.peak.value)}</small></div>
        <div class="metric"><span>Vs su máximo</span><strong>${signedPct(st.fromPeak)}</strong><small>último cerrado ${esc(FP.trendStoryEngine.pLabel(st.lastActive.period))}</small></div></div>
      ${drv}
      ${rel ? `<h4>Contra su contexto</h4><ul class="story-context">${rel}</ul>` : ''}
      <details class="disclosure"><summary>Cómo se calculan las fases y la estabilidad</summary><div class="panel__body"><p class="field__hint">Una fase cambia de dirección cuando el movimiento contrario supera <b>${((st.reversal || rules.reversalMin) * 100).toFixed(0)} %</b> (el mayor entre ${(rules.reversalMin * 100).toFixed(0)} % y ${rules.reversalNoiseMult}× la variación típica propia). Lo que no llega a ese umbral se lee como «estable». Los meses sin venta no se tratan como caída gradual: forman un episodio «sin ventas».</p><p class="field__hint">Estable: variación típica ≤ ${(rules.noiseStable * 100).toFixed(0)} %; volátil: &gt; ${(rules.noiseVolatile * 100).toFixed(0)} %. «Ahora» compara el período en curso con los mismos días del período anterior y se considera «en línea» si queda dentro de ${((cur.band || rules.tolerance) * 100).toFixed(0)} %. Describe lo que muestran los números; no explica por qué.</p></div></details>
    </div>`;
  }

  function selectedCard(a) {
    const r = a.selected;
    if (!r) return '<div class="empty"><strong>Elige una entidad</strong>Haz clic en su nombre en la tabla para ver su historia, hacia dónde va y qué revisar.</div>';
    const cls = PATTERN[r.pattern] || ['na', r.pattern];
    return `<div class="trend-detail">
      <div class="trend-detail__head"><div><span class="field__hint">${esc(LEVEL[a.level] || a.level)}</span><h3>${esc(r.entity)}</h3></div>${pill(r.pattern)}</div>
      ${storyBlock(a, r)}${levelChart(r)}
      <details class="disclosure"><summary>Evidencia: crecimiento % por período y cambios</summary>${growthChart(r.series)}<p class="field__hint">Períodos: ${esc(r.evidence.periods.join(', '))}</p><p class="field__hint">Cambios: ${r.evidence.changes.map((x) => typeof x === 'number' ? signedPct(x) : 's/d').join(' · ')}</p></details>
      ${r.series.some((x) => x.value === null) ? '<p class="field__hint">Hay períodos sin observación para esta entidad. La app no los trata como cero ni como meses consecutivos para detectar tendencias.</p>' : ''}
      ${r.anomaly ? `<p class="note note--warning"><strong>Qué pasó:</strong> ${r.anomaly.direction === 'increase' ? 'hubo una subida inusualmente grande' : r.anomaly.direction === 'decrease' ? 'hubo una caída inusualmente grande' : 'hubo un movimiento inusual'} en ${esc(r.endPeriod || 'el último período')}: ${money(r.recentAbsoluteChange)} (${signedPct(r.percentageChange)}). El cambio se aleja del comportamiento histórico (z=${r.anomaly.z.toFixed(1)}; umbral ${r.anomaly.thresholdZ.toFixed(1)}). Esto indica qué ocurrió estadísticamente, no por qué ocurrió.</p>` : ''}
      <div class="entity-next-step"><strong>Siguiente paso</strong><span>${nextStep(r)}</span></div>
    </div>`;
  }
  function nextStep(r) {
    if (r.anomaly) return 'Revisa primero el período marcado como anómalo y busca qué cambió en producto, canal, región o sucursal. La anomalía no explica por sí sola la causa.';
    if (r.pattern === 'decline_sustained' || r.pattern === 'decline_accelerating' || r.advanced?.signal === 'structural_decline') return 'Investiga dónde se concentra la caída y continúa con Prioridades de acción para buscar evidencia operativa.';
    if (r.pattern === 'growth_sustained' || r.pattern === 'growth_accelerating' || r.advanced?.signal === 'structural_growth') return 'Valida qué entidades explican el crecimiento y si el patrón se repite en otros períodos antes de tomarlo como oportunidad.';
    if (r.pattern === 'recovery' || r.pattern === 'strong_recovery') return 'Comprueba si la recuperación recuperó el nivel perdido y qué segmentos están sosteniendo el rebote.';
    if (r.pattern === 'trend_break' || r.advanced?.signal === 'trend_break') return 'Revisa el punto de cambio y contrasta qué dimensiones cambiaron alrededor de esa fecha.';
    return 'Revisa la evidencia de los últimos períodos y decide si requiere seguimiento o puede continuar a la siguiente señal.';
  }

  function analysisAssistant(a) {
    const as = a.assistant || { open:false, status:'idle', result:null, errors:[] };
    const configured = FP.cohereConnection?.isConfigured ? FP.cohereConnection.isConfigured() : false;
    const suggestions = [
      '¿Qué se está dejando de vender?',
      '¿Desde cuándo están cayendo y por cuánto tiempo?',
      '¿Cuáles contribuyen más a la caída?',
      '¿Cuáles están creciendo?',
      '¿Cuáles están soportando la caída?',
      '¿Quién está ganando participación y dinero?'
    ];
    const result = as.result;
    const resultBlock = result ? `<div class="analysis-assistant__answer"><span class="analysis-assistant__label">Respuesta</span><p>${esc(result.answer || '')}</p>${Array.isArray(result.evidence) && result.evidence.length ? `<div class="analysis-assistant__evidence"><strong>Evidencia utilizada</strong>${result.evidence.slice(0,5).map(e => `<div><b>${esc(e.entity || 'Entidad')}</b><span>${esc(e.reason || '')}</span><small>${esc(e.source || '')}</small></div>`).join('')}</div>` : ''}${result.nextQuestion ? `<div class="analysis-assistant__next"><strong>Siguiente pregunta</strong><span>${esc(result.nextQuestion)}</span></div>` : ''}${Array.isArray(result.limitations) && result.limitations.length ? `<p class="field__hint"><strong>Límites:</strong> ${esc(result.limitations.join(' · '))}</p>` : ''}</div>` : '';
    const error = as.status === 'error' ? `<div class="ds-alert ds-alert--danger" role="alert">${esc((as.errors || []).join(' '))}${!configured ? ' Configura la conexión con Cohere en Ajustes.' : ''}</div>` : '';
    const history = (as.history || []).slice(0,-1).reverse().slice(0,3).map(h => `<div class="analysis-assistant__history-item"><span>${esc(h.question)}</span>${h.ok && h.result ? `<small>${esc(h.result.answer || '')}</small>` : `<small class="is-error">No se pudo responder.</small>`}</div>`).join('');
    return `<aside class="analysis-assistant ${as.open ? 'is-open' : ''}" aria-label="Asistente conversacional de Análisis">
      <button type="button" class="analysis-assistant__fab" data-action="an-assistant-toggle" aria-expanded="${as.open ? 'true' : 'false'}" aria-controls="an-assistant-panel"><span aria-hidden="true">✦</span><span>Asistente de análisis</span></button>
      ${as.open ? `<section class="analysis-assistant__panel" id="an-assistant-panel">
        <div class="analysis-assistant__head"><div><span class="analysis-layer-label">COHERE</span><h3>Pregúntale a tus datos</h3><p>Responde usando resultados ya calculados por Análisis. No inventa cifras ni sustituye la evidencia.</p></div><button type="button" class="btn btn--small btn--ghost" data-action="an-assistant-toggle" aria-label="Cerrar asistente">Cerrar</button></div>
        <div class="analysis-assistant__suggestions" aria-label="Preguntas sugeridas">${suggestions.map(q => `<button type="button" class="analysis-assistant__suggestion" data-action="an-assistant-suggest" data-question="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <div class="analysis-assistant__input"><label for="an-assistant-input">Tu pregunta</label><textarea id="an-assistant-input" rows="2" placeholder="Ej. ¿Qué productos llevan más tiempo cayendo?" data-action="an-assistant-question">${esc(as.question || '')}</textarea><div class="btn-row"><button type="button" class="btn btn--primary" data-action="an-assistant-ask" ${as.status === 'busy' || !configured ? 'disabled' : ''}>${as.status === 'busy' ? 'Consultando…' : 'Preguntar'}</button>${!configured ? '<span class="field__hint">Configura Cohere en Ajustes para usar el asistente.</span>' : '<span class="field__hint">La conexión es la misma que usa Diagnóstico y Narrativa.</span>'}</div></div>
        ${as.status === 'busy' ? '<p class="ds-loading" role="status">Consultando la evidencia calculada…</p>' : ''}${error}${resultBlock}${history ? `<details class="analysis-assistant__history"><summary>Preguntas anteriores</summary>${history}</details>` : ''}
      </section>` : ''}
    </aside>`;
  }
  function finiteLocal(v){ return typeof v==='number' && Number.isFinite(v); }

  function forecastPanel(a) {
    const f = a.forecast;
    if (!f || f.status !== 'available') {
      return `<section class="panel panel--inner trend-forecast-panel"><div class="panel__head"><div><span class="analysis-layer-label">PROYECCIÓN</span><h3 class="panel__title">Forecast de tendencias</h3><p class="panel__desc">Se necesitan al menos ${FP.trendForecastEngine ? FP.trendForecastEngine.DEFAULTS.minPoints : 4} observaciones históricas comparables.</p></div></div></section>`;
    }
    const unitMap={year:'años',month:'meses',week:'semanas',day:'días'}, unit=unitMap[a.periodType||'month']||'períodos';
    const visible = new Set((a._filteredRows || a.rows || []).map(r=>r.entity));
    const scopedRows=(Array.isArray(f.rows)?f.rows:[]).filter(r=>visible.has(r.entity));
    const size=6;
    const page=Math.max(1,Math.min(Math.max(1,Math.ceil(scopedRows.length/size)),Number(a.forecastPage)||1));
    const pages=Math.max(1,Math.ceil(scopedRows.length/size));
    const top=scopedRows.slice((page-1)*size,page*size);
    const direction=x=>x.directionReading || (x.changeToHorizon>0?'↑ Creciendo':x.changeToHorizon<0?'↓ Cayendo':'→ Estable');
    const pct=v=>typeof v==='number'&&Number.isFinite(v)?(v>=0?'+':'')+(v*100).toFixed(1)+' %':F().DASH;
    const fmt=v=>money(v);
    const lastProjected=r=>Array.isArray(r.periods)&&r.periods.length?r.periods[r.periods.length-1].value:null;
    const card=r=>`<tr><th scope="row">${esc(r.entity)} <button type="button" class="btn btn--small btn--ghost" data-action="an-drill" data-source="forecast" data-entity="${esc(r.entity)}" aria-label="Ver detalle de ${esc(r.entity)}">Detalle</button></th><td>${esc(direction(r))}</td><td class="num">${fmt(r.lastValue)}</td><td class="num">${fmt(lastProjected(r))}</td><td class="num">${pct(r.changeToHorizon)}</td><td>${esc(r.confidence||'—')} · ${r.confidenceScore||0}/100</td></tr>`;
    return `<section class="panel panel--inner trend-forecast-panel"><div class="panel__head"><div><span class="analysis-layer-label">PROYECCIÓN</span><h3 class="panel__title">Forecast de tendencias</h3><p class="panel__desc">Prioriza primero las proyecciones con mayor confianza. Después puedes recorrer el resto mediante paginación.</p></div></div><div class="panel__body">
      <div class="settings-grid"><div class="field"><span class="field__hint">Horizonte</span><div class="segmented" role="group">${[3,6,12].map(n=>`<button type="button" data-action="an-forecast-horizon" data-value="${n}" aria-pressed="${n===a.forecastHorizon}">${n} ${unit}</button>`).join('')}</div></div><div class="field"><label for="an-forecast-method">Método</label><select id="an-forecast-method" data-action="an-forecast-method"><option value="linear" ${a.forecastMethod==='linear'?'selected':''}>Tendencia lineal</option><option value="average" ${a.forecastMethod==='average'?'selected':''}>Promedio reciente</option><option value="ensemble" ${a.forecastMethod==='ensemble'?'selected':''}>Combinado</option></select><span class="field__hint">La confianza es descriptiva; no es una probabilidad.</span></div></div>
      <p class="field__hint forecast-scope"><b>Observado:</b> períodos cerrados hasta ${esc(lastClosedLabel(a))}${a.context && a.context.focus && a.context.focus.partial ? ' (el período en curso no se usa para proyectar)' : ''} · <b>Proyectado:</b> los siguientes ${a.forecastHorizon || 3} ${unit} · Canal ${esc(a.context ? a.context.channelLabel : 'Total digital')}. No se usan datos posteriores al corte.</p>
      ${top.length?`<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th>Dirección</th><th class="num">Último</th><th class="num">Proyección</th><th class="num">Cambio</th><th>Confianza</th></tr></thead><tbody>${top.map(card).join('')}</tbody></table></div>`:'<div class="empty"><strong>No hay proyecciones para el filtro actual</strong>Se requiere historia suficiente.</div>'}
      <div class="pager forecast-pager" aria-label="Paginación de Forecast"><span>${scopedRows.length?`${(page-1)*size+1}–${Math.min(page*size,scopedRows.length)} de ${scopedRows.length} entidades`:'0 entidades'}</span><div class="btn-row"><button type="button" class="btn btn--small" data-action="an-forecast-page" data-value="${page-1}" ${page<=1?'disabled':''}>Anterior</button><span class="num">Página ${page} de ${pages}</span><button type="button" class="btn btn--small" data-action="an-forecast-page" data-value="${page+1}" ${page>=pages?'disabled':''}>Siguiente</button></div></div>
      <div class="forecast-validation"><strong>Validación histórica</strong><span>${f.backtest ? `Backtest: ${f.backtest.periodsTested||0} ${unit} evaluados · error medio ${f.backtest.mape !== null && f.backtest.mape !== undefined ? (f.backtest.mape*100).toFixed(1)+" %" : "no calculable"}` : "No disponible con la historia actual"}</span></div>
      <details class="disclosure"><summary>Ver metodología y supuestos</summary><div class="panel__body"><p class="field__hint">${esc(f.methodology||'Proyección descriptiva basada en la serie histórica.')}</p><p class="field__hint">La dirección resume el patrón histórico; no demuestra causalidad. La proyección puede cambiar si cambia la dinámica observada.</p></div></details>
    </div></section>`;
  }

  function explanation(r) {
    const p = r.pattern;
    const map = {
      growth_sustained: `crece de forma persistente durante ${r.consecutivePeriods} períodos consecutivos`, growth_accelerating: `crece y la velocidad del crecimiento está aumentando`, growth_decelerating: `sigue creciendo, pero la velocidad del crecimiento está disminuyendo`,
      decline_sustained: `presenta deterioro sostenido durante ${r.consecutivePeriods} períodos consecutivos`, decline_accelerating: `cae y la velocidad de la caída está aumentando`, decline_decelerating: `sigue cayendo, pero la velocidad de la caída está disminuyendo`,
      recovery: 'muestra señales de recuperación después de un período de deterioro', strong_recovery: 'muestra una recuperación consistente después de un deterioro relevante', trend_break: 'presenta una ruptura respecto de la dirección anterior', stable: 'permanece dentro de un rango de variación estable', volatile: 'presenta oscilaciones frecuentes sin una dirección persistente', anomaly: 'presenta un movimiento extraordinario respecto de su histórico', insufficient_history: 'no tiene suficiente historia para una clasificación robusta'
    };
    return `${r.entity} ${map[p] || 'tiene un patrón no clasificado'}. ${r.startPeriod ? `La tendencia identificada comienza en ${r.startPeriod}.` : ''} ${r.cumulativeChange !== null ? `El cambio acumulado desde el primer dato disponible es ${signedPct(r.cumulativeChange)}.` : ''}`.trim();
  }
  /** Aviso de materialidad en Contribución: la tabla oculta lo que pesa menos del umbral, pero el cambio neto y la concentración siguen contando TODAS las entidades. */
  function matNote(a, c) {
    if (!(Number(a.minSharePct) > 0)) return '';
    const byEnt = new Map((a.rows || []).map((r) => [r.entity, r]));
    const all = [...c.positive, ...c.negative];
    const hid = all.filter((x) => { const r = byEnt.get(x.entity); return r && !isMaterial(a, r); });
    if (!hid.length) return '';
    const net = hid.reduce((s2, x) => s2 + (x.delta || 0), 0);
    return `<p class="field__hint contribution-mat" data-hidden="${hid.length}">Materialidad ${esc(String(a.minSharePct))} %: ${hid.length} entidades más chicas no se listan (suman ${money(net)} del cambio neto). El cambio neto y la concentración incluyen todas.</p>`;
  }
  function contributionPanel(a) {
    const c = a.contribution;
    if (!c || c.status !== 'available') return `<section class="panel panel--inner"><div class="panel__head"><div><span class="analysis-layer-label">DRIVER</span><h3 class="panel__title">Contribución y origen</h3><p class="panel__desc">No hay suficientes valores comparables para determinar qué entidades explican el movimiento.</p></div></div></section>`;
    const visible = new Set((a._filteredRows || a.rows || []).map(r => r.entity));
    const list = (c.direction === 'decline' ? c.negative : c.positive).filter(r=>visible.has(r.entity)).slice(0, 8);
    const opposite = (c.direction === 'decline' ? c.positive : c.negative).filter(r=>visible.has(r.entity));
    const fmtDelta = (v) => money(v);
    const pct = (v, signed=false) => v === null || !Number.isFinite(v) ? F().DASH : `${signed && v > 0 ? '+' : ''}${(v * 100).toFixed(1)} %`;
    const pp = (v) => v === null || !Number.isFinite(v) ? F().DASH : `${v > 0 ? '+' : ''}${v.toFixed(1)} pp`;
    const roleLabel = (r) => r.delta < 0 ? 'Arrastra' : r.delta > 0 ? 'Compensa' : 'Estable';
    const prio = new Map(a.priorities && a.priorities.status === 'available' ? [...(a.priorities.drag || []), ...(a.priorities.compensate || [])].map((x) => [x.entity, x]) : []);
    const clue = (e) => { const x = prio.get(e); if (!x || !x.evidenceSummary) return F().DASH; const parts = String(x.evidenceSummary).split(' · ').filter((s) => !/sin dato/i.test(s)); return parts.length ? esc(parts.join(' · ')) : F().DASH; };
    const row = (r) => `<tr><th scope="row"><button type="button" class="link-btn" data-action="an-drill" data-source="contribucion" data-entity="${esc(r.entity)}" aria-label="Ver detalle de ${esc(r.entity)}">${esc(r.entity)}</button><span class="cell-sub">${roleLabel(r)} · #${r.rank}</span></th><td class="num">${fmtDelta(r.baseline)} <span class="cell-sub">→ ${fmtDelta(r.current)}</span></td><td class="num">${fmtDelta(r.delta)}<span class="cell-sub">${pct(r.deltaPct, true)}</span></td><td class="num">${r.contributionPct === null ? F().DASH : `${r.contributionPct > 0 ? '+' : ''}${(r.contributionPct * 100).toFixed(1)} %`}<span class="cell-sub">del cambio neto</span></td><td class="num">${r.movementShare === null ? F().DASH : `${(r.movementShare * 100).toFixed(1)} %`}<span class="cell-sub">del movimiento</span></td><td class="num">${pp(r.shareChangePp)}</td><td class="num">${prio.has(r.entity) ? (prio.get(r.entity).consecutivePeriods || 0) + ' per.' : F().DASH}</td><td class="contribution-clue">${clue(r.entity)}</td></tr>`;
    const label = c.direction === 'decline' ? 'explican el deterioro' : 'explican el crecimiento';
    return `<section class="panel panel--inner contribution-panel"><div class="panel__head"><div><span class="analysis-layer-label">DRIVER</span><h3 class="panel__title">Contribución y origen</h3><p class="panel__desc">Cuánto aportó cada entidad al cambio, cuánto lleva persistiendo y la primera pista a revisar. No es causalidad.</p></div><div class="panel__actions"><button type="button" class="btn btn--small btn--ghost" data-action="an-diagnose">Diagnosticar este periodo</button><button type="button" class="btn btn--small btn--ghost" data-action="an-export-contrib">Descargar CSV</button></div></div><div class="panel__body">
      <div class="metric-grid"><div class="metric"><span>Cambio neto</span><strong>${fmtDelta(c.totalDelta)}</strong><small>base → actual</small></div><div class="metric"><span>Movimiento positivo</span><strong>${fmtDelta(c.compensation.positiveDelta)}</strong><small>compensación generada</small></div><div class="metric"><span>Movimiento negativo</span><strong>${fmtDelta(c.compensation.negativeDelta)}</strong><small>arrastre generado</small></div><div class="metric"><span>Concentración 80%</span><strong>${c.direction === 'decline' ? (c.concentration.negative.topN || 0) : (c.concentration.positive.topN || 0)} entidades</strong><small>para explicar el movimiento</small></div></div>
      ${reconLine(a)}
      ${matNote(a, c)}
      ${list.length ? `<div class="table-wrap"><table class="table ds-table contribution-table"><thead><tr><th>Entidad / rol</th><th class="num">Base → actual</th><th class="num">Cambio${D()} / %</th><th class="num">Aporte al cambio neto</th><th class="num">Peso del movimiento</th><th class="num">Δ share</th><th class="num">Persist.</th><th>Primera pista</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : '<div class="empty"><strong>Sin contribuyentes</strong>No hay movimiento significativo que atribuir.</div>'}
      <details class="disclosure"><summary>Cómo leer esta tabla, evidencia y compensación</summary><div class="panel__body"><div class="contribution-guide"><div><strong>Cómo leer esta tabla</strong><span><b>Aporte al cambio neto</b> = qué parte del resultado final explica la entidad. <b>Peso del movimiento</b> = qué parte de todo lo que subió/bajó corresponde a ella.</span></div><div><strong>Ejemplo</strong><span>Una entidad puede aportar más de 100% al cambio neto si otras entidades están compensando en sentido contrario.</span></div></div><p class="field__hint">Comparación: ${esc(c.baselinePeriod || '—')} → ${esc(c.currentPeriod || '—')}. Entidades analizadas: ${c.evidence.entities.length}. El cambio neto reconcilia con movimiento positivo + movimiento negativo.</p></div></details>
    </div></section>`;
  }


  /* ---------- Volumen · Precio · Mezcla (PVM) ---------- */
  function pvmPanel(a) {
    const p = a.pvm; if (!p) return '';
    const head = (desc) => `<div class="panel__head"><div><span class="analysis-layer-label">DRIVER</span><h3 class="panel__title">Volumen · Precio · Mezcla</h3><p class="panel__desc">${desc}</p></div></div>`;
    if (p.status === 'not_applicable' || p.status === 'unavailable' || p.status === 'insufficient_data') {
      return `<section class="panel panel--inner pvm-panel" id="an-pvm">${head('Separa el cambio de venta en vender más unidades, cobrar distinto por unidad y cambiar qué se vende.')}<div class="panel__body"><p class="note ${p.status === 'not_applicable' ? '' : 'note--warning'}"><strong>${p.status === 'not_applicable' ? 'No aplica.' : 'No disponible.'}</strong> ${esc(p.message || '')}</p></div></section>`;
    }
    const t = p.total, rec = p.reconciliation;
    const nl = t.newItems + t.lost;
    const lvl = LEVEL[p.level] || p.level;
    const reading = `De la variación de ${smny(t.delta)} (${esc(p.comparisonLabel || '')}): volumen ${smny(t.volume)}, precio ${smny(t.price)}, mezcla ${smny(t.mix)}${Math.abs(nl) > 0.5 ? ` y ${esc(lvl.toLowerCase())}s nuevos/perdidos ${smny(nl)}` : ''}${Math.abs(t.noUnits) > 0.5 ? ` y sin unidades ${smny(t.noUnits)}` : ''}. Es una descomposición matemática, no una causa.`;
    const tag = (r) => r.kind === 'new' ? '<span class="tag">nuevo</span>' : r.kind === 'lost' ? '<span class="tag">sin ventas en el período actual</span>' : r.kind === 'no_units' ? '<span class="tag">sin unidades</span>' : '';
    const rows = p.rows.slice(0, 10);
    const granularNote = ['sku', 'product'].includes(p.level) ? '' : `<p class="field__hint pvm-level-note"><strong>Nivel ${esc(lvl.toLowerCase())}:</strong> el precio por unidad de una ${esc(lvl.toLowerCase())} mezcla productos de precios distintos, así que su «Precio» incluye cambios internos de mezcla. Para precio puro, analiza por Producto o SKU.</p>`;
    return `<section class="panel panel--inner pvm-panel" id="an-pvm">${head('Responde <strong>cuánto del cambio de venta viene de vender más o menos unidades, de cobrar distinto por unidad o de cambiar qué se vende</strong>. Mismo canal, período y comparación equivalente que el resto del módulo.')}<div class="panel__body">
      ${p.status === 'partial' ? `<p class="note note--warning"><strong>Descomposición parcial.</strong> ${esc(p.message)}</p>` : ''}
      <div class="metric-grid"><div class="metric"><span>Variación de venta</span><strong>${smny(t.delta)}</strong></div><div class="metric"><span>Volumen</span><strong>${smny(t.volume)}</strong><small>Δ unidades ${F().integer(Math.round(t.units1 - t.units0))}</small></div><div class="metric"><span>Precio</span><strong>${smny(t.price)}</strong><small>cobro por unidad</small></div><div class="metric"><span>Mezcla</span><strong>${smny(t.mix)}</strong><small>qué se vende</small></div><div class="metric"><span>Nuevos / perdidos</span><strong>${smny(nl)}</strong><small>${t.newCount} nuevo(s) · ${t.lostCount} sin ventas ahora</small></div>${Math.abs(t.noUnits) > 0.5 || t.noUnitsCount ? `<div class="metric"><span>Sin unidades</span><strong>${smny(t.noUnits)}</strong><small>${t.noUnitsCount} sin unidades válidas</small></div>` : ''}</div>
      <p class="note"><strong>Lectura:</strong> ${reading}</p>
      <p class="note analysis-recon ${rec.ok ? 'analysis-recon--ok' : 'note--warning'}"><strong>${rec.ok ? '✓ Conciliado' : '⚠ No concilia'}:</strong> Volumen + Precio + Mezcla + Nuevos/Perdidos${t.noUnitsCount ? ' + Sin unidades' : ''} ${mny(rec.sum)} ${rec.ok ? '=' : '≠'} variación total ${mny(rec.delta)}.</p>
      ${granularNote}
      <div class="table-wrap"><table class="table ds-table" aria-label="Volumen, precio y mezcla por ${esc(lvl.toLowerCase())}"><thead><tr><th>${esc(lvl)}</th><th class="num">Precio prom. base → actual</th><th class="num">Δ venta</th><th class="num">Volumen</th><th class="num">Precio</th><th class="num">Mezcla</th><th class="num">Nuevo / perdido</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.entity)} ${tag(r)} <button type="button" class="btn btn--small btn--ghost" data-action="an-drill" data-source="pvm" data-entity="${esc(r.entity)}" aria-label="Ver detalle de ${esc(r.entity)}">Detalle</button></th><td class="num">${r.p0 === null ? '—' : mny(r.p0)} → ${r.p1 === null ? '—' : mny(r.p1)}</td><td class="num">${smny(r.delta)}</td><td class="num">${r.kind === 'continuing' ? smny(r.volume) : '—'}</td><td class="num">${r.kind === 'continuing' ? smny(r.price) : '—'}</td><td class="num">${r.kind === 'continuing' ? smny(r.mix) : '—'}</td><td class="num">${r.kind === 'new' || r.kind === 'lost' ? smny(r.newItems + r.lost) : r.kind === 'no_units' ? 'sin unidades' : '—'}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Σ ${p.rows.length} ${esc(lvl.toLowerCase())}(s)</th><td></td><td class="num">${smny(t.delta)}</td><td class="num">${smny(t.volume)}</td><td class="num">${smny(t.price)}</td><td class="num">${smny(t.mix)}</td><td class="num">${smny(nl)}</td></tr></tfoot></table></div>
      ${p.rows.length > rows.length ? `<p class="field__hint">Se muestran las ${rows.length} de mayor movimiento; los totales incluyen las ${p.rows.length}.</p>` : ''}
      <details class="disclosure"><summary>Método y límites</summary><div class="panel__body"><p class="field__hint">${esc(p.method)}</p><p class="field__hint"><b>Precio</b> es la venta realizada por unidad (venta ÷ unidades): incluye descuentos y no separa precio de lista de promoción. <b>Mezcla</b> mide cambio de composición entre ${esc(lvl.toLowerCase())}s, no calidad del surtido. No hay costos ni margen: no es rentabilidad.</p></div></details>
    </div></section>`;
  }

  /* ---------- Puente al plan ---------- */
  /** Proyección de la tendencia del total contra la meta de los meses proyectados (la meta existe por canal, no por producto). */
  function projVsPlan(b) {
    const o = b.outlookVsPlan; if (!o || !o.items || !o.items.length) return '';
    const pl = FP.trendStoryEngine.pLabel, lvl = { high: 'alta', medium: 'media', low: 'baja' }[o.confidence] || '—';
    const rows = o.items.map((i) => `<tr><th scope="row">${esc(pl(i.period))}</th><td class="num">${mny(i.projected)}<span class="cell-sub">rango ${mny(i.low)}–${mny(i.high)}</span></td><td class="num">${mny(i.plan)}</td><td class="num ${i.pct < 0 ? 'is-neg' : 'is-pos'}">${i.pct >= 0 ? '+' : '−'}${Math.abs(i.pct * 100).toFixed(1)} %</td></tr>`).join('');
    return `<h4>Si la tendencia sigue, ¿se llega a la meta?</h4><div class="table-wrap"><table class="table ds-table" aria-label="Proyección contra meta"><thead><tr><th>Mes</th><th class="num">Proyección del total</th><th class="num">Meta</th><th class="num">Contra la meta</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="field__hint">Extiende la tendencia reciente del total (confianza ${esc(lvl)}); no es un pronóstico ni considera temporada, promociones o inventario. La proyección usa la venta de productos y la meta es sobre venta real, así que pueden diferir un poco. Solo se muestran meses con meta completa; por producto no hay meta.</p>`;
  }
  function bridgePanel(a) {
    const b = a.bridge; if (!b) return '';
    const head = (desc) => `<div class="panel__head"><div><span class="analysis-layer-label">DRIVER</span><h3 class="panel__title">Puente al plan</h3><p class="panel__desc">${desc}</p></div></div>`;
    if (b.status !== 'available' && b.status !== 'partial') {
      return `<section class="panel panel--inner bridge-panel" id="an-bridge">${head('Muestra cuánto de la brecha contra la meta explica cada canal y cada producto.')}<div class="panel__body"><p class="note ${b.status === 'not_applicable' ? '' : 'note--warning'}"><strong>${b.status === 'not_applicable' ? 'No aplica.' : 'No disponible.'}</strong> ${esc(b.message || b.planMessage || '')}</p></div></section>`;
    }
    const lvl = LEVEL[b.level] || b.level, rec = b.reconciliation;
    const rows = b.rows.slice(0, 10);
    const worst = b.rows.slice().sort((x, y) => x.contribution - y.contribution)[0];
    const reading = b.gap < 0 ? `${esc(b.currentLabel || 'El período')} quedó ${mny(Math.abs(b.gap))} (${(Math.abs(b.gapPct) * 100).toFixed(1)} %) por debajo de la meta${worst && worst.contribution < 0 ? `; ${esc(worst.entity)} es quien más aporta a esa brecha (${smny(worst.contribution)}) bajo el supuesto de crecimiento parejo` : ''}.`
      : `${esc(b.currentLabel || 'El período')} superó la meta por ${mny(b.gap)} (${(b.gapPct * 100).toFixed(1)} %).`;
    const chans = (b.channels || []).filter((c) => c.plan || c.actual);
    return `<section class="panel panel--inner bridge-panel" id="an-bridge">${head('Responde <strong>cuánto de la brecha contra la meta explica cada canal y cada producto</strong>. La meta se toma de los datos de Plan cargados para el mismo período y canal.')}<div class="panel__body">
      ${b.message ? `<p class="note note--warning"><strong>Brecha parcial.</strong> ${esc(b.message)}</p>` : ''}${b.planNote ? `<p class="note note--warning">${esc(b.planNote)}</p>` : ''}
      <div class="metric-grid"><div class="metric"><span>Meta</span><strong>${mny(b.plan)}</strong></div><div class="metric"><span>Real</span><strong>${mny(b.actual)}</strong></div><div class="metric"><span>Brecha $</span><strong>${smny(b.gap)}</strong></div><div class="metric"><span>Brecha %</span><strong>${signedPct(b.gapPct)}</strong></div><div class="metric"><span>Cambio real vs comparación</span><strong>${smny(b.observed)}</strong></div><div class="metric"><span>Cambio que pedía la meta</span><strong>${smny(b.expected)}</strong></div></div>
      <p class="note"><strong>Lectura:</strong> ${reading}</p>
      <p class="note analysis-recon ${rec.ok ? 'analysis-recon--ok' : 'note--warning'}"><strong>${rec.ok ? '✓ Conciliado' : '⚠ No concilia'}:</strong> Σ contribuciones ${mny(rec.sumContribution)} ${rec.ok ? '=' : '≠'} brecha ${mny(rec.gap)}${rec.channelSum === null ? '' : ` · Σ brechas por canal ${mny(rec.channelSum)} ${rec.channelOk ? '✓' : '⚠'}`}.</p>
      ${chans.length > 1 ? `<h4>Por canal</h4><div class="table-wrap"><table class="table ds-table" aria-label="Brecha por canal"><thead><tr><th>Canal</th><th class="num">Meta</th><th class="num">Real</th><th class="num">Brecha $</th><th class="num">% de la brecha total</th></tr></thead><tbody>${chans.map((c) => `<tr><th scope="row">${esc(FP.analysisContext.channelLabel(c.channel))}</th><td class="num">${mny(c.plan)}</td><td class="num">${mny(c.actual)}</td><td class="num">${smny(c.gap)}</td><td class="num">${Math.abs(b.gap) > 0.5 && c.gap !== null ? ((c.gap / b.gap) * 100).toFixed(0) + ' %' : '—'}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Σ canales</th><td class="num">${mny(b.plan)}</td><td class="num">${mny(b.actual)}</td><td class="num">${smny(b.gap)}</td><td></td></tr></tfoot></table></div>` : ''}
      <h4>Por ${esc(lvl.toLowerCase())}</h4><div class="table-wrap"><table class="table ds-table" aria-label="Contribución a la brecha por ${esc(lvl.toLowerCase())}"><thead><tr><th>${esc(lvl)}</th><th class="num">Base</th><th class="num">Actual</th><th class="num">Cambio real</th><th class="num">Cambio esperado*</th><th class="num">Aporte a la brecha</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.entity)} <button type="button" class="btn btn--small btn--ghost" data-action="an-drill" data-source="puente" data-entity="${esc(r.entity)}" aria-label="Ver detalle de ${esc(r.entity)}">Detalle</button></th><td class="num">${mny(r.baseline)}</td><td class="num">${mny(r.current)}</td><td class="num">${smny(r.delta)}</td><td class="num">${smny(r.expected)}</td><td class="num">${smny(r.contribution)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Σ ${b.rows.length} ${esc(lvl.toLowerCase())}(s)</th><td class="num">${mny(b.baseline)}</td><td class="num">${mny(b.actual)}</td><td class="num">${smny(b.observed)}</td><td class="num">${smny(b.expected)}</td><td class="num">${smny(rec.sumContribution)}</td></tr></tfoot></table></div>
      ${projVsPlan(b)}
      <p class="field__hint">* ${esc(b.assumption)}</p>
      ${b.rows.length > rows.length ? `<p class="field__hint">Se muestran las ${rows.length} de mayor aporte; los totales incluyen las ${b.rows.length}.</p>` : ''}
    </div></section>`;
  }

  function shareMixPanel(a) {
    const sh = a.share;
    const visible = new Set((a._filteredRows || a.rows || []).map(r => r.entity));
    if (!sh || !sh.rows || !sh.rows.length) return `<section class="panel panel--inner"><div class="panel__head"><div><span class="analysis-layer-label">DRIVER</span><h3 class="panel__title">Mix Intelligence</h3><p class="panel__desc">No hay suficiente histórico comparable para calcular participación.</p></div></div></section>`;
    const scoped = (sh.rows || []).filter(r => visible.has(r.entity));
    const topG = scoped.filter(r => r.status === 'gaining').sort((a,b)=>b.shareChangePp-a.shareChangePp).slice(0, 3);
    const topL = scoped.filter(r => r.status === 'losing').sort((a,b)=>a.shareChangePp-b.shareChangePp).slice(0, 3);
    const delta=(r)=>(r.currentValue||0)-(r.baselineValue||0);
    const pct=(r)=>r.baselineValue!==0?delta(r)/r.baselineValue:null;
    const card=(r,type,i)=>`<article class="mix-card mix-card--${type}">
      <div class="mix-card__top"><span class="mix-rank">${i+1}</span><strong title="${esc(r.entity)}">${esc(r.entity)}</strong><span>${type==='gain'?'🟢 Gana share':'🔴 Pierde share'}</span></div>
      <div class="mix-card__share"><div><span>Participación</span><strong>${signedPct(r.baselineShare)} → ${signedPct(r.currentShare)}</strong></div><div><span>Cambio de mix</span><strong>${r.shareChangePp>=0?'+':''}${r.shareChangePp.toFixed(1)} pp</strong></div><div><span>Ranking</span><strong>${r.rankBaseline||'—'} → ${r.rankCurrent||'—'}</strong></div></div>
      <div class="mix-card__values"><div><span>${ML()} base → actual</span><strong>${money(r.baselineValue)} → ${money(r.currentValue)}</strong></div><div><span>Cambio${D()}</span><strong>${money(delta(r))}</strong></div><div><span>Cambio %</span><strong>${signedPct(pct(r))}</strong></div></div>
      <div class="mix-card__meta"><span>Ranking <b>${r.rankBaseline||'—'} → ${r.rankCurrent||'—'}</b></span><span>Período <b>${esc(sh.baselinePeriod||'—')} → ${esc(sh.currentPeriod||'—')}</b></span><button type="button" class="btn btn--small btn--ghost" data-action="an-drill" data-source="mix" data-entity="${esc(r.entity)}" aria-label="Ver detalle de ${esc(r.entity)}">Detalle</button></div>
    </article>`;
    const cards=(arr,type)=>arr.length?`<div class="mix-card-list">${arr.map((r,i)=>card(r,type,i)).join('')}</div>`:'<p class="field__hint">No hay cambios significativos de participación en el filtro actual.</p>';
    return `<section class="panel panel--inner mix-intelligence-panel"><div class="panel__head"><div><span class="analysis-layer-label">DRIVER</span><h3 class="panel__title">Mix Intelligence</h3><p class="panel__desc">Explica <strong>cómo cambió la composición</strong> entre períodos comparables. El foco aquí es participación, posición y concentración; el dinero queda como contexto.</p></div></div><div class="panel__body">
      <div class="mix-comparison"><span>Comparación</span><strong>${esc(sh.comparisonLabel||'Períodos comparables')}</strong><span>HHI actual: <b>${(sh.hhi||0).toFixed(3)}</b></span></div>
      <div class="metric-grid"><div class="metric"><span>Ganadores de share</span><strong>${scoped.filter(r=>r.status==='gaining').length}</strong><small>suben participación</small></div><div class="metric"><span>Perdedores de share</span><strong>${scoped.filter(r=>r.status==='losing').length}</strong><small>bajan participación</small></div><div class="metric"><span>Nuevos</span><strong>${scoped.filter(r=>r.status==='new').length}</strong><small>sin venta base</small></div><div class="metric"><span>Perdidos</span><strong>${scoped.filter(r=>r.status==='lost').length}</strong><small>sin venta actual</small></div><div class="metric"><span>Estables</span><strong>${scoped.filter(r=>r.status==='stable').length}</strong><small>share casi igual</small></div></div>
      <div class="grid-2 mix-groups"><div><div class="mix-section-head"><div><span class="analysis-layer-label">COMPOSICIÓN ↑</span><h4>Quién gana participación</h4></div><span>Orden: Δ pp</span></div>${cards(topG,'gain')}</div><div><div class="mix-section-head"><div><span class="analysis-layer-label">COMPOSICIÓN ↓</span><h4>Quién pierde participación</h4></div><span>Orden: Δ pp</span></div>${cards(topL,'loss')}</div></div>
      <details class="disclosure"><summary>Ver mix completo</summary><div class="panel__body"><p class="field__hint">La primera lectura ordena por cambio de participación (puntos porcentuales). El dinero y el crecimiento quedan visibles para evitar confundir una gran ganancia de share de una entidad pequeña con el mayor impacto económico.</p><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th class="num">Base → actual</th><th class="num">Cambio${D()}</th><th class="num">Cambio %</th><th class="num">Share base → actual</th><th class="num">Δ pp</th><th>Ranking</th></tr></thead><tbody>${[...scoped].sort((x,y)=>Math.abs(y.shareChangePp)-Math.abs(x.shareChangePp)).slice(0,50).map(r=>`<tr><th scope="row">${esc(r.entity)}</th><td class="num">${money(r.baselineValue)} → ${money(r.currentValue)}</td><td class="num">${money(delta(r))}</td><td class="num">${signedPct(pct(r))}</td><td class="num">${signedPct(r.baselineShare)} → ${signedPct(r.currentShare)}</td><td class="num">${r.shareChangePp>=0?'+':''}${r.shareChangePp.toFixed(1)} pp</td><td>${r.rankBaseline||'—'} → ${r.rankCurrent||'—'}</td></tr>`).join('')}</tbody></table></div></div></details>
    </div></section>`;
  }
  function narrativePanel(a) {
    const n=a.narrative, ai=a.ai||{};
    if(!n||!n.ready) return '';
    const layers=Array.isArray(n.layers)?n.layers:[];
    const claims=n.claims||[];
    const text=ai.status==='ok'&&ai.result&&ai.result.summary ? ai.result.summary : n.executiveSummary;
    const detail=ai.status==='ok'&&ai.result&&ai.result.narrative ? ai.result.narrative : claims.slice(0,8).map(c=>`<p><strong>${esc(c.level)}</strong>: ${esc(c.text)}</p>`).join('');
    const busy=ai.status==='busy';
    const error=ai.status==='error' ? `<p class="field__hint">No se pudo usar Cohere: ${esc((ai.errors||[]).join(' '))}. Se conserva la narrativa determinística.</p>` : '';
    const layerCards=layers.map(l=>{ const st=n.layerStatus?.[l.id]||'insufficient'; const count=(n.sections?.[l.id]||[]).length; return `<div class="narrative-layer narrative-layer--${esc(st)}"><span class="narrative-layer__status">${st==='available'?'●':'○'}</span><div><strong>${esc(l.label)}</strong><small>${esc(l.question)}</small><span>${count ? `${count} evidencia(s)` : 'Sin evidencia suficiente'}</span></div></div>`; }).join('');
    return `<section class="panel panel--inner analysis-narrative-panel"><div class="panel__head"><div><h3 class="panel__title">Resumen del análisis</h3></div></div><div class="panel__body"><p class="narrative-summary">${esc(text)}</p><div class="narrative-next"><strong>Siguiente pregunta analítica</strong><span>${esc(n.nextQuestion||'Contrastar la señal con evidencia adicional.')}</span></div>
      <details class="disclosure"><summary>Ver detalle por capa y redactar con Cohere (opcional)</summary><div class="panel__body"><div class="narrative-layer-grid">${layerCards}</div><div class="narrative-block">${detail}</div><div class="btn-row"><button type="button" class="btn btn--small" data-action="an-ai" ${busy?'disabled':''}>${busy?'Redactando…':'Redactar con Cohere (opcional)'}</button></div>${error}<p class="field__hint">Integra las capas HECHO → DRIVER → SEÑAL → HIPÓTESIS → PROYECCIÓN sin agregar cifras ni convertir señales en causas. Cohere reutiliza la conexión de Ajustes y solo redacta resultados ya calculados.</p></div></details></div></section>`;
  }

  // Aislamiento de paneles opcionales (guía §18): si uno falla, los demás se siguen mostrando
  // y el error queda visible y en consola. No envuelve todo Evolución en un único try/catch.
  function safe(name, fn) {
    try { return fn(); }
    catch (err) {
      try { console.error('[Evolución] Panel «' + name + '» falló:', err); } catch (_) {}
      return `<section class="panel panel--inner panel--optional-error" role="alert"><div class="panel__body"><p class="note note--warning"><strong>${esc(name)} no está disponible.</strong> Ocurrió un error al dibujar esta sección; el resto de Evolución sigue funcionando. Detalle técnico: ${esc(err && err.message ? err.message : String(err))}</p></div></section>`;
    }
  }

  function render(state) {
    const a = state.an;
    MK = (a.context && a.context.metric) || a.metric || 'revenue';
    const filteredRows = (a.rows || []).filter((r) => {
      if (a.pattern !== 'all' && r.pattern !== a.pattern) return false;
      if (a.signal !== 'all' && !(r.advanced && r.advanced.signal === a.signal)) return false;
      if ((a.stateFilter || 'all') !== 'all' && !(r.story && r.story.current && r.story.current.state === a.stateFilter)) return false;
      if (a.anomalyDirection !== 'all' && !(r.anomaly && r.anomaly.direction === a.anomalyDirection)) return false;
      if (a.entityQuery && !String(r.entity || '').toLowerCase().includes(String(a.entityQuery).toLowerCase())) return false;
      if (a.minImpact > 0 && Math.abs(r.recentAbsoluteChange || 0) < a.minImpact) return false;
      if (!isMaterial(a, r)) return false;
      return true;
    });
    const pageSize = Math.max(1, Number(a.pageSize) || 6);
    const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const page = Math.max(1, Math.min(pageCount, Number(a.page) || 1));
    if (a.page !== page) a.page = page;
    const rows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
    const el = $('an-content'); if (!el) return;
    if (!FP.productStore || !FP.productStore.available()) {
      el.innerHTML = `<div class="empty"><strong>Faltan datos de productos</strong>Carga y guarda datos de productos para construir las series históricas de Evolución.</div>`; return;
    }
    if (a.loading && !a.rows.length) { el.innerHTML = `<div class="empty"><strong>Construyendo evolución histórica…</strong>Se están agregando los períodos desde IndexedDB. La interfaz seguirá disponible.</div>`; return; }
    if (a.error) { el.innerHTML = `<div class="empty empty--error"><strong>No se pudo calcular Evolución</strong>${esc(a.error)}</div>`; return; }
    const total = filteredRows.length, allTotal=a.rows.length, growth = filteredRows.filter((r) => r.direction === 'growth').length, decline = filteredRows.filter((r) => r.direction === 'decline').length;
    const sh=a.share||{}; const tm=a.temporal||{}; const ci2=a.comparisonInfo||{}; const cur=typeof tm.currentTotal==='number'?tm.currentTotal:(typeof sh.currentTotal==='number'?sh.currentTotal:null), base=ci2.comparable&&typeof sh.baselineTotal==='number'?sh.baselineTotal:null, delta=cur!==null&&base!==null?cur-base:null, deltaPct=FP.analysisContext.pctChange(cur,base);
    const anomalyCount=filteredRows.filter(r=>r.anomaly).length;
    a._filteredRows = filteredRows;
    const hiddenMat = (a.rows || []).filter((r) => !isMaterial(a, r)).length;
    el.innerHTML = `${safe('Filtros', () => filters(state))}${safe('Contexto', () => contextBar(a))}${safe('Narrativa', () => narrativePanel(a))}
      <div class="metric-grid trend-kpis">
        <button type="button" class="metric metric--drill" data-action="an-drill-total" data-source="kpi" aria-label="Ver detalle del período actual"><span>${ML()} actual <small>${esc(ci2.current?.label || tm.focus?.label || '—')}</small></span><strong>${money(cur)}</strong></button>
        <button type="button" class="metric metric--drill" data-action="an-drill-total" data-source="kpi" aria-label="Ver detalle del período de comparación"><span>${ML()} comparable <small>${esc(ci2.baseline?.label || '—')}</small></span><strong>${money(base)}</strong></button>
        <button type="button" class="metric metric--drill" data-action="an-drill-total" data-source="kpi" aria-label="Ver de dónde viene el cambio en pesos"><span>Cambio${D()}</span><strong>${money(delta)}</strong></button>
        <button type="button" class="metric metric--drill" data-action="an-drill-total" data-source="kpi" aria-label="Ver de dónde viene el cambio porcentual"><span>Cambio %</span><strong>${signedPct(deltaPct)}</strong></button>
      </div>
      ${total ? `<p class="field__hint trend-count">${F().integer(total)} de ${F().integer(allTotal)} entidades · ${growth} crecen · ${decline} caen${anomalyCount ? ` · ${anomalyCount} con anomalía` : ''}${hiddenMat ? ` · ${F().integer(hiddenMat)} ocultas por materialidad (menos de ${a.minSharePct} % del total)` : ''}</p><div class="table-wrap trend-table-wrap" id="an-trend-table"><table class="table ds-table trend-table"><thead><tr><th>Entidad</th><th>Ahora</th><th>Patrón / inicio</th><th class="num">Actual${D()}</th><th class="num">Cambio${D()}</th><th class="num">Cambio %</th><th class="num">Acumulado</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row"><div class="entity-cell"><button type="button" class="link-btn" data-action="an-drill" data-source="patron" data-entity="${esc(r.entity)}" aria-label="Leer entidad ${esc(r.entity)}" title="Ver la historia de ${esc(r.entity)}">${esc(r.entity)}</button></div></th><td>${statePill(r)}</td><td>${pill(r.pattern)}<span class="cell-sub">Inicio ${esc(r.startPeriod || F().DASH)}</span></td><td class="num">${money(r.currentValue)}</td><td class="num">${money(r.recentAbsoluteChange)}</td><td class="num">${signedPct(r.percentageChange)}</td><td class="num">${signedPct(r.cumulativeChange)}</td></tr>`).join('')}</tbody></table></div><div class="pager trend-pager" aria-label="Paginación de evolución y patrones"><span>${F().integer((page - 1) * pageSize + 1)}–${F().integer(Math.min(page * pageSize, filteredRows.length))} de ${F().integer(filteredRows.length)} entidades</span><div class="btn-row"><button type="button" class="btn btn--small" data-action="an-page" data-value="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button><span class="num" aria-current="page">Página ${page} de ${pageCount}</span><button type="button" class="btn btn--small" data-action="an-page" data-value="${page + 1}" ${page >= pageCount ? 'disabled' : ''}>Siguiente</button></div></div>` : `<div class="empty"><strong>No hay suficiente historia</strong>Se necesitan al menos ${FP.trendEngine.DEFAULTS.minPeriods} períodos con datos para clasificar una entidad.</div>`}
      <section class="panel panel--inner entity-reading-panel" id="an-entity-reading"><div class="panel__head"><div><h3 class="panel__title">Lectura de la entidad</h3></div><div class="panel__actions"><button type="button" class="btn btn--small btn--ghost" data-action="an-diagnose">Diagnosticar esto</button>${a.selected ? '<button type="button" class="btn btn--small btn--ghost" data-action="an-export-reading">Descargar lectura</button><button type="button" class="btn btn--small btn--ghost" data-action="an-clear-selection">Cerrar lectura</button>' : ''}</div></div><div class="panel__body">${a.drill && a.drill.scope === 'total' ? '' : selectedCard(a)}${safe('Detalle y trazabilidad', () => drillPanel(a))}</div></section>
      ${safe('Contribución y origen', () => contributionPanel(a))}
      ${safe('Volumen, precio y mezcla', () => pvmPanel(a))}
      ${safe('Puente al plan', () => bridgePanel(a))}
      ${safe('Participación y mix', () => shareMixPanel(a))}
      <details class="disclosure analysis-forecast-fold"><summary>Forecast por entidad (método anterior, con backtest)</summary>${safe('Forecast de tendencias', () => forecastPanel(a))}</details>
      ${safe('Asistente de análisis', () => analysisAssistant(a))}`;
  }
  /** Materialidad: oculta de la tabla de patrones las entidades que pesan menos de X % del total (en el periodo actual o en el base). En Contribución la tabla también las oculta (con aviso), pero el cambio neto y la concentración incluyen todas las entidades. */
  function isMaterial(a, r) {
    const pct = Number(a.minSharePct) || 0; if (pct <= 0) return true;
    const tot = Math.max((a.share && a.share.currentTotal) || 0, (a.share && a.share.baselineTotal) || 0);
    if (!(tot > 0)) return true;
    return Math.max(Math.abs(r.currentValue || 0), Math.abs(r.previousValue || 0)) >= (pct / 100) * tot;
  }
  FP.trendView = { render, isMaterial };
})(typeof window !== 'undefined' ? window : globalThis);
