/**
 * agent-panel.js — Panel de asistentes (módulo diferido «agentes»; se carga al abrir el panel o al contar el botón).
 *
 * Un solo panel con selector de agente. Fase 2: Analista de Números (historia del periodo + ruta de comprensión) y Auditor de Conversión
 * (embudo por producto) comparten la MISMA tarjeta de hallazgo; Arquitecto de Ofertas (Fase 4) aparece como «próximamente». El panel nunca
 * queda vacío ni inventa: siempre dice qué pasó y qué sigue.
 * Datos: FP.agents.runner.run → detectores (código) + IA opcional que ordena y redacta (agentRunner.js). La IA nunca calcula.
 * Eventos con data-ag (delegación propia): no usa el data-action de app.js.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const SPARK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1F5FE0" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/></svg>';
  const AGENT_IDS = ['analista', 'auditor'];
  const SECTIONS = [
    { id: 'cae', title: 'Qué se cae', empty: 'Nada relevante cae contra el plan ni contra el periodo anterior.' },
    { id: 'crece', title: 'Qué crece', empty: 'Nada crece lo suficiente para compensar lo que cae.' },
    { id: 'revisar', title: 'Dónde revisar primero', empty: 'No hay una pista clara adicional por ahora.' }
  ];

  const S = { open: false, agent: null, picked: false, aboutOpen: false, sugOpen: false, gateOpen: false, expanded: {}, runs: {}, busy: {}, tokens: {}, q: '', asks: {}, opener: null, panel: null,
    route: { key: null, cur: 1, open: {} } };

  const st = () => (FP.app && FP.app.state) || null;
  const reg = () => FP.agents.registry;
  const aiReady = () => !!(FP.cohereConnection && FP.cohereConnection.isConfigured() && !(st() && st().settings && st().settings.enableAI === false));
  const hasAnalysis = () => !!(st() && st().an && Array.isArray(st().an.rows) && st().an.rows.length);
  const isMobile = () => !!(root.matchMedia && root.matchMedia('(max-width: 720px)').matches);
  const curRun = () => S.runs[S.agent] || null;

  /**
   * Hallazgos que piden atención: lo que se cae o hay que revisar (no lo que crece) y las alertas del embudo (no «sin alerta»), solo de prioridad Alta o Media
   * (los de Baja siguen en el panel, pero no mueven el contador ni la línea de Inicio). Solo detectores, sin IA.
   */
  function summaryOf(runs) {
    const a = runs.analista, u = runs.auditor;
    const list = [].concat(a && a.status === 'ok' ? a.findings.filter((f) => f.section !== 'crece') : [], u && u.status === 'ok' ? u.findings.filter((f) => !f.sinAlerta) : []);
    const alta = list.filter((f) => f.prio === 'Alta').length, media = list.filter((f) => f.prio === 'Media').length;
    return { n: alta + media, alta, media };
  }
  const countOf = (runs) => summaryOf(runs).n;
  async function summary() {
    const state = st(), runs = {};
    for (const a of AGENT_IDS) { try { runs[a] = await FP.agents.runner.run(state, { agent: a, useAI: false }); } catch (e) { runs[a] = null; } }
    const s = summaryOf(runs), an = runs.analista && runs.analista.status === 'ok' ? runs.analista : null;
    return { ...s, scopeLabel: an && an.scope ? an.scope.label : null, channelLabel: an && an.scope ? an.scope.channelLabel : null, key: FP.agents.runner.selectionKey(state) };
  }
  async function countFindings() { return (await summary()).n; }

  // ---------- Piezas ----------
  function aiChip(run) {
    if (!run) return '';
    const a = run.ai || {};
    if (a.status === 'ok') return '<span class="ag-chip-ai ok">Ordenado y redactado con IA · cifras del motor</span>';
    if (a.status === 'off') return '<span class="ag-chip-ai">Sin IA · textos del motor</span>';
    if (a.status === 'none') return '';
    return '<span class="ag-chip-ai warn">IA no disponible ahora · textos del motor</span>';
  }
  function aiWarn(run) {
    const a = run && run.ai;
    if (!a || ['ok', 'off', 'none'].includes(a.status)) return '';
    const why = a.status === 'rejected' || a.status === 'invalid' ? 'La IA devolvió algo que no coincide con las cifras del motor y se descartó.' : 'No se pudo consultar a la IA.';
    return `<div class="ag-ho" style="background:#FFF1DC;border:0;color:#7A4608"><b>${esc(why)}</b> Te muestro lo que calculó el motor, sin ordenar ni redactar.</div>`;
  }
  const toneOf = (text, value) => (/^[−-]/.test(String(text)) || (typeof value === 'number' && value < 0) ? 'dn' : /^\+/.test(String(text)) ? 'up' : '');

  /** Mini-visual de una tarjeta: barras, tabla o pasos del embudo. */
  function visual(v) {
    if (!v) return '';
    if (v.type === 'bars' && v.rows && v.rows.length) {
      const max = Math.max(...v.rows.map((r) => Math.abs(r.value) || 0), 1e-9);
      return `<div class="ag-bars">${v.rows.map((r) => `<div class="ag-br"><span>${esc(r.label)}</span><div class="ag-tr"><i class="${toneOf(r.text, r.value)}" style="width:${Math.max(3, Math.round(Math.abs(r.value) / max * 100))}%"></i></div><b class="${toneOf(r.text, r.value)}">${esc(r.text)}</b></div>`).join('')}</div>`;
    }
    if (v.type === 'table' && v.rows && v.rows.length) {
      const num = new Set(v.num || [v.head.length - 1]);
      return `<div class="ag-tw"><table class="ag-mini"><thead><tr>${v.head.map((h, i) => `<th${num.has(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${v.rows.map((r) => `<tr>${r.map((c, i) => `<td${num.has(i) ? ` class="n ${toneOf(c)}"` : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    if (v.type === 'steps' && v.rows && v.rows.length) {
      return `<div class="ag-steps">${v.rows.map((r) => `<div class="ag-sr"><span>${esc(r.label)}</span><div class="ag-tr"><i class="${r.low ? 'low' : ''}" style="width:${Math.max(3, r.pct)}%"></i></div><b>${esc(r.aText)} · ${esc(r.bText)}</b></div>`).join('')}</div>`;
    }
    return '';
  }
  function handoff(h) {
    const t = reg().AGENTS[h.to];
    if (!t) return '';
    if (t.available) return `<div class="ag-ho"><b>Sugerencia:</b> ${esc(h.reason)}<div style="margin-top:8px"><button type="button" class="ag-go" data-ag="agent" data-id="${esc(h.to)}">Pasar a ${esc(t.name)}</button></div></div>`;
    return `<div class="ag-ho"><b>Sugerencia:</b> ${esc(h.reason)} <span class="ag-note">(${esc(t.name)}: ${esc(t.phase || 'próximamente')})</span></div>`;
  }
  const dl = (k, v) => (v ? `<div><span class="ag-k">${esc(k)}</span><div>${esc(v)}</div></div>` : '');

  /** Tarjeta de hallazgo — LA MISMA para el Analista de Números y el Auditor de Conversión. `rank` solo en listas planas (Auditor). */
  function findingCard(f, rank) {
    const open = !!S.expanded[f.id];
    const rows = (f.evid || []).map((e) => `<div class="ag-ev"><span>${esc(e.k)}</span><b>${esc(e.v)}</b></div>`).join('');
    const go = f.view ? `<a class="ag-a" href="#${esc(f.view)}" data-ag="go">Ver en ${esc(f.viewLabel || f.view)}</a>` : '';
    const ho = f.handoff ? handoff(f.handoff) : '';
    const good = f.section === 'crece' || f.sinAlerta;
    const chipText = rank ? `Prioridad ${rank} · ${f.tag || f.detector}` : (f.tag ? (good ? f.tag : `${f.prio} · ${f.tag}`) : f.prio);
    const big = f.big ? `<div class="ag-big"><b class="${esc(f.big.tone || '')}">${esc(f.big.value)}</b><span>${esc(f.big.sub)}</span></div>` : '';
    const muestra = f.muestraLimitada ? '<span class="ag-pp Baja" title="Pocas vistas: la tasa es débil">Muestra limitada</span>' : '';
    const baja = f.confianza === 'baja' ? '<span class="ag-pp Media" title="GA4 no cuadra con tu venta">Confianza baja</span>' : '';
    return `<article class="ag-card" data-id="${esc(f.id)}">
      <div class="ag-actions" style="gap:8px"><span class="ag-pp ${good ? 'Ok' : esc(f.prio)}">${esc(chipText)}</span>${muestra}${baja}<span class="ag-note">${esc(f.owner)}</span></div>
      <h3>${esc(f.title)}</h3>${big}${visual(f.visual)}<p>${esc(f.resumen)}</p>${f.nota ? `<p>${esc(f.nota)}</p>` : ''}
      <div class="ag-actions"><button type="button" class="ag-more" data-ag="more" data-id="${esc(f.id)}" aria-expanded="${open}"><span>${open ? 'Ver menos' : 'Ver más'}</span>${CHEV}</button>${go}</div>
      ${open ? `<div class="ag-det">
        ${dl('Qué vi', f.que)}
        ${rows ? `<div><span class="ag-k">Cifras</span>${rows}</div>` : ''}
        ${dl('Hipótesis (a validar, no causa)', f.hipotesis)}${dl('Cómo validarlo', f.validar)}${dl('Acción esta semana', f.accion ? `${f.accion}${/Responsable natural/.test(f.accion) ? '' : ` Responsable natural: ${f.owner}.`}` : '')}
        ${dl(f.muestraLimitada ? 'Muestra' : 'Qué no puedo afirmar', f.limites)}
        ${dl('Siguiente pregunta', f.pregunta)}
        <div class="ag-note">Fuente: ${esc(f.fuente)}${f.ai ? ' · redacción con IA' : ''}</div>${ho}</div>` : ''}
    </article>`;
  }

  function gateBlock(run, agent) {
    const g = run.gate; if (!g) return '';
    const cls = g.level === 'ok' ? 'ok' : g.level === 'low' ? 'low' : 'warn';
    let extra = '';
    if (agent === 'auditor') {
      const how = { ok: 'Puedes usar el embudo para decidir qué fichas revisar primero.', warn: 'Revisa en GA4 el etiquetado de compras (evento de compra) antes de comparar productos entre sí.', low: 'Antes de cambiar fichas, revisa el etiquetado de GA4 y la carga de unidades. Mientras tanto usa los hallazgos como dirección, no como cifra.', unknown: 'Carga las unidades vendidas por producto en el mismo periodo para poder verificar el cuadre.' }[g.level] || '';
      extra = `<button type="button" class="ag-link" data-ag="gate" aria-expanded="${S.gateOpen}">Ver cómo se calculó el cuadre${CHEV}</button>${S.gateOpen ? `<div class="ag-det"><div><span class="ag-k">Cómo se calcula</span><div>Compras de GA4 ÷ unidades vendidas en tu archivo de productos, por producto y en los mismos días.</div></div><div><span class="ag-k">Qué hacer con esto</span><div>${esc(how)}</div></div></div>` : ''}`;
    }
    return `<div class="ag-gate ${cls}" role="status"><b>${esc(g.title)}</b><p>${esc(g.text)}</p>${extra}</div>`;
  }

  /** Qué periodo y canal está leyendo el agente: lo que la persona tiene elegido en la app. */
  function scopeChips(run, agent) {
    const sc = run.scope, M = FP.agents.story;
    if (!sc || !sc.period || !M) return '';
    const mes = sc.label || M.monthLabel(sc.period.key), cap = mes.charAt(0).toUpperCase() + mes.slice(1), ch = sc.channelLabel || 'Total digital';
    const a = agent === 'auditor'
      ? `<span class="ag-chip-i">${esc(cap)}${sc.to ? ` al ${esc(M.dayLabel(sc.to))}` : ''}</span><span class="ag-chip-i">${esc(ch)}</span><span class="ag-chip-i">Embudo de GA4 por producto</span>`
      : `<span class="ag-chip-i">${esc(cap)} al corte del ${esc(M.dayLabel(sc.lastActual))}</span><span class="ag-chip-i">${esc(ch)}</span>`;
    return `${a}<span class="ag-follow">Sigo el periodo y el canal que tienes elegido; cámbialos en la vista y esto se actualiza.${sc.note ? ` ${esc(sc.note)}` : ''}</span>`;
  }
  /** Texto del periodo elegido (para los avisos de «sin datos»). */
  function chosenLabel(sel) {
    const A = FP.agents.analista;
    if (!sel || !sel.key || !A) return null;
    return `${A.periodLabel(sel.type, sel.key, null)}${sel.channel && sel.channel !== 'total' ? ` · ${A.channelLabel(sel.channel)}` : ''}`;
  }

  function storyBlock(run) {
    const h = run.headline; if (!h) return '';
    const mes = run.scope.label || FP.agents.story.monthLabel(run.scope.period.key);
    const kp = (run.kpis || []).map((k) => `<div class="ag-kpi"><small>${esc(k.k)}</small><b class="${esc(k.tone)}">${esc(k.v)}</b>${k.chip ? `<span class="ag-chipc ag-chipc--${esc(k.chipLevel || '')}">${esc(k.chip)}</span>` : ''}</div>`).join('');
    return `<section class="ag-story" aria-label="Historia del periodo"><h2>La historia de ${/^semana/.test(mes) ? 'la ' : ''}${esc(mes)} en 20 segundos</h2>
      <p class="ag-lead">${esc(h.lead)}</p><ul class="ag-points">${h.items.map((i) => `<li><b>${esc(i.k)}:</b> ${esc(i.text)}</li>`).join('')}</ul>
      ${kp ? `<div class="ag-kpis">${kp}</div>` : ''}</section>`;
  }
  function sectionsBlock(run) {
    const by = { cae: [], crece: [], revisar: [] };
    run.findings.forEach((f) => { (by[f.section] || by.revisar).push(f); });
    return SECTIONS.map((s) => `<h2 class="ag-sec">${esc(s.title)}</h2>${by[s.id].length ? by[s.id].map((f) => findingCard(f)).join('') : `<div class="ag-empty">${esc(s.empty)}</div>`}`).join('');
  }
  function routeKey(run) { return run && run.scope ? `${run.scope.period.type}|${run.scope.period.key}|${run.scope.channel || 'total'}|${run.scope.lastActual}` : null; }
  function routeBlock(run) {
    const steps = run.route || []; if (!steps.length) return '';
    const key = routeKey(run);
    if (S.route.key !== key) S.route = { key, cur: 1, open: {} };
    const total = steps.length, cur = S.route.cur, done = cur > total;
    const items = steps.map((s, i) => {
      const n = i + 1, state = n < cur ? 'done' : n === cur ? 'cur' : 'pending', shown = state === 'cur' || (state === 'done' && S.route.open[n]);
      return `<li class="ag-tstep ${state}"><span class="ag-dot" aria-hidden="true">${state === 'done' ? '✓' : n}</span><div>
        <button type="button" class="ag-rq" data-ag="rq" data-n="${n}" aria-expanded="${shown}" ${state === 'pending' ? 'disabled' : ''}>${esc(s.q)}</button>
        ${shown ? `<div class="ag-ra"><span>${esc(s.a)}</span>${state === 'cur' ? `<button type="button" class="ag-go" data-ag="rnext" data-n="${n}">${s.last ? 'Listo, ya lo entendí' : 'Entendido, sigamos'}</button>` : ''}</div>` : ''}</div></li>`;
    }).join('');
    return `<h2 class="ag-sec">Entendámoslo juntos</h2><section class="ag-story ag-route"><div class="ag-sp"><span>${done ? `Ruta completa · ${total} de ${total}` : `Vas ${cur} de ${total} preguntas`}</span><span>Ruta de comprensión</span></div>
      <div class="ag-prog" role="progressbar" aria-label="Avance de la ruta" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done ? total : cur}"><i style="width:${done ? 100 : Math.round(cur / total * 100)}%"></i></div>
      <ol class="ag-trail">${items}</ol>
      ${done ? '<p class="ag-note" role="status">Ruta completa. Si algo no te quedó claro, pregúntame abajo o toca una pregunta para volver a leerla.</p>' : ''}</section>`;
  }

  function bodyAnalista() {
    const run = S.runs.analista;
    if (S.busy.analista && !run) return '<div class="ag-skel"></div><div class="ag-skel"></div><div class="ag-note" role="status">Revisando tus datos…</div>';
    if (!run) return '';
    if (run.status === 'no_data' && run.selection && run.selection.chosen) {
      return `<div class="ag-card"><h3>No hay venta real en lo que elegiste</h3><p>Elegiste ${esc(chosenLabel(run.selection))}, pero ahí todavía no hay venta real cargada o falta el plan. Cambia el periodo o el canal en la vista, o carga lo que falta.</p>
        <div class="ag-actions"><a class="ag-go" data-ag="go" href="#carga" style="display:inline-flex;align-items:center;text-decoration:none">Ir a Carga de datos</a></div></div>`;
    }
    if (run.status === 'no_data') {
      return `<div class="ag-card"><h3>Todavía no hay con qué comparar</h3><p>Necesito el plan del mes y la venta real cargada para revisar el pacing. Sin eso no puedo decir si algo se sale de lo normal.</p>
        <div class="ag-actions"><a class="ag-go" data-ag="go" href="#carga" style="display:inline-flex;align-items:center;text-decoration:none">Ir a Carga de datos</a></div></div>`;
    }
    const chips = `${demoStrip()}<div class="ag-chiprow">${scopeChips(run, 'analista')}</div>`;
    const lect = run.lectura ? `<div class="ag-ans"><span class="ag-k">Lectura</span>${esc(run.lectura)}</div>` : '';
    const empty = !run.findings.length ? `<div class="ag-card"><h3>Nada fuera de lo normal</h3><p>Revisé ${esc(run.detectors)} puntos del pacing, el forecast y las categorías y ninguno pasa el umbral. Cuando algo cambie, aquí aparece primero.</p></div>` : '';
    return `${chips}${aiChip(run)}${aiWarn(run)}${gateBlock(run, 'analista')}${lect}${storyBlock(run)}${empty || sectionsBlock(run)}${routeBlock(run)}${S.busy.analista ? '<div class="ag-note" role="status">Ordenando y redactando con IA…</div>' : ''}${errNote(run)}`;
  }
  const errNote = (run) => (run && run.errors && run.errors.length ? `<div class="ag-note">Nota: no pude calcular ${run.errors.length} parte(s) y las omití (${esc(run.errors.map((e) => String(e).split(':')[0]).join(', '))}).</div>` : '');

  // ---------- Datos de ejemplo (Fase 3.2b) ----------
  const demoInfo = () => (FP.app && FP.app.demoInfo ? FP.app.demoInfo() : { loaded: false, real: true, canOffer: false });
  /** Franja ámbar mientras haya productos de ejemplo cargados; sin botón de borrar (se retiran al cargar datos reales). */
  const demoStrip = () => (demoInfo().loaded ? '<div class="ag-demo" role="note"><b>Estás viendo datos de ejemplo</b><span>Productos y embudo de ejemplo; no son tus ventas. Se reemplazan solos en cuanto cargues tus archivos reales.</span></div>' : '');

  // ---------- Auditor de Conversión ----------
  function bodyAuditor() {
    const run = S.runs.auditor;
    if (S.busy.auditor && !run) return '<div class="ag-skel"></div><div class="ag-skel"></div><div class="ag-note" role="status">Revisando el embudo de tus productos…</div>';
    if (!run) return '';
    const go = (href, label) => `<div class="ag-actions"><a class="ag-go" data-ag="go" href="${href}" style="display:inline-flex;align-items:center;text-decoration:none">${label}</a></div>`;
    if (run.status === 'no_data') {
      const offer = demoInfo().canOffer;
      return `<div class="ag-card"><h3>Todavía no hay productos cargados</h3><p>El Auditor necesita el archivo de ventas por producto y el embudo de GA4 por producto para ver dónde se queda la compra. Sin eso no puedo seguir el embudo.</p>
        <div class="ag-actions"><a class="ag-go" data-ag="go" href="#carga" style="display:inline-flex;align-items:center;text-decoration:none">Ir a Carga de datos</a>${offer ? '<button type="button" class="ag-go ag-go--alt" data-ag="demo">Probar con datos de ejemplo</button>' : ''}</div>
        ${offer ? '<p class="ag-note">Ejemplo: agosto y septiembre de 2026, 600 productos, 4 canales. No son tus datos. Este botón no sale si ya cargaste datos reales.</p>' : ''}</div>`;
    }
    if (run.status === 'sin_embudo') return `<div class="ag-card"><h3>Faltan los datos del embudo</h3><p>Hay ventas por producto, pero no el embudo de GA4 (vistas, carrito, checkout y compras) para este mes. Sin él no puedo decir en qué paso se pierde la compra.</p>${go('#carga', 'Ir a Carga de datos')}</div>`;
    if (run.status === 'sin_mes') { const lab = run.scope ? chosenLabel({ type: run.scope.type, key: run.scope.key }) : null; return `<div class="ag-card"><h3>El archivo de productos no llega a lo que elegiste</h3><p>Tus productos están cargados hasta ${esc(FP.agents.story.dayLabel(run.dateMax || ''))}${lab ? `, pero elegiste ${esc(lab)}` : ''}. Cambia el periodo en la vista o carga el periodo que falta para revisar el embudo.</p>${go('#carga', 'Ir a Carga de datos')}</div>`; }
    const chips = `${demoStrip()}<div class="ag-chiprow">${scopeChips(run, 'auditor')}</div>`;
    const lect = run.lectura ? `<div class="ag-ans"><span class="ag-k">Lectura</span>${esc(run.lectura)}</div>` : '';
    const list = run.findings.length ? run.findings.map((f, i) => findingCard(f, i + 1)).join('')
      : `<div class="ag-card"><h3>Nada fuera de lo normal en el embudo</h3><p>Revisé ${esc(run.detectors)} puntos del embudo (fuga por paso, demanda sin conversión, web contra app, concentración y mezcla de tráfico) y ninguno pasa el umbral.</p></div>`;
    return `${chips}${aiChip(run)}${aiWarn(run)}${gateBlock(run, 'auditor')}${lect}${list}<p class="ag-note">Los hallazgos salen del cálculo determinista de tu herramienta. La IA solo los ordena y los redacta; si propone una cifra que no está en el cálculo, se descarta y se muestra el texto del motor.</p>${S.busy.auditor ? '<div class="ag-note" role="status">Ordenando y redactando con IA…</div>' : ''}${errNote(run)}`;
  }
  function bodySoon(a) {
    return `<div class="ag-card"><h3>${esc(a.name)} · ${esc(a.phase || 'próximamente')}</h3><p>${esc(a.role)}</p>
      <p class="ag-note">Todavía no está disponible. Mientras tanto el Analista de Números y el Auditor de Conversión siguen activos.</p>
      <div class="ag-actions"><button type="button" class="ag-go" data-ag="agent" data-id="analista">Volver al Analista de Números</button></div></div>`;
  }
  /** Estado de la IA, siempre visible abajo: «IA conectada» o «IA no conectada» con el enlace a Configuración. */
  function aiStatusLine() {
    if (aiReady()) return '<div class="ag-note"><b style="color:#1E7A4C">● IA conectada</b></div>';
    return '<div class="ag-note" style="display:flex;align-items:center;justify-content:space-between;gap:10px;white-space:nowrap"><b style="color:#A05A0A">● IA no conectada</b><a class="ag-a" href="#ajustes" data-section="ia" data-ag="go">Ir a Configuración</a></div>';
  }
  const PLACEHOLDER = { analista: 'Pregúntale al Analista (p. ej. «¿por qué cae Insulinas?»)…', auditor: 'Pregúntale al Auditor (p. ej. «¿qué producto reviso primero?»)…' };
  function askBlock() {
    const agent = S.agent;
    if (!AGENT_IDS.includes(agent)) return '';
    const run = S.runs[agent], qs = run && run.findings ? run.findings.map((f) => f.pregunta).filter(Boolean).slice(0, 4) : [];
    const sug = qs.length ? `<button type="button" class="ag-link" data-ag="sug" aria-expanded="${S.sugOpen}">¿No sabes qué preguntar?${CHEV}</button>${S.sugOpen ? `<div class="ag-chips">${qs.map((q) => `<button type="button" class="ag-chip" data-ag="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}` : '';
    const a = S.asks[agent]; let ans = '';
    if (a) {
      if (a.status === 'busy') ans = '<div class="ag-note" role="status">Consultando la evidencia calculada…</div>';
      else if (a.status === 'error') ans = `<div class="ag-ho" style="background:#FFF1DC;border:0;color:#7A4608">${esc((a.errors || ['No se pudo responder.'])[0])}</div>`;
      else if (a.result) {
        const r = a.result, to = a.to && reg().AGENTS[a.to];
        ans = `<div class="ag-ans" role="status"><span class="ag-k">Respuesta</span>${esc(r.answer || '')}${Array.isArray(r.evidence) && r.evidence.length ? r.evidence.slice(0, 4).map((e) => `<div class="ag-note"><b>${esc(e.entity)}</b> · ${esc(e.reason)} <i>(${esc(e.source)})</i></div>`).join('') : ''}${r.nextQuestion ? `<div class="ag-note">Siguiente pregunta: ${esc(r.nextQuestion)}</div>` : ''}${Array.isArray(r.limitations) && r.limitations.length ? `<div class="ag-note">Límites: ${esc(r.limitations.join(' · '))}</div>` : ''}${to && to.available ? `<div><button type="button" class="ag-go" data-ag="agent" data-id="${esc(a.to)}">Pasar a ${esc(to.name)}</button></div>` : ''}</div>`;
      }
    }
    if (!aiReady()) return aiStatusLine();
    return `${aiStatusLine()}${sug}${ans}<div style="display:flex;gap:8px"><label for="ag-q" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Pregúntale a tus datos</label><input id="ag-q" class="ag-in" type="text" placeholder="${esc(PLACEHOLDER[agent])}" value="${esc(S.q)}" data-ag="q" autocomplete="off"><button type="button" class="ag-go" data-ag="ask" ${a && a.status === 'busy' ? 'disabled' : ''}>Preguntar</button></div><div class="ag-note">Si preguntas por rentabilidad o ganancia, te aclaro que solo hablo de venta. ${agent === 'analista' ? 'Si preguntas por el embudo o por fichas, te paso al Auditor de Conversión.' : 'Si preguntas por promociones o descuentos, te llevo al Arquitecto de Ofertas (Fase 4).'}</div>`;
  }
  function html() {
    const { AGENTS } = reg();
    const a = AGENTS[S.agent] || AGENTS.analista;
    const tabs = Object.keys(AGENTS).map((id) => `<button type="button" class="ag-tab" data-ag="agent" data-id="${id}" aria-pressed="${id === S.agent}">${esc(AGENTS[id].label)}<small>${esc(AGENTS[id].available ? AGENTS[id].sub : AGENTS[id].phase)}</small></button>`).join('');
    const about = `<div class="ag-about"><button type="button" class="ag-aboutbtn" data-ag="about" aria-expanded="${S.aboutOpen}"><span>${esc(a.name)}</span>${CHEV}</button>${S.aboutOpen ? `<div class="ag-aboutbody">${esc(a.role)}<br><span class="ag-note">Los números los calcula el motor de la app. La IA, si está conectada, solo ordena y redacta; nunca calcula.</span></div>` : ''}</div>`;
    const body = !a.available ? bodySoon(a) : S.agent === 'auditor' ? bodyAuditor() : bodyAnalista();
    return `<div class="ag-head"><div class="ag-actions" style="justify-content:space-between;gap:10px"><div class="ag-title">${SPARK}<span id="ag-title">Asistentes</span></div><button type="button" class="ag-x" data-ag="close" aria-label="Cerrar asistentes">${CLOSE}</button></div>
      <div class="ag-tabs" role="group" aria-label="Elegir asistente">${tabs}</div>${about}</div>
      <div class="ag-body" id="ag-body">${body}</div>
      <div class="ag-foot">${a.available ? askBlock() : ''}</div>`;
  }

  /** Selector estable del elemento enfocado (el panel se redibuja completo y el foco debe sobrevivir). */
  function focusKey(el) {
    if (!el || !S.panel || !S.panel.contains(el)) return null;
    if (el.id) return `#${el.id}`;
    const a = el.dataset && el.dataset.ag; if (!a) return null;
    return `[data-ag="${a}"]${el.dataset.id ? `[data-id="${el.dataset.id}"]` : ''}${el.dataset.n ? `[data-n="${el.dataset.n}"]` : ''}`;
  }
  function paint(keepFocus) {
    if (!S.panel) return;
    const key = keepFocus === false ? null : focusKey(document.activeElement);
    const pos = S.panel.querySelector('#ag-body'), top = pos ? pos.scrollTop : 0;
    S.panel.innerHTML = html();
    const b = S.panel.querySelector('#ag-body'); if (b) b.scrollTop = top;
    if (key) { const el = S.panel.querySelector(key); if (el) { el.focus(); try { if (el.value !== undefined) el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* sin selección */ } } }
  }

  // ---------- Datos ----------
  /** Corre un agente: primero los detectores (se pintan en cuanto están) y luego, si hay IA, el orden y la redacción. */
  async function refresh(force, agentId) {
    const agent = agentId || S.agent;
    if (!AGENT_IDS.includes(agent) || !reg().AGENTS[agent].available) return;
    const my = (S.tokens[agent] = (S.tokens[agent] || 0) + 1), state = st(), R = FP.agents.runner;
    S.busy[agent] = true; paint();
    let quick = null;
    try { quick = await R.run(state, { agent, useAI: false, force: !!force }); } catch (e) { quick = null; }
    if (my !== S.tokens[agent]) return;   // llegó una corrida más reciente
    if (quick) S.runs[agent] = quick;
    const wantsAI = aiReady() && quick && quick.status === 'ok' && quick.findings.length > 0;
    S.busy[agent] = wantsAI;
    paint(); syncBadge();
    if (!wantsAI) return;
    let res = null;
    try { res = await R.run(state, { agent, force: !!force }); } catch (e) { res = null; }
    if (my !== S.tokens[agent]) return;
    S.busy[agent] = false;
    if (res) S.runs[agent] = res;
    paint(); syncBadge();
  }
  function syncBadge() { if (FP.agentLauncher) FP.agentLauncher.setCount(countOf(S.runs)); }

  async function ask() {
    const agent = S.agent, q = String(S.q || '').trim(), state = st(), R = FP.agents.runner;
    if (!q || !aiReady() || !AGENT_IDS.includes(agent)) return;
    S.asks[agent] = { status: 'busy' }; paint();
    try {
      const local = R.routeQuestion(agent, q);
      if (local) { S.asks[agent] = { status: 'ok', result: { answer: local.text }, to: local.to || null }; S.q = ''; }
      else if (agent === 'analista' && FP.cohereAnalysisAssistant && hasAnalysis()) {
        // Con Análisis calculado se usa el asistente de Análisis (contexto completo); sin él, el de la historia del periodo.
        const r = await FP.cohereAnalysisAssistant.ask(q, state, { apiKey: state.dx && state.dx.apiKey, model: state.dx && state.dx.model });
        S.asks[agent] = r.ok ? { status: 'ok', result: r.result } : { status: 'error', errors: r.errors };
        if (r.ok) S.q = '';
      } else {
        const r = await R.ask(agent, q, state);
        S.asks[agent] = r.ok ? { status: 'ok', result: { answer: r.answer, nextQuestion: r.nextQuestion }, to: r.to || null } : { status: 'error', errors: r.errors };
        if (r.ok) S.q = '';
      }
    } catch (e) { S.asks[agent] = { status: 'error', errors: [String(e && e.message || e)] }; }
    paint();
  }

  // ---------- Abrir / cerrar ----------
  function ensurePanel() {
    if (S.panel) return;
    const p = document.createElement('section');
    p.className = 'ag-panel'; p.id = 'ag-panel'; p.hidden = true;
    p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'false'); p.setAttribute('aria-labelledby', 'ag-title');
    p.addEventListener('click', onClick);
    p.addEventListener('input', (e) => { if (e.target && e.target.dataset.ag === 'q') S.q = e.target.value; });
    p.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.dataset.ag === 'q') { e.preventDefault(); ask(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.open) close(); });
    document.body.appendChild(p);
    S.panel = p;
  }
  function open(opener) {
    ensurePanel();
    S.opener = opener || S.opener;
    if (!S.picked || !S.agent) S.agent = reg().defaultAgent(FP.agentLauncher ? FP.agentLauncher.curView() : 'inicio');
    S.open = true; S.panel.hidden = false;
    if (S.opener) S.opener.setAttribute('aria-expanded', 'true');
    paint(false);
    const x = S.panel.querySelector('[data-ag="close"]'); if (x) x.focus();
    refresh(false);
  }
  function close() {
    if (!S.panel || !S.open) return;
    S.open = false; S.panel.hidden = true; AGENT_IDS.forEach((a) => { S.tokens[a] = (S.tokens[a] || 0) + 1; S.busy[a] = false; });
    if (S.opener) { S.opener.setAttribute('aria-expanded', 'false'); try { S.opener.focus(); } catch (e) { /* sin foco */ } }
  }
  function toggle(opener) { if (S.open) close(); else open(opener); }
  /** El agente por defecto sigue a la vista mientras la persona no haya elegido otro a mano. */
  /** La persona cambió el año/mes/semana o el canal: lo que lee el agente cambia, así que se recalcula (el panel abierto se actualiza solo). */
  function onContextChange() {
    const R = FP.agents && FP.agents.runner; if (!R) return;   // el módulo diferido todavía no se descargó: nada que actualizar
    const k = R.selectionKey(st());
    if (k === S.selKey) return;
    const first = S.selKey === undefined; S.selKey = k;
    if (first) return;
    if (!S.open) S.runs = {};   // cerrado: al abrir se recalcula con lo elegido
    else { AGENT_IDS.forEach((a) => { if (a !== S.agent) delete S.runs[a]; }); refresh(false, S.agent); }
    if (FP.agentLauncher) FP.agentLauncher.refreshBadge();
  }
  function onViewChange() {
    if (S.open && !S.picked) { const next = reg().defaultAgent(FP.agentLauncher.curView()); if (next !== S.agent) { S.agent = next; paint(); if (!S.runs[next]) refresh(false, next); } }
    if (FP.agentLauncher) FP.agentLauncher.refreshBadge();
  }

  function onClick(e) {
    const t = e.target.closest && e.target.closest('[data-ag]');
    if (!t) return;
    const k = t.dataset.ag;
    if (k === 'close') close();
    else if (k === 'agent') { S.agent = t.dataset.id; S.picked = true; S.sugOpen = false; paint(); if (AGENT_IDS.includes(S.agent) && !S.runs[S.agent]) refresh(false); }
    else if (k === 'about') { S.aboutOpen = !S.aboutOpen; paint(); }
    else if (k === 'gate') { S.gateOpen = !S.gateOpen; paint(); }
    else if (k === 'more') { S.expanded = { ...S.expanded, [t.dataset.id]: !S.expanded[t.dataset.id] }; paint(); }
    else if (k === 'sug') { S.sugOpen = !S.sugOpen; paint(); }
    else if (k === 'chip') { S.q = t.dataset.q || ''; S.sugOpen = false; paint(false); const i = document.getElementById('ag-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    else if (k === 'ask') ask();
    else if (k === 'rnext') { S.route = { ...S.route, cur: Math.max(S.route.cur, +t.dataset.n + 1) }; paint(false); focusRoute(); }
    else if (k === 'rq') { const n = +t.dataset.n; if (n < S.route.cur) { S.route = { ...S.route, open: { ...S.route.open, [n]: !S.route.open[n] } }; paint(); } }
    else if (k === 'demo') { t.disabled = true; Promise.resolve(FP.app.actions['ag-demo-conversion']()).catch(() => { t.disabled = false; }); }
    else if (k === 'go') { if (isMobile()) close(); }   // el enlace #vista navega solo; en celular el panel ocupa toda la pantalla
  }
  /** Tras «Entendido, sigamos» el foco pasa a la pregunta que sigue, para que el lector de pantalla y el teclado no se pierdan. */
  function focusRoute() {
    const el = S.panel && S.panel.querySelector('.ag-tstep.cur .ag-rq');
    if (el) { try { el.focus({ preventScroll: false }); el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* sin foco */ } }
  }

  FP.agentPanel = { open, close, toggle, onViewChange, onContextChange, countFindings, summary, refresh, _state: S, _findingCard: findingCard, _countOf: countOf, _summaryOf: summaryOf };
})(typeof window !== 'undefined' ? window : globalThis);
