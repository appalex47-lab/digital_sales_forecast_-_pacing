/**
 * settings-view.js — Configuración de RevNavigator.
 * Reúne en un solo lugar lo que se configura una vez y vale para toda la app:
 *   · Estado de la herramienta (año, meta, canales, datos y motor: el detalle de las píldoras del encabezado) · Modo de uso · Análisis con IA (Cohere) · Almacenamiento · Negocio (Business Setup, más abajo en la misma vista).
 * No hay lógica nueva: cada control conserva su acción de siempre (ux-mode, dx-key, dx-remember, dx-model, storage-tests, storage-retry, bc-*).
 * Configuración de planeación NO está aquí: sigue en Planear porque afecta al plan, no a la herramienta.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);

  // Preferencias que siguen en su vista (se enlazan; no se movieron)
  const ELSEWHERE = [
    { what: 'Configuración de planeación', desc: 'Método, periodo histórico, suavizado y comparación de métodos. Afecta a tu plan, no a la herramienta.', view: 'configuracion', where: 'Planear' },
    { what: 'Opciones de lectura de archivos', desc: 'Formato de fecha, formato numérico y tolerancia de CR y AOV al importar.', view: 'carga', where: 'Carga de datos' },
    { what: 'Parámetros del forecast', desc: 'Método y umbrales de alertas del pacing.', view: 'pacing', where: 'Pacing & Forecast' },
    { what: 'Recorrido guiado y glosario', desc: 'Guía opcional para aprender la herramienta.', view: 'ayuda', where: '¿Cómo funciona?' }
  ];

  /* ---------- Desplegables: cada sección es un <details> con su título y un resumen que se ve aunque esté cerrada ---------- */
  const SECTIONS = ['st-estado', 'st-modo', 'st-otras', 'st-fuentes', 'st-equivalencias', 'st-almacenamiento', 'st-ia', 'st-ia-log', 'st-ia-aprendido', 'st-ia-privacidad', 'st-negocio'];
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  /** Resumen de una línea de cada sección (estado actual), para decidir si hace falta abrirla. */
  function metaFor(state, id) {
    const esc = FP.ui.helpers.esc, ai = state.dx;
    switch (id) {
      case 'st-estado': { const st = state.selfTest; return `Año ${state.year} · motor ${st && st.passed === st.total ? 'operativo' : 'con fallas'}`; }
      case 'st-modo': { const m = (FP.guidanceConfig.MODES || []).find((x) => x[0] === state.ux.mode); return m ? esc(m[1]) : ''; }
      case 'st-otras': return plural(ELSEWHERE.length, 'preferencia', 'preferencias');
      case 'st-fuentes': { const b = FP.dataSources.build(state); return `${b.summary.activeSources} de ${b.summary.liveSources} fuentes con datos`; }
      case 'st-equivalencias': return plural(FP.aliases.rules().length, 'equivalencia', 'equivalencias');
      case 'st-almacenamiento': return 'Dónde se guardan tus datos';
      case 'st-ia': return `${ai.apiKey ? 'API key en uso' : 'Sin API key'} · IA ${state.settings.enableAI === false ? 'desactivada' : 'activada'}`;
      case 'st-ia-log': return plural(FP.aiAudit.count(), 'consulta en esta sesión', 'consultas en esta sesión');
      case 'st-ia-aprendido': return plural(Object.keys(FP.importer.learnedMappings()).length, 'columna aprendida', 'columnas aprendidas');
      case 'st-ia-privacidad': return plural((state.settings.piiColumns || []).length, 'columna marcada a mano', 'columnas marcadas a mano');
      default: return '';
    }
  }
  /** Abre un desplegable: el título (h3) y el resumen van dentro del <summary>, que es el botón que lo abre y lo cierra. */
  function accStart(state, id, title, desc) {
    const open = state.stOpen && state.stOpen[id] !== undefined ? state.stOpen[id] : false;
    return `<details class="panel stacc" id="${id}" data-st="${id}" tabindex="-1" ${open ? 'open' : ''}>
      <summary class="stacc__sum"><h3 class="panel__title stacc__title">${title}</h3><span class="stacc__meta">${metaFor(state, id)}</span></summary>
      <div class="stacc__body">${desc ? `<p class="panel__desc">${desc}</p>` : ''}`;
  }
  const accEnd = () => '</div></details>';

  /**
   * Fase I · «Fuentes de datos» (Configuración): qué fuentes existen, su estado, cuándo se cargó cada una por última vez, qué periodo cubre,
   * qué tan frescos están los datos y su calidad. Las fuentes que aún no existen se muestran como «No conectado», con lo que necesitan.
   */
  function sourcesPanel(state) {
    const esc = FP.ui.helpers.esc, DS = FP.dataSources, pill = FP.ui.helpers.pill, F = FP.format;
    const b = DS.build(state), per = (p) => (p ? `${esc(p.start)} a ${esc(p.end)}` : '—');
    const scoreHtml = (v) => (typeof v === 'number' ? pill(v >= 90 ? 'ok' : v >= 70 ? 'warning' : 'error', `${v}/100`) : '—');
    const ST = { active: ['ok', 'Con datos'], empty: ['na', 'Sin archivos'], unavailable: ['na', 'No conectado'] };
    const srows = b.sources.map((s) => { const [tone, txt] = ST[s.status];
      return `<tr><th scope="row">${esc(s.label)}<span class="cell-sub">${esc(s.note || '')}</span></th><td>${pill(tone, txt)}</td>
        <td class="wrap">${s.status === 'unavailable' ? `<span class="cell-sub">Todavía no disponible (Fase ${esc(s.phase)}).</span> ${esc(s.requires)}` : s.status === 'empty' ? 'Nada cargado todavía.' : `${esc(DS.ago(s.lastSync))}<span class="cell-sub">${s.files} archivo${s.files === 1 ? '' : 's'}</span>`}</td>
        <td>${per(s.period)}</td><td>${scoreHtml(s.score)}</td></tr>`; }).join('');
    const FR = { ok: 'ok', warning: 'warning', error: 'error' };
    const drows = b.datasets.map((d) => d.empty
      ? `<tr><th scope="row">${esc(d.label)}</th><td colspan="7"><span class="cell-sub">Sin archivos cargados.</span></td></tr>`
      : `<tr><th scope="row">${esc(d.label)}</th><td class="num">${d.files}</td><td class="num">${F.integer(d.records)}</td><td>${per(d.start ? { start: d.start, end: d.end } : null)}</td>
        <td>${d.fresh ? `${pill(FR[d.fresh.tone], d.fresh.daysBehind === 0 ? 'Al día' : `${d.fresh.daysBehind} día${d.fresh.daysBehind === 1 ? '' : 's'} de atraso`)}<span class="cell-sub">datos hasta ${esc(d.fresh.until)}</span>` : '—'}</td>
        <td>${esc(DS.ago(d.lastImport))}</td><td class="num">${d.quarantined ? F.integer(d.quarantined) : '0'}</td><td>${scoreHtml(d.score)}</td></tr>`).join('');
    return `${accStart(state, 'st-fuentes', 'Fuentes de datos', `De dónde vienen tus datos y cómo están. Hoy se alimenta con archivos (CSV y Excel, incluido el export de GA4); las conexiones directas llegarán por fases y aquí se verá su estado. «Última sincronización» es la última vez que se cargó algo de esa fuente.`)}
      <div class="panel__body stack">
        <p>${b.summary.activeSources} de ${b.summary.liveSources} fuentes disponibles hoy tienen datos${b.summary.lastSync ? `; la última carga fue ${esc(DS.ago(b.summary.lastSync))}` : ''}. ${b.summary.pendingSources} más están pendientes de conexión.</p>
        <div class="table-wrap"><table class="table ds-table" aria-label="Fuentes de datos"><thead><tr><th scope="col">Fuente</th><th scope="col">Estado</th><th scope="col">Última sincronización</th><th scope="col">Periodo disponible</th><th scope="col">Calidad</th></tr></thead><tbody>${srows}</tbody></table></div>
        <h4>Por tipo de dato</h4>
        <div class="table-wrap"><table class="table ds-table" aria-label="Datos cargados por tipo"><thead><tr><th scope="col">Tipo de dato</th><th scope="col" class="num">Archivos</th><th scope="col" class="num">Registros</th><th scope="col">Periodo</th><th scope="col">Frescura</th><th scope="col">Última carga</th><th scope="col" class="num">En cuarentena</th><th scope="col">Calidad</th></tr></thead><tbody>${drows}</tbody></table></div>
        <p class="field__hint">Frescura: días entre la última fecha con datos y hoy (al día hasta 2 días; atención de 3 a 7; atrasado más de 7). Se calcula para venta real y segmentos. La calidad es la Salud de los datos de Calidad de datos.</p>
      </div>${accEnd()}`;
  }

  /**
   * Fase H · transparencia y control de la IA: (1) registro de lo que salió hacia Cohere en esta sesión, (2) lo que la IA aprendió
   * (editable y borrable) y (3) columnas protegidas como datos personales. Nada de esto guarda ni muestra valores de ejemplo.
   */
  function aiControlPanels(state) {
    const esc = FP.ui.helpers.esc, C = FP.config, IMP = FP.importer;
    const log = FP.aiAudit.list();
    const hh = (iso) => { const d = new Date(iso); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':'); };
    const ST = { ok: ['ok', 'Respondió'], invalid: ['warning', 'Respuesta inválida'], unavailable: ['error', 'No respondió'] };
    const logRows = log.map((e) => { const [tone, txt] = ST[e.status] || ['na', e.status || '—'];
      return `<tr><td>${hh(e.at)}</td><td class="wrap">${esc(e.purpose)}</td><td>${esc(e.model || '—')}</td><td class="num">${e.columnsSent}</td><td class="num">${e.examplesSent}</td>
        <td class="wrap">${e.protectedColumns.length ? e.protectedColumns.map((p) => `${esc(p.header)} <span class="cell-sub">${esc(p.reason)}</span>`).join('<br>') : '—'}</td>
        <td class="num">${e.chars.toLocaleString('es-MX')}</td><td>${FP.ui.helpers.pill(tone, txt)}</td></tr>`; }).join('');
    const logPanel = `${accStart(state, 'st-ia-log', 'Qué se envió a Cohere en esta sesión', `Cada consulta que salió del navegador, con las columnas y los ejemplos que viajaron. El registro vive solo en esta sesión: no guarda valores de ejemplo ni las respuestas, y se pierde al recargar la página.`)}
      <div class="panel__body panel__body--flush">${log.length ? `<div class="table-wrap"><table class="table ds-table" aria-label="Consultas a Cohere">
        <thead><tr><th scope="col">Hora</th><th scope="col">Para qué</th><th scope="col">Modelo</th><th scope="col" class="num">Columnas</th><th scope="col" class="num">Ejemplos enviados</th><th scope="col">Columnas protegidas (sin ejemplos)</th><th scope="col" class="num">Caracteres enviados</th><th scope="col">Resultado</th></tr></thead><tbody>${logRows}</tbody></table></div>
        <div class="panel__body"><button type="button" class="btn" data-action="ia-log-clear">Borrar el registro</button></div>`
        : '<div class="empty"><strong>Todavía no se ha enviado nada a Cohere en esta sesión</strong>Cuando uses la IA (mapeo de columnas, tipo de archivo, Diagnóstico o Narrativa), cada consulta aparecerá aquí.</div>'}</div>${accEnd()}`;
    const learned = Object.entries(IMP.learnedMappings()).sort((a, b) => a[0].localeCompare(b[0]));
    const opts = (cur) => C.importFields.map((f) => `<option value="${esc(f.key)}" ${f.key === cur ? 'selected' : ''}>${esc(f.label)}</option>`).join('');
    const learnRows = learned.map(([h, f]) => `<tr><th scope="row">${esc(h)}</th><td><label class="visually-hidden" for="lr-${esc(h)}">Campo para la columna ${esc(h)}</label>
        <select id="lr-${esc(h)}" data-action="learn-set" data-header="${esc(h)}">${opts(f)}</select></td>
        <td><button type="button" class="btn btn--small" data-action="learn-del" data-header="${esc(h)}">Olvidar</button></td></tr>`).join('');
    const learnPanel = `${accStart(state, 'st-ia-aprendido', 'Lo que la IA ya aprendió', `Columnas que Cohere resolvió antes y que la app recuerda para no volver a preguntar. Si alguna quedó mal, cámbiala u olvídala. No afecta lo ya importado.`)}
      <div class="panel__body panel__body--flush">${learned.length ? `<div class="table-wrap"><table class="table ds-table" aria-label="Columnas aprendidas por la IA">
        <thead><tr><th scope="col">Columna (normalizada)</th><th scope="col">Campo en la app</th><th scope="col">Acción</th></tr></thead><tbody>${learnRows}</tbody></table></div>
        <div class="panel__body"><button type="button" class="btn" data-action="learn-clear">Olvidar todo lo aprendido</button></div>`
        : '<div class="empty"><strong>Todavía no hay columnas aprendidas</strong>Aparecerán aquí cuando la IA resuelva una columna con nombre desconocido al revisar un archivo.</div>'}</div>${accEnd()}`;
    const piiList = (state.settings.piiColumns || []).join('\n');
    const piiPanel = `${accStart(state, 'st-ia-privacidad', 'Datos personales: columnas protegidas', `A Cohere solo viajan los encabezados de las columnas que no se reconocen y hasta 3 ejemplos de cada una. Una columna viaja <strong>sin ejemplos</strong> cuando su nombre o su contenido parece correo, teléfono, RFC, CURP, nombre de persona, paciente, receta, diagnóstico, domicilio o identificador de cliente (o cuando tú la marcas aquí). Ante la duda se protege.`)}
      <div class="panel__body stack"><div class="field"><label class="field__hint" for="pii-text">Columnas que quieres proteger siempre (una por línea, tal como se llaman en tus archivos)</label>
        <textarea id="pii-text" class="alias-text" rows="4" spellcheck="false">${esc(piiList)}</textarea></div>
        <div class="btn-row"><button type="button" class="btn btn--primary" data-action="pii-save">Guardar columnas protegidas</button></div></div>${accEnd()}`;
    return logPanel + learnPanel + piiPanel;
  }

  /** Equivalencias de nombres: tabla editable + lo que la app no reconoció o ve duplicado (solo sugiere; el usuario decide). */
  function aliasPanel(state) {
    const esc = FP.ui.helpers.esc, AL = FP.aliases, C = FP.config;
    const rows = [];
    const btn = (field, from, to, label) => `<button type="button" class="btn btn--small" data-action="alias-add" data-field="${esc(field)}" data-from="${esc(from)}" data-to="${esc(to)}">${esc(label)}</button>`;
    // 1) Valores que no se reconocieron al revisar o importar (esta sesión)
    const opts = { canal: C.channels.map((c) => c.label), estado: C.products.states.map((x) => x[0]), tipo_entrega: C.products.deliveries.map((x) => x[1]) };
    AL.unknowns().slice(0, 15).forEach((u) => {
      const sg = opts[u.field] ? AL.suggest(u.value, opts[u.field]) : null;
      rows.push(`<tr><td>${esc(u.field)}</td><td><strong>${esc(u.value)}</strong></td><td class="num">${u.n}</td>
        <td class="wrap">${sg ? `¿Es «${esc(sg)}»? ${btn(u.field, u.value, sg, `Usar «${sg}»`)}` : `Sin sugerencia. Escribe: ${esc(u.field)}: ${esc(u.value)} = …`}</td></tr>`);
    });
    // 2) Nombres libres que parecen el mismo
    const groupsFor = (field, counts) => AL.similarGroups(counts).slice(0, 8).forEach((g) => {
      const others = g.variants.filter((v) => v.value !== g.canonical);
      rows.push(`<tr><td>${esc(field)}</td><td class="wrap">${g.variants.map((v) => `${esc(v.value)} (${v.n})`).join(' · ')}</td><td class="num">${g.variants.reduce((x, v) => x + v.n, 0)}</td>
        <td class="wrap">${others.map((v) => btn(field, v.value, g.canonical, `«${v.value}» → «${g.canonical}»`)).join(' ')}</td></tr>`);
    });
    const PS = FP.productStore;
    if (PS && PS.dims) {
      const cities = new Map(); (PS.dims.cities || []).forEach((c, i) => { if (i > 0 && c && c.name) cities.set(c.name, (cities.get(c.name) || 0) + 1); });
      const branches = new Map(); (PS.dims.branches || []).forEach((b, i) => { if (i > 0 && b) branches.set(b, 1); });
      groupsFor('ciudad', cities); groupsFor('sucursal', branches);
    }
    const inv = {}; Object.entries(AL.DIM_FIELD).forEach(([d, f]) => { inv[d] = f; });
    const seg = new Map();
    FP.dataStore.records(state.store, 'segments').forEach((r) => {
      const f = inv[r.dimension] || r.dimension; if (!f || !r.segment) return;
      if (!seg.has(f)) seg.set(f, new Map());
      const m = seg.get(f); m.set(r.segment, (m.get(r.segment) || 0) + 1);
    });
    seg.forEach((m, f) => groupsFor(f, m));
    return `${accStart(state, 'st-equivalencias', 'Equivalencias de nombres', `Para homologar canales, estados, ciudades, sucursales, fuentes, dispositivos y regiones entre archivos. Una por línea: <code>campo: valor = como debe quedar</code>. Se aplican al revisar o cargar un archivo; lo ya importado no cambia (quita el archivo y vuelve a cargarlo).`)}
      <div class="panel__body stack">
        <div class="field"><label class="field__hint" for="alias-text">Equivalencias (campos: ${esc(AL.FIELDS.join(', '))}). Ejemplos: <code>canal: tienda online = ecommerce</code> · <code>estado: Edo Mex = Estado de México</code> · <code>ciudad: Gdl = Guadalajara</code></label>
          <textarea id="alias-text" class="alias-text" rows="6" spellcheck="false">${esc(AL.serialize())}</textarea></div>
        <div class="btn-row"><button type="button" class="btn btn--primary" data-action="aliases-save">Guardar y aplicar</button></div>
        <p class="field__hint">Los dispositivos conocidos (Mobile, móvil, celular → Móvil; Desktop → Escritorio; Tablet → Tableta) se unifican solos al cargar segmentos.</p>
      </div>
      <div class="panel__body panel__body--flush">${rows.length ? `<div class="table-wrap"><table class="table ds-table">
        <thead><tr><th scope="col">Campo</th><th scope="col">Valor(es)</th><th scope="col" class="num">Veces</th><th scope="col">Sugerencia</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
        : '<div class="empty"><strong>Nada por homologar</strong>Aquí aparecen los valores que no se reconocieron al revisar archivos, y los nombres que parecen el mismo.</div>'}</div>
    ${accEnd()}`;
  }

  function render(state) {
    const esc = H().esc;
    const ai = state.dx;
    const link = (id, label) => `<li><a href="#${id}" data-jump="${id}">${esc(label)}</a></li>`;
    $('settings-view').innerHTML = `
      <section class="panel" aria-labelledby="t-settings">
        <div class="panel__head"><div>
          <h2 class="panel__title" id="t-settings">Configuración de RevNavigator</h2>
          <p class="panel__desc">Lo que configuras una vez y vale para toda la herramienta. Cada sección es un desplegable: ábrela para ver o cambiar lo que contiene; el resumen de cada una se ve aunque esté cerrada. Tu plan se configura aparte, en Configuración de planeación.</p>
        </div></div>
        <div class="panel__body stack">
          <div class="btn-row"><button type="button" class="btn" data-action="st-expand-all">Expandir todo</button><button type="button" class="btn" data-action="st-collapse-all">Contraer todo</button></div>
          <nav aria-label="Secciones de esta pantalla"><div class="stindex">
            <div><p class="stgroup">Herramienta</p><ul class="plain-list">${link('st-estado', 'Estado de la herramienta')}${link('st-modo', 'Modo de uso')}${link('st-otras', 'Otras preferencias')}${link('st-negocio', 'Negocio (Business Setup)')}</ul></div>
            <div><p class="stgroup">Datos</p><ul class="plain-list">${link('st-fuentes', 'Fuentes de datos')}${link('st-equivalencias', 'Equivalencias de nombres')}${link('st-almacenamiento', 'Almacenamiento')}</ul></div>
            <div><p class="stgroup">Inteligencia artificial</p><ul class="plain-list">${link('st-ia', 'Conexión con Cohere')}${link('st-ia-log', 'Qué se envió a Cohere')}${link('st-ia-aprendido', 'Lo que la IA aprendió')}${link('st-ia-privacidad', 'Datos personales protegidos')}</ul></div>
          </div></nav>
        </div>
      </section>

      <p class="stgroup stgroup--page">Herramienta</p>
      ${accStart(state, 'st-estado', 'Estado de la herramienta', 'El detalle de las píldoras del encabezado: año, meta anual, canales, estado de los datos y estado del motor.')}
        <div class="panel__body"><dl class="status-bar__list" id="status-bar"></dl></div>
      ${accEnd()}

      ${accStart(state, 'st-modo', 'Modo de uso', 'Cuánto detalle y ayuda se muestra en cada vista. Aprendiz explica más y te guía paso a paso; Analista muestra el detalle completo.')}
        <div class="panel__body">${H().segmented('ux-mode', FP.guidanceConfig.MODES, state.ux.mode)}</div>
      ${accEnd()}

      ${accStart(state, 'st-otras', 'Otras preferencias, en su vista', 'Siguen donde se usan: cambian el resultado de esa vista.')}
        <div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table ds-table">
          <thead><tr><th scope="col">Qué</th><th scope="col">Para qué sirve</th><th scope="col">Dónde está</th></tr></thead>
          <tbody>${ELSEWHERE.map((r) => `<tr><th scope="row">${esc(r.what)}</th><td class="wrap">${esc(r.desc)}</td><td class="wrap"><a href="#${r.view}" data-nav="${r.view}">${esc(r.where)}</a></td></tr>`).join('')}</tbody>
        </table></div></div>
      ${accEnd()}

      <p class="stgroup stgroup--page">Datos</p>
      ${sourcesPanel(state)}
      ${aliasPanel(state)}
      ${accStart(state, 'st-almacenamiento', 'Almacenamiento', 'Dónde se guardan tus datos en este navegador.')}
        <div class="panel__body">${FP.productView.storageBlock(state, { heading: false })}</div>
      ${accEnd()}

      <p class="stgroup stgroup--page">Inteligencia artificial</p>
      ${accStart(state, 'st-ia', 'Conexión con Cohere (análisis con IA)', 'La usan Diagnóstico, Recovery Center, Narrativa y el mapeo semántico de importaciones. Todas comparten esta misma conexión de Cohere; no se crea otra API key. Cohere no calcula ni cambia cifras.')}
        <div class="panel__body stack">
          <div class="field"><label for="dx-key-input" class="field__hint">API key de Cohere</label>
            <input id="dx-key-input" type="password" autocomplete="off" value="${esc(ai.apiKey || '')}" data-action="dx-key" placeholder="Pega tu API key"></div>
          <div class="field field--check"><label><input type="checkbox" data-action="dx-remember" ${ai.rememberKey ? 'checked' : ''}> Recordar la key en este navegador</label>
            <span class="field__hint">Se guarda en localStorage de este navegador y nunca se exporta. Cualquiera con acceso a este navegador podría verla.</span></div>
          <div class="field"><label for="dx-model" class="field__hint">Modelo</label>
            <input id="dx-model" type="text" value="${esc(ai.model)}" data-action="dx-model"></div>
        </div>
      ${accEnd()}
      ${aiControlPanels(state)}`;
    // Negocio vive en el HTML (no lo pinta esta función): su resumen y su estado abierto se sincronizan aquí
    const bz = FP.config.business || {}, nb = document.getElementById('st-negocio');
    const meta = document.getElementById('st-negocio-meta');
    if (meta) meta.textContent = bz.configured ? `${bz.name || 'Sin nombre'} · ${FP.config.currency}` : `Sin configurar · moneda ${FP.config.currency}`;
    if (nb && state.stOpen && state.stOpen['st-negocio'] !== undefined && nb.open !== state.stOpen['st-negocio']) nb.open = state.stOpen['st-negocio'];
  }

  // Los vínculos internos de esta pantalla abren la sección (si está cerrada) y llevan a ella sin cambiar de vista
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-jump]');
      if (!a) return;
      e.preventDefault();
      const el = document.getElementById(a.dataset.jump);
      if (!el) return;
      if (el.tagName === 'DETAILS' && !el.open) el.open = true;   // dispara «toggle»: queda registrado en state.stOpen
      el.scrollIntoView({ block: 'start' });
      const sum = el.querySelector ? el.querySelector('summary') : null;
      try { (sum || el).focus({ preventScroll: true }); } catch (err) { /* sin foco */ }
    });
    // «toggle» no burbujea: se escucha en captura para recordar qué secciones están abiertas aunque la pantalla se repinte
    document.addEventListener('toggle', (e) => {
      const d = e.target;
      if (d && d.matches && d.matches('details[data-st]') && FP.app && FP.app.state) (FP.app.state.stOpen || (FP.app.state.stOpen = {}))[d.dataset.st] = d.open;
    }, true);
  }

  FP.settingsView = { render, aliasPanel, SECTIONS };
})(typeof window !== 'undefined' ? window : globalThis);
