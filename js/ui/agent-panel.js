/**
 * agent-panel.js — Fase 1 · Panel de asistentes (módulo diferido «agentes»; se carga al abrir el panel o al contar el botón).
 *
 * Un solo panel con selector de agente. Hoy solo existe el Analista de Números; Auditor de Conversión (Fase 2) y Arquitecto de Ofertas
 * (Fase 4) aparecen como «próximamente». El panel nunca queda vacío ni inventa: siempre dice qué pasó y qué sigue.
 * Datos: FP.agents.runner.run → detectores (código) + IA opcional que ordena y redacta (agentRunner.js).
 * Eventos con data-ag (delegación propia): no usa el data-action de app.js.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const SPARK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1F5FE0" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"/></svg>';

  const S = { open: false, agent: null, picked: false, aboutOpen: false, sugOpen: false, expanded: {}, run: null, busy: false, token: 0, q: '', ask: null, opener: null, panel: null };

  const st = () => (FP.app && FP.app.state) || null;
  const reg = () => FP.agents.registry;
  const aiReady = () => !!(FP.cohereConnection && FP.cohereConnection.isConfigured() && !(st() && st().settings && st().settings.enableAI === false));
  const hasAnalysis = () => !!(st() && st().an && Array.isArray(st().an.rows) && st().an.rows.length);
  const isMobile = () => !!(root.matchMedia && root.matchMedia('(max-width: 720px)').matches);

  /** Solo los detectores (sin IA). Lo usa el contador del botón. */
  function detectNow() { try { return FP.agents.analista.detect(st(), {}); } catch (e) { return { status: 'no_data', findings: [], errors: [String(e && e.message || e)] }; } }
  function countFindings() { const d = detectNow(); return d.status === 'ok' ? d.findings.length : 0; }

  // ---------- Vista ----------
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
  function findingCard(f) {
    const open = !!S.expanded[f.id];
    const rows = (f.evid || []).map((e) => `<div class="ag-ev"><span>${esc(e.k)}</span><b>${esc(e.v)}</b></div>`).join('');
    const go = f.view ? `<a class="ag-a" href="#${esc(f.view)}" data-ag="go">Ver en ${esc(f.viewLabel || f.view)}</a>` : '';
    const ho = f.handoff ? handoff(f.handoff) : '';
    return `<article class="ag-card" data-id="${esc(f.id)}">
      <div class="ag-actions" style="gap:8px"><span class="ag-pp ${esc(f.prio)}">${esc(f.prio)}</span><span class="ag-note">${esc(f.owner)}</span></div>
      <h3>${esc(f.title)}</h3><p>${esc(f.resumen)}</p>
      <div class="ag-actions"><button type="button" class="ag-more" data-ag="more" data-id="${esc(f.id)}" aria-expanded="${open}"><span>${open ? 'Ver menos' : 'Ver más'}</span>${CHEV}</button>${go}</div>
      ${open ? `<div class="ag-det">
        <div><span class="ag-k">Qué vi</span><div>${esc(f.que)}</div></div>
        ${rows ? `<div><span class="ag-k">Cifras</span>${rows}</div>` : ''}
        <div><span class="ag-k">Qué no puedo afirmar</span><div>${esc(f.limites)}</div></div>
        <div><span class="ag-k">Siguiente pregunta</span><div>${esc(f.pregunta)}</div></div>
        <div class="ag-note">Fuente: ${esc(f.fuente)}${f.ai ? ' · redacción con IA' : ''}</div>${ho}</div>` : ''}
    </article>`;
  }
  function handoff(h) {
    const t = reg().AGENTS[h.to];
    if (!t) return '';
    if (t.available) return `<div class="ag-ho"><b>Sugerencia:</b> ${esc(h.reason)}<div style="margin-top:8px"><button type="button" class="ag-go" data-ag="agent" data-id="${esc(h.to)}">Pasar a ${esc(t.name)}</button></div></div>`;
    return `<div class="ag-ho"><b>Sugerencia:</b> ${esc(h.reason)} <span class="ag-note">(${esc(t.name)}: ${esc(t.phase || 'próximamente')})</span></div>`;
  }
  function bodyAnalista() {
    const run = S.run;
    if (S.busy && !run) return '<div class="ag-skel"></div><div class="ag-skel"></div><div class="ag-note" role="status">Revisando tus datos…</div>';
    if (!run) return '';
    if (run.status === 'no_data') {
      return `<div class="ag-card"><h3>Todavía no hay con qué comparar</h3><p>Necesito el plan del mes y la venta real cargada para revisar el pacing. Sin eso no puedo decir si algo se sale de lo normal.</p>
        <div class="ag-actions"><a class="ag-go" data-ag="go" href="#carga" style="display:inline-flex;align-items:center;text-decoration:none">Ir a Carga de datos</a></div></div>`;
    }
    const sc = run.scope && run.scope.period ? `Total digital · ${esc(run.scope.period.key)} · con datos al ${esc(run.scope.lastActual)}` : '';
    const head = `<div class="ag-note">${sc}</div>`;
    if (!run.findings.length) {
      return `${head}<div class="ag-card"><h3>Nada fuera de lo normal</h3><p>Revisé ${esc(run.detectors)} puntos del pacing, el forecast y la calidad de datos y ninguno pasa el umbral. Cuando algo cambie, aquí aparece primero.</p></div>`;
    }
    const lect = run.lectura ? `<div class="ag-ans"><span class="ag-k">Lectura</span>${esc(run.lectura)}</div>` : '';
    return `${head}${aiChip(run)}${aiWarn(run)}${lect}${run.findings.map(findingCard).join('')}${S.busy ? '<div class="ag-note" role="status">Ordenando y redactando con IA…</div>' : ''}`;
  }
  function bodySoon(a) {
    return `<div class="ag-card"><h3>${esc(a.name)} · ${esc(a.phase || 'próximamente')}</h3><p>${esc(a.role)}</p>
      <p class="ag-note">Todavía no está disponible. Mientras tanto el Analista de Números sigue activo.</p>
      <div class="ag-actions"><button type="button" class="ag-go" data-ag="agent" data-id="analista">Volver al Analista de Números</button></div></div>`;
  }
  /** Estado de la conexión con IA, siempre visible abajo: conectada (y por dónde) o cómo conectarla, con enlace a Configuración. */
  function aiStatusLine() {
    const server = !!(FP.cohereProxy && FP.cohereProxy.available()), key = !!(st() && st().dx && st().dx.apiKey), off = !!(st() && st().settings && st().settings.enableAI === false);
    const link = '<a class="ag-a" href="#ajustes" data-section="ia" data-ag="go">Ir a Configuración · Inteligencia artificial</a>';
    if (aiReady()) return `<div class="ag-note"><b style="color:#1E7A4C">● IA conectada</b> · ${server ? 'servidor del equipo' : 'API key de este navegador'}. Ordena y redacta los hallazgos y responde tus preguntas; las cifras siempre las calcula el motor.</div>`;
    if ((server || key) && off) return `<div class="ag-note"><b style="color:#A05A0A">● IA desactivada</b> en Configuración. Actívala para que ordene y redacte los hallazgos y responda preguntas. Sin ella ves los textos del motor.</div>${link}`;
    return `<div class="ag-note"><b style="color:#A05A0A">● IA sin conectar.</b> Los hallazgos funcionan igual, con los textos del motor. Para conectarla:<br>1. Inicia sesión con tu cuenta del equipo (usa el servidor del equipo y no necesitas key), o<br>2. pega tu API key de Cohere en Configuración → Inteligencia artificial.</div>${link}`;
  }
  function askBlock() {
    if (S.agent !== 'analista') return '';
    const run = S.run, qs = run && run.findings ? run.findings.map((f) => f.pregunta).filter(Boolean).slice(0, 4) : [];
    const sug = qs.length ? `<button type="button" class="ag-link" data-ag="sug" aria-expanded="${S.sugOpen}">¿No sabes qué preguntar?${CHEV}</button>${S.sugOpen ? `<div class="ag-chips">${qs.map((q) => `<button type="button" class="ag-chip" data-ag="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}` : '';
    let ans = '';
    if (S.ask) {
      if (S.ask.status === 'busy') ans = '<div class="ag-note" role="status">Consultando la evidencia calculada…</div>';
      else if (S.ask.status === 'error') ans = `<div class="ag-ho" style="background:#FFF1DC;border:0;color:#7A4608">${esc((S.ask.errors || ['No se pudo responder.'])[0])}</div>`;
      else if (S.ask.result) {
        const r = S.ask.result;
        ans = `<div class="ag-ans" role="status"><span class="ag-k">Respuesta</span>${esc(r.answer || '')}${Array.isArray(r.evidence) && r.evidence.length ? r.evidence.slice(0, 4).map((e) => `<div class="ag-note"><b>${esc(e.entity)}</b> · ${esc(e.reason)} <i>(${esc(e.source)})</i></div>`).join('') : ''}${r.nextQuestion ? `<div class="ag-note">Siguiente pregunta: ${esc(r.nextQuestion)}</div>` : ''}${Array.isArray(r.limitations) && r.limitations.length ? `<div class="ag-note">Límites: ${esc(r.limitations.join(' · '))}</div>` : ''}</div>`;
      }
    }
    if (!aiReady()) return aiStatusLine();
    if (!hasAnalysis()) return `${aiStatusLine()}${sug}<div class="ag-note">Para preguntar, abre primero <a href="#analisis" data-ag="go">Análisis</a>: ahí se calculan los resultados que uso para responder.</div>`;
    return `${aiStatusLine()}${sug}${ans}<div style="display:flex;gap:8px"><label for="ag-q" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Pregúntale a tus datos</label><input id="ag-q" class="ag-in" type="text" placeholder="Pregúntale a tus datos…" value="${esc(S.q)}" data-ag="q" autocomplete="off"><button type="button" class="ag-go" data-ag="ask" ${S.ask && S.ask.status === 'busy' ? 'disabled' : ''}>Preguntar</button></div>`;
  }
  function html() {
    const { AGENTS } = reg();
    const a = AGENTS[S.agent] || AGENTS.analista;
    const tabs = Object.keys(AGENTS).map((id) => `<button type="button" class="ag-tab" data-ag="agent" data-id="${id}" aria-pressed="${id === S.agent}">${esc(AGENTS[id].label)}<small>${esc(AGENTS[id].available ? AGENTS[id].sub : AGENTS[id].phase)}</small></button>`).join('');
    const about = `<div class="ag-about"><button type="button" class="ag-aboutbtn" data-ag="about" aria-expanded="${S.aboutOpen}"><span>${esc(a.name)}</span>${CHEV}</button>${S.aboutOpen ? `<div class="ag-aboutbody">${esc(a.role)}<br><span class="ag-note">Los números los calcula el motor de la app. La IA, si está conectada, solo ordena y redacta; nunca calcula.</span></div>` : ''}</div>`;
    return `<div class="ag-head"><div class="ag-actions" style="justify-content:space-between;gap:10px"><div class="ag-title">${SPARK}<span id="ag-title">Asistentes</span></div><button type="button" class="ag-x" data-ag="close" aria-label="Cerrar asistentes">${CLOSE}</button></div>
      <div class="ag-tabs" role="group" aria-label="Elegir asistente">${tabs}</div>${about}</div>
      <div class="ag-body" id="ag-body">${a.available ? bodyAnalista() : bodySoon(a)}</div>
      <div class="ag-foot">${a.available ? askBlock() : ''}</div>`;
  }

  /** Selector estable del elemento enfocado (el panel se redibuja completo y el foco debe sobrevivir). */
  function focusKey(el) {
    if (!el || !S.panel || !S.panel.contains(el)) return null;
    if (el.id) return `#${el.id}`;
    const a = el.dataset && el.dataset.ag; if (!a) return null;
    return `[data-ag="${a}"]${el.dataset.id ? `[data-id="${el.dataset.id}"]` : ''}`;
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
  async function refresh(force) {
    const my = ++S.token, state = st();
    const quick = detectNow();   // los detectores son instantáneos: se muestran antes de que responda la IA
    S.run = { status: quick.status, scope: quick.scope, detectors: quick.detectors, lectura: '', findings: quick.findings.map((f) => ({ ...f, ai: false })), ai: { status: quick.findings.length && !aiReady() ? 'off' : 'none' } };
    S.busy = aiReady() && quick.status === 'ok' && quick.findings.length > 0;
    paint();
    if (!S.busy) { S.busy = false; syncBadge(quick); return; }
    let res;
    try { res = await FP.agents.runner.run(state, { force: !!force }); } catch (e) { res = null; }
    if (my !== S.token) return;   // llegó una corrida más reciente
    S.busy = false;
    if (res) S.run = res;
    paint(); syncBadge(res || quick);
  }
  function syncBadge(r) { if (FP.agentLauncher && r && r.status === 'ok') FP.agentLauncher.setCount(r.findings.length); }

  async function ask() {
    const q = String(S.q || '').trim(), state = st();
    if (!q || !FP.cohereAnalysisAssistant || !aiReady() || !hasAnalysis()) return;
    S.ask = { status: 'busy' }; paint();
    try {
      const r = await FP.cohereAnalysisAssistant.ask(q, state, { apiKey: state.dx && state.dx.apiKey, model: state.dx && state.dx.model });
      S.ask = r.ok ? { status: 'ok', result: r.result } : { status: 'error', errors: r.errors };
      if (r.ok) S.q = '';
    } catch (e) { S.ask = { status: 'error', errors: [String(e && e.message || e)] }; }
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
    S.open = false; S.panel.hidden = true; S.token++;
    if (S.opener) { S.opener.setAttribute('aria-expanded', 'false'); try { S.opener.focus(); } catch (e) { /* sin foco */ } }
  }
  function toggle(opener) { if (S.open) close(); else open(opener); }
  /** El agente por defecto sigue a la vista mientras la persona no haya elegido otro a mano. */
  function onViewChange() { if (S.open && !S.picked) { S.agent = reg().defaultAgent(FP.agentLauncher.curView()); paint(); } if (FP.agentLauncher) FP.agentLauncher.refreshBadge(); }

  function onClick(e) {
    const t = e.target.closest && e.target.closest('[data-ag]');
    if (!t) return;
    const k = t.dataset.ag;
    if (k === 'close') close();
    else if (k === 'agent') { S.agent = t.dataset.id; S.picked = true; paint(); }
    else if (k === 'about') { S.aboutOpen = !S.aboutOpen; paint(); }
    else if (k === 'more') { S.expanded = { ...S.expanded, [t.dataset.id]: !S.expanded[t.dataset.id] }; paint(); }
    else if (k === 'sug') { S.sugOpen = !S.sugOpen; paint(); }
    else if (k === 'chip') { S.q = t.dataset.q || ''; S.sugOpen = false; paint(false); const i = document.getElementById('ag-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
    else if (k === 'ask') ask();
    else if (k === 'go') { if (isMobile()) close(); }   // el enlace #vista navega solo; en celular el panel ocupa toda la pantalla
  }

  FP.agentPanel = { open, close, toggle, onViewChange, countFindings, refresh, _state: S };
})(typeof window !== 'undefined' ? window : globalThis);
