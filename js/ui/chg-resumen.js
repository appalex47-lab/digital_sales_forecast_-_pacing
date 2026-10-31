/**
 * chg-resumen.js — Reglas invisibles de «Qué cambió desde ayer»: qué frase del veredicto, qué chips de confiabilidad, qué filas del resumen
 * general, qué línea de lectura de cada sección, qué acciones de «¿Qué hago hoy?» y qué líneas de la franja de Inicio se muestran.
 * Descriptivo: solo repite lo que ya calculó FP.changeEngine (comparación contra el plan, contra la semana pasada y contra la foto anterior)
 * y lo que guarda FP.changeStore (ciclo de vida de las alertas); no calcula cifras nuevas ni dice causas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const B = (t) => `<b>${t}</b>`;
  const esc = (v) => FP.ui.helpers.esc(v);
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const dshort = (iso) => (iso ? `${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]}` : '—');
  const dlong = (iso) => { if (!iso) return '—'; const d = new Date(`${iso}T00:00:00Z`); return `${DIA[d.getUTCDay()]} ${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]}`; };
  const when = (at) => { try { const d = new Date(at); return `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } catch (e) { return ''; } };
  const money = (v) => (fin(v) ? FP.format.currency(Math.abs(v), 0) : '—');
  const compact = (v) => (fin(v) ? FP.format.currencyCompact(v) : '—');
  const pc = (v) => (fin(v) ? `${v < 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(1)} %` : '—');
  const pp = (v) => (fin(v) ? `${v < 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(2)} pp` : '—');

  /** Alertas vivas clasificadas contra la foto de comparación: nuevas, que siguen (o activas sin foto) y resueltas en la última semana. */
  function alertsOf(state, sync, baseDay) {
    const run = state.fc.run, live = new Set((run.alerts || []).map(FP.changeEngine.alertKey));
    const rows = sync.rows.filter((r) => live.has(r.alert_key)).map((r) => ({ r, life: FP.changeEngine.lifecycle(r, sync.today, baseDay) }));
    const weekAgo = FP.changeEngine.addDays(sync.today, -7);
    const done = sync.rows.filter((r) => r.status === 'resolved' && r.resolved_at && r.resolved_at.slice(0, 10) >= weekAgo);
    return { nw: rows.filter((x) => x.life.id === 'new'), cont: rows.filter((x) => x.life.id !== 'new'), done, all: rows };
  }

  const nameOf = (c, id) => (c.channels.find((x) => x.id === id) || { label: id }).label;

  /** @returns {{verdict, chips, rows, lec, actions, alerts, strip}} */
  function build(state, c, sync, baseDay) {
    const t = c.total, A = alertsOf(state, sync, baseDay), photo = Boolean(c.base), r = t.vsPlan;
    const sem = c.mode === 'semana', per = sem ? 'Esta semana' : `Ayer (${dlong(c.day)})`;
    const first = fin(r) ? (r <= -0.05 ? `${per} vendiste ${money(t.actual)}, ${B(Math.abs(r * 100).toFixed(1) + ' %')} por debajo del plan`
      : r <= -0.01 ? `${per} vendiste ${money(t.actual)}, ligeramente por debajo del plan (${pc(r)})`
        : r >= 0.02 ? `${per} vendiste ${money(t.actual)}, ${Math.abs(r * 100).toFixed(1)} % por encima del plan` : `${per} vendiste ${money(t.actual)}, en línea con el plan (${pc(r)})`) : `${per} vendiste ${money(t.actual)}`;
    const second = fin(t.closeDelta) && t.close ? `; el cierre proyectado ${t.closeDelta < 0 ? 'bajó' : 'subió'} ${money(t.closeDelta)} desde la foto anterior.` : '.';
    const nA = A.nw.length, ojo = c.partial.length ? ` Ojo: falta ${c.partial[0].missing.map((id) => nameOf(c, id)).join(' y ')} del ${dshort(c.partial[0].date)}; ese día no entra al Total.` : '';
    const verdict = `${first}${second}${nA ? ` Hay ${nA} alerta${nA === 1 ? '' : 's'} nueva${nA === 1 ? '' : 's'}.` : ''}${ojo}`;
    const chips = [];
    chips.push(['mu', `● Comparación: ${photo ? `foto del ${esc(dlong(c.base.day))}${c.base.at ? `, ${esc(when(c.base.at))}` : ''}` : 'sin foto anterior'}`, photo ? 'Contra la foto de cifras guardada de la visita anterior.' : 'Hoy se guarda la primera foto; la comparación aparece desde la próxima visita.']);
    chips.push(['ok', `● Último día completo: ${esc(dlong(c.day))}`, 'El último día con venta real en todos los canales.']);
    if (nA) chips.push(['warn', `◐ ${nA} alerta${nA === 1 ? '' : 's'} nueva${nA === 1 ? '' : 's'}`, 'Aparecieron después de la foto de comparación.']);
    if (c.partial.length) chips.push(['warn', '◐ Datos parciales', 'Falta un canal en un día reciente: ese día no entra al Total.']);
    if (!photo) chips.push(['warn', '◐ Sin foto anterior', 'No se puede decir cuánto cambió el cierre; solo cómo vas contra el plan.']);
    chips.push(['mu', c.planChanged ? '◐ El plan cambió' : '● Plan sin cambios', 'El plan original no se modifica desde esta pantalla.']);
    chips.push(['mu', `● Guardado ${sync.source === 'cloud' ? 'con tu equipo' : 'en este navegador'}`, sync.source === 'cloud' ? 'Las alertas y la foto diaria se comparten con tu equipo.' : 'Las alertas se guardan solo en este navegador (no se comparten con tu equipo).']);

    const S = [], top = c.channels.slice().sort((a, b) => Math.abs(b.effectPp || b.vsPlan || 0) - Math.abs(a.effectPp || a.vsPlan || 0))[0];
    S.push([sem ? 'Esta semana' : 'Ayer', `Vendiste ${B(money(t.actual))}, ${B(pc(r))} vs plan${fin(t.vsLastWeek) ? ` y ${pc(t.vsLastWeek)} vs ${sem ? 'la misma parte de la semana pasada' : 'el mismo día de la semana pasada'}` : ''}.`,
      `${per} vendiste ${money(t.actual)} contra un plan de ${money(t.plan)} (${pc(r)})${fin(t.vsLastWeek) ? ` y ${pc(t.vsLastWeek)} contra ${sem ? 'la misma parte de la semana pasada' : 'el mismo día de la semana pasada'}` : ''}. ${c.headline.map(esc).join(' ')}`]);
    if (t.close) S.push(['Cierre', fin(t.closeDelta) ? `El cierre proyectado ${t.closeDelta < 0 ? 'bajó' : 'subió'} ${B(money(t.closeDelta))}: ${B(compact(t.close.forecast))} vs meta ${compact(t.close.plan)}.` : `Cierre proyectado ${B(compact(t.close.forecast))} vs meta ${compact(t.close.plan)} (sin foto anterior).`,
      `Cierre proyectado de ${esc(t.close.label)}: ${compact(t.close.forecast)} contra la meta de ${compact(t.close.plan)}.${fin(c.gap.delta) ? ` Desde la foto anterior la brecha ${c.gap.delta < 0 ? 'se redujo' : 'creció'} ${money(c.gap.delta)}.` : ' Sin foto anterior, el cambio del cierre aparece desde la próxima visita.'}`]);
    if (top && fin(top.vsPlan)) S.push(['Canal', `${B(esc(top.label))} ${top.vsPlan < 0 ? 'se quedó atrás' : 'impulsó'} (${pc(top.vsPlan)} vs plan${fin(top.effectPp) ? `, ${pp(top.effectPp)} en el cierre` : ''}).`,
      `Canales ordenados por cuánto movieron el cierre: ${c.channels.map((x) => `${esc(x.label)} ${pc(x.vsPlan)}`).join('; ')}.`]);
    if (A.nw.length + A.cont.length + A.done.length) S.push(['Alertas', `${A.nw.length ? B(`${A.nw.length} nueva${A.nw.length === 1 ? '' : 's'}`) : 'Ninguna nueva'}, ${A.cont.length} ${photo ? (A.cont.length === 1 ? 'sigue' : 'siguen') : (A.cont.length === 1 ? 'activa' : 'activas')}${A.done.length ? `, ${A.done.length} resuelta${A.done.length === 1 ? '' : 's'} esta semana` : ''}.`,
      `Nuevas: ${A.nw.map((x) => esc(x.r.channel === 'total' ? 'Total digital' : nameOf(c, x.r.channel))).join(', ') || 'ninguna'}. ${photo ? 'Siguen' : 'Activas'}: ${A.cont.map((x) => esc(x.r.channel === 'total' ? 'Total digital' : nameOf(c, x.r.channel))).join(', ') || 'ninguna'}. Resueltas esta semana: ${A.done.length || 'ninguna'}.`]);
    if (c.partial.length) { const p = c.partial[0], names = p.missing.map((id) => esc(nameOf(c, id))).join(' y ');
      S.push(['Datos', `${B('Falta ' + names)} del ${dshort(p.date)}: ese día no entra al Total.`, `Falta ${names} del ${dshort(p.date)} (${money(p.othersRevenue)} de otros canales no entran al Total).`]); }
    else S.push(['Datos', `Venta real cargada hasta el ${B(dshort(c.day))}${c.newDays > 0 ? ` (${c.newDays} día${c.newDays === 1 ? '' : 's'} nuevo${c.newDays === 1 ? '' : 's'})` : ''}.`, `Venta real cargada hasta el ${dshort(c.day)}. ${c.planChanged ? `El plan cambió: ahora es «${esc(c.planVersion)}».` : 'Plan sin cambios desde la foto de comparación.'}`]);
    const worst = c.channels.find((x) => x.signal.id === 'worse') || c.channels.find((x) => x.signal.id === 'watch');
    if (worst) S.push(['Hoy', `${B('Revisar ' + esc(worst.label))} con el canal${c.partial.length ? ` y pedir ${esc(nameOf(c, c.partial[0].missing[0]))} del ${dshort(c.partial[0].date)}` : ''}.`, `Lo que sigue: revisar ${esc(worst.label)} (${pc(worst.vsPlan)} vs plan)${c.partial.length ? `; pedir y cargar la venta de ${c.partial[0].missing.map((id) => esc(nameOf(c, id))).join(' y ')} del ${dshort(c.partial[0].date)}` : ''}; actualizar Sheets y revisar si cambió alguna cifra.`]);

    const L = { s1: '', s2: '', s3: '' };
    const wr = c.channels.find((x) => x.signal.id === 'worse');
    if (wr) L.s1 = `${B(esc(wr.label))} fue el que más empeoró (${pc(wr.vsPlan)} vs plan${fin(wr.effectPp) ? `, ${pp(wr.effectPp)} en el cierre` : ''}).`;
    if (A.nw.length) L.s2 = `${B(`${A.nw.length} alerta${A.nw.length === 1 ? ' nueva' : 's nuevas'}`)} desde la foto de comparación.`;
    if (c.partial.length) L.s3 = `Mientras no se cargue ${c.partial[0].missing.map((id) => esc(nameOf(c, id))).join(' y ')}, el Total de ese día queda incompleto.`;

    const act = [];
    if (worst) act.push({ id: 'dx', channel: worst.id, title: `Revisar ${worst.label}`, desc: `Abre Diagnóstico con ese canal y el último día completo (${pc(worst.vsPlan)} vs plan). Nada se guarda.` });
    if (c.partial.length) act.push({ id: 'load', title: `Cargar ${c.partial[0].missing.map((id) => nameOf(c, id)).join(' y ')} del ${dshort(c.partial[0].date)}`, desc: 'Abre Carga de datos. Mientras falte, ese día no entra al Total.' });
    act.push({ id: 'sheets', title: 'Actualizar todo (Sheets)', desc: 'Vuelve a leer las hojas conectadas y revisa si cambió alguna cifra.' });
    act.push({ id: 'pac', title: 'Ver el cierre en Pacing', desc: 'Abre Pacing y Forecast para ver cómo viene el año contra el plan.' });

    const strip = S.slice(0, 3).map((x) => x[1]);
    return { verdict, chips, rows: S, lec: L, actions: act, alerts: A, strip, newAlerts: A.nw.length };
  }

  FP.chgResumen = { build, alertsOf, dshort, dlong };
})(typeof window !== 'undefined' ? window : globalThis);
