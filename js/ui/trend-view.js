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
  function pill(pattern) { const [kind, label] = PATTERN[pattern] || ['na', pattern || 'Sin clasificar']; return `<span class="pill pill--${kind}">${esc(label)}</span>`; }
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
    const patterns = [['all', 'Todos'], ...Object.entries(PATTERN).map(([k, v]) => [k, v[1]])];
    return `<div class="settings-grid">
      <div class="field"><label for="an-level">Analizar por</label><select id="an-level" data-action="an-level">${levels.map(([v, l]) => `<option value="${v}" ${v === a.level ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><span class="field__hint">La misma lógica puede recorrer productos, categorías, estados o sucursales.</span></div>
      <div class="field"><span class="field__hint">Historia</span><div class="segmented" role="group">${[6, 12, 18, 24].map((n) => `<button type="button" data-action="an-months" data-value="${n}" aria-pressed="${n === a.months}">${n} meses</button>`).join('')}</div></div>
      <div class="field"><label for="an-pattern">Patrón</label><select id="an-pattern" data-action="an-pattern">${patterns.map(([v, l]) => `<option value="${v}" ${v === a.pattern ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    </div>`;
  }
  function advancedPanel(a) {
    const rows = (a.advanced || []).slice().sort((x, y) => (y.score || 0) - (x.score || 0)).slice(0, 12);
    const groups = a.groups || [];
    const label = (x) => ({ critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo' }[x] || x);
    const signal = (x) => ({ structural_decline: 'Deterioro estructural', structural_growth: 'Crecimiento estructural', early_warning: 'Alerta temprana', trend_break: 'Ruptura de tendencia', recovery: 'Recuperación', anomaly: 'Anomalía', normal: 'Sin señal avanzada' }[x] || x);
    return `<section class="panel panel--inner trend-advanced"><div class="panel__head"><div><h3 class="panel__title">Patrones avanzados</h3><p class="panel__desc">Prioriza persistencia, magnitud, aceleración y cambios de régimen. No determina causas.</p></div></div><div class="panel__body">
      <div class="metric-grid">
        <div class="metric"><span>Señales avanzadas</span><strong>${rows.filter((x) => x.signal !== 'normal').length}</strong></div>
        <div class="metric"><span>Deterioros estructurales</span><strong>${rows.filter((x) => x.signal === 'structural_decline').length}</strong></div>
        <div class="metric"><span>Alertas tempranas</span><strong>${rows.filter((x) => x.earlyWarning).length}</strong></div>
        <div class="metric"><span>Rupturas</span><strong>${rows.filter((x) => x.signal === 'trend_break').length}</strong></div>
      </div>
      ${groups.length ? `<div class="trend-groups"><h4>Concentración de patrones</h4><div class="chip-list">${groups.slice(0, 8).map((g) => `<span class="pill pill--na">${esc(signal(g.signal))}: ${g.count}</span>`).join('')}</div></div>` : ''}
      ${rows.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th>Señal</th><th>Severidad</th><th>Score</th><th>Persistencia</th><th>Rupturas</th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.entity)}</th><td>${esc(signal(r.signal))}</td><td>${esc(label(r.severity))}</td><td class="num">${r.score}</td><td class="num">${r.persistence}</td><td class="num">${r.regimeChanges}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>No hay señales avanzadas</strong>Se requieren suficientes períodos para detectar persistencia o cambios de régimen.</div>'}
      <p class="field__hint">El score es un índice de priorización relativo; no es probabilidad ni causalidad.</p>
    </div></section>`;
  }

  function contributionPanel(a) {
    const c = a.contribution;
    if (!c || c.status !== 'available') return `<section class="panel panel--inner"><div class="panel__head"><div><h3 class="panel__title">Contribución y origen</h3><p class="panel__desc">No hay suficientes valores comparables para determinar qué entidades explican el movimiento.</p></div></div></section>`;
    const list = (c.direction === 'decline' ? c.negative : c.positive).slice(0, 8);
    const opposite = c.direction === 'decline' ? c.positive : c.negative;
    const fmtDelta = (v) => money(v);
    const row = (r) => `<tr><th scope="row">${esc(r.entity)}</th><td class="num">${fmtDelta(r.delta)}</td><td class="num">${r.contributionPct === null ? F().DASH : `${(r.contributionPct * 100).toFixed(1)} %`}</td><td class="num">${r.movementShare === null ? F().DASH : `${(r.movementShare * 100).toFixed(1)} %`}</td></tr>`;
    const label = c.direction === 'decline' ? 'explican el deterioro' : 'explican el crecimiento';
    return `<section class="panel panel--inner contribution-panel"><div class="panel__head"><div><h3 class="panel__title">Contribución y origen</h3><p class="panel__desc">Identifica qué entidades explican el movimiento observado. Es atribución descriptiva, no causalidad.</p></div></div><div class="panel__body">
      <div class="metric-grid"><div class="metric"><span>Movimiento total</span><strong>${fmtDelta(c.totalDelta)}</strong></div><div class="metric"><span>Principales contribuyentes</span><strong>${list.length}</strong></div><div class="metric"><span>Concentración 80%</span><strong>${c.direction === 'decline' ? (c.concentration.negative.topN || 0) : (c.concentration.positive.topN || 0)} entidades</strong></div><div class="metric"><span>Compensación opuesta</span><strong>${fmtDelta(opposite.reduce((s,r)=>s+r.delta,0))}</strong></div></div>
      ${list.length ? `<p class="note"><strong>Lectura:</strong> ${list.slice(0,3).map(r => esc(r.entity)).join(', ')} ${label}; revisa primero estas entidades porque concentran la mayor parte del movimiento.</p><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th class="num">Cambio</th><th class="num">Contribución</th><th class="num">Participación del movimiento</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>` : '<div class="empty"><strong>Sin contribuyentes</strong>No hay movimiento significativo que atribuir.</div>'}
      <details class="disclosure"><summary>Ver evidencia y compensación</summary><div class="panel__body"><p class="field__hint">Entidades analizadas: ${c.evidence.entities.length}. Cambio positivo total: ${fmtDelta(c.compensation.positiveDelta)}. Cambio negativo total: ${fmtDelta(c.compensation.negativeDelta)}.</p></div></details>
    </div></section>`;
  }

  function riskPanel(a) {
    const r=a.risks;
    if(!r || r.status!=='available') return '';
    const label={critical:'Crítico',high:'Alto',medium:'Medio',low:'Bajo'};
    const item=x=>`<tr><th scope="row">${esc(x.entity)}</th><td>${esc(x.pattern||F().DASH)}</td><td>${esc(label[x.severity]||x.severity)}</td><td class="num">${x.score}</td><td class="num">${x.consecutivePeriods}</td><td class="num">${finite(x.shareChangePp)?(x.shareChangePp>0?'+':'')+x.shareChangePp.toFixed(1)+' pp':F().DASH}</td></tr>`;
    const finite=v=>typeof v==='number'&&Number.isFinite(v);
    const table=(arr)=>arr.length?`<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th>Patrón</th><th>Prioridad</th><th class="num">Score</th><th class="num">Persistencia</th><th class="num">Share</th></tr></thead><tbody>${arr.slice(0,6).map(item).join('')}</tbody></table></div>`:'<p class="field__hint">No hay elementos con evidencia suficiente.</p>';
    return `<section class="panel panel--inner risk-opportunity-panel"><div class="panel__head"><div><h3 class="panel__title">Riesgos y oportunidades</h3><p class="panel__desc">Prioriza qué investigar primero combinando magnitud, persistencia, patrón, aceleración y participación. No determina causalidad.</p></div></div><div class="panel__body"><div class="metric-grid"><div class="metric"><span>Riesgos</span><strong>${r.risks.length}</strong></div><div class="metric"><span>Oportunidades</span><strong>${r.opportunities.length}</strong></div><div class="metric"><span>En observación</span><strong>${r.watch.length}</strong></div><div class="metric"><span>Prioridad crítica</span><strong>${r.all.filter(x=>x.severity==='critical').length}</strong></div></div><div class="grid-2"><div><h4>🔴 Riesgos prioritarios</h4>${table(r.risks)}</div><div><h4>🟢 Oportunidades prioritarias</h4>${table(r.opportunities)}</div></div><details class="disclosure"><summary>Ver metodología</summary><div class="panel__body"><p class="field__hint">${esc(r.methodology)}</p><p class="field__hint">La prioridad ayuda a ordenar la investigación; no significa que el elemento sea la causa del resultado.</p></div></details></div></section>`;
  }

  function forecastPanel(a) {
    const f=a.forecast;
    if (!f || f.status!=='available') return `<section class="panel panel--inner"><div class="panel__head"><div><h3 class="panel__title">Forecast de tendencias</h3><p class="panel__desc">Se necesitan al menos ${FP.trendForecastEngine ? FP.trendForecastEngine.DEFAULTS.minPoints : 4} observaciones históricas comparables.</p></div></div></section>`;
    const fmt=v=>money(v), pct=v=>typeof v==='number'&&Number.isFinite(v)?(v>=0?'+':'')+(v*100).toFixed(1)+' %':F().DASH;
    const top=f.rows.slice(0,8), direction=x=>x.changeToHorizon>0?'Crecimiento':x.changeToHorizon<0?'Deterioro':'Estable';
    return `<section class="panel panel--inner trend-forecast-panel"><div class="panel__head"><div><h3 class="panel__title">Forecast de tendencias</h3><p class="panel__desc">Proyecta la trayectoria histórica para anticipar dirección y magnitud esperada. No usa plan ni afirma causalidad.</p></div></div><div class="panel__body">
      <div class="settings-grid"><div class="field"><span class="field__hint">Horizonte</span><div class="segmented" role="group">${[3,6,12].map(n=>`<button type="button" data-action="an-forecast-horizon" data-value="${n}" aria-pressed="${n===a.forecastHorizon}">${n} meses</button>`).join('')}</div></div><div class="field"><label for="an-forecast-method">Método</label><select id="an-forecast-method" data-action="an-forecast-method"><option value="linear" ${a.forecastMethod==='linear'?'selected':''}>Tendencia lineal</option><option value="average" ${a.forecastMethod==='average'?'selected':''}>Promedio reciente</option><option value="ensemble" ${a.forecastMethod==='ensemble'?'selected':''}>Combinado</option></select><span class="field__hint">El método combinado promedia tendencia lineal y promedio reciente.</span></div></div>
      <div class="metric-grid"><div class="metric"><span>Entidades proyectadas</span><strong>${f.rows.length}</strong></div><div class="metric"><span>Con crecimiento</span><strong>${f.growth}</strong></div><div class="metric"><span>Con deterioro</span><strong>${f.decline}</strong></div><div class="metric"><span>Horizonte</span><strong>${f.horizon} meses</strong></div></div>
      ${top.length?`<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th>Dirección</th><th class="num">Último</th><th class="num">Proyección</th><th class="num">Cambio</th><th>Confianza</th></tr></thead><tbody>${top.map(r=>`<tr><th scope="row">${esc(r.entity)}</th><td>${direction(r)}</td><td class="num">${fmt(r.lastValue)}</td><td class="num">${fmt(r.periods[r.periods.length-1]?.value)}</td><td class="num">${pct(r.changeToHorizon)}</td><td>${esc(r.confidence)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><strong>No hay proyecciones</strong>Se requiere historia suficiente.</div>'}
      <details class="disclosure"><summary>Ver metodología y supuestos</summary><div class="panel__body"><p class="field__hint">${esc(f.methodology)}</p><p class="field__hint">Las proyecciones se calculan por entidad desde su propia serie. Los límites bajo/alto reflejan variabilidad histórica cuando puede estimarse; no son una probabilidad de resultado.</p></div></details>
    </div></section>`;
  }

  function selectedCard(a) {
    const r = a.selected;
    if (!r) return '<div class="empty"><strong>Selecciona una entidad</strong>Elige una fila para ver su trayectoria histórica y la evidencia del patrón.</div>';
    const cls = PATTERN[r.pattern] || ['na', r.pattern];
    return `<div class="trend-detail">
      <div class="trend-detail__head"><div><span class="field__hint">${esc(LEVEL[a.level] || a.level)}</span><h3>${esc(r.entity)}</h3></div>${pill(r.pattern)}</div>
      <div class="metric-grid">
        <div class="metric"><span>Desde</span><strong>${esc(r.startPeriod || F().DASH)}</strong></div>
        <div class="metric"><span>Duración</span><strong>${r.consecutivePeriods || 0} períodos</strong></div>
        <div class="metric"><span>Cambio acumulado</span><strong>${signedPct(r.cumulativeChange)}</strong></div>
        <div class="metric"><span>Velocidad</span><strong>${typeof r.slope === 'number' ? money(r.slope) + '/periodo' : F().DASH}</strong></div>
        <div class="metric"><span>Punto de inflexión</span><strong>${esc(r.turningPoint || F().DASH)}</strong></div>
        <div class="metric"><span>Confianza</span><strong>${esc(r.confidence)}</strong></div>
      </div>
      <div class="trend-detail__chart">${spark(r.series)}</div>
      <p class="note ${cls[0] === 'error' ? 'note--warning' : ''}"><strong>Lectura:</strong> ${esc(explanation(r))}</p>
      ${r.anomaly ? `<p class="note note--warning">El último movimiento se comporta como anomalía estadística respecto de los cambios previos (z=${r.anomaly.z.toFixed(1)}). Es una señal para investigar, no una causa.</p>` : ''}
      <details class="disclosure"><summary>Ver evidencia</summary><div class="panel__body"><p class="field__hint">Períodos: ${esc(r.evidence.periods.join(', '))}</p><p class="field__hint">Cambios: ${r.evidence.changes.map((x) => typeof x === 'number' ? signedPct(x) : 's/d').join(' · ')}</p></div></details>
    </div>`;
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
  function shareMixPanel(a) {
    const sh = a.share;
    if (!sh || !sh.rows || !sh.rows.length) return `<section class="panel panel--inner"><div class="panel__head"><div><h3 class="panel__title">Share & Mix</h3><p class="panel__desc">No hay suficiente histórico comparable para calcular participación.</p></div></div></section>`;
    const topG = sh.winners.slice(0, 5), topL = sh.losers.slice(0, 5);
    const row = (r) => `<tr><th scope="row">${esc(r.entity)}</th><td class="num">${signedPct(r.baselineShare)}</td><td class="num">${signedPct(r.currentShare)}</td><td class="num">${r.shareChangePp > 0 ? '+' : ''}${r.shareChangePp.toFixed(1)} pp</td><td>${r.rankBaseline || F().DASH} → ${r.rankCurrent || F().DASH}</td></tr>`;
    return `<section class="panel panel--inner"><div class="panel__head"><div><h3 class="panel__title">Share & Mix Intelligence</h3><p class="panel__desc">Mide cómo cambió la participación de cada entidad dentro del total de su dimensión. Un cambio de share no implica causalidad.</p></div></div><div class="panel__body"><div class="metric-grid"><div class="metric"><span>Ganadores de share</span><strong>${sh.winners.length}</strong></div><div class="metric"><span>Perdedores de share</span><strong>${sh.losers.length}</strong></div><div class="metric"><span>Concentración HHI</span><strong>${(sh.hhi || 0).toFixed(3)}</strong></div><div class="metric"><span>Concentración</span><strong>${esc(sh.concentration)}</strong></div></div><div class="grid-2"><div><h4>Quién gana participación</h4>${topG.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th class="num">Base</th><th class="num">Actual</th><th class="num">Cambio</th><th>Ranking</th></tr></thead><tbody>${topG.map(row).join('')}</tbody></table></div>` : '<p class="field__hint">No hay ganadores significativos.</p>'}</div><div><h4>Quién pierde participación</h4>${topL.length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th class="num">Base</th><th class="num">Actual</th><th class="num">Cambio</th><th>Ranking</th></tr></thead><tbody>${topL.map(row).join('')}</tbody></table></div>` : '<p class="field__hint">No hay perdedores significativos.</p>'}</div></div><details class="disclosure"><summary>Ver mix completo</summary><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th class="num">Share base</th><th class="num">Share actual</th><th class="num">Cambio pp</th><th>Ranking</th></tr></thead><tbody>${[...sh.rows].sort((x,y)=>Math.abs(y.shareChangePp)-Math.abs(x.shareChangePp)).slice(0,50).map(row).join('')}</tbody></table></div></details></div></section>`;
  }

  function narrativePanel(a) {
    const n=a.narrative, ai=a.ai||{};
    if(!n||!n.ready) return '';
    const claims=Object.values(n.sections||{}).flat().slice(0,8);
    const text=ai.status==='ok'&&ai.result&&ai.result.summary ? ai.result.summary : n.executiveSummary;
    const detail=ai.status==='ok'&&ai.result&&ai.result.narrative ? ai.result.narrative : claims.map(c=>`<strong>${esc(c.level)}</strong>: ${esc(c.text)}`).join('<br>');
    const busy=ai.status==='busy';
    const error=ai.status==='error' ? `<p class="field__hint">No se pudo usar Cohere: ${esc((ai.errors||[]).join(' '))}. Se conserva la narrativa determinística.</p>` : '';
    return `<section class="panel panel--inner analysis-narrative-panel"><div class="panel__head"><div><h3 class="panel__title">Narrativa analítica</h3><p class="panel__desc">Resume lo que ya calcularon Evolución, Patrones, Share & Mix, Contribución, Riesgos y Forecast. No agrega cifras ni convierte señales en causas.</p></div></div><div class="panel__body"><p class="narrative-summary">${esc(text)}</p><div class="narrative-block"><p>${detail}</p></div><div class="btn-row"><button type="button" class="btn btn--small" data-action="an-ai" ${busy?'disabled':''}>${busy?'Redactando…':'Redactar con Cohere (opcional)'}</button></div>${error}<p class="field__hint">Cohere reutiliza la conexión configurada en Ajustes y solo redacta los resultados ya calculados.</p></div></section>`;
  }

  function render(state) {
    const a = state.an;
    const rows = (a.rows || []).filter((r) => a.pattern === 'all' || r.pattern === a.pattern).slice(0, 100);
    const el = $('an-content'); if (!el) return;
    if (!FP.productStore || !FP.productStore.available()) {
      el.innerHTML = `<div class="empty"><strong>Faltan datos de productos</strong>Carga y guarda datos de productos para construir las series históricas de Evolución.</div>`; return;
    }
    if (a.loading && !a.rows.length) { el.innerHTML = `<div class="empty"><strong>Construyendo evolución histórica…</strong>Se están agregando los períodos desde IndexedDB. La interfaz seguirá disponible.</div>`; return; }
    if (a.error) { el.innerHTML = `<div class="empty empty--error"><strong>No se pudo calcular Evolución</strong>${esc(a.error)}</div>`; return; }
    const total = a.rows.length, growth = a.rows.filter((r) => r.direction === 'growth').length, decline = a.rows.filter((r) => r.direction === 'decline').length;
    el.innerHTML = `${filters(state)}
      <div class="metric-grid trend-kpis">
        <div class="metric"><span>Entidades analizadas</span><strong>${total}</strong></div>
        <div class="metric"><span>Con crecimiento</span><strong>${growth}</strong></div>
        <div class="metric"><span>Con deterioro</span><strong>${decline}</strong></div>
        <div class="metric"><span>Patrones detectados</span><strong>${new Set(a.rows.map((r) => r.pattern)).size}</strong></div>
      </div>
      ${total ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Entidad</th><th>Patrón</th><th>Desde</th><th>Duración</th><th class="num">Acumulado</th><th class="num">Cambio reciente</th><th>Evolución</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.entity)}</th><td>${pill(r.pattern)}</td><td>${esc(r.startPeriod || F().DASH)}</td><td>${r.consecutivePeriods || 0}</td><td class="num">${signedPct(r.cumulativeChange)}</td><td class="num">${signedPct(r.percentageChange)}</td><td>${spark(r.series)}</td><td><button type="button" class="btn btn--small" data-action="an-select" data-entity="${esc(r.entity)}">Ver evolución</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><strong>No hay suficiente historia</strong>Se necesitan al menos ${FP.trendEngine.DEFAULTS.minPeriods} períodos con datos para clasificar una entidad.</div>`}
      ${advancedPanel(a)}
      ${shareMixPanel(a)}
      ${contributionPanel(a)}
      ${riskPanel(a)}
      ${forecastPanel(a)}
      ${narrativePanel(a)}
      <section class="panel panel--inner"><div class="panel__head"><div><h3 class="panel__title">Lectura de la entidad</h3><p class="panel__desc">La explicación usa únicamente métricas y evidencia calculadas; todavía no intenta determinar causalidad.</p></div></div><div class="panel__body">${selectedCard(a)}</div></section>`;
  }
  FP.trendView = { render };
})(typeof window !== 'undefined' ? window : globalThis);
