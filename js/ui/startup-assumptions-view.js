/**
 * startup-assumptions-view.js — «Supuestos de arranque» (Fase 14).
 * Guía para planear cuando faltan histórico o venta real: forma estándar del año (día de semana y eventos),
 * AOV general repartido a los canales según la meta de cada uno, y CR por canal con su fuente.
 * Todo es SUPUESTO del usuario: la app no trae cifras de industria; el benchmark lo captura el usuario con su fuente y año.
 * Solo presentación: el cálculo vive en planningEngine (resolveGeneralAov, standardShape).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const H = () => FP.ui.helpers;
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const DOW_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const SRC = [['own', 'Mi dato'], ['benchmark', 'Benchmark'], ['estimate', 'Estimación']];
  let userOpen = null;   // null = automático (abierto si no hay histórico ni venta real)
  let autoOpen = true;

  const num = (v) => (v === null || v === undefined || v === '' ? '' : String(v));
  const fmtMoney = (v) => (v === null || v === undefined ? '—' : FP.format.currency(v, 0));

  function hasData(state) {
    if (!state.store) return false;
    return FP.dataStore.records(state.store, 'historical').length > 0 || FP.dataStore.records(state.store, 'actual').length > 0;
  }

  function monthShares(state, cfg) {
    const ss = cfg.standardShape;
    const days = FP.calendar.daysOfYear(state.year);
    const sums = Array(12).fill(0);
    days.forEach((d) => {
      let f = 1;
      if (ss && ss.enabled) {
        f *= Number(ss.dayOfWeek[FP.calendar.getDateAttributes(d).dayOfWeekIndex - 1]) || 1;
        const md = d.slice(5);
        (ss.events || []).forEach((e) => { const v = Number(e.factor); if (v > 0 && FP.planning.inMMDD(md, e.from, e.to)) f *= v; });
      }
      sums[+d.slice(5, 7) - 1] += f;
    });
    const total = sums.reduce((a, b) => a + b, 0);
    return sums.map((x) => x / total);
  }

  function srcSelect(action, value, attrs, label) {
    return `<select aria-label="${H().esc(label)}" data-action="${action}" ${attrs}>${SRC.map(([k, l]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  }

  function render(state) {
    const esc = H().esc;
    const cfg = FP.seasonality.effectiveConfig(state.planning.settings);
    const ss = cfg.standardShape, ga = cfg.generalAov;
    const data = hasData(state);
    autoOpen = !data;
    const open = userOpen === null ? autoOpen : userOpen;
    const genValue = FP.planning.generalAovValue(ga);
    const explicit = FP.planning.explicitPlan(state.store, state.year);
    const res = FP.planning.resolveGeneralAov({ cfg, year: state.year, targets: state.targets, explicit, profiles: state.planning.profiles });
    const revs = Object.fromEntries(C().channelIds.map((ch) => [ch, state.targets.byChannel[ch] ? state.targets.byChannel[ch].revenue : null]));
    const totalRev = Object.values(revs).reduce((a, v) => a + (v > 0 ? v : 0), 0);
    const shares = monthShares(state, cfg);

    const intro = data
      ? '<p class="field__hint">Ya tienes datos: estos supuestos se usan solo donde falte histórico (el histórico siempre manda).</p>'
      : '<div class="ds-alert ds-alert--warning" role="note"><strong>Aún no hay histórico ni venta real.</strong> El plan se calculará con lo que captures aquí; cada cifra queda marcada como <em>Supuesto</em> y se afinará con tu venta real (la app te lo propondrá, nunca lo cambia sola).</div>';

    const shape = `
      <h4 class="h4">1 · Forma del año: ¿cómo se reparte la meta?</h4>
      <p class="field__hint">Sin histórico la app reparte parejo por días del calendario. Aquí puedes indicar tus días fuertes y tus eventos. El peso de cada mes sale de la suma de sus días.</p>
      <div class="field"><label><input type="checkbox" data-action="ss-toggle" ${ss.enabled ? 'checked' : ''}> Usar mi forma estándar donde falte histórico</label></div>
      ${ss.enabled ? `
        <div class="field"><span class="field__label">Día de la semana (1 = día normal)</span>
          <div class="settings-grid settings-grid--7">${DOW.map((d, i) => `<label class="field"><span>${d}<span class="sr-only">${DOW_FULL[i].slice(1)}</span></span>
            <input type="number" min="0.1" max="5" step="0.05" value="${esc(ss.dayOfWeek[i])}" aria-label="Factor ${DOW_FULL[i]}" data-action="ss-dow" data-i="${i}"></label>`).join('')}</div></div>
        <div class="field"><span class="field__label">Eventos y temporadas (se repiten cada año; el rango puede cruzar fin de año)</span>
          ${(ss.events || []).length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Evento</th><th>Desde (MM-DD)</th><th>Hasta (MM-DD)</th><th>Factor</th><th></th></tr></thead><tbody>
            ${ss.events.map((e, i) => `<tr>
              <td><input type="text" aria-label="Nombre del evento ${i + 1}" value="${esc(e.name || '')}" placeholder="Ej. Buen Fin" data-action="ss-event-set" data-i="${i}" data-f="name"></td>
              <td><input type="text" aria-label="Desde ${i + 1}" value="${esc(e.from || '')}" placeholder="11-13" maxlength="5" data-action="ss-event-set" data-i="${i}" data-f="from"></td>
              <td><input type="text" aria-label="Hasta ${i + 1}" value="${esc(e.to || '')}" placeholder="11-16" maxlength="5" data-action="ss-event-set" data-i="${i}" data-f="to"></td>
              <td><input type="number" min="0.1" max="10" step="0.05" aria-label="Factor ${i + 1}" value="${esc(e.factor)}" data-action="ss-event-set" data-i="${i}" data-f="factor"></td>
              <td><button type="button" class="btn btn--quiet" aria-label="Quitar evento ${i + 1}" data-action="ss-event-del" data-i="${i}">Quitar</button></td></tr>`).join('')}
          </tbody></table></div>` : '<p class="field__hint">Aún no hay eventos.</p>'}
          <div class="btn-row"><button type="button" class="btn" data-action="ss-event-add">Agregar evento</button></div>
          <p class="field__hint">Los factores son tuyos: la app no sugiere cifras. Si un evento cambia de fecha cada año (Buen Fin, Hot Sale), edítalo antes de generar el plan.</p></div>
        <p class="field__hint num"><strong>Cómo pesaría cada mes del año con esta forma:</strong> ${shares.map((x, i) => `${MONTHS[i]} ${FP.format.percent(x, 1)}`).join(' · ')}</p>` : ''}`;

    const linesBlock = ga.mode === 'lines' ? `
      <div class="field"><span class="field__label">Mis líneas de producto o servicio</span>
        ${(ga.lines || []).length ? `<div class="table-wrap"><table class="table ds-table"><thead><tr><th>Línea</th><th>AOV (${C().currency})</th><th>% de pedidos</th><th></th></tr></thead><tbody>
          ${ga.lines.map((l, i) => `<tr>
            <td><input type="text" aria-label="Nombre de la línea ${i + 1}" value="${esc(l.name || '')}" data-action="gaov-line-set" data-i="${i}" data-f="name"></td>
            <td><input type="number" min="0" step="0.01" aria-label="AOV de la línea ${i + 1}" value="${esc(num(l.aov))}" data-action="gaov-line-set" data-i="${i}" data-f="aov"></td>
            <td><input type="number" min="0" max="100" step="0.1" aria-label="Porcentaje de pedidos de la línea ${i + 1}" value="${esc(num(l.share))}" data-action="gaov-line-set" data-i="${i}" data-f="share"></td>
            <td><button type="button" class="btn btn--quiet" aria-label="Quitar línea ${i + 1}" data-action="gaov-line-del" data-i="${i}">Quitar</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="field__hint">Agrega tus líneas con su AOV y el % de pedidos que representa cada una.</p>'}
        <div class="btn-row"><button type="button" class="btn" data-action="gaov-line-add">Agregar línea</button></div>
        ${(() => { const s = (ga.lines || []).reduce((a, l) => a + (Number(l.share) || 0), 0); return `<p class="field__hint">Suma de % de pedidos: <strong>${FP.format.decimal(s, 1)}%</strong>${Math.abs(s - 100) < 0.05 ? ' ✓' : s > 0 ? ' (no suma 100: se normaliza)' : ''}. AOV general = Σ (% de pedidos × AOV de la línea). Usa % de <em>pedidos</em>, no de venta.</p>`; })()}</div>` : '';

    const gaov = `
      <h4 class="h4">2 · Ticket promedio (AOV) y conversión (CR)</h4>
      <p class="field__hint">Pedidos = venta ÷ AOV; tráfico = pedidos ÷ CR. Captura un <strong>AOV general</strong>: cada canal lo hereda y la meta de cada canal pesa en el resultado. Si un canal tiene un ticket distinto, ponle su AOV propio y los demás se ajustan para que el total digital siga en el AOV general.</p>
      <div class="settings-grid">
        <div class="field"><label for="gaov-mode">AOV general viene de</label>
          <select id="gaov-mode" data-action="gaov-mode"><option value="manual" ${ga.mode !== 'lines' ? 'selected' : ''}>Un número que capturo</option><option value="lines" ${ga.mode === 'lines' ? 'selected' : ''}>Mis líneas de producto o servicio</option></select></div>
        <div class="field"><label for="gaov-value">AOV general (${C().currency})</label>
          ${ga.mode === 'lines' ? `<input id="gaov-value" type="text" readonly value="${genValue === null ? '' : esc(FP.format.currency(genValue, 2))}"><span class="field__hint">Generado de tus líneas.</span>`
            : `<input id="gaov-value" type="number" min="0" step="0.01" value="${esc(num(ga.value))}" data-action="gaov-value">`}</div>
        <div class="field"><label for="gaov-source">Origen del AOV general</label>${srcSelect('gaov-source', ga.source, 'id="gaov-source"', 'Origen del AOV general')}</div>
        <div class="field"><label for="gaov-ref">Fuente y año</label>
          <input id="gaov-ref" type="text" value="${esc(ga.ref || '')}" placeholder="${ga.source === 'benchmark' ? 'Obligatorio: estudio y año' : 'Opcional'}" data-action="gaov-ref">
          ${ga.source === 'benchmark' && !String(ga.ref || '').trim() ? '<span class="field__hint neg">Falta la fuente y el año del benchmark.</span>' : ''}</div>
      </div>
      ${linesBlock}
      ${res.issue ? `<div class="ds-alert ds-alert--warning" role="alert">${esc(res.issue)}</div>` : ''}
      <div class="table-wrap"><table class="table ds-table"><thead><tr><th>Canal</th><th class="num">% de la meta</th><th class="num">AOV del canal</th><th>AOV propio (${C().currency})</th><th>CR (%)</th><th>Origen del CR</th><th>Fuente y año</th></tr></thead><tbody>
        ${C().channels.map((c) => {
          const a = cfg.assumptions[c.id] || {}, r = res.byChannel[c.id], rev = revs[c.id];
          const own = a.aov > 0;
          const eff = own ? a.aov : r ? r.value : null;
          const tag = own ? 'Propio' : r ? (r.kind === 'adjusted' ? 'Ajustado' : 'Hereda') : (genValue ? '' : '');
          const cs = cfg.crSource[c.id];
          return `<tr><td><span class="channel-cell" style="--dot:${c.color}">${esc(c.label)}</span></td>
            <td class="num">${rev > 0 && totalRev > 0 ? FP.format.percent(rev / totalRev, 1) : '—'}<span class="cell-sub">${rev > 0 ? fmtMoney(rev) : 'Sin meta'}</span></td>
            <td class="num">${eff ? fmtMoney(eff) : '—'}${tag ? `<span class="cell-sub">${tag}</span>` : ''}</td>
            <td><input type="number" min="0" step="0.01" aria-label="AOV propio ${esc(c.label)}" value="${esc(num(a.aov))}" placeholder="Hereda" data-action="plan-assumption" data-channel="${c.id}" data-key="aov"></td>
            <td><input type="number" min="0" max="100" step="0.01" aria-label="CR ${esc(c.label)} en porcentaje" value="${a.conversionRate ? esc(Math.round(a.conversionRate * 1e6) / 1e4) : ''}" data-action="cr-pct" data-channel="${c.id}"></td>
            <td>${srcSelect('cr-source', cs.type, `data-channel="${c.id}"`, `Origen del CR ${c.label}`)}</td>
            <td><input type="text" aria-label="Fuente y año del CR ${esc(c.label)}" value="${esc(cs.ref || '')}" placeholder="${cs.type === 'benchmark' ? 'Obligatorio' : '—'}" data-action="cr-ref" data-channel="${c.id}">
              ${cs.type === 'benchmark' && !String(cs.ref || '').trim() && a.conversionRate ? '<span class="field__hint neg">Falta fuente y año.</span>' : ''}</td></tr>`;
        }).join('')}
      </tbody></table></div>
      <p class="field__hint">WhatsApp y Llamadas no tienen «sesiones» como la web: su CR es contactos que se vuelven pedido; define qué cuenta como tráfico en esos canales. La CR se captura por canal porque cambia mucho entre ellos. La app no trae benchmarks: si usas uno, captura su fuente y año.</p>`;

    return `<details class="ds-accordion ds-accordion--plain" id="startup-assumptions" ${open ? 'open' : ''}>
      <summary><span>Supuestos de arranque${data ? '' : ' · guía para llenar lo que aún no tienes'}</span><svg class="ds-accordion__chev" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg></summary>
      <div class="ds-accordion__body stack">${intro}${shape}${gaov}</div></details>`;
  }

  /** Recuerda si la persona abrió o cerró la guía (el render la vuelve a dibujar). */
  function bind() {
    const d = document.getElementById('startup-assumptions');
    if (d) d.addEventListener('toggle', () => { userOpen = d.open === autoOpen ? null : d.open; });
  }

  /**
   * Dónde vive la guía: en «Metas y motor» (junto a las metas que alimentan el plan) mientras NO haya histórico ni venta real;
   * en cuanto hay datos, se mueve a «Configuración de planeación» (plegada). Nunca está en los dos sitios a la vez.
   */
  function sync(state) {
    const data = hasData(state);
    const host = document.getElementById('startup-assumptions-host');
    if (host && data) host.innerHTML = '';
    if (!data) { const old = document.querySelector('#plan-config #startup-assumptions'); if (old) old.remove(); }
  }
  function mountInGoals(state) {
    const host = document.getElementById('startup-assumptions-host');
    if (!host) return;
    host.innerHTML = hasData(state) ? '' : render(state);
    bind();
  }

  FP.startupAssumptionsView = { render, bind, hasData, sync, mountInGoals };
})(typeof window !== 'undefined' ? window : globalThis);
