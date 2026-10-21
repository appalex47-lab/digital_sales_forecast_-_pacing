/* reportCopy.js — Títulos de la presentación (PDF) generados a partir de las cifras de cada lámina.
 * Solo texto de presentación: lee la salida de FP.reportBuilder.build y no calcula, ni cambia, ningún dato.
 * Cada título trae varias redacciones según lo que digan los datos; si falta un dato clave o no hay nada que destaque,
 * devuelve null y la vista usa el título neutro de siempre. Las cifras del título son las mismas de la lámina.
 * Descriptivo, nunca causal: «pesa», «suma», «resta» (no «causa», «por culpa de»). */
(function (root) {
  'use strict';
  const FP = root.FP = root.FP || {};
  const RB = () => FP.reportBuilder;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  // Nombres largos: se corta en límite de palabra, sin puntos suspensivos ni dosis/medidas sueltas al final («MOUNJARO KWIKPEN MULTIDOSIS 1…» → «MOUNJARO KWIKPEN MULTIDOSIS»).
  // Un nombre técnico sin espacios no se corta (se deja entero).
  const nice = (t) => (t && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(t) ? t.toLowerCase().replace(/(^|[\s(\/-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()) : t);   // «MOUNJARO KWIKPEN» → «Mounjaro Kwikpen»
  const cut = (s, n) => {
    s = nice(String(s == null ? '' : s).trim()); if (s.length <= n) return s;
    if (!/\s/.test(s)) return s.length <= 48 ? s : s.slice(0, n - 1) + '…';
    let w = s.split(/\s+/), out = []; for (const t of w) { if ((out.concat(t).join(' ')).length > n || (out.length && /\d/.test(t))) break; out.push(t); }   // se detiene antes de la dosis/presentación (primer token con dígitos)
    while (out.length > 1 && /^[\d.,/%()+-]+[A-Za-zµ]{0,4}$|^(de|del|la|el|con|y|c\/\d*)$/i.test(out[out.length - 1])) out.pop();
    return out.length ? out.join(' ') : s.slice(0, n);
  };
  const page = (rep, id) => (rep.pages || []).find((p) => p.id === id && p.status === 'included') || null;
  const kpi = (p, id) => { const k = p && (p.kpis || []).find((x) => x.id === id); return k && fin(k.value) ? k.value : null; };
  const lower1 = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const money = (v) => RB().fmt('smoneyC', v), moneyC = (v) => RB().fmt('moneyC', v), pct = (v) => RB().fmt('pct', v);
  const periodOf = (rep) => { const c = page(rep, 'cover'); const f = c && (c.facts || []).find((x) => x.id === 'period'); return f && f.value ? String(f.value) : null; };

  /** Cumplimiento (real a la fecha / plan comparable) → frase. Umbrales: ±2 % «en línea», −10 % «se aleja». */
  function standing(c) {
    if (!fin(c)) return null;
    if (c >= 1.02) return { key: 'above', text: 'supera el plan' };
    if (c >= 0.98) return { key: 'on', text: 'va en línea con el plan' };
    if (c >= 0.90) return { key: 'below', text: 'va por debajo del plan' };
    return { key: 'far', text: 'se aleja del plan' };
  }

  const RULES = {
    summary(p, rep) {
      const st = standing(kpi(page(rep, 'pacing'), 'compliance')); if (!st) return null;
      const per = periodOf(rep), sel = page(rep, 'pacing') && page(rep, 'pacing').selection;
      const subj = sel ? 'La selección' : (per ? per.split(' ')[0] : 'El período');
      const ent = p.focus && p.focus.entity ? cut(p.focus.entity, 32) : null;
      return `${subj} ${st.text}${ent ? `; la atención está en ${ent}` : ''}`;
    },
    pacing(p, rep) {
      const c = kpi(p, 'compliance'), st = standing(c); if (!st) return null;
      const per = periodOf(rep), sel = p.selection;
      const subj = sel ? 'La selección' : (per ? per.split(' ')[0] : 'El período');
      const verb = st.key === 'above' ? 'supera el' : st.key === 'on' ? 'llega al' : st.key === 'below' ? 'queda por debajo del' : 'queda lejos del';
      let tail = '';
      const ch = (p.charts || [])[0];
      if (ch && Array.isArray(ch.plan) && Array.isArray(ch.forecast) && fin(ch.cutIndex) && ch.cutIndex < ch.plan.length - 1) {
        const lp = ch.plan[ch.plan.length - 1], lf = ch.forecast[ch.forecast.length - 1];
        if (fin(lp) && fin(lf) && lp > 0) { const r = lf / lp; const yr = /^Año\b/.test(per || ''); tail = r >= 1.02 ? `; el cierre estimado supera ${yr ? 'la meta anual' : 'el plan del mes'}` : r >= 0.98 ? '; el cierre estimado confirma el ritmo' : `; el cierre estimado queda por debajo ${yr ? 'de la meta anual' : 'del plan del mes'}`; }
      }
      // con el plan a la vista: «Octubre va 4.2 % arriba del plan y cerraría en $35.8M» (cifras de la misma lámina)
      let close = null; const chx = (p.charts || [])[0];
      if (chx && Array.isArray(chx.forecast) && fin(chx.cutIndex) && chx.cutIndex < chx.forecast.length - 1 && fin(chx.forecast[chx.forecast.length - 1]) && !/^Año\b/.test(per || '')) close = chx.forecast[chx.forecast.length - 1];
      if (fin(c) && close !== null && Math.abs(c - 1) >= 0.02) return `${subj} va ${(Math.abs(c - 1) * 100).toFixed(1)} % ${c > 1 ? 'arriba' : 'abajo'} del plan y cerraría en ${moneyC(close)}`;
      return `${subj} ${verb} plan comparable${tail}`;
    },
    drivers(p) {
      const gap = kpi(p, 'gap'), t = (p.tables || []).find((x) => x.id === 'drivers'); if (!fin(gap) || !t || !t.rows.length) return null;
      const NAME = { Volumen: 'Volumen', CR: 'Conversión', AOV: 'Ticket' };
      const rows = t.rows.filter((r) => fin(r.contribution)).map((r) => ({ n: NAME[r.driver] || r.driver, v: r.contribution }));
      if (!rows.length) return null;
      const pos = rows.filter((r) => r.v > 0), neg = rows.filter((r) => r.v < 0);
      const join = (a, lc) => { const n = a.map((x) => (lc ? lower1(x.n) : x.n)); return n.length < 2 ? n[0] : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1]; };
      if (pos.length && neg.length) return `${join(pos)} ${pos.length > 1 ? 'suman' : 'suma'} y ${join(neg, true)} ${neg.length > 1 ? 'restan' : 'resta'}; la brecha neta es ${money(gap)}`;
      const main = [...rows].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
      return `${main.n} es el componente que más pesa en la brecha de ${money(gap)}`;
    },
    movers(p) {
      const top = (arr) => (arr || []).filter((i) => i && fin(i.value)).sort((a, b) => (a.type === 'Canal' ? 0 : 1) - (b.type === 'Canal' ? 0 : 1) || Math.abs(b.value) - Math.abs(a.value))[0];
      const m = top(p.minus), s = top(p.plus);
      if (m && s) return `${cut(m.name, 28)} es lo que más resta y ${cut(s.name, 28)} lo que más suma`;
      if (m) return `${cut(m.name, 36)} es lo que más resta; nada suma de forma medible`;
      if (s) return `${cut(s.name, 36)} es lo que más suma; nada resta de forma medible`;
      return null;
    },
    trends(p) {
      const drag = kpi(p, 'drag'), comp = kpi(p, 'comp'), t0 = (p.tables || [])[0], ent = t0 && t0.rows && t0.rows[0] ? cut(t0.rows[0].entity, 30) : null;
      if (!fin(drag) || drag >= 0) return fin(comp) && comp > 0 ? `Lo que compensa suma ${money(comp)} y nada cae de forma medible` : null;
      const tail = fin(comp) && comp > 0 ? `; lo que compensa suma ${money(comp)}` : '; nada lo compensa';
      return `${ent ? `${ent} concentra la mayor caída` : 'Lo que cae pesa'} (total ${money(drag)})${tail}`;
    },
    categories(p) {
      const it = ((p.charts || [])[0] || {}).items; if (!Array.isArray(it) || !it.length) return null;
      const top = [...it].filter((i) => fin(i.value)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]; if (!top || top.value === 0) return null;
      return `${cut(top.label, 30)} concentra el mayor ${top.value < 0 ? 'descenso' : 'aumento'} (${money(top.value)})`;
    },
    customers(p) {
      if (p.lapsed && p.lapsed.count === 0 && fin(p.lapsed.base) && p.lapsed.base > 0) return `Ninguno de los ${RB().fmt('int', p.lapsed.base)} clientes del mes anterior dejó de comprar en ${p.lapsed.monthLabel || p.lapsed.month}`;
      const L = p.lapsed;
      if (L && L.monthLabel && L.prevLabel && fin(L.count) && fin(L.base) && L.base > 0 && L.count > 0) {
        const pc = Math.round(L.count / L.base * 100), n = RB().fmt('int', L.count), b = RB().fmt('int', L.base);
        const tenth = L.count / L.base * 10, kk = Math.round(tenth);
        if (kk >= 1 && kk <= 9 && Math.abs(tenth - kk) <= 0.35) return L.inProgress ? `${kk} de cada 10 clientes que compraron en ${L.prevLabel} aún no vuelven a comprar en ${L.monthLabel}` : `${kk} de cada 10 clientes que compraron en ${L.prevLabel} no volvieron a comprar en ${L.monthLabel}`;
        return L.inProgress ? `${n} de ${b} clientes de ${L.prevLabel} aún no vuelven a comprar (${pc} %)` : `${n} de ${b} clientes de ${L.prevLabel} no volvieron a comprar en ${L.monthLabel} (${pc} %)`;
      }
      if (p.lapsed && fin(p.lapsed.count) && fin(p.lapsed.base) && p.lapsed.base > 0) return `${RB().fmt('int', p.lapsed.count)} de ${RB().fmt('int', p.lapsed.base)} clientes del mes anterior no volvieron a comprar en ${p.lapsed.month}`;
      const n = kpi(p, 'customers'); return fin(n) ? `${RB().fmt('int', n)} clientes identificados compran en el período` : null;
    },
    traffic(p) {
      const o = p.overview && p.overview.totals;
      if (p.overview && p.overview.atypical) return 'Tráfico y conversión cambian de forma atípica; conviene validar la cobertura de datos antes de leerlo';
      if (o && fin(o.trafficChg) && fin(o.crChg)) {
        const ref = p.scope && /anterior/i.test(p.scope.comparison || '') ? 'frente al período anterior' : 'frente a la referencia';
        if (Math.abs(o.trafficChg) < 0.005 && Math.abs(o.crChg) < 0.005) return `El tráfico y la conversión se mantienen estables ${ref}`;
        const mv = (v, what) => (Math.abs(v) < 0.005 ? `${what} casi no cambia` : `${what} ${v > 0 ? 'sube' : 'baja'} ${(Math.abs(v) * 100).toFixed(1)} %`);
        return `${mv(o.trafficChg, 'El tráfico')} y ${mv(o.crChg, 'la conversión').replace(/^La conversión/, 'la conversión')} ${ref}`;
      }
      const t = (p.tables || [])[0], dim = p.scope && p.scope.dimension ? String(p.scope.dimension).toLowerCase() : null;
      const rows = t ? t.rows.filter((r) => fin(r.crChg)) : [];
      if (rows.length < 2) return dim ? `Tráfico y conversión por ${dim}` : null;
      const best = [...rows].sort((a, b) => b.crChg - a.crChg)[0], worst = [...rows].sort((a, b) => a.crChg - b.crChg)[0];
      if (best === worst || best.crChg === worst.crChg) return null;
      if (String(best.segment).length > 24 || String(worst.segment).length > 24) return dim ? `Tráfico y conversión por ${dim}` : null;   // nombres técnicos largos: título neutro, el detalle va en la tabla
      return `La conversión ${best.crChg > 0 ? 'sube más' : 'cae menos'} en ${best.segment} y ${worst.crChg < 0 ? 'cae más' : 'sube menos'} en ${worst.segment}`;
    },
    campaigns(p) {
      const c = p.campaigns; if (!c || !c.rows || !c.rows.length) return null;
      if (c.opportunity && c.opportunity.length) return `${cut(c.opportunity[0].name, 34)} concentra la mayor oportunidad de conversión`;
      const star = c.rows.filter((r) => r.quadrant === 'star');
      if (star.length) return `${cut(star[0].name, 34)} lidera en tráfico y convierte sobre el total`;
      return 'Las campañas convierten a un ritmo parecido; ninguna destaca';
    },
    recovery(p) {
      const rem = kpi(p, 'remaining'), days = kpi(p, 'days') !== null ? kpi(p, 'days') : (fin(p.daysLeft) ? p.daysLeft : null), daily = kpi(p, 'daily');
      if (!fin(rem) || !fin(days)) return null;
      if (rem <= 0) return 'La meta del período ya está cubierta';
      if (p.net && fin(p.net.gap) && fin(p.net.shortfall)) return `Los canales rezagados necesitan ${moneyC(p.net.shortfall)}${fin(daily) ? `: ${moneyC(daily)} diarios en ${RB().fmt('int', days)} ${days === 1 ? 'día' : 'días'}` : ' para llegar a su plan'}`;
      return `Faltan ${moneyC(rem)} en ${RB().fmt('int', days)} ${days === 1 ? 'día' : 'días'}${fin(daily) ? `: se requieren ${moneyC(daily)} por día` : ''}`;
    },
    closing(p, rep) {
      const st = standing(kpi(page(rep, 'pacing'), 'compliance')), per = periodOf(rep);
      const blk = (n) => (p.blocks || []).find((b) => b.title === n) || {};
      const down = blk('Qué resta').list && blk('Qué resta').list[0];
      if (!st) return null;
      const head = `${per ? per.split(' ')[0] : 'El período'} ${st.text}`;
      return down && down.name ? `${head}; conviene revisar primero ${cut(down.name, 30)}` : head;
    }
  };

  const sg = (v, d) => (v >= 5 ? 'más de 5 veces' : (v < 0 ? '−' : '+') + (Math.abs(v) * 100).toFixed(d == null ? 1 : d) + ' %');
  const bestWorst = (rows) => { const r = rows.filter((x) => fin(x.crChg)); if (r.length < 2) return null; const b = [...r].sort((x, y) => y.crChg - x.crChg)[0], w = [...r].sort((x, y) => x.crChg - y.crChg)[0]; return b === w ? null : { b, w }; };
  const READ = {
    /** Párrafo de lectura: dónde se movió el tráfico y la conversión (canal y dispositivo siempre que haya datos). «**x**» marca negritas. */
    traffic(p, rep) {
      const o = p.overview; if (!o || !o.totals || !fin(o.totals.trafficChg)) return null;
      const t = o.totals, per = periodOf(rep), out = [];
      out.push(`${per ? 'En ' + per.toLowerCase() : 'En el período'} llegaron **${RB().fmt('int', t.traffic)}** sesiones (${sg(t.trafficChg)}) y la conversión fue de **${RB().fmt('pct2', t.cr)}**${fin(t.crDiffPp) ? ` (${t.crDiffPp < 0 ? '−' : '+'}${(Math.abs(t.crDiffPp) * 100).toFixed(2)} pp)` : ''}.`);
      const mix = (id) => (o.mix || []).find((m) => m.id === id);
      const ch = mix('medium'), bw = o.atypical ? null : (ch && bestWorst(ch.rows));
      if (o.atypical) out.push('La variación es atípica (caída o alza extrema, o un canal que llega a cero): suele indicar que el archivo de Segmentos cubre distinto el período actual y el anterior. Valídalo antes de sacar conclusiones por canal.');
      if (bw) out.push(`Por canal, la conversión ${bw.b.crChg > 0 ? 'subió más' : 'cayó menos'} en **${bw.b.label}** (${sg(bw.b.crChg)}) y ${bw.w.crChg < 0 ? 'cayó más' : 'subió menos'} en **${bw.w.label}** (${sg(bw.w.crChg)}).`);
      const dv = mix('device');
      if (dv && dv.rows.length > 1) {
        const up = [...dv.rows].sort((a, b) => (b.share - b.baseShare) - (a.share - a.baseShare))[0], d = up.share - up.baseShare;
        out.push(Math.abs(d) >= 0.005 && fin(up.cr) && fin(t.cr) ? `En dispositivo, el tráfico se inclinó hacia **${up.label}** (${d > 0 ? '+' : '−'}${(Math.abs(d) * 100).toFixed(1)} pp de participación), que convierte ${up.cr >= t.cr ? 'por encima' : 'por debajo'} del total.` : 'La mezcla por dispositivo casi no cambió.');
      }
      return out.join(' ');
    },
    campaigns(p) {
      const c = p.campaigns; if (!c || !c.rows || !c.rows.length) return null;
      const star = c.rows.filter((r) => r.quadrant === 'star'), opp = c.opportunity || [];
      const a = star.length ? `**${star.map((r) => cut(r.name, 30)).join(', ')}** ${star.length > 1 ? 'son estrella: concentran' : 'es estrella: concentra'} tráfico y ${star.length > 1 ? 'convierten' : 'convierte'} sobre el total.` : 'Ninguna campaña combina mucho tráfico con conversión por encima del total.';
      const b = opp.length ? `La mayor oportunidad está en **${cut(opp[0].name, 30)}**: igualar la conversión del total valdría cerca de **${RB().fmt('moneyC', opp[0].value)}**.` : `Las diferencias de conversión entre campañas son pequeñas y **no son concluyentes**: ninguna justifica una acción por sí sola.`;
      return `${a} ${b}`;
    }
  };
  /** @returns {string|null} texto de lectura de la lámina (puede traer «**negritas**»), o null. */
  function reading(p, report) { try { const f = READ[p && p.id]; const s = f && report ? f(p, report) : null; return s && !/undefined|NaN|null|\[object/.test(s) ? s : null; } catch (e) { return null; } }

  /** @returns {string|null} título con conclusión para la lámina, o null (la vista usa el título neutro). */
  function title(p, report) {
    try {
      const f = RULES[p && p.id]; if (!f || !report) return null;
      const s = f(p, report);
      return s && typeof s === 'string' && !/undefined|NaN|null|\[object/.test(s) ? s : null;
    } catch (e) { return null; }
  }
  FP.reportCopy = { title, reading, standing };
})(typeof window !== 'undefined' ? window : globalThis);
