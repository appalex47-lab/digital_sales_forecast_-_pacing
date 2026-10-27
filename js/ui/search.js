/**
 * search.js — Búsqueda global (MVP): secciones («Ir a»), acciones y conceptos del glosario. NO busca dentro de los datos.
 *  - Atajo Ctrl/Cmd+K o «/»; campo de la barra superior y botón 🔍 (móvil) abren la misma paleta.
 *  - Sin acentos ni mayúsculas, con sinónimos (brecha = gap). Teclado: ↑↓, Enter, Esc. Recientes solo en este navegador.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SYN = { brecha: ['gap'], gap: ['brecha'], meta: ['plan'], plan: ['meta'], corte: ['cutoff'], cutoff: ['corte'], 'ticket promedio': ['aov'], aov: ['ticket promedio'],
    conversion: ['cr'], cr: ['conversion'], pronostico: ['forecast'], forecast: ['pronostico'], descargar: ['exportar', 'paquete'], exportar: ['descargar', 'paquete'],
    subir: ['cargar', 'carga'], cargar: ['carga', 'subir', 'datos'], datos: ['carga'], clientes: ['ltv', 'cohorte'], ltv: ['clientes'], calidad: ['validacion'], ayuda: ['glosario'],
    cumplimiento: ['pacing', 'compliance'], pacing: ['cumplimiento'], recuperar: ['recovery', 'reforecast'], tendencia: ['evolucion', 'patrones'], estacionalidad: ['temporada'] };
  const expand = (tok) => [tok].concat(SYN[tok] || []);

  /** Puntúa un elemento: cada palabra de la consulta (o su sinónimo) debe aparecer en título, palabras clave o descripción. */
  function score(item, q) {
    const toks = norm(q).split(/\s+/).filter(Boolean); if (!toks.length) return 0;
    const t = norm(item.title), k = norm(item.keywords || ''), d = norm(item.desc || '');
    let total = 0;
    for (const tok of toks) {
      let best = 0;
      for (const v of expand(tok)) {
        if (t.startsWith(v)) best = Math.max(best, 6); else if (t.split(/\s+/).some((w) => w.startsWith(v))) best = Math.max(best, 5); else if (t.includes(v)) best = Math.max(best, 4);
        else if (k.includes(v)) best = Math.max(best, 3); else if (d.includes(v)) best = Math.max(best, 1);
      }
      if (!best) return 0; total += best;
    }
    return total;
  }
  const TYPE_ORDER = ['go', 'action', 'concept'];
  function rank(items, q, perGroup = 5) {
    const out = { go: [], action: [], concept: [] };
    items.forEach((it) => { const s = score(it, q); if (s > 0) out[it.type].push({ ...it, s }); });
    TYPE_ORDER.forEach((g) => { out[g].sort((a, b) => b.s - a.s || a.title.localeCompare(b.title, 'es')); out[g] = out[g].slice(0, perGroup); });
    return out;
  }

  /* ---------- Índice (secciones, acciones, glosario) ---------- */
  const ACTIONS = [
    { id: 'a-carga', title: 'Cargar datos', desc: 'Importa histórico, plan, venta real, segmentos o productos.', keywords: 'subir archivo csv importar demo', view: 'carga' },
    { id: 'a-calidad', title: 'Revisar la calidad de los datos', desc: 'Filas rechazadas, duplicados y huecos.', keywords: 'validar errores', view: 'calidad', needsData: true },
    { id: 'a-paquete', title: 'Exportar el paquete de análisis', desc: 'Descarga todo lo calculado en un .zip (Datos → Exportar datos).', keywords: 'descargar zip exportar paquete', view: 'datos', needsData: true },
    { id: 'a-presentacion', title: 'Generar la presentación en PDF', desc: 'Reporte ejecutivo de 16:9 con lo ya calculado.', keywords: 'pdf presentacion reporte ejecutivo imprimir guardar', view: 'presentacion', needsData: true },
    { id: 'a-diag', title: 'Exportar el diagnóstico', desc: 'Abre el diagnóstico para descargar su lectura.', keywords: 'descargar exportar brecha', view: 'diagnostico', needsData: true },
    { id: 'a-ajustes', title: 'Abrir ajustes', desc: 'Preferencias, nube y claves.', keywords: 'configuracion preferencias cohere', view: 'ajustes' },
    { id: 'a-glos', title: 'Ver el glosario completo', desc: 'Todos los términos con su definición.', keywords: 'ayuda terminos definiciones', glossary: true }
  ];
  function hasData() { try { const s = root.FP.app && root.FP.app.state; return Boolean(s && ((s.dataset && FP.dataModel && FP.dataModel.allRecords(s.dataset).length) || (FP.productStore && FP.productStore.available && FP.productStore.available()))); } catch (e) { return false; } }
  function buildIndex() {
    const G = FP.guidanceConfig || {}, items = [], doc = typeof document !== 'undefined' ? document : null;
    Object.entries(G.VIEWS || {}).forEach(([id, v]) => { if (v.retired || (doc && !doc.getElementById(`view-${id}`))) return;
      items.push({ type: 'go', id: `v-${id}`, title: v.title, desc: v.purpose || '', keywords: '', view: id }); });
    ACTIONS.forEach((a) => { if (a.view && doc && !doc.getElementById(`view-${a.view}`)) return; items.push({ type: 'action', ...a }); });
    (G.HELP || []).filter((e) => e.glossary).forEach((e) => items.push({ type: 'concept', id: `c-${e.id}`, title: e.title, desc: e.shortDescription || '', keywords: '', help: e.id }));
    return items;
  }

  /* ---------- Paleta (solo navegador) ---------- */
  const LABEL = { go: 'Ir a', action: 'Acción', concept: 'Concepto' };
  const ICON = { go: '→', action: '⚡', concept: '📖' };
  const RK = 'fp.v1:searchRecent';
  const recents = () => { try { return JSON.parse(root.localStorage.getItem(RK) || '[]').slice(0, 5); } catch (e) { return []; } };
  const saveRecent = (q) => { try { const l = [q].concat(recents().filter((x) => x !== q)).slice(0, 5); root.localStorage.setItem(RK, JSON.stringify(l)); } catch (e) { /* sin almacenamiento */ } };
  let el = null, flat = [], sel = 0, items = null;

  function choose(it) {
    close();
    if (it.type === 'go' || (it.type === 'action' && it.view)) { const v = it.view; if (root.location.hash === `#${v}`) root.FP.app.render && root.FP.app.render(); else root.location.hash = v; }
    else if (it.type === 'action' && it.glossary) FP.help.openGlossary();
    else if (it.type === 'concept') FP.help.open([it.help]);
  }
  function paint(q) {
    const body = el.querySelector('.gs__list'); const data = hasData();
    if (!q.trim()) {
      const r = recents();
      flat = []; body.innerHTML = r.length ? `<div class="gs__grp">Recientes</div><div class="gs__chips">${r.map((x) => `<button type="button" class="chip" data-gs-recent="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : '';
      body.innerHTML += '<p class="gs__hint">Busca secciones, acciones o conceptos (gap, AOV, cutoff…). No busca dentro de tus datos.</p>'; return;
    }
    const res = rank(items, q); flat = [];
    const html = TYPE_ORDER.map((g) => res[g].length ? `<div class="gs__grp">${LABEL[g]}</div>${res[g].map((it) => { const i = flat.push(it) - 1;
      const need = it.type === 'action' && it.needsData && !data ? ' <span class="gs__need">· necesita datos cargados</span>' : '';
      return `<button type="button" class="gs__row${i === sel ? ' is-on' : ''}" role="option" data-gs-i="${i}"><span class="gs__ic" aria-hidden="true">${ICON[g]}</span><span class="gs__t"><b>${esc(it.title)}</b>${need}<small>${esc(it.desc)}</small></span></button>`; }).join('')}` : '').join('');
    body.innerHTML = html || `<p class="gs__hint">Sin resultados para «${esc(q)}». Prueba con otra palabra (por ejemplo «brecha», «meta», «exportar»).</p>`;
  }
  function open(initial) {
    if (!el) {
      el = document.createElement('div'); el.id = 'gs'; el.className = 'gs'; el.hidden = true;
      el.innerHTML = `<div class="gs__backdrop" data-gs-close></div><div class="gs__box" role="dialog" aria-label="Buscar en RevNavigator"><div class="gs__bar"><button type="button" class="gs__back" data-gs-close aria-label="Cerrar búsqueda">←</button><input id="gs-input" type="search" autocomplete="off" placeholder="Buscar secciones, acciones o conceptos…" aria-label="Buscar en RevNavigator"><kbd class="gs__k">Esc</kbd></div><div class="gs__list" role="listbox"></div><div class="gs__foot">↑↓ moverse · Enter abrir · Esc cerrar</div></div>`;
      document.body.appendChild(el);
      el.addEventListener('click', (e) => { const t = e.target.closest('[data-gs-close],[data-gs-i],[data-gs-recent]'); if (!t) return;
        if (t.hasAttribute('data-gs-close')) return close();
        if (t.dataset.gsRecent != null) { const i = el.querySelector('#gs-input'); i.value = t.dataset.gsRecent; sel = 0; paint(i.value); return; }
        const it = flat[Number(t.dataset.gsI)]; if (it) { saveRecent(el.querySelector('#gs-input').value.trim()); choose(it); } });
      el.querySelector('#gs-input').addEventListener('input', (e) => { sel = 0; paint(e.target.value); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (flat.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length; paint(el.querySelector('#gs-input').value); const on = el.querySelector('.is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' }); } }
        else if (e.key === 'Enter') { const it = flat[sel]; if (it) { e.preventDefault(); saveRecent(el.querySelector('#gs-input').value.trim()); choose(it); } } });
    }
    items = buildIndex(); sel = 0; el.hidden = false; document.body.classList.add('gs-lock');
    const i = el.querySelector('#gs-input'); i.value = initial || ''; paint(i.value); i.focus();
  }
  function close() { if (el) el.hidden = true; document.body.classList.remove('gs-lock'); }
  function init() {
    // El campo del encabezado solo abre el buscador (clic, Enter, Espacio o una letra); NUNCA al recibir el foco con Tab,
    // para no atrapar el recorrido con teclado ni abrir una pantalla completa sin que la persona lo pida.
    const inp = document.querySelector('.topbar__search input');
    if (inp) { inp.removeAttribute('disabled'); inp.readOnly = true;
      inp.addEventListener('click', () => open(''));
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(''); }
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(e.key); } }); }
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '', typing = /INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(''); }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(''); } });
  }
  FP.search = { norm, score, rank, buildIndex, open, close, init };
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }
})(typeof window !== 'undefined' ? window : globalThis);
