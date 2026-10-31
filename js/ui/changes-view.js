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
    return `<p class="field__hint">Ordenado por cuánto movió el cierre; sin foto anterior, por tamaño de la diferencia.</p>
      <div class="table-wrap"><table class="table ds-table"><thead><tr><th>Canal</th><th class="num">${c.mode === 'semana' ? 'Semana' : 'Ayer'}</th><th class="num">vs plan</th><th class="num">vs semana pasada</th><th class="num" title="Cambio del cierre proyectado del canal, en puntos del plan total">Efecto en el cierre</th><th>Señal</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /** Cuerpo de «¿Qué alertas hay?». Las alertas que siguen con el mismo mensaje en 3 o más canales se agrupan en un desplegable; cada una conserva su estado, responsable y nota. */
  function alertsBody(state, sync, c) {
    const esc = H().esc, ownMail = sync.userEmail;
    const baseDay = (baseFor(state.cx.mode, sync) || {}).day || null;
    const A = FP.chgResumen.alertsOf(state, sync, baseDay);
    const rows = A.all, done = A.done;
    const ord = { new: 0, active: 1, continues: 1 };
    rows.sort((a, b) => (ord[a.life.id] - ord[b.life.id]) || (b.life.days - a.life.days));
    const item = ({ r, life }) => `<li class="chg-alert" data-key="${esc(r.alert_key)}">
      <div class="chg-alert__main">${H().pill(life.id === 'new' ? 'warning' : 'na', life.label)} <span>${esc(r.message)}</span>${life.id !== 'new' ? ` <span class="cell-sub">día ${life.days}</span>` : ''}${r.times_opened > 1 ? ` <span class="cell-sub">(vuelve a abrirse: ${r.times_opened}.ª vez)</span>` : ''}</div>
      <div class="chg-alert__ctl"><label class="cell-sub">Estado <select data-chg-status="${esc(r.alert_key)}" aria-label="Estado de la alerta">${['open', 'seen', 'following', 'resolved'].map((s2) => `<option value="${s2}"${r.status === s2 ? ' selected' : ''}>${STATUS[s2]}</option>`).join('')}</select></label>
        ${r.owner_email ? `<span class="cell-sub">Responsable: ${esc(r.owner_email)}</span> <button type="button" class="btn btn--sm" data-action="chg-owner" data-key="${esc(r.alert_key)}" data-own="0">Soltar</button>` : (ownMail ? `<button type="button" class="btn btn--sm" data-action="chg-owner" data-key="${esc(r.alert_key)}" data-own="1">Me encargo yo</button>` : '')}
        <input type="text" class="chg-note" maxlength="500" placeholder="Nota (se guarda al salir del campo)" value="${esc(r.note || '')}" data-chg-note="${esc(r.alert_key)}" aria-label="Nota de la alerta"></div></li>`;
    const nw = rows.filter((x) => x.life.id === 'new'), cont = rows.filter((x) => x.life.id !== 'new');
    // el mensaje empieza con el nombre del canal: se agrupa por lo que dice
    const groups = new Map(); cont.forEach((x) => { const k = String(x.r.message || '').replace(/^[^:]{1,40}:\s*/, ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const open = state.cx.open || (state.cx.open = {});
    const parts = nw.map(item);
    groups.forEach((g, msg) => {
      if (g.length >= 3) parts.push(`<li class="chg-group-li"><details class="chg-group" data-g="${esc(g[0].r.alert_key)}"${open[g[0].r.alert_key] ? ' open' : ''}><summary>${H().pill('na', g[0].life.label)} <strong>${g.length} alertas iguales:</strong> ${esc(msg)} <span class="cell-sub">(${g.map((x) => esc(x.r.channel === 'total' ? 'Total digital' : (c.channels.find((y) => y.id === x.r.channel) || { label: x.r.channel }).label)).join(', ')})</span></summary><ul class="chg-alerts">${g.map(item).join('')}</ul></details></li>`);
      else g.forEach((x) => parts.push(item(x)));
    });
    const doneItems = done.map((r) => `<li class="chg-alert chg-alert--done"><div class="chg-alert__main">${H().pill('ok', 'Resuelta')} <span>${esc(r.message)}</span> <span class="cell-sub">${esc(dshort(r.resolved_at.slice(0, 10)))}</span></div></li>`).join('');
    const where = sync.source === 'cloud' ? 'Compartidas con tu equipo.' : 'Guardadas solo en este navegador.';
    return `<p class="field__hint">${esc(where)} «Nueva» = apareció después de la foto de comparación; «Sigue» = ya estaba.</p>
      ${sync.note ? `<p class="note note--warn">${esc(sync.note)}</p>` : ''}${parts.length || doneItems ? `<ul class="chg-alerts">${parts.join('')}${doneItems}</ul>` : '<p class="note note--ok">Sin alertas activas con los datos de hoy.</p>'}
        <p class="field__hint"><a href="#pacing" data-nav="pacing">Ver todas en Pacing &amp; Forecast →</a></p>`;
  }

  function dataBlock(c, state, sync) {
    const esc = H().esc, parts = [];
    parts.push(`<li>Venta real cargada hasta el <strong>${esc(dshort(c.day))}</strong>${c.newDays > 0 ? ` (${c.newDays} ${c.newDays === 1 ? 'día nuevo' : 'días nuevos'} desde la foto de comparación)` : ''}.</li>`);
    c.partial.forEach((p) => {
      const names = p.missing.map((id) => (c.channels.find((x) => x.id === id) || { label: id }).label);
      parts.push(`<li>Falta <strong>${esc(names.join(', '))}</strong> del ${esc(dshort(p.date))}: ese día <strong>no entra al Total</strong> (${esc(money(p.othersRevenue))} de otros canales).</li>`);
    });
    parts.push(`<li>${c.planChanged ? `El plan cambió: ahora es «${esc(c.planVersion)}».` : 'Plan sin cambios desde la foto de comparación.'}</li>`);
    return `<ul class="chg-list">${parts.join('')}</ul><p class="field__hint"><a href="#carga" data-nav="carga">Ir a Carga de datos →</a></p>`;
  }

  const uxs = (state) => (state.ux.chg = state.ux.chg || { mode: 'full', sum: 'c' });

  /** Prepara la comparación (una vez por corrida): foto de hoy, alertas y filas guardadas. Al terminar vuelve a pintar Inicio, esta vista y el menú. */
  function ensure(state) {
    const run = state.fc.run; state.cx = state.cx || { mode: 'ayer', sync: null, key: null };
    if (!run || run.plan.source === 'none') return;
    const key = `${run.generatedAt}|${(run.alerts || []).length}`;
    if (state.cx.key === key) return;
    state.cx.key = key; state.cx.sync = null; state.cx._nc = null;
    FP.changeStore.sync(run).then((sy) => { if (state.cx.key === key) { state.cx.sync = sy; if (FP.app && (state.view === 'cambios' || state.view === 'inicio')) FP.app.render(); else if (FP.navigation && FP.app) FP.app.render(); } });
  }

  /** Modelo de la comparación «desde ayer» con la foto ya preparada (null si aún no hay nada que comparar). */
  function summaryOf(state) {
    ensure(state);
    const sync = state.cx && state.cx.sync, run = state.fc.run; if (!sync || !run || run.plan.source === 'none') return null;
    const c = FP.changeEngine.compare(run, { mode: 'ayer', base: sync.ayer, labels: labelsOf(run) });
    if (c.status !== 'ok') return null;
    return { c, R: FP.chgResumen.build(state, c, sync, (sync.ayer || {}).day || null) };
  }

  /** Alertas nuevas (para la marca del menú): solo las que aparecieron después de la foto de comparación. */
  function newCount(state) {
    const sync = state.cx && state.cx.sync, run = state.fc && state.fc.run; if (!sync || !run) return 0;
    const key = `${state.cx.key}|${sync.rows.length}`;
    if (state.cx._nc && state.cx._nc.key === key) return state.cx._nc.n;
    let n = 0; try { n = FP.chgResumen.alertsOf(state, sync, (sync.ayer || {}).day || null).nw.length; } catch (e) { n = 0; }
    state.cx._nc = { key, n }; return n;
  }

  /** Franja «Desde ayer» de Inicio: tres líneas y el enlace a la página completa. Vacía mientras no haya comparación. */
  function stripHtml(state) {
    const esc = H().esc, m = summaryOf(state); if (!m) return '';
    const n = m.R.newAlerts;
    return `<section class="chg-strip" aria-label="Desde ayer" data-chg-strip="1"><div class="chg-strip__h"><h3>Desde ayer${n ? ` <span class="chg-strip__n">${n} alerta${n === 1 ? '' : 's'} nueva${n === 1 ? '' : 's'}</span>` : ''}</h3>
      <a href="#cambios" data-nav="cambios" class="btn btn--small">Ver qué cambió →</a></div>
      <ul>${m.R.strip.map((l) => `<li>${l}</li>`).join('')}</ul></section>`;
  }

  function render(state) {
    const el = $('chg-body'); if (!el) return;
    const esc = H().esc, run = state.fc.run, u = uxs(state), PXH = FP.pxView;
    state.cx = state.cx || { mode: 'ayer', sync: null, key: null };
    if (!run || run.plan.source === 'none') { el.innerHTML = '<div class="empty"><strong>Todavía no hay con qué comparar</strong>Se necesita un plan del año y venta real. <a href="#carga" data-nav="carga">Ir a Carga de datos</a></div>'; return; }
    ensure(state);
    const sync = state.cx.sync;
    if (!sync) { el.innerHTML = '<p class="note" role="status">Preparando la comparación…</p>'; return; }
    const c = model(state, sync);
    const modeBtns = MODES.map(([id, l]) => `<button type="button" data-action="chg-mode" data-mode="${id}" aria-pressed="${state.cx.mode === id}">${l}</button>`).join('');
    const topbar = `<div class="px-topbar" id="chg-topbar"><div class="px-topbar__row"><div class="px-seg chg-modes" role="group" aria-label="Comparar">${modeBtns}</div>
        <div class="px-seg chg-modeseg" role="group" aria-label="Nivel de detalle"><button type="button" id="chg-m-res" aria-pressed="${u.mode === 'res'}">Resumen</button><button type="button" id="chg-m-full" aria-pressed="${u.mode !== 'res'}">Completo</button></div></div></div>`;
    if (c.status !== 'ok') {
      el.innerHTML = `<div class="px px-chg"><div class="px-app">${topbar}<div class="empty"><strong>${c.status === 'no_actual' ? 'Aún no hay un día con venta real en todos los canales' : 'Todavía no hay con qué comparar'}</strong>${c.status === 'no_actual' ? 'Carga la venta real de cada canal para el mismo día y vuelve a abrir esta página. ' : ''}<a href="#carga" data-nav="carga">Ir a Carga de datos</a></div></div></div>`;
      return;
    }
    const baseDay = (baseFor(state.cx.mode, sync) || {}).day || null;
    const R = FP.chgResumen.build(state, c, sync, baseDay), long = u.sum === 'l';
    const P = (h) => PXH.P(h);
    const blk = (id, t, cap, body, lec) => P(`<section class="blk" id="${id}"><div class="blk__h"><h3>${t}</h3><span class="cap">${cap}</span></div>@@B@@${lec ? `<p class="lec">${lec}</p>` : ''}</section>`).replace('@@B@@', () => `<div class="chgbody stack">${body}</div>`);
    const base = c.base;
    const baseTxt = state.cx.mode === 'semana' ? 'Semana en curso contra plan y contra la semana pasada.' : base ? `Contra la foto del ${esc(dlong(base.day))}${base.at ? ` (${esc(when(base.at))})` : ''}.` : 'Sin foto anterior: hoy se guarda la primera y la comparación aparece desde tu próxima visita.';
    const chips = R.chips.map((x) => `<span class="px-tchip px-${x[0]}" tabindex="0" data-tip="${esc(x[2])}">${x[1]}</span>`).join('');
    const rowsS = R.rows.filter((r) => (long ? r[2] : r[1]));
    const verdict = `<section class="px-verdict"><p class="px-eyebrow">Qué cambió desde ayer · «Ayer» = ${esc(dlong(c.day))}, el último día con venta real en todos los canales</p><h2>${R.verdict}</h2>
      <div class="px-trust" aria-label="Confiabilidad y contexto">${chips}</div><div class="chgkpi-slot">${kpis(c)}</div></section>`;
    const intro = `<section class="px-intro"><div class="px-intro__h"><h3>Resumen general</h3><div class="px-mini" id="chg-md" role="group" aria-label="Versión del resumen"><button type="button" data-v="c" aria-pressed="${!long}">Versión corta</button><button type="button" data-v="l" aria-pressed="${long}">Versión larga</button></div></div>
      <div class="px-sum${long ? ' px-sum--l' : ''}" data-chg-summary="1">${rowsS.map((r) => `<div class="px-sum__r"><span>${esc(r[0])}</span><span>${long ? r[2] : r[1]}</span></div>`).join('')}</div></section>`;
    const GO = { dx: 'chg-to-dx', load: 'chg-to-load', sheets: 'sheets-refresh-all', pac: 'chg-to-pacing' };
    const actCard = (a) => `<div><b>${esc(a.title)}</b><span>${esc(a.desc)}</span><button type="button" class="px-lk" data-action="${GO[a.id]}"${a.channel ? ` data-channel="${esc(a.channel)}"` : ''}>${a.id === 'sheets' ? 'Actualizar →' : 'Abrir →'}</button></div>`;
    const secs = [
      blk('chg-s-ch', '¿Qué canal movió el cierre?', 'Cuánto aportó cada canal contra el plan y contra la semana pasada.', channelTable(c) + (base ? '' : '<p class="field__hint">Aún no hay una foto anterior comparable: el cambio del cierre proyectado aparece desde la próxima visita.</p>'), R.lec.s1),
      blk('chg-s-al', '¿Qué alertas hay?', 'Nuevas, las que siguen y las resueltas esta semana.', alertsBody(state, sync, c), R.lec.s2),
      blk('chg-s-da', '¿Qué cambió en los datos?', 'Qué se cargó, qué falta y si cambió el plan.', dataBlock(c, state, sync), R.lec.s3),
      P(`<section class="blk" id="chg-s-hoy"><div class="blk__h"><h3>¿Qué hago hoy?</h3><span class="cap">De la lectura a la acción: lo que sigue, con el mismo canal y día.</span></div><div class="act">${R.actions.map(actCard).join('')}</div><p class="cap">Salen de las reglas de arriba; no son causas confirmadas. Nada se guarda ni se ejecuta desde aquí.</p></section>`)
    ];
    const defs = [['Ayer', 'El último día con venta real en todos los canales.'], ['Foto', 'Cifras clave del forecast guardadas al visitar; «mi última visita» siempre es de este navegador.'], ['Nueva / Sigue / Resuelta', 'Ciclo de vida de cada alerta contra la foto de comparación. Sin foto no se puede decir si es nueva y se muestra «Activa».'], ['Efecto en el cierre', 'Cuánto movió cada canal el cierre proyectado desde la foto anterior (en puntos porcentuales).'], ['Señal', '«Empeoró» desde −5 % contra el plan; «A vigilar» desde −1 %; «Mejoró» desde +2 %.']];
    const meth = `<details class="px-meth" id="chg-meth"${u.meth ? ' open' : ''}><summary>Método y definiciones</summary><div class="px-meth__b"><section class="px-dsec"><h4>Cómo se calcula</h4><dl class="px-defs">${defs.map((d) => `<div><dt>${esc(d[0])}</dt><dd>${esc(d[1])}</dd></div>`).join('')}</dl>
      <p class="px-cap">La comparación con la foto usa cifras del forecast guardadas ${sync.source === 'cloud' ? 'en la nube de tu equipo (una por día)' : 'solo en este navegador'}; «mi última visita» siempre es de este navegador. No explica causas: ordena lo que se movió y dice dónde mirar. Las hipótesis nuevas con evidencia están en <a href="#diagnostico" data-nav="diagnostico">Diagnóstico</a>.</p></section></div></details>`;
    el.innerHTML = `<div class="px px-chg"><div class="px-app" id="chg-frame" data-mode="${u.mode}">${topbar}${verdict}${intro}
      <div class="px-more"><p class="px-cap chg-base">${baseTxt}</p>${secs.join('\n')}</div>
      <section class="px-blk px-foot"><span class="px-mu">Foto diaria de cifras del forecast · guardada ${sync.source === 'cloud' ? 'con tu equipo' : 'solo en este navegador'} · último día completo ${esc(dlong(c.day))}</span></section>${meth}</div></div>`;
    const md = $('chg-meth'); if (md) md.addEventListener('toggle', () => { u.meth = md.open; });
    el.querySelectorAll('details.chg-group').forEach((d) => d.addEventListener('toggle', () => { state.cx.open[d.dataset.g] = d.open; }));
    if (!el._chgBound) {
      el._chgBound = true;
      el.addEventListener('click', (e) => {
        const st = FP.app && FP.app.state, uu = st && uxs(st); if (!uu) return;
        const m = e.target.closest('#chg-m-res,#chg-m-full'); if (m) { uu.mode = m.id === 'chg-m-res' ? 'res' : 'full'; const fr = $('chg-frame'); if (fr) fr.dataset.mode = uu.mode; $('chg-m-res').setAttribute('aria-pressed', String(uu.mode === 'res')); $('chg-m-full').setAttribute('aria-pressed', String(uu.mode !== 'res')); return; }
        const sm = e.target.closest('#chg-md button'); if (sm) { uu.sum = sm.dataset.v; const y = root.scrollY; render(st); root.scrollTo(0, y); }
      });
    }
  }

  FP.changesView = { render, model, ensure, stripHtml, newCount, summaryOf };
})(typeof window !== 'undefined' ? window : globalThis);
