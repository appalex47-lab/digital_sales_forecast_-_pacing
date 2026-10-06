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
  function signedPct(v) { return typeof v === 'number' && Number.isFinite(v) ? F().signedPercent(v, 1) : F().DASH; }
  function money(v) { return typeof v === 'number' && Number.isFinite(v) ? F().currency(v, 0) : F().DASH; }
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
    const comparisonNote = a.comparison === 'year_ago' && sh.comparisonAvailable === false ? `<div class="note note--warning analysis-comparison-warning"><strong>Comparación no disponible.</strong> ${esc(sh.comparisonMessage || 'No existe el período de comparación en los datos cargados.')} Puedes cambiar a “Período anterior” sin recargar la página.</div>` : '';
    const temporalCards = [t.yoy, t.mom, t.wow, t.dod].filter(Boolean).map(x => `<span class="temporal-chip ${x.available ? '' : 'is-muted'}"><strong>${esc(x.id.toUpperCase())}</strong> ${x.available ? signedPct(x.change) : 'No disponible'}</span>`).join('');
    const seasonNote = t.seasonality?.status === 'available' ? `<small>Estacionalidad: ${esc(String(t.seasonality.comparablePeriods))} período(s) comparables · índice ${signedPct((t.seasonality.index || 1) - 1)}</small>` : `<small>Estacionalidad: histórico insuficiente para este periodo.</small>`;
    return `<div class="analysis-filter-bar">
      <div class="period-context"><strong>Contexto temporal</strong><span>${esc(focusLabel)}</span><small>El periodo focal cambia las métricas y el punto final del histórico. El histórico sigue disponible para detectar tendencias, estacionalidad y patrones.</small></div>
      <div class="settings-grid analysis-period-controls">
        <div class="field"><label for="an-period-type">Granularidad</label><select id="an-period-type" data-action="an-period-type"><option value="year" ${pt==='year'?'selected':''}>Año</option><option value="month" ${pt==='month'?'selected':''}>Mes</option><option value="week" ${pt==='week'?'selected':''}>Semana</option><option value="day" ${pt==='day'?'selected':''}>Día</option></select></div>
        <div class="field"><label for="an-focus">Periodo focal</label><select id="an-focus" data-action="an-focus">${opts.length ? opts.slice().reverse().map(o => `<option value="${esc(o.key)}" ${o.key===focusKey?'selected':''}>${esc(FP.temporalEngine.label(pt,o.key,o.range))}</option>`).join('') : '<option>Sin periodos</option>'}</select></div>
        <div class="field"><label for="an-period-count">Historia</label><input id="an-period-count" type="number" min="3" max="${pt==='day'?90:24}" step="1" value="${count}" data-action="an-period-count"></div>
        <div class="field"><label for="an-comparison">Comparación principal</label><select id="an-comparison" data-action="an-comparison"><option value="previous" ${a.comparison!=='year_ago'?'selected':''}>Período anterior</option><option value="year_ago" ${a.comparison==='year_ago'?'selected':''}>Mismo periodo año anterior</option></select></div>
        <div class="field"><label for="an-level">Analizar por</label><select id="an-level" data-action="an-level">${levels.map(([v,l])=>`<option value="${v}" ${v===a.level?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
      </div>
      <div class="temporal-summary" aria-label="Comparaciones temporales"><strong>Comparaciones disponibles</strong>${temporalCards || '<span class="temporal-chip is-muted">Se calcularán al terminar el análisis</span>'}${seasonNote}</div>
      <div class="settings-grid analysis-filter-controls">
        <div class="field"><label for="an-pattern">Patrón</label><select id="an-pattern" data-action="an-pattern">${patterns.map(([v,l])=>`<option value="${v}" ${v===a.pattern?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="an-signal">Señal avanzada</label><select id="an-signal" data-action="an-signal">${signals.map(([v,l])=>`<option value="${v}" ${v===a.signal?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="an-anomaly-direction">Anomalía</label><select id="an-anomaly-direction" data-action="an-anomaly-direction"><option value="all" ${a.anomalyDirection==='all'?'selected':''}>Todas</option><option value="increase" ${a.anomalyDirection==='increase'?'selected':''}>Subida inusual</option><option value="decrease" ${a.anomalyDirection==='decrease'?'selected':''}>Caída inusual</option></select></div>
        <div class="field"><label for="an-entity-query">Buscar</label><input id="an-entity-query" type="search" value="${esc(a.entityQuery || '')}" placeholder="Producto, categoría, SKU…" data-action="an-entity-query"></div>
        <div class="field"><label for="an-min-impact">Impacto mínimo $</label><input id="an-min-impact" type="number" min="0" step="100" value="${a.minImpact || ''}" placeholder="0" data-action="an-min-impact"></div>
      </div>
      ${patternHelp()}
      ${comparisonNote}
    </div>`;
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
    const latest=xy.at(-1), latestText=signedPct(latest.v);
    return `<div class="entity-growth-chart" role="img" aria-label="Gráfica de crecimiento por período de ${esc(points[0].label)} a ${esc(points.at(-1).label)}"><div class="entity-growth-chart__head"><div><strong>Crecimiento por período</strong><span class="cell-sub">X = fecha / período · Y = crecimiento %</span></div><span>Último cambio: ${latestText}</span></div><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="${L}" y1="${T}" x2="${L}" y2="${xAxisY}" class="trend-chart__axis-line"/>
      <line x1="${L}" y1="${xAxisY}" x2="${W-R}" y2="${xAxisY}" class="trend-chart__axis-line"/>
      <line x1="${L}" y1="${zeroY.toFixed(1)}" x2="${W-R}" y2="${zeroY.toFixed(1)}" class="trend-chart__zero"/>
      ${yTicks}${xLabels}
      <polyline points="${poly}" class="trend-chart__line" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${xy.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="trend-chart__point"><title>${esc(p.label)} · ${signedPct(p.v)}</title></circle>`).join('')}
      <text x="16" y="18" class="trend-chart__axis-title">Crecimiento %</text>
      <text x="${W-R}" y="${H-4}" text-anchor="end" class="trend-chart__axis-title">Fecha / período</text>
    </svg></div>`;
  }

  function selectedCard(a) {
    const r = a.selected;
    if (!r) return '<div class="empty"><strong>Selecciona una señal</strong>Usa “Leer” en una entidad priorizada para ver qué ocurrió, cuándo ocurrió y qué deberías revisar.</div>';
    const cls = PATTERN[r.pattern] || ['na', r.pattern];
    return `<div class="trend-detail">
      <div class="trend-detail__head"><div><span class="field__hint">${esc(LEVEL[a.level] || a.level)}</span><h3>${esc(r.entity)}</h3></div>${pill(r.pattern)}</div>
      <div class="metric-grid">
        <div class="metric"><span>Inicio del patrón actual</span><strong>${esc(r.patternStartPeriod || r.startPeriod || F().DASH)}</strong></div>
        <div class="metric"><span>Duración del patrón</span><strong>${r.patternDurationPeriods || r.consecutivePeriods || 0} períodos</strong></div>
        <div class="metric"><span>Cambio acumulado</span><strong>${signedPct(r.cumulativeChange)}</strong></div>
        <div class="metric"><span>Velocidad</span><strong>${typeof r.slope === 'number' ? money(r.slope) + '/periodo' : F().DASH}</strong></div>
        <div class="metric"><span>Punto de inflexión</span><strong>${esc(r.turningPoint || F().DASH)}</strong></div>
        <div class="metric"><span>Confianza</span><strong>${esc(r.confidence)}</strong></div>
      </div>
      ${growthChart(r.series)}
      <p class="note ${cls[0] === 'error' ? 'note--warning' : ''}"><strong>Lectura:</strong> ${esc(explanation(r))}</p>
      ${r.series.some((x) => x.value === null) ? '<p class="field__hint">Hay períodos sin observación para esta entidad. La app no los trata como cero ni como meses consecutivos para detectar tendencias.</p>' : ''}
      ${r.anomaly ? `<p class="note note--warning"><strong>Qué pasó:</strong> ${r.anomaly.direction === 'increase' ? 'hubo una subida inusualmente grande' : r.anomaly.direction === 'decrease' ? 'hubo una caída inusualmente grande' : 'hubo un movimiento inusual'} en ${esc(r.endPeriod || 'el último período')}: ${money(r.recentAbsoluteChange)} (${signedPct(r.percentageChange)}). El cambio se aleja del comportamiento histórico (z=${r.anomaly.z.toFixed(1)}; umbral ${r.anomaly.thresholdZ.toFixed(1)}). Esto indica qué ocurrió estadísticamente, no por qué ocurrió.</p>` : ''}
      <details class="disclosure"><summary>Ver evidencia</summary><div class="panel__body"><p class="field__hint">Períodos: ${esc(r.evidence.periods.join(', '))}</p><p class="field__hint">Cambios: ${r.evidence.changes.map((x) => typeof x === 'number' ? signedPct(x) : 's/d').join(' · ')}</p></div></details>
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

  function analysisMapPanel() {
    const arch = FP.analysisArchitecture;
    const layers = arch && arch.layers ? arch.layers : [];
    if (!layers.length) return '';
    const cards = layers.map((x) => {
      const action = x.id === 'hypothesis'
        ? `<a class="btn btn--small btn--ghost" href="#diagnostico" data-nav="diagnostico">Ir a Diagnóstico</a>`
        : '';
      return `<article class="analysis-map__card analysis-map__card--${esc(x.id)}"><div class="analysis-map__num">${x.order}</div><div><span class="analysis-map__eyebrow">${esc(x.label)}</span><h3>${esc(x.question)}</h3><p><strong>${esc(x.modules.join(' + '))}</strong> · ${esc(x.purpose)}</p>${action}</div></article>`;
    }).join('');
    return `<section class="panel panel--inner analysis-map" aria-labelledby="analysis-map-title"><div class="panel__head"><div><h2 class="panel__title" id="analysis-map-title">Cómo leer este análisis</h2><p class="panel__desc">La sección sigue el mismo razonamiento que <strong>¿Por qué? Diagnóstico</strong>: primero demostramos el hecho, después explicamos matemáticamente el movimiento, luego priorizamos señales y finalmente validamos hipótesis.</p></div></div><div class="panel__body"><div class="analysis-map__grid">${cards}</div><div class="analysis-map__rule"><strong>Regla de lectura:</strong> una contribución matemática no se presenta como causa; una señal no se presenta como diagnóstico; una hipótesis siempre requiere validación.</div></div></section>`;
  }

  function priorityPanel(a) {
    const p=a.priorities;
    if(!p || p.status!=='available') return `<section class="panel panel--inner priority-panel"><div class="panel__head"><div><span class="analysis-layer-label">SEÑAL</span><h3 class="panel__title">Prioridades de acción</h3><p class="panel__desc">No hay suficiente movimiento comparable para ordenar qué entidades debes revisar primero.</p></div></div></section>`;
    const visible=new Set((a._filteredRows||a.rows||[]).map(r=>r.entity));
    const drag=p.drag.filter(x=>visible.has(x.entity));
    const compensate=p.compensate.filter(x=>visible.has(x.entity));
    const pctChange=x=>finiteLocal(x.percentageChange)?signedPct(x.percentageChange):F().DASH;
    const periodText=(x)=>x.baselinePeriod&&x.currentPeriod?`${esc(x.baselinePeriod)} → ${esc(x.currentPeriod)}`:'Período comparable';
    const card=(x,type,i)=>`<article class="priority-card priority-card--${type}">
      <div class="priority-card__top"><span class="priority-rank">${i+1}</span><div class="priority-card__entity"><strong title="${esc(x.entity)}">${esc(x.entity)}</strong><span>${periodText(x)}</span></div><span class="priority-badge">${type==='drag'?'🔴 Arrastre':'🟢 Compensa'}</span></div>
      <div class="priority-card__main"><div><span>Impacto en venta</span><strong class="priority-impact">${money(x.impact)}</strong></div><div><span>Cambio</span><strong>${pctChange(x)}</strong></div><div><span>Movimiento</span><strong>${finiteLocal(x.impactSharePct)?x.impactSharePct.toFixed(1)+'%':'—'}</strong><small>del movimiento ${type==='drag'?'negativo':'positivo'}</small></div></div>
      <div class="priority-card__meta"><span>Persistencia <b>${x.consecutivePeriods||0}</b></span><span>Patrón <b>${pill(x.pattern)}</b></span><span>Score <b>${x.score}</b></span></div>
      <p class="priority-card__why"><strong>Por qué está aquí:</strong> ${type==='drag'?'es una de las mayores caídas monetarias del período comparable.':'es uno de los mayores movimientos positivos del período comparable.'} ${x.consecutivePeriods>=2?'Además, el patrón tiene persistencia.':''}</p>
      ${x.evidenceSummary?`<p class="priority-card__evidence"><strong>Primera pista:</strong> ${esc(x.evidenceSummary)}</p>`:''}
      <button type="button" class="btn btn--small btn--ghost" data-action="an-select" data-entity="${esc(x.entity)}">Leer evidencia</button>
    </article>`;
    const cards=(arr,type)=>arr.length?`<div class="priority-card-list">${arr.slice(0,6).map((x,i)=>card(x,type,i)).join('')}</div>`:`<div class="empty"><strong>Ninguna entidad en este grupo</strong>No hay movimiento con esta dirección dentro del filtro actual.</div>`;
    const dragTotal=p.totals?.drag||0, compTotal=p.totals?.compensate||0, balance=dragTotal+compTotal;
    const comparison=p.comparison?.baselinePeriod&&p.comparison?.currentPeriod?`${p.comparison.baselinePeriod} → ${p.comparison.currentPeriod}`:'período comparable';
    const partialNote=p.comparison?.currentPartial?'<span class="priority-partial">⚠ período actual parcial</span>':'';
    return `<section class="panel panel--inner priority-panel"><div class="panel__head"><div><span class="analysis-layer-label">SEÑAL</span><h3 class="panel__title">Prioridades de acción</h3><p class="panel__desc">Aquí no buscamos la causa todavía: identificamos <strong>qué entidades mueven más la venta</strong> para saber dónde investigar primero.</p></div></div><div class="panel__body">
      <div class="priority-start"><div><span class="advanced-start__eyebrow">Empieza aquí</span><h4>1. Mira primero el impacto monetario</h4><p>El orden principal responde a una pregunta concreta: <strong>¿qué entidad perdió o ganó más dinero entre los períodos comparables?</strong> Después usamos persistencia, patrón, share y cambio relativo para enriquecer la prioridad.</p></div><div class="advanced-start__steps"><span><b>1</b> Impacto</span><span><b>2</b> Persistencia</span><span><b>3</b> Evidencia</span><span><b>4</b> Acción</span></div></div>
      <div class="priority-comparison"><span>Comparación analizada</span><strong>${esc(comparison)}</strong>${partialNote}<span class="priority-comparison__hint">La comparación usa exactamente los períodos seleccionados.</span></div>
      <div class="metric-grid priority-balance"><div class="metric"><span>🔴 Caída acumulada</span><strong>${money(dragTotal)}</strong><small>solo entidades en arrastre</small></div><div class="metric"><span>🟢 Crecimiento acumulado</span><strong>${money(compTotal)}</strong><small>solo entidades compensadoras</small></div><div class="metric"><span>⚖ Balance neto</span><strong>${money(balance)}</strong><small>arrastre + compensación</small></div><div class="metric"><span>Prioridades visibles</span><strong>${drag.length+compensate.length}</strong><small>máximo 6 por grupo</small></div></div>
      <div class="priority-groups"><div><div class="priority-section-head"><div><span class="analysis-layer-label">MAYOR IMPACTO NEGATIVO</span><h4>🔴 Qué está tirando la venta</h4></div><span>Orden: caída $</span></div>${cards(drag,'drag')}</div><div><div class="priority-section-head"><div><span class="analysis-layer-label">MAYOR IMPACTO POSITIVO</span><h4>🟢 Qué está compensando / haciendo crecer</h4></div><span>Orden: crecimiento $</span></div>${cards(compensate,'compensate')}</div></div>
      <div class="risk-data-status"><strong>La prioridad no es una causa.</strong> Venta, pedidos, unidades y dimensiones están disponibles para investigar. Stock, precio, promociones y costos/margen se consideran información faltante si no están en el dataset.</div>
      <details class="disclosure"><summary>¿Cómo se ordena una prioridad?</summary><div class="panel__body"><p class="field__hint"><strong>1. Impacto monetario absoluto</strong> del período comparable. <strong>2. Participación dentro del movimiento</strong> negativo/positivo. <strong>3. Persistencia.</strong> <strong>4. Patrón y aceleración.</strong> <strong>5. Cambio relativo y share.</strong> El score orienta la investigación; no reemplaza el impacto monetario.</p><p class="field__hint">“Arrastra” y “Compensa” son atribuciones matemáticas del movimiento, no explicaciones causales.</p></div></details>
    </div></section>`;
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

  function forecastPanel(a) {
    const f = a.forecast;
    if (!f || f.status === 'unavailable') return `<section class="panel panel--inner forecast-analysis-panel"><div class="panel__head"><div><span class="analysis-layer-label">PROYECCIÓN</span><h3 class="panel__title">Forecast de tendencias</h3><p class="panel__desc">El motor de Forecast no está disponible. El resto del Análisis continúa funcionando.</p></div></div></section>`;
    if (f.status === 'error') return `<section class="panel panel--inner forecast-analysis-panel"><div class="panel__head"><div><span class="analysis-layer-label">PROYECCIÓN</span><h3 class="panel__title">Forecast de tendencias</h3><p class="panel__desc">No se pudo calcular Forecast. Evolución, Mix, Prioridades y las demás capas conservan sus datos.</p></div></div><div class="panel__body"><div class="empty empty--error"><strong>Forecast no disponible</strong>${esc(f.error || 'Error no especificado.')}</div></div></section>`;
    if (f.status !== 'available') return `<section class="panel panel--inner forecast-analysis-panel"><div class="panel__head"><div><span class="analysis-layer-label">PROYECCIÓN</span><h3 class="panel__title">Forecast de tendencias</h3><p class="panel__desc">No hay suficiente historia para proyectar tendencias con una base razonable.</p></div></div></section>`;
    const rows = Array.isArray(f.rows) ? f.rows : [];
    const size = Math.max(1, Number(a.forecastPageSize) || 6);
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const page = Math.max(1, Math.min(pages, Number(a.forecastPage) || 1));
    if (a.forecastPage !== page) a.forecastPage = page;
    const visible = rows.slice((page - 1) * size, page * size);
    const moneyDelta = r => finiteLocal(r.periods?.at(-1)?.value) && finiteLocal(r.lastValue) ? r.periods.at(-1).value - r.lastValue : null;
    const pctDelta = r => finiteLocal(r.changeToHorizon) ? signedPct(r.changeToHorizon) : F().DASH;
    const confidenceLabel = r => r.confidence === 'high' ? 'Alta' : r.confidence === 'medium' ? 'Media' : 'Baja';
    const confidenceClass = r => r.confidence === 'high' ? 'is-high' : r.confidence === 'medium' ? 'is-medium' : 'is-low';
    const patternLabel = r => r.directionReading || 'Sin dirección dominante';
    const card = r => `<article class="forecast-card">
      <div class="forecast-card__top"><div><span class="forecast-card__entity" title="${esc(r.entity)}">${esc(r.entity)}</span><span class="forecast-card__direction">${esc(patternLabel(r))}</span></div><span class="forecast-confidence ${confidenceClass(r)}">${confidenceLabel(r)} · ${r.confidenceScore || 0}/100</span></div>
      <div class="forecast-card__metrics"><div><span>Venta actual</span><strong>${money(r.lastValue)}</strong></div><div><span>Proyección final</span><strong>${money(r.periods?.at(-1)?.value)}</strong></div><div><span>Cambio proyectado</span><strong>${pctDelta(r)}</strong><small>${money(moneyDelta(r))}</small></div><div><span>Piezas actuales</span><strong>${finiteLocal(r.latestUnits) ? F().integer(r.latestUnits) : '—'}</strong></div><div><span>Piezas proyectadas</span><strong>${finiteLocal(r.forecastUnits) ? F().integer(r.forecastUnits) : '—'}</strong></div><div><span>Duración</span><strong>${r.patternDurationPeriods || 0} períodos</strong><small>desde ${esc(r.patternStartPeriod || '—')}</small></div></div>
      <div class="forecast-card__evidence"><div><strong>Modelo:</strong> ${esc(r.method)} · <strong>Historial:</strong> ${r.historyPoints} períodos · <strong>Horizonte:</strong> ${r.horizon}</div><div><strong>Backtesting:</strong> ${r.backtest?.periodsTested ? `${r.backtest.periodsTested} períodos · error ${r.backtest.mape != null ? (r.backtest.mape*100).toFixed(1)+'%' : '—'}` : 'historia insuficiente'}</div></div>
      <p class="forecast-card__reading"><strong>Lectura:</strong> ${esc(patternLabel(r))}. La proyección supone que la dinámica histórica utilizada por el modelo continúa; no es una garantía ni una causa.</p>
    </article>`;
    return `<section class="panel panel--inner forecast-analysis-panel"><div class="panel__head"><div><span class="analysis-layer-label">PROYECCIÓN</span><h3 class="panel__title">Forecast de tendencias</h3><p class="panel__desc">Proyecta la trayectoria histórica y prioriza primero las entidades con mayor confiabilidad. Después puedes recorrer todo el universo mediante paginación.</p></div></div><div class="panel__body">
      <div class="forecast-start"><div><span class="advanced-start__eyebrow">Empieza aquí</span><h4>Primero revisa las proyecciones más confiables</h4><p>El orden prioriza <strong>confiabilidad</strong>; en empates usa impacto proyectado, duración y consistencia. Confianza no significa probabilidad de que ocurra: describe qué tan sólida es la evidencia histórica para este modelo.</p></div><div class="advanced-start__steps"><span><b>1</b> Confianza</span><span><b>2</b> Impacto</span><span><b>3</b> Duración</span><span><b>4</b> Proyección</span></div></div>
      <div class="metric-grid forecast-kpis"><div class="metric"><span>Entidades proyectables</span><strong>${rows.length}</strong></div><div class="metric"><span>Alta confianza</span><strong>${f.highConfidence || 0}</strong></div><div class="metric"><span>Media / baja</span><strong>${(f.mediumConfidence || 0)} / ${(f.lowConfidence || 0)}</strong></div><div class="metric"><span>Crecen / caen</span><strong>${f.growth || 0} / ${f.decline || 0}</strong></div></div>
      <div class="forecast-controls"><div><span>Horizonte</span><div class="btn-row"><button type="button" class="btn btn--small ${a.forecastHorizon===3?'is-active':''}" data-action="an-forecast-horizon" data-value="3">3 períodos</button><button type="button" class="btn btn--small ${a.forecastHorizon===6?'is-active':''}" data-action="an-forecast-horizon" data-value="6">6 períodos</button><button type="button" class="btn btn--small ${a.forecastHorizon===12?'is-active':''}" data-action="an-forecast-horizon" data-value="12">12 períodos</button></div></div><label class="field">Método<select data-action="an-forecast-method"><option value="linear" ${a.forecastMethod==='linear'?'selected':''}>Tendencia lineal</option><option value="average" ${a.forecastMethod==='average'?'selected':''}>Promedio reciente</option><option value="ensemble" ${a.forecastMethod==='ensemble'?'selected':''}>Ensemble</option></select></label></div>
      <div class="forecast-list">${visible.map(card).join('')}</div>
      <div class="pager forecast-pager" aria-label="Paginación de Forecast"><span>${F().integer((page-1)*size+1)}–${F().integer(Math.min(page*size,rows.length))} de ${F().integer(rows.length)} entidades</span><div class="btn-row"><button type="button" class="btn btn--small" data-action="an-forecast-page" data-value="${page-1}" ${page<=1?'disabled':''}>Anterior</button><span class="num">Página ${page} de ${pages}</span><button type="button" class="btn btn--small" data-action="an-forecast-page" data-value="${page+1}" ${page>=pages?'disabled':''}>Siguiente</button></div></div>
      <details class="disclosure"><summary>¿Cómo se calcula y cómo debe interpretarse?</summary><div class="panel__body"><p class="field__hint">El motor puede usar tendencia lineal, promedio reciente o ensemble. Evalúa retrospectivamente algunos períodos mediante backtesting cuando existe historia suficiente. La confianza combina historial, consistencia, variabilidad y error observado en ese backtest.</p><p class="field__hint"><strong>Dirección:</strong> no significa solo “crece” o “cae”. Indica si la tendencia es sostenida, acelerada, desacelerándose, recuperándose, volátil o estable, y desde hace cuántos períodos.</p><p class="field__hint"><strong>Dinero y piezas:</strong> la venta se proyecta en dinero; cuando existen unidades históricas suficientes también se muestra su trayectoria para evitar confundir crecimiento monetario con crecimiento de piezas.</p><p class="field__hint"><strong>Importante:</strong> los límites de la proyección representan variabilidad histórica y no son intervalos de confianza estadísticos. La proyección no demuestra causalidad y puede cambiar ante una ruptura de tendencia, cambio de precio, disponibilidad, promociones u otros factores no observados.</p></div></details>
    </div></section>`;
  }
  function finiteLocal(v){ return typeof v==='number' && Number.isFinite(v); }


  function shareMixPanel(a) {
    const sh = a.share;
    const visible = new Set((a._filteredRows || a.rows || []).map(r => r.entity));
    if (!sh || !sh.rows || !sh.rows.length) return `<section class="panel panel--inner"><div class="panel__head"><div><span class="analysis-layer-label">DRIVER</span><h3 class="panel__title">Mix Intelligence</h3><p class="panel__desc">No hay suficiente histórico comparable para calcular participación.</p></div></div></section>`;
    const scoped = (sh.rows || []).filter(r => visible.has(r.entity));
    const topG = scoped.filter(r => r.status === 'gaining').sort((a,b)=>b.shareChangePp-a.shareChangePp).slice(0, 5);
    const topL = scoped.filter(r => r.status === 'losing').sort((a,b)=>a.shareChangePp-b.shareChangePp).slice(0, 5);
    const delta=(r)=>(r.currentValue||0)-(r.baselineValue||0);
    const pct=(r)=>r.baselineValue!==0?delta(r)/r.baselineValue:null;
    const card=(r,type,i)=>`<article class="mix-card mix-card--${type}">
      <div class="mix-card__top"><span class="mix-rank">${i+1}</span><strong title="${esc(r.entity)}">${esc(r.entity)}</strong><span>${type==='gain'?'🟢 Gana share':'🔴 Pierde share'}</span></div>
      <div class="mix-card__share"><div><span>Participación</span><strong>${signedPct(r.baselineShare)} → ${signedPct(r.currentShare)}</strong></div><div><span>Cambio de mix</span><strong>${r.shareChangePp>=0?'+':''}${r.shareChangePp.toFixed(1)} pp</strong></div><div><span>Ranking</span><strong>${r.rankBaseline||'—'} → ${r.rankCurrent||'—'}</strong></div></div>
      <div class="mix-card__values"><div><span>Venta base → actual</span><strong>${money(r.baselineValue)} → ${money(r.currentValue)}</strong></div><div><span>Cambio $</span><strong>${money(delta(r))}</strong></div><div><span>Cambio %</span><strong>${signedPct(pct(r))}</strong></div></div>
      <div class="mix-card__meta"><span>Ranking <b>${r.rankBaseline||'—'} → ${r.rankCurrent||'—'}</b></span><span>Período <b>${esc(sh.baselinePeriod||'—')} → ${esc(sh.currentPeriod||'—')}</b></span></div>
    </article>`;
    const cards=(arr,type)=>arr.length?`<div class="mix-card-list">${arr.map((r,i)=>card(r,type,i)).join('')}</div>`:'<p class="field__hint">No hay cambios significativos de participación en el filtro actual.</p>';
    return `<section class="panel panel--inner mix-intelligence-panel"><div class="panel__head"><div><span class="analysis-layer-label">DRIVER</span><h3 class="panel__title">Mix Intelligence</h3><p class="panel__desc">Explica <strong>cómo cambió la composición</strong> entre períodos comparables. El foco aquí es participación, posición y concentración; el dinero queda como contexto.</p></div></div><div class="panel__body">
      <div class="mix-comparison"><span>Comparación</span><strong>${esc(sh.comparisonLabel||'Períodos comparables')}</strong><span>HHI actual: <b>${(sh.hhi||0).toFixed(3)}</b></span></div>
      <div class="metric-grid"><div class="metric"><span>Ganadores de share</span><strong>${scoped.filter(r=>r.status==='gaining').length}</strong><small>suben participación</small></div><div class="metric"><span>Perdedores de share</span><strong>${scoped.filter(r=>r.status==='losing').length}</strong><small>bajan participación</small></div><div class="metric"><span>Nuevos</span><strong>${scoped.filter(r=>r.status==='new').length}</strong><small>sin venta base</small></div><div class="metric"><span>Perdidos</span><strong>${scoped.filter(r=>r.status==='lost').length}</strong><small>sin venta actual</small></div><div class="metric"><span>Estables</span><strong>${scoped.filter(r=>r.status==='stable').length}</strong><small>share casi igual</small></div></div>
      <div class="grid-2 mix-groups"><div><div class="mix-section-head"><div><span class="analysis-layer-label">COMPOSICIÓN ↑</span><h4>Quién gana participación</h4></div><span>Orden: Δ pp</span></div>${cards(topG,'gain')}</div><div><div class="mix-section-head"><div><span class="analysis-layer-label">COMPOSICIÓN ↓</span><h4>Quién pierde participación</h4></div><span>Orden: Δ pp</span></div>${cards(topL,'loss')}</div></div>
      <details class="disclosure"><summary>Ver mix completo</summary><div class="panel__body"><p class="field__hint">La primera lectura ordena por cambio de participación (puntos porcentuales). El dinero y el crecimiento quedan visibles para evitar confundir una gran ganancia de share de una entidad pequeña con el mayor impacto económico.</p><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th class="num">Base → actual</th><th class="num">Cambio $</th><th class="num">Cambio %</th><th class="num">Share base → actual</th><th class="num">Δ pp</th><th>Ranking</th></tr></thead><tbody>${[...scoped].sort((x,y)=>Math.abs(y.shareChangePp)-Math.abs(x.shareChangePp)).slice(0,50).map(r=>`<tr><th scope="row">${esc(r.entity)}</th><td class="num">${money(r.baselineValue)} → ${money(r.currentValue)}</td><td class="num">${money(delta(r))}</td><td class="num">${signedPct(pct(r))}</td><td class="num">${signedPct(r.baselineShare)} → ${signedPct(r.currentShare)}</td><td class="num">${r.shareChangePp>=0?'+':''}${r.shareChangePp.toFixed(1)} pp</td><td>${r.rankBaseline||'—'} → ${r.rankCurrent||'—'}</td></tr>`).join('')}</tbody></table></div></div></details>
    </div></section>`;
  }
  function cohortPanel(a) {
    const c = a.cohort;
    const visible = new Set((a._filteredRows || a.rows || []).map(r=>r.entity));
    if (!c || c.status !== 'available' || !c.rows.length) return `<section class="panel panel--inner"><div class="panel__head"><div><h3 class="panel__title">Cohortes</h3><p class="panel__desc">No hay suficiente actividad histórica para construir cohortes de entidades.</p></div></div></section>`;
    const levelLabel = LEVEL[a.level] || 'Entidad';
    const pct = (v) => typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(1)} %` : F().DASH;
    const count = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
    const age1 = pct(c.summary.retentionAge1), age3 = pct(c.summary.retentionAge3);
    const rows = c.rows.slice().reverse().slice(0, 12);
    const cell = (r, age) => { const x = r.cells.find((z) => z.age === age); return x ? `<td class="num">${pct(x.retention)}</td>` : '<td class="num">—</td>'; };
    const s = c.summary;
    return `<section class="panel panel--inner trend-cohorts">
      <div class="panel__head"><div><h3 class="panel__title">Cohortes y ciclo de vida</h3><p class="panel__desc">Agrupa ${esc(levelLabel.toLowerCase())}es por su primer período activo y, además, identifica qué pasó en el último período completo comparable. Esto mide <strong>retención de entidades/productos</strong>, no retención de clientes.</p></div></div>
      <div class="panel__body">
        <div class="metric-grid">
          <div class="metric"><span>Cohortes</span><strong>${c.cohortCount}</strong></div>
          <div class="metric"><span>Entidades en cohortes</span><strong>${c.entityCount}</strong></div>
          <div class="metric"><span>Retención mes 1 · promedio</span><strong>${age1}</strong></div>
          <div class="metric"><span>Retención mes 3 · promedio</span><strong>${age3}</strong></div>
        </div>
        <div class="metric-grid lifecycle-metrics">
          <div class="metric"><span>🆕 Nuevos</span><strong>${count(s.newCount)}</strong><small>primera actividad en el último período</small></div>
          <div class="metric"><span>🔁 Retenidos</span><strong>${count(s.retainedCount)}</strong><small>activos en períodos consecutivos</small></div>
          <div class="metric"><span>↩ Reactivados</span><strong>${count(s.reactivatedCount)}</strong><small>volvieron después de una pausa</small></div>
          <div class="metric"><span>⚠ Perdidos</span><strong>${count(s.lostCount)}</strong><small>activos antes, inactivos en el último período</small></div>
        </div>
        <div class="cohort-help">
          <h4>¿Cómo leer el ciclo de vida?</h4>
          <div class="grid-2">
            <p><strong>Nuevo:</strong> aparece por primera vez dentro de la ventana analizada. No significa necesariamente que el producto sea nuevo en el negocio.</p>
            <p><strong>Retenido:</strong> tuvo actividad en el período anterior y también en el último. Es la señal más directa de continuidad.</p>
            <p><strong>Reactivado:</strong> vuelve a registrar actividad después de al menos un período sin actividad. No se cuenta como nuevo.</p>
            <p><strong>Perdido:</strong> tenía actividad en el período anterior y no la tiene en el último período completo. No implica automáticamente baja definitiva.</p>
          </div>
          <p class="field__hint">Comparación: <strong>${esc(c.lifecycle.previousPeriod || '—')} → ${esc(c.lifecycle.latestPeriod || '—')}</strong>. Si la fuente tiene huecos de medición, “perdido” debe interpretarse como pérdida de actividad observada, no como churn definitivo.</p>
        </div>
        <div class="table-wrap"><table class="table ds-table"><thead><tr><th>Cohorte</th><th class="num">Tamaño</th><th class="num">Mes 0</th><th class="num">Mes 1</th><th class="num">Mes 2</th><th class="num">Mes 3</th><th>Último período</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.cohortPeriod)}</th><td class="num">${r.size}</td><td class="num">100.0 %</td>${cell(r,1)}${cell(r,2)}${cell(r,3)}<td class="num">${r.latest ? pct(r.latest.retention) : '—'}</td></tr>`).join('')}</tbody></table></div>
        <p class="field__hint">La cohorte se determina por el primer período con actividad observado en esta ventana (${esc(c.firstPeriod || '—')} → ${esc(c.latestPeriod || '—')}). Los porcentajes de retención muestran qué proporción de esa cohorte vuelve a tener actividad en cada edad.</p>
      </div>
    </section>`;
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
    return `<section class="panel panel--inner analysis-narrative-panel"><div class="panel__head"><div><h3 class="panel__title">Lectura ejecutiva del análisis</h3><p class="panel__desc">Integra las seis capas en orden: HECHO → DRIVER → SEÑAL → HIPÓTESIS → PROYECCIÓN → CICLO DE VIDA. No agrega cifras ni convierte señales en causas.</p></div></div><div class="panel__body"><div class="narrative-layer-grid">${layerCards}</div><p class="narrative-summary">${esc(text)}</p><div class="narrative-block">${detail}</div><div class="narrative-next"><strong>Siguiente pregunta analítica</strong><span>${esc(n.nextQuestion||'Contrastar la señal con evidencia adicional.')}</span></div><div class="btn-row"><button type="button" class="btn btn--small" data-action="an-ai" ${busy?'disabled':''}>${busy?'Redactando…':'Redactar con Cohere (opcional)'}</button></div>${error}<p class="field__hint">Cohere reutiliza la conexión configurada en Ajustes y solo redacta resultados ya calculados.</p></div></section>`;
  }

  function render(state) {
    const a = state.an;
    const filteredRows = (a.rows || []).filter((r) => {
      if (a.pattern !== 'all' && r.pattern !== a.pattern) return false;
      if (a.signal !== 'all' && !(r.advanced && r.advanced.signal === a.signal)) return false;
      if (a.anomalyDirection !== 'all' && !(r.anomaly && r.anomaly.direction === a.anomalyDirection)) return false;
      if (a.entityQuery && !String(r.entity || '').toLowerCase().includes(String(a.entityQuery).toLowerCase())) return false;
      if (a.minImpact > 0 && Math.abs(r.recentAbsoluteChange || 0) < a.minImpact) return false;
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
    const sh=a.share||{}; const tm=a.temporal||{}; const cur=typeof tm.currentTotal==='number'?tm.currentTotal:(typeof sh.currentTotal==='number'?sh.currentTotal:null), base=typeof sh.baselineTotal==='number'?sh.baselineTotal:null, delta=cur!==null&&base!==null?cur-base:null, deltaPct=delta!==null&&base!==0?delta/base:null;
    const anomalyCount=filteredRows.filter(r=>r.anomaly).length;
    a._filteredRows = filteredRows;
    el.innerHTML = `${analysisMapPanel()}${filters(state)}
      <div class="metric-grid trend-kpis">
        <div class="metric"><span>Venta actual <small>${esc(tm.focus?.label || sh.currentPeriod || '—')}</small></span><strong>${money(cur)}</strong></div>
        <div class="metric"><span>Venta comparable <small>${esc(sh.baselinePeriod || '—')}</small></span><strong>${money(base)}</strong></div>
        <div class="metric"><span>Cambio $</span><strong>${money(delta)}</strong></div>
        <div class="metric"><span>Cambio %</span><strong>${signedPct(deltaPct)}</strong></div>
        <div class="metric"><span>Entidades visibles</span><strong>${total} / ${allTotal}</strong></div>
        <div class="metric"><span>Crecen / caen</span><strong>${growth} / ${decline}</strong></div>
        <div class="metric"><span>Anomalías visibles</span><strong>${anomalyCount}</strong></div>
        <div class="metric"><span>Patrones</span><strong>${new Set(filteredRows.map((r) => r.pattern)).size}</strong></div>
      </div>
      ${total ? `<div class="table-wrap trend-table-wrap" id="an-trend-table"><table class="table ds-table trend-table"><thead><tr><th>Entidad</th><th>Patrón / inicio</th><th class="num">Actual $</th><th class="num">Cambio $</th><th class="num">Cambio %</th><th class="num">Acumulado</th><th>Duración</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row"><div class="entity-cell"><span>${esc(r.entity)}</span><button type="button" class="btn btn--small btn--ghost" data-action="an-select" data-entity="${esc(r.entity)}" aria-label="Leer entidad ${esc(r.entity)}">Leer</button></div></th><td>${pill(r.pattern)}<span class="cell-sub">Inicio ${esc(r.startPeriod || F().DASH)}</span></td><td class="num">${money(r.currentValue)}</td><td class="num">${money(r.recentAbsoluteChange)}</td><td class="num">${signedPct(r.percentageChange)}</td><td class="num">${signedPct(r.cumulativeChange)}</td><td>${r.consecutivePeriods || 0} períodos</td></tr>`).join('')}</tbody></table></div><div class="pager trend-pager" aria-label="Paginación de evolución y patrones"><span>${F().integer((page - 1) * pageSize + 1)}–${F().integer(Math.min(page * pageSize, filteredRows.length))} de ${F().integer(filteredRows.length)} entidades</span><div class="btn-row"><button type="button" class="btn btn--small" data-action="an-page" data-value="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button><span class="num" aria-current="page">Página ${page} de ${pageCount}</span><button type="button" class="btn btn--small" data-action="an-page" data-value="${page + 1}" ${page >= pageCount ? 'disabled' : ''}>Siguiente</button></div></div>` : `<div class="empty"><strong>No hay suficiente historia</strong>Se necesitan al menos ${FP.trendEngine.DEFAULTS.minPeriods} períodos con datos para clasificar una entidad.</div>`}
      <section class="panel panel--inner entity-reading-panel" id="an-entity-reading"><div class="panel__head"><div><h3 class="panel__title">Lectura de la entidad</h3><p class="panel__desc">Aquí conviertes la señal en comprensión: trayectoria, crecimiento por fecha/período, evidencia y siguiente paso.</p></div>${a.selected ? '<button type="button" class="btn btn--small btn--ghost" data-action="an-clear-selection">Cerrar lectura</button>' : ''}</div><div class="panel__body">${selectedCard(a)}</div></section>
      ${shareMixPanel(a)}
      ${priorityPanel(a)}
      ${forecastPanel(a)}
      ${cohortPanel(a)}
      ${narrativePanel(a)}${analysisAssistant(a)}`;
  }
  FP.trendView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
