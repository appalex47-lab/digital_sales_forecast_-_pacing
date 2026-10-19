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

  /* ---------- Secciones fijas agrupadas en pestañas: cada pestaña muestra sus secciones completas, sin desplegables ---------- */
  const TABS = [
    { id: 'cuenta', label: 'Cuenta y nube', hint: 'Sesión, equipo y copia en la nube', sections: ['st-nube'] },
    { id: 'ia', label: 'Inteligencia artificial', hint: 'Conexión con Cohere y control de lo que se envía', sections: ['st-ia', 'st-ia-log', 'st-ia-aprendido', 'st-ia-privacidad'] },
    { id: 'datos', label: 'Datos', hint: 'Fuentes, equivalencias y almacenamiento', sections: ['st-fuentes', 'st-equivalencias', 'st-almacenamiento'] },
    { id: 'herramienta', label: 'Herramienta', hint: 'Estado, modo de uso y otras preferencias', sections: ['st-estado', 'st-modo', 'st-otras'] },
    { id: 'negocio', label: 'Negocio', hint: 'Contexto del negocio (Business Setup)', sections: ['st-negocio'] }
  ];
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  /** Resumen de una línea de cada sección (estado actual), para decidir si hace falta abrirla. */
  function metaFor(state, id) {
    const esc = FP.ui.helpers.esc, ai = state.dx;
    switch (id) {
      case 'st-estado': { const st = state.selfTest; return `Año ${state.year} · motor ${st && st.passed === st.total ? 'operativo' : 'con fallas'}`; }
      case 'st-modo': { const m = (FP.guidanceConfig.MODES || []).find((x) => x[0] === state.ux.mode); return m ? esc(m[1]) : ''; }
      case 'st-nube': { const c = state.cloud || {}; return c.last ? `Última copia: ${c.last.keys} bloques${c.last.verified ? ' · verificada' : ''}` : (c.session ? `Equipo ${esc(c.session.teamName || '')} · ${esc(c.session.email || '')}` : 'Sin sesión'); }
      case 'st-otras': return plural(ELSEWHERE.length, 'preferencia', 'preferencias');
      case 'st-fuentes': { const b = FP.dataSources.build(state); return `${b.summary.activeSources} de ${b.summary.liveSources} fuentes con datos`; }
      case 'st-equivalencias': return plural(FP.aliases.rules().length, 'equivalencia', 'equivalencias');
      case 'st-almacenamiento': return 'Dónde se guardan tus datos';
      case 'st-ia': return `${FP.cohereProxy && FP.cohereProxy.available() ? 'Servidor del equipo' : ai.apiKey ? 'API key en uso' : 'Sin API key'} · IA ${state.settings.enableAI === false ? 'desactivada' : 'activada'}`;
      case 'st-ia-log': return plural(FP.aiAudit.count(), 'consulta en esta sesión', 'consultas en esta sesión');
      case 'st-ia-aprendido': return plural(Object.keys(FP.importer.learnedMappings()).length, 'columna aprendida', 'columnas aprendidas');
      case 'st-ia-privacidad': return plural((state.settings.piiColumns || []).length, 'columna marcada a mano', 'columnas marcadas a mano');
      default: return '';
    }
  }
  /** Sección fija (no desplegable): título, resumen del estado actual a la derecha y su contenido siempre a la vista. */
  function accStart(state, id, title, desc) {
    return `<section class="panel stsec" id="${id}" data-st="${id}" tabindex="-1" aria-labelledby="${id}-t">
      <header class="stsec__head"><h3 class="panel__title stsec__title" id="${id}-t">${title}</h3><span class="stsec__meta">${metaFor(state, id)}</span></header>
      <div class="stsec__body">${desc ? `<p class="panel__desc">${desc}</p>` : ''}`;
  }
  const accEnd = () => '</div></section>';

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


  /** Volver a abrir la elección de tipo de uso (el recorrido guiado inicial). */
  function usePanel() {
    return `<section class="panel" id="st-uso"><div class="panel__body stack"><h3 class="panel__title">Tipo de uso</h3>
      <p class="field__hint">Si cambió lo que tienes (por ejemplo ya cargaste histórico o venta real), vuelve a elegir con qué datos cuentas y te muestro los pasos que te sirven. No borra ni cambia tus datos.</p>
      <div class="btn-row"><button type="button" class="btn" data-action="tour-change-path">Cambiar tipo de uso</button></div></div></section>`;
  }

  /** Nube (Supabase) con acceso por equipo: correo y contraseña; todos los miembros del equipo comparten la misma copia. */
  function cloudPanel(state) {
    const esc = FP.ui.helpers.esc, c = state.cloud || {}, s = c.session;
    const dis = c.busy ? 'disabled' : '';
    const who = s ? `<strong>${esc(s.email || '')}</strong> · equipo <strong>${esc(s.teamName || 'sin nombre')}</strong>` : 'sin sesión: inicia sesión para usar la nube';
    const account = s
      ? `<div class="field"><label class="field__hint" for="cloud-pw-new">Cambiar mi contraseña (mínimo 8 caracteres)</label>
          <input id="cloud-pw-new" type="password" autocomplete="new-password" placeholder="Contraseña nueva">
          <input id="cloud-pw-new2" type="password" autocomplete="new-password" placeholder="Repite la contraseña nueva"></div>
        <div class="btn-row"><button type="button" class="btn" data-action="cloud-password-change" ${dis}>Cambiar contraseña</button></div>`
      : `<div class="btn-row"><button type="button" class="btn btn--primary" data-action="login-open" ${dis}>Iniciar sesión</button></div>
        <p class="field__hint">Las cuentas las crea la persona administradora de tu equipo; no hay registro abierto. Si olvidaste tu contraseña, pídele que la restablezca.</p>`;
    return `${accStart(state, 'st-nube', 'Nube (Supabase)', 'Guarda una copia de tus datos en tu proyecto de Supabase y la restaura. Inicias sesión con tu cuenta; todas las personas de tu equipo ven los mismos datos y otro equipo solo ve los suyos.')}
        <div class="panel__body stack">
          <ul class="plain-list">
            <li>Sesión: ${who}</li>
            <li>Qué viaja: tus datos y configuración guardados en este navegador. Los datos de Productos viajan comprimidos (tope de 100 MB); <strong>no viaja</strong> la API key de Cohere.</li>
            <li>Dónde: tu proyecto de Supabase, protegido por reglas de acceso por cuenta. Confirma con tu empresa que es un destino permitido antes de subir información real.</li>
            <li>Es una copia <strong>compartida por el equipo</strong>: subir reemplaza lo que haya subido otra persona para esas mismas claves, y «Borrar» la quita para todos.</li>
          </ul>
          <div class="btn-row">
            <button type="button" class="btn btn--primary" data-action="cloud-upload" ${dis || !s ? 'disabled' : ''}>${c.busy ? 'Trabajando…' : 'Subir copia a la nube'}</button>
            <button type="button" class="btn" data-action="cloud-download" ${dis || !s ? 'disabled' : ''}>Restaurar desde la nube</button>
            <button type="button" class="btn btn--small" data-action="cloud-delete" ${dis || !s ? 'disabled' : ''}>Borrar copia de la nube</button>
            ${s ? `<button type="button" class="btn btn--small" data-action="cloud-signout" ${dis}>Cerrar sesión</button>` : ''}
            ${c.restored ? '<button type="button" class="btn btn--small btn--primary" data-action="bc-reload">Recargar y aplicar</button>' : ''}
          </div>
          <div class="field field--check"><label><input type="checkbox" data-action="cloud-auto-toggle" ${c.auto && c.auto.on ? 'checked' : ''} ${s ? '' : 'disabled'} ${dis}> Sincronizar automáticamente metas, supuestos y ajustes</label>
            <span class="field__hint">Solo lo liviano (metas, supuestos, versiones, equivalencias, enlaces de Sheets, negocio). Los datos pesados siguen subiéndose a mano. Si dos equipos cambian lo mismo, gana el cambio más reciente. No incluye preferencias por dispositivo ni la API key de Cohere.${s ? '' : ' Requiere una sesión: sube una copia primero.'}</span>
            <span class="field__hint" id="cloud-auto-status">${esc(c.auto && c.auto.on ? (c.auto.error ? `No se pudo sincronizar: ${c.auto.error}` : c.auto.last ? `Última sincronización: ${new Date(c.auto.last).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'Encendida: se sincroniza cuando cambies algo.') : 'Apagada: tus metas y ajustes solo se guardan en este navegador.')}</span></div>
          ${account}
          ${c.msg ? `<p class="note ${c.tone === 'bad' ? 'note--warning' : c.tone === 'ok' ? 'note--ok' : ''}" id="cloud-msg" role="status">${esc(c.msg)}</p>` : '<p class="note" id="cloud-msg" role="status" hidden></p>'}
        </div>
      ${accEnd()}`;
  }

  function render(state) {
    const esc = H().esc;
    const ai = state.dx;
    const tab = TABS.some((t) => t.id === state.stTab) ? state.stTab : 'herramienta';
    const cur = TABS.find((t) => t.id === tab);
    $('settings-view').innerHTML = `
      <section class="panel" aria-labelledby="t-settings">
        <div class="panel__head"><div data-own-head>
          <h2 class="panel__title" id="t-settings">Configuración de RevNavigator</h2>
          <p class="panel__desc">Lo que configuras una vez y vale para toda la herramienta, agrupado por tema. Tu plan se configura aparte, en Configuración de planeación.</p>
        </div></div>
        <div class="panel__body">
          <div class="sttabs" role="tablist" aria-label="Secciones de Configuración">${TABS.map((t) => `<button type="button" role="tab" class="sttab" id="sttab-${t.id}" data-action="st-tab" data-tab="${t.id}" aria-selected="${t.id === tab}" aria-controls="stp-${t.id}" tabindex="${t.id === tab ? 0 : -1}"><span class="sttab__l">${esc(t.label)}</span><span class="sttab__h">${esc(t.hint)}</span></button>`).join('')}</div>
        </div>
      </section>
      <div class="st-pane" id="stp-herramienta" data-pane="herramienta" role="tabpanel" aria-labelledby="sttab-herramienta">
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
      </div>`;
    const bEl = $('settings-view-b');
    if (bEl) bEl.innerHTML = `
      <div class="st-pane" id="stp-cuenta" data-pane="cuenta" role="tabpanel" aria-labelledby="sttab-cuenta">${cloudPanel(state)}${usePanel()}</div>
      <div class="st-pane" id="stp-ia" data-pane="ia" role="tabpanel" aria-labelledby="sttab-ia">
      ${accStart(state, 'st-ia', 'Conexión con Cohere (análisis con IA)', 'La usan Diagnóstico, Recovery Center, Narrativa y el mapeo semántico de importaciones. Todas comparten esta misma conexión de Cohere; no se crea otra API key. Cohere no calcula ni cambia cifras.')}
        <div class="panel__body stack">
          ${FP.cohereProxy && FP.cohereProxy.available()
            ? `<div class="note note--ok" data-ai-server><strong>La IA usa el servidor de tu equipo.</strong> Con tu sesión, Cohere se llama desde tu Supabase y la API key vive allá, no en este navegador. No necesitas pegar ninguna key.</div>
               <div class="btn-row"><button type="button" class="btn btn--small" data-action="dx-proxy-test" ${ai.proxyTest && ai.proxyTest.busy ? 'disabled' : ''}>${ai.proxyTest && ai.proxyTest.busy ? 'Probando…' : 'Probar la conexión del servidor'}</button></div>
               ${ai.proxyTest && ai.proxyTest.msg ? `<p class="note ${ai.proxyTest.ok ? 'note--ok' : 'note--warning'}" id="dx-proxy-msg" role="status">${esc(ai.proxyTest.msg)}</p>` : ''}
               <p class="field__hint">La key de abajo es solo un respaldo para cuando no inicies sesión o el servidor no esté disponible.</p>`
            : '<p class="field__hint" data-ai-local>Sin sesión de equipo: la IA usa la API key pegada aquí. Al iniciar sesión pasará al servidor del equipo y podrás quitarla de este navegador.</p>'}
          <div class="field"><label for="dx-key-input" class="field__hint">API key de Cohere (respaldo)</label>
            <input id="dx-key-input" type="password" autocomplete="off" value="${esc(ai.apiKey || '')}" data-action="dx-key" placeholder="Pega tu API key"></div>
          <div class="field field--check"><label><input type="checkbox" data-action="dx-remember" ${ai.rememberKey ? 'checked' : ''}> Recordar la key en este navegador</label>
            <span class="field__hint">Se guarda en localStorage de este navegador y nunca se exporta ni se sube a la nube. Cualquiera con acceso a este navegador podría verla.</span></div>
          <div class="note note--warning"><strong>Límite de seguridad.</strong> Esta app corre completa en tu navegador: una API key guardada aquí <em>no es un secreto seguro</em>. Cualquier extensión, script del mismo sitio o persona con acceso a este equipo puede leerla; ocultarla o codificarla no lo evita. Úsala solo en equipos personales, no la recuerdes en equipos compartidos y crea en Cohere una key propia con límite de gasto que puedas revocar. Con sesión de equipo la app usa el servidor intermedio (proxy) y esta key no hace falta.</div>
          <div class="btn-row"><button type="button" class="btn btn--small" data-action="dx-key-clear" ${ai.apiKey ? '' : 'disabled'}>Quitar la key de este navegador</button></div>
          <div class="field"><label for="dx-model" class="field__hint">Modelo</label>
            <input id="dx-model" type="text" value="${esc(ai.model)}" data-action="dx-model"></div>
        </div>
      ${accEnd()}
      ${aiControlPanels(state)}
      </div>
      <div class="st-pane" id="stp-datos" data-pane="datos" role="tabpanel" aria-labelledby="sttab-datos">
      ${sourcesPanel(state)}
      ${aliasPanel(state)}
      ${accStart(state, 'st-almacenamiento', 'Almacenamiento', 'Dónde se guardan tus datos en este navegador.')}
        <div class="panel__body">${FP.productView.storageBlock(state, { heading: false })}</div>
      ${accEnd()}
      </div>`;
    showTab(tab);
    // Negocio vive en el HTML (no lo pinta esta función): solo se actualiza su resumen
    const bz = FP.config.business || {};
    const meta = document.getElementById('st-negocio-meta');
    if (meta) meta.textContent = bz.configured ? `${bz.name || 'Sin nombre'} · ${FP.config.currency}` : `Sin configurar · moneda ${FP.config.currency}`;
    showTab(tab);
  }

  /** Muestra solo los paneles de la pestaña activa (Negocio vive en el HTML y se reconoce por data-pane). */
  function showTab(tab) {
    const root_ = document.getElementById('view-ajustes'); if (!root_) return;
    root_.querySelectorAll('[data-pane]').forEach((el) => { el.hidden = el.dataset.pane !== tab; });
    root_.querySelectorAll('.sttab').forEach((b) => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  }

  // Flechas, Inicio y Fin cambian de pestaña (patrón de pestañas de WAI-ARIA)
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
      const t = e.target && e.target.closest && e.target.closest('.sttab'); if (!t) return;
      const all = [...document.querySelectorAll('#view-ajustes .sttab')]; const i = all.indexOf(t);
      const n = e.key === 'ArrowRight' ? (i + 1) % all.length : e.key === 'ArrowLeft' ? (i - 1 + all.length) % all.length : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : -1;
      if (n < 0) return;
      e.preventDefault(); all[n].focus(); all[n].click();
    });
  }

  FP.settingsView = { render, aliasPanel, showTab, TABS };
})(typeof window !== 'undefined' ? window : globalThis);
