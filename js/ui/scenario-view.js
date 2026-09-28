/**
 * scenario-view.js — Recovery Center, parte de escenarios (Fase 6).
 * Simulador (Nivel 1 y segmentos), "¿qué tendría que cambiar?", escenarios guardados,
 * "¿cuánto del gap puedo recuperar?" y comparación. Todo lo que se ve aquí es SIMULADO.
 * Solo pinta: los cálculos vienen de FP.scenarioEngine y FP.recoveryEngine.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const F = () => FP.format;
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  const money = (v) => F().currency(v, 0);
  const signedMoney = (v) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${F().currency(Math.abs(v), 0)}` : F().DASH);
  const pct = (v, d = 1) => F().percent(v, d);
  const spct = (v, d = 1) => F().signedPercent(v, d);
  const pp = (v) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${(Math.abs(v) * 100).toFixed(2)} pp` : F().DASH);
  const SIM = '<span class="tag tag--sim">Simulado</span>';

  /** Texto de los cambios de un escenario, sin confundir pp con %. */
  function changesText(c) {
    const out = [];
    if (c.trafficPct) out.push(`Volumen ${spct(c.trafficPct)}`);
    if (c.crValue) out.push(c.crMode === 'pp' ? `CR ${pp(c.crValue)}` : `CR ${spct(c.crValue)} relativo`);
    if (c.aovValue) out.push(c.aovMode === 'abs' ? `AOV ${signedMoney(c.aovValue)}` : `AOV ${spct(c.aovValue)}`);
    return out.join(', ') || 'Sin cambios (base)';
  }

  function targetText(t) {
    if (!t || t.type !== 'segment') return 'Canal completo';
    const d = C().diagnostics.dimensions[t.dimension];
    return `${d ? d.label : t.dimension}: ${t.segmentLabel || t.segment}`;
  }

  /* ---------- Simulador ---------- */

  function renderSimulator(state) {
    const esc = H().esc;
    const rc = state.rc;
    const d = rc.draft;
    const ctx = rc.ctx;
    const targets = FP.scenarioEngine.availableTargets(ctx);
    const hyps = rc.analysis ? rc.analysis.hypotheses : [];
    const r = rc.preview;
    const num = (key, value, label, hint, step = '0.01') => `<div class="field"><label for="rc-${key}" class="field__hint">${esc(label)}</label>
      <input id="rc-${key}" type="number" step="${step}" value="${esc(value)}" data-action="rc-draft" data-key="${key}"><span class="field__hint">${esc(hint)}</span></div>`;
    const row = (label, k, fmt) => {
      const b = r && r.valid ? r.base[k] : null, s = r && r.valid ? r.scenario[k] : null;
      const dl = fin(b) && fin(s) ? s - b : null;
      const dtxt = k === 'conversionRate' ? pp(dl) : k === 'revenue' || k === 'aov' ? signedMoney(dl) : fin(dl) ? `${dl > 0 ? '+' : ''}${F().integer(dl)}` : F().DASH;
      return `<tr><th scope="row">${esc(label)}</th><td class="num">${esc(fmt(b))}</td><td class="num">${esc(fmt(s))}</td>
        <td class="num">${esc(dtxt)}<span class="cell-sub">${esc(fin(b) && fin(s) && b !== 0 ? spct(s / b - 1) : '')}</span></td></tr>`;
    };
    const g = r && r.valid ? r.gap : null;
    $('rc-simulator').innerHTML = `
      <div class="subhead"><h3 class="panel__title">Simulador de escenario ${SIM}</h3>
        <span class="field__hint">Esto es una simulación: no modifica plan, actual, forecast ni reforecast.</span></div>
      <div class="settings-grid settings-grid--sim">
        ${num('trafficPct', d.trafficPct, 'Volumen (%)', 'Ej. 5 = +5 %', '0.1')}
        <div class="field"><label for="rc-crMode" class="field__hint">CR en</label>
          <select id="rc-crMode" data-action="rc-draft" data-key="crMode">
            <option value="pp" ${d.crMode === 'pp' ? 'selected' : ''}>Puntos porcentuales (pp)</option>
            <option value="pct" ${d.crMode === 'pct' ? 'selected' : ''}>% relativo</option></select></div>
        ${num('crValue', d.crValue, d.crMode === 'pp' ? 'CR (pp)' : 'CR (% relativo)', d.crMode === 'pp' ? 'Ej. 0.15 = +0.15 pp (no +15 %)' : 'Ej. 10 = +10 % del CR actual')}
        <div class="field"><label for="rc-aovMode" class="field__hint">AOV en</label>
          <select id="rc-aovMode" data-action="rc-draft" data-key="aovMode">
            <option value="pct" ${d.aovMode === 'pct' ? 'selected' : ''}>%</option>
            <option value="abs" ${d.aovMode === 'abs' ? 'selected' : ''}>Pesos</option></select></div>
        ${num('aovValue', d.aovValue, d.aovMode === 'pct' ? 'AOV (%)' : 'AOV (pesos)', d.aovMode === 'pct' ? 'Ej. 3 = +3 %' : 'Ej. 50 = +$50 por pedido', d.aovMode === 'pct' ? '0.1' : '1')}
        <div class="field"><label for="rc-target" class="field__hint">Aplicar a</label>
          <select id="rc-target" data-action="rc-draft" data-key="target">
            <option value="channel">Canal completo</option>
            ${targets.map((t) => `<optgroup label="${esc(t.label)}">${t.segments.map((s) => { const v = `${t.dimension}::${s.key}`;
              return `<option value="${esc(v)}" ${d.target === v ? 'selected' : ''}>${esc(s.label)}</option>`; }).join('')}</optgroup>`).join('')}
          </select><span class="field__hint">${targets.length ? 'Segmentos que existen en los datos.' : 'Sin datos de segmentos: solo canal completo.'}</span></div>
      </div>
      ${(() => { const h = hyps.find((x) => x.id === d.hypothesisId); const pd = r && r.valid ? FP.scenarioEngine.primaryDriver(r.changes) : null;
        return h && pd && h.driver && h.driver !== pd ? `<p class="note note--warning">La hipótesis ${esc(h.id)} es sobre ${esc(C().metrics[h.driver].label)} y este escenario mueve principalmente ${esc(C().metrics[pd].label)}. Puedes guardarlo, pero la cadena quedará mezclada.</p>` : ''; })()}
      ${r && r.errors.length ? `<ul class="issues issues--block">${r.errors.map((e) => `<li>${H().pill('error', 'No válido')} <span>${esc(e)}</span></li>`).join('')}</ul>` : ''}
      ${r && r.warnings.length ? `<ul class="issues issues--block">${r.warnings.map((e) => `<li>${H().pill('warning', 'Advertencia')} <span>${esc(e)}</span></li>`).join('')}</ul>` : ''}
      ${r && r.valid ? `
      <div class="grid-2 grid-2--tight">
        <div class="table-wrap"><table class="table table--matrix">
          <thead><tr><th>Variable</th><th class="num">Base</th><th class="num">Escenario ${SIM}</th><th class="num">Δ</th></tr></thead>
          <tbody>
            ${row('Volumen', 'trafficVolume', (v) => F().integer(v))}
            ${row('CR', 'conversionRate', (v) => F().percent(v, 2))}
            ${row('AOV', 'aov', (v) => F().currency(v, 2))}
            ${row('Pedidos', 'orders', (v) => F().integer(v))}
            ${row('Venta', 'revenue', money)}
          </tbody></table></div>
        <dl class="kpis kpis--2x">
          <div><dt>Venta incremental simulada</dt><dd class="num">${esc(signedMoney(r.incremental.revenue))}</dd><small>Impacto potencial bajo este escenario</small></div>
          <div><dt>Brecha antes</dt><dd class="num">${esc(g.noGap ? 'Sin brecha' : money(g.gapBefore))}</dd><small>Plan ${esc(money(g.plan))} − base ${esc(money(g.base))}</small></div>
          <div><dt>Gap restante bajo el escenario</dt><dd class="num">${esc(g.noGap ? '—' : money(g.gapAfter))}</dd><small>${esc(g.noGap ? 'La base ya alcanza el plan' : `${pct(g.remainingPercent)} del gap`)}</small></div>
          <div><dt>Recovery simulado</dt><dd class="num">${esc(g.noGap ? '—' : pct(g.recoveryPercent))}</dd><small>Del gap del periodo</small></div>
          <div><dt>Impacto en total digital</dt><dd class="num">${esc(signedMoney(r.digital.incremental.revenue))}</dd><small>Solo cambia el alcance simulado</small></div>
          <div><dt>Días donde aplica</dt><dd class="num">${r.editable.days}</dd><small>${esc(ctx.applyTo === 'all' ? 'Todo el periodo (retrospectivo)' : 'Días no cerrados')}</small></div>
        </dl>
      </div>
      <details class="disclosure"><summary>¿De dónde salen estas cifras?</summary><div class="panel__body"><ul class="plain-list">${r.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}
        <li>Plan: ${esc(ctx.planVersion ? ctx.planVersion.label : 'del archivo importado')} · periodo ${esc(ctx.period.label)} · canal ${esc(FP.scenarioEngine.chLabel(ctx.channel))}.</li></ul></div></details>` : ''}
      <div class="filters rc-save">
        <div class="field"><label for="rc-hyp" class="field__hint">Hipótesis que origina el escenario</label>
          <select id="rc-hyp" data-action="rc-draft" data-key="hypothesisId"><option value="">Sin hipótesis (exploración)</option>
            ${hyps.map((h) => `<option value="${esc(h.id)}" ${d.hypothesisId === h.id ? 'selected' : ''}>${esc(h.id)} · ${esc(h.hypothesis.slice(0, 90))}</option>`).join('')}</select></div>
        <div class="field"><label for="rc-name" class="field__hint">Nombre</label>
          <input id="rc-name" type="text" value="${esc(d.name)}" data-action="rc-draft" data-key="name" placeholder="Ej. CR mobile recurrente"></div>
        <div class="field"><label for="rc-type" class="field__hint">Tipo</label>
          <select id="rc-type" data-action="rc-draft" data-key="type">${Object.entries(C().recovery.scenarioTypes).map(([k, l]) =>
            `<option value="${k}" ${d.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><span class="field__hint">&nbsp;</span><div class="btn-row">
          <button type="button" class="btn btn--primary" data-action="rc-save-scenario" ${r && r.valid ? '' : 'disabled'}>${d.supersedes ? `Guardar como nueva versión de ${esc(d.supersedes)}` : 'Guardar escenario'}</button>
          <button type="button" class="btn btn--ghost" data-action="rc-draft-reset">Limpiar</button></div></div>
      </div>`;
  }

  /* ---------- ¿Qué tendría que cambiar? ---------- */

  function renderInverse(state) {
    const esc = H().esc;
    const rc = state.rc;
    const ro = rc.analysis ? rc.analysis.recoveryOptions : null;
    const tp = rc.settings.targetPct;
    const seg = H().segmented('rc-target-pct', C().recovery.recoveryTargets.map((t) => [String(t), `${Math.round(t * 100)} %`]), String(tp));
    if (!ro || !ro.ok) {
      $('rc-inverse').innerHTML = `<div class="subhead"><h3 class="panel__title">¿Qué tendría que cambiar? ${SIM}</h3>${seg}</div>
        <p class="note">${esc(ro ? ro.reason : 'Sin contexto.')}</p>`;
      return;
    }
    const rows = ro.alternatives.map((a) => {
      const x = a.display;
      const parts = [];
      if (a.drivers.includes('trafficVolume')) parts.push(`Volumen ${spct(x.trafficPct)}`);
      if (a.drivers.includes('conversionRate')) parts.push(`CR ${pp(x.crPP)} (${spct(x.crRelPct)} relativo; de ${F().percent(x.crFrom, 2)} a ${F().percent(x.crTo, 2)})`);
      if (a.drivers.includes('aov')) parts.push(`AOV ${spct(x.aovPct)}`);
      return `<tr><td><strong>${a.id}</strong> · ${esc(a.label)}</td><td class="wrap">${esc(parts.join('; '))}</td>
        <td class="num">${a.simulated ? esc(signedMoney(a.simulated.incremental)) : F().DASH}</td>
        <td class="num">${a.simulated ? esc(pct(a.simulated.recoveryPercent)) : F().DASH}</td>
        <td>${!a.feasible ? H().pill('error', 'No posible') + `<span class="cell-sub">${esc(a.errors[0] || '')}</span>` : a.exceedsConstraints.length ? H().pill('warning', 'Excede restricción') + `<span class="cell-sub">${esc(a.exceedsConstraints.join(' '))}</span>` : H().pill('ok', 'Dentro de restricciones')}</td>
        <td><button type="button" class="btn btn--small" data-action="rc-use-alt" data-id="${a.id}" ${a.feasible ? '' : 'disabled'}>Llevar al simulador</button></td></tr>`;
    }).join('');
    const mw = ro.maxWithinConstraints;
    $('rc-inverse').innerHTML = `
      <div class="subhead"><h3 class="panel__title">¿Qué tendría que cambiar? ${SIM}</h3>
        <div class="field"><span class="field__hint">Objetivo de recuperación del gap</span>${seg}</div></div>
      <p>Para recuperar <strong>${esc(pct(tp, 0))}</strong> del gap (${esc(money(ro.required))} de ${esc(money(ro.gap.gapBefore))}) ${rc.ctx.aggregated ? 'en la parte restante del periodo' : `en ${ro.editableDays} días`}:</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Alternativa</th><th>Cambio requerido</th><th class="num">Venta simulada</th><th class="num">Recovery</th><th>Restricciones</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      ${mw ? `<p class="note">Con todos los drivers en su restricción máxima (${esc(changesText(mw.changes))}): ${mw.error ? esc(mw.error) : `recovery simulado ${esc(pct(mw.recoveryPercent))}, gap restante ${esc(money(mw.gapAfter))}.`}</p>` : ''}
      <p class="field__hint">${esc(ro.note)} Dos o tres drivers: mismo cambio relativo en cada uno. Cálculo inverso matemático, no recomendación.</p>`;
  }

  /* ---------- Escenarios guardados, recuperación y comparación ---------- */

  function renderSaved(state) {
    const esc = H().esc;
    const rc = state.rc;
    const list = rc.analysis ? rc.analysis.scenarios : [];
    const ctx = rc.ctx;
    const base = rc.base;
    if (!list.length) {
      $('rc-saved').innerHTML = `<div class="subhead"><h3 class="panel__title">¿Cuánto del gap puedo recuperar? ${SIM}</h3></div>
        <p class="note">Aún no hay escenarios guardados para este canal y periodo.</p>`;
      return;
    }
    const sel = new Set(rc.selected.filter((id) => list.some((s) => s.scenarioId === id)));
    const gapBefore = base && base.valid ? base.gap.gapBefore : null;
    const chosen = list.filter((s) => sel.has(s.scenarioId));
    const sumInc = chosen.reduce((a, s) => a + (s.expectedImpact.incrementalValue || 0), 0);
    const rows = list.map((s) => `<tr>
      <td><input type="checkbox" data-action="rc-select" data-id="${esc(s.scenarioId)}" ${sel.has(s.scenarioId) ? 'checked' : ''} aria-label="Seleccionar ${esc(s.name)}"></td>
      <td><strong>${esc(s.name)}</strong> <span class="chip">${esc(C().recovery.scenarioTypes[s.type] || s.type)}</span><span class="cell-sub">${esc(s.scenarioId)}${s.supersedes ? ` · reemplaza a ${esc(s.supersedes)}` : ''} · ${esc(s.createdAt.slice(0, 16).replace('T', ' '))}</span></td>
      <td class="wrap">${esc(changesText(s.inputs))}<span class="cell-sub">${esc(targetText(s.target))}</span></td>
      <td class="wrap"><span class="cell-sub">${s.links.hypothesisId ? `${esc(s.links.hypothesisId)}: ${esc((s.links.hypothesis || '').slice(0, 80))}` : 'Sin hipótesis'}</span></td>
      <td class="num">${esc(signedMoney(s.expectedImpact.incrementalValue))}</td>
      <td class="num">${esc(fin(s.expectedImpact.recoveryPercent) ? pct(s.expectedImpact.recoveryPercent) : '—')}</td>
      <td><button type="button" class="btn btn--small btn--ghost" data-action="rc-edit-scenario" data-id="${esc(s.scenarioId)}">Nueva versión</button></td></tr>`).join('');

    // Plan / actual / forecast / reforecast / escenarios (líneas de cierre)
    const scope = FP.scenarioEngine.scopeOf(ctx);
    const refc = scope.every((ch) => ctx.byChannel[ch].reforecast) ? scope.reduce((a, ch) => a + ctx.byChannel[ch].reforecast.revenue, 0) : null;
    const lines = [
      ['Plan original', base && base.valid ? base.plan.revenue : null, 'plan'],
      ['Actual acumulado', FP.recoveryEngine.runRecoveryAnalysis ? (rc.analysis.gap ? rc.analysis.gap.actualToDate : null) : null, 'actual'],
      ['Forecast (base)', base && base.valid ? base.base.revenue : null, 'forecast'],
      ['Reforecast requerido', refc, 'reforecast'],
      ...chosen.map((s) => [`${s.name} ${'(simulado)'}`, s.outputs.scenario.revenue, 'scenario'])
    ];
    const max = Math.max(...lines.map((l) => l[1]).filter(fin), 1);
    const comp = chosen.slice(0, 4);
    const cmpRow = (label, get, fmt) => `<tr><th scope="row">${esc(label)}</th><td class="num">${esc(fmt(get(base && base.valid ? { outputs: { scenario: base.base, gap: base.gap } } : null, true)))}</td>
      ${comp.map((s) => `<td class="num">${esc(fmt(get(s)))}</td>`).join('')}</tr>`;
    const sc = (s) => (s ? s.outputs.scenario : null);
    $('rc-saved').innerHTML = `
      <div class="subhead"><h3 class="panel__title">¿Cuánto del gap puedo recuperar? ${SIM}</h3></div>
      <div class="table-wrap"><table class="table"><thead><tr><th></th><th>Escenario</th><th>Cambios</th><th>Hipótesis</th><th class="num">Venta incremental simulada</th><th class="num">Recovery simulado</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      ${chosen.length ? `<dl class="kpis kpis--3">
        <div><dt>Gap del periodo</dt><dd class="num">${esc(fin(gapBefore) && gapBefore > 0 ? money(gapBefore) : 'Sin brecha')}</dd></div>
        <div><dt>Recuperación simulada (suma de ${chosen.length})</dt><dd class="num">${esc(signedMoney(sumInc))}</dd><small>${esc(fin(gapBefore) && gapBefore > 0 ? `${pct(sumInc / gapBefore)} del gap` : '')}</small></div>
        <div><dt>Gap restante bajo los escenarios</dt><dd class="num">${esc(fin(gapBefore) && gapBefore > 0 ? money(gapBefore - sumInc) : '—')}</dd><small>${esc(fin(gapBefore) && gapBefore > 0 ? `${pct((gapBefore - sumInc) / gapBefore)} del gap` : '')}</small></div>
      </dl>
      <p class="field__hint">Suma simple de escenarios independientes: no incluye la interacción entre drivers. Para un combinado exacto, simula los cambios juntos en un solo escenario.</p>` : '<p class="field__hint">Marca escenarios para sumarlos contra el gap y compararlos.</p>'}
      <h4>Plan, forecast, reforecast y escenarios · ${esc(ctx.period.label)}</h4>
      <div class="closure-bars">${lines.map(([l, v, cls]) => `<div class="closure-bar"><span class="closure-bar__label">${esc(l)}</span>
        <span class="closure-bar__track"><span class="closure-bar__fill closure-bar__fill--${cls === 'scenario' ? 'scenario' : cls === 'actual' ? 'actual' : cls}" style="width:${fin(v) ? Math.max(1, v / max * 100).toFixed(2) : 0}%"></span></span>
        <span class="closure-bar__value num">${esc(money(v))}</span><span class="closure-bar__note">${cls === 'scenario' ? 'Simulación, no predicción' : ''}</span></div>`).join('')}</div>
      ${comp.length ? `<h4>Comparación de escenarios</h4><div class="table-wrap"><table class="table table--matrix">
        <thead><tr><th>Variable</th><th class="num">Base</th>${comp.map((s) => `<th class="num">${esc(s.name)} ${SIM}</th>`).join('')}</tr></thead>
        <tbody>
          ${cmpRow('Volumen', (s) => sc(s) && sc(s).trafficVolume, (v) => F().integer(v))}
          ${cmpRow('CR', (s) => sc(s) && sc(s).conversionRate, (v) => F().percent(v, 2))}
          ${cmpRow('AOV', (s) => sc(s) && sc(s).aov, (v) => F().currency(v, 2))}
          ${cmpRow('Pedidos', (s) => sc(s) && sc(s).orders, (v) => F().integer(v))}
          ${cmpRow('Venta', (s) => sc(s) && sc(s).revenue, money)}
          ${cmpRow('Gap restante', (s) => s && s.outputs.gap ? s.outputs.gap.gapAfter : null, money)}
          ${cmpRow('Recovery %', (s, isBase) => (isBase ? 0 : s && s.outputs.gap ? s.outputs.gap.recoveryPercent : null), (v) => pct(v))}
        </tbody></table></div>` : ''}
      <p class="field__hint">Escenarios guardados: inmutables, con entradas, salidas, supuestos, fecha y versión. Editar crea una versión nueva.</p>`;
  }

  function render(state) {
    renderSimulator(state);
    renderInverse(state);
    renderSaved(state);
  }

  FP.scenarioView = { render, changesText, targetText };
})(typeof window !== 'undefined' ? window : globalThis);
