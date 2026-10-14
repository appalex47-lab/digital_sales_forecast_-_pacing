/**
 * changes-view.js — «Qué cambió desde ayer» (Monitorear). Solo pinta lo que calcula FP.changeEngine con la corrida de forecast
 * y lo que guarda FP.changeStore (estado de alertas, foto diaria). No explica causas: ordena lo que se movió y dice dónde mirar.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const H = () => FP.ui.helpers;
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const MODES = [['ayer', 'Desde ayer'], ['visita', 'Desde mi última visita'], ['semana', 'Esta semana']];
  const STATUS = { open: 'Abierta', seen: 'Vista', following: 'En seguimiento', resolved: 'Resuelta' };
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  const money = (v) => (fin(v) ? FP.format.currency(v, 0) : '—');
  const compact = (v) => (fin(v) ? FP.format.currencyCompact(v) : '—');
  const pc = (v, d = 1) => (fin(v) ? `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v * 100).toFixed(d)}%` : '—');
  const pp = (v) => (fin(v) ? `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v * 100).toFixed(2)} pp` : '—');
  const dshort = (iso) => (iso ? `${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]}` : '—');
  const dlong = (iso) => { if (!iso) return '—'; const d = new Date(`${iso}T00:00:00Z`); return `${DIA[d.getUTCDay()]} ${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]}`; };
  const when = (at) => { try { const d = new Date(at); return `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (e) { return ''; } };
  const tone = (v) => (!fin(v) || v === 0 ? '' : v < 0 ? 'neg' : 'pos');
  const SIG = { worse: 'error', watch: 'warning', better: 'ok', flat: 'na', unknown: 'na' };

  function labelsOf(run) {
    const out = { total: 'Total digital' };
    Object.keys(run.channels || {}).forEach((ch) => { try { out[ch] = FP.dataModel.getChannel(ch).label; } catch (e) { out[ch] = ch; } });
    return out;
  }

  function baseFor(mode, sync) { return mode === 'visita' ? sync.visita : sync.ayer; }

  function model(state, sync) {
    const run = state.fc.run, mode = state.cx.mode;
    return FP.changeEngine.compare(run, { mode, base: baseFor(mode, sync), labels: labelsOf(run) });
  }

  function kpis(c) {
    const t = c.total, esc = H().esc, cl = t.close;
    const card = (label, value, line1, line2, t1) => `<div class="metric-card"><div class="metric-card__head"><span class="metric-card__label">${esc(label)}</span></div>
      <div class="metric-card__value num">${esc(value)}</div>${line1 ? `<div class="metric-card__compare chg-${t1 || ''}">${esc(line1)}</div>` : ''}${line2 ? `<div class="metric-card__period">${esc(line2)}</div>` : ''}</div>`;
    const first = card(c.mode === 'semana' ? 'Venta de la semana' : 'Venta de ayer', money(t.actual), fin(t.vsPlan) ? `${pc(t.vsPlan)} vs plan (${money(t.plan)})` : 'Sin plan para ese día', fin(t.vsLastWeek) ? `${pc(t.vsLastWeek)} vs ${c.mode === 'semana' ? 'misma parte de la semana pasada' : 'mismo día sem. pasada'}` : 'Sin dato de la semana pasada', tone(t.vsPlan));
    const second = cl ? card(`Cierre proyectado · ${cl.label}`, compact(cl.forecast), fin(cl.plan) ? `${pc(cl.forecast / cl.plan - 1)} vs meta (${compact(cl.plan)})` : 'Sin meta', fin(t.closeDelta) ? `${t.closeDelta < 0 ? 'Bajó' : 'Subió'} ${compact(Math.abs(t.closeDelta))} desde la foto anterior` : 'Aún sin foto anterior comparable', tone(cl.plan ? cl.forecast / cl.plan - 1 : null)) : card('Cierre proyectado', '—', 'Sin cifras de cierre', '', '');
    const third = card('Brecha contra la meta', fin(c.gap.now) ? money(c.gap.now) : '—', fin(c.gap.delta) ? `${money(Math.abs(c.gap.delta))} ${c.gap.delta < 0 ? 'más' : 'menos'} que en la foto anterior` : 'Sin foto anterior comparable', c.reachable === null ? '' : c.reachable ? 'La proyección alcanza la meta' : 'La proyección no alcanza la meta', tone(c.gap.now));
    return `<div class="chg-kpis">${first}${second}${third}</div>`;
  }

  function channelTable(c) {
    const esc = H().esc, pill = H().pill;
    const rows = c.channels.map((r) => `<tr><td><strong>${esc(r.label)}</strong></td><td class="num">${esc(money(r.actual))}</td>
      <td class="num chg-${tone(r.vsPlan)}">${esc(pc(r.vsPlan))}</td><td class="num chg-${tone(r.vsLastWeek)}">${esc(pc(r.vsLastWeek))}</td>
      <td class="num chg-${tone(r.effectPp)}">${esc(pp(r.effectPp))}</td><td>${pill(SIG[r.signal.id] || 'na', r.signal.label)}</td></tr>`).join('');
    return `<section class="panel" aria-labelledby="chg-t-ch"><div class="panel__head"><div><h2 class="panel__title" id="chg-t-ch">Qué se movió por canal</h2>
      <p class="panel__desc">Ordenado por cuánto movió el cierre; sin foto anterior, por tamaño de la diferencia.</p></div></div>
      <div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table ds-table"><thead><tr><th>Canal</th><th class="num">${c.mode === 'semana' ? 'Semana' : 'Ayer'}</th><th class="num">vs plan</th><th class="num">vs semana pasada</th><th class="num" title="Cambio del cierre proyectado del canal, en puntos del plan total">Efecto en el cierre</th><th>Señal</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
  }

  function alertBlock(state, sync, c) {
    const esc = H().esc, run = state.fc.run, ownMail = sync.userEmail;
    const baseDay = (baseFor(state.cx.mode, sync) || {}).day || null;
    const live = new Set((run.alerts || []).map(FP.changeEngine.alertKey));
    const rows = sync.rows.filter((r) => live.has(r.alert_key)).map((r) => ({ r, life: FP.changeEngine.lifecycle(r, sync.today, baseDay) }));
    const weekAgo = FP.changeEngine.addDays(sync.today, -7);
    const done = sync.rows.filter((r) => r.status === 'resolved' && r.resolved_at && r.resolved_at.slice(0, 10) >= weekAgo);
    const ord = { new: 0, active: 1, continues: 1 };
    rows.sort((a, b) => (ord[a.life.id] - ord[b.life.id]) || (b.life.days - a.life.days));
    const item = ({ r, life }) => `<li class="chg-alert" data-key="${esc(r.alert_key)}">
      <div class="chg-alert__main">${H().pill(life.id === 'new' ? 'warning' : 'na', life.label)} <span>${esc(r.message)}</span>${life.id !== 'new' ? ` <span class="cell-sub">día ${life.days}</span>` : ''}${r.times_opened > 1 ? ` <span class="cell-sub">reabierta ${r.times_opened - 1} ${r.times_opened === 2 ? 'vez' : 'veces'}</span>` : ''}</div>
      <div class="chg-alert__ctl"><label class="cell-sub">Estado <select data-chg-status="${esc(r.alert_key)}" aria-label="Estado de la alerta">${['open', 'seen', 'following', 'resolved'].map((s) => `<option value="${s}"${r.status === s ? ' selected' : ''}>${STATUS[s]}</option>`).join('')}</select></label>
        ${r.owner_email ? `<span class="cell-sub">Responsable: ${esc(r.owner_email)}</span> <button type="button" class="btn btn--sm" data-action="chg-owner" data-key="${esc(r.alert_key)}" data-own="0">Soltar</button>` : (ownMail ? `<button type="button" class="btn btn--sm" data-action="chg-owner" data-key="${esc(r.alert_key)}" data-own="1">Me encargo yo</button>` : '')}
        <input type="text" class="chg-note" maxlength="500" placeholder="Nota (se guarda al salir del campo)" value="${esc(r.note || '')}" data-chg-note="${esc(r.alert_key)}" aria-label="Nota de la alerta"></div></li>`;
    const doneItems = done.map((r) => `<li class="chg-alert chg-alert--done"><div class="chg-alert__main">${H().pill('ok', 'Resuelta')} <span>${esc(r.message)}</span> <span class="cell-sub">${esc(dshort(r.resolved_at.slice(0, 10)))}</span></div></li>`).join('');
    const where = sync.source === 'cloud' ? 'Compartidas con tu equipo.' : 'Guardadas solo en este navegador.';
    return `<section class="panel" aria-labelledby="chg-t-al"><div class="panel__head"><div><h2 class="panel__title" id="chg-t-al">Alertas</h2><p class="panel__desc">${esc(where)} «Nueva» = apareció después de la foto de comparación; «Sigue» = ya estaba.</p></div></div>
      <div class="panel__body">${sync.note ? `<p class="note note--warn">${esc(sync.note)}</p>` : ''}${rows.length || doneItems ? `<ul class="chg-alerts">${rows.map(item).join('')}${doneItems}</ul>` : '<p class="note note--ok">Sin alertas activas con los umbrales actuales.</p>'}
        <p class="field__hint"><a href="#pacing" data-nav="pacing">Ver todas en Pacing &amp; Forecast →</a></p></div></section>`;
  }

  function dataBlock(c, state, sync) {
    const esc = H().esc, parts = [];
    parts.push(`<li>Venta real cargada hasta el <strong>${esc(dshort(c.day))}</strong>${c.newDays > 0 ? ` (${c.newDays} ${c.newDays === 1 ? 'día nuevo' : 'días nuevos'} desde la foto de comparación)` : ''}.</li>`);
    c.partial.forEach((p) => {
      const names = p.missing.map((id) => (c.channels.find((x) => x.id === id) || { label: id }).label);
      parts.push(`<li>Falta <strong>${esc(names.join(', '))}</strong> del ${esc(dshort(p.date))}: ese día <strong>no entra al Total</strong> (${esc(money(p.othersRevenue))} de otros canales).</li>`);
    });
    parts.push(`<li>${c.planChanged ? `El plan cambió: ahora es «${esc(c.planVersion)}».` : 'Plan sin cambios desde la foto de comparación.'}</li>`);
    return `<section class="panel" aria-labelledby="chg-t-da"><div class="panel__head"><div><h2 class="panel__title" id="chg-t-da">Qué cambió en los datos</h2></div></div>
      <div class="panel__body"><ul class="chg-list">${parts.join('')}</ul><p class="field__hint"><a href="#carga" data-nav="carga">Ir a Carga de datos →</a></p></div></section>`;
  }

  function todayBlock(c) {
    const esc = H().esc, items = [];
    c.partial.slice(-3).forEach((p) => { const names = p.missing.map((id) => (c.channels.find((x) => x.id === id) || { label: id }).label); items.push(`Pedir a ${names.join(' y ')} la venta del ${dshort(p.date)} y cargarla: hoy ese día no cuenta en el Total.`); });
    const worst = c.channels.filter((r) => r.signal.id === 'worse')[0];
    if (worst) items.push(`Revisar ${worst.label} con el canal: ${fin(worst.vsPlan) ? pc(worst.vsPlan) + ' vs plan' : 'empeoró'}.`);
    items.push('Actualizar Sheets y revisar si cambió alguna cifra.');
    return `<section class="panel" aria-labelledby="chg-t-hoy"><div class="panel__head"><div><h2 class="panel__title" id="chg-t-hoy">Qué hago hoy</h2><p class="panel__desc">Salen de las reglas de arriba; no son causas confirmadas.</p></div></div>
      <div class="panel__body"><ul class="chg-list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <p class="btn-row"><button type="button" class="btn btn--primary" data-action="sheets-refresh-all">Actualizar todo (Sheets)</button> <a class="btn" href="#diagnostico" data-nav="diagnostico">Ir a Diagnóstico</a></p></div></section>`;
  }

  function render(state) {
    const el = $('chg-body'); if (!el) return;
    const esc = H().esc, run = state.fc.run;
    state.cx = state.cx || { mode: 'ayer', sync: null, key: null };
    if (!run || run.plan.source === 'none') { el.innerHTML = '<div class="empty"><strong>Todavía no hay con qué comparar</strong>Se necesita un plan del año y venta real. <a href="#carga" data-nav="carga">Ir a Carga de datos</a></div>'; return; }
    const key = `${run.generatedAt}|${(run.alerts || []).length}`;
    if (state.cx.key !== key) {
      state.cx.key = key; state.cx.sync = null;
      FP.changeStore.sync(run).then((s) => { if (state.cx.key === key) { state.cx.sync = s; if (state.view === 'cambios') render(state); } });
    }
    const sync = state.cx.sync;
    if (!sync) { el.innerHTML = '<p class="note" role="status">Preparando la comparación…</p>'; return; }
    const c = model(state, sync);
    const modes = `<div class="chg-modes" role="group" aria-label="Comparar">${MODES.map(([id, l]) => `<button type="button" class="chip-btn${state.cx.mode === id ? ' is-on' : ''}" aria-pressed="${state.cx.mode === id}" data-action="chg-mode" data-mode="${id}">${esc(l)}</button>`).join('')}</div>`;
    if (c.status !== 'ok') {
      el.innerHTML = `${modes}<div class="empty"><strong>${c.status === 'no_actual' ? 'Aún no hay un día con venta real en todos los canales' : 'Todavía no hay con qué comparar'}</strong>${c.status === 'no_actual' ? 'Carga la venta real de cada canal. ' : ''}<a href="#carga" data-nav="carga">Ir a Carga de datos</a></div>`; return;
    }
    const base = c.base;
    const baseTxt = state.cx.mode === 'semana' ? 'Semana en curso contra plan y contra la semana pasada.' : base ? `Contra la foto del ${esc(dlong(base.day))}${base.at ? ` (${esc(when(base.at))})` : ''}.` : 'Sin foto anterior: hoy se guarda la primera y la comparación aparece desde tu próxima visita.';
    el.innerHTML = `${modes}
      <p class="field__hint">«Ayer» = ${esc(dlong(c.day))}, el último día con venta real en todos los canales. ${baseTxt}</p>
      <section class="panel chg-head" aria-labelledby="chg-t-top"><div class="panel__body"><h2 class="panel__title" id="chg-t-top">Lo más importante</h2>
        <p class="chg-headline">${c.headline.map((s) => esc(s)).join(' ')}</p></div></section>
      ${kpis(c)}${channelTable(c)}${alertBlock(state, sync, c)}${dataBlock(c, state, sync)}${todayBlock(c)}
      <p class="field__hint">Cómo se calcula: la comparación con la foto usa cifras del forecast guardadas ${sync.source === 'cloud' ? 'en la nube de tu equipo (una por día)' : 'solo en este navegador'}; «mi última visita» siempre es de este navegador. Las hipótesis nuevas con evidencia están en <a href="#diagnostico" data-nav="diagnostico">Diagnóstico</a>.</p>`;
  }

  FP.changesView = { render, model };
})(typeof window !== 'undefined' ? window : globalThis);
