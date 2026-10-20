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
  const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
  const page = (rep, id) => (rep.pages || []).find((p) => p.id === id && p.status === 'included') || null;
  const kpi = (p, id) => { const k = p && (p.kpis || []).find((x) => x.id === id); return k && fin(k.value) ? k.value : null; };
  const lower1 = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const money = (v) => RB().fmt('smoney', v), moneyC = (v) => RB().fmt('moneyC', v), pct = (v) => RB().fmt('pct', v);
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
        if (fin(lp) && fin(lf) && lp > 0) { const r = lf / lp; tail = r >= 1.02 ? '; el cierre estimado supera el plan del mes' : r >= 0.98 ? '; el cierre estimado confirma el ritmo' : '; el cierre estimado queda por debajo del plan del mes'; }
      }
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
      if (p.lapsed && p.lapsed.count === 0 && fin(p.lapsed.base) && p.lapsed.base > 0) return `Ninguno de los ${RB().fmt('int', p.lapsed.base)} clientes del mes anterior dejó de comprar en ${p.lapsed.month}`;
      if (p.lapsed && fin(p.lapsed.count) && fin(p.lapsed.base) && p.lapsed.base > 0) return `${RB().fmt('int', p.lapsed.count)} de ${RB().fmt('int', p.lapsed.base)} clientes del mes anterior no volvieron a comprar en ${p.lapsed.month}`;
      const n = kpi(p, 'customers'); return fin(n) ? `${RB().fmt('int', n)} clientes identificados compran en el período` : null;
    },
    traffic(p) {
      const t = (p.tables || [])[0], dim = p.scope && p.scope.dimension ? String(p.scope.dimension).toLowerCase() : null;
      const rows = t ? t.rows.filter((r) => fin(r.crChg)) : [];
      if (rows.length < 2) return dim ? `Tráfico y conversión por ${dim}` : null;
      const best = [...rows].sort((a, b) => b.crChg - a.crChg)[0], worst = [...rows].sort((a, b) => a.crChg - b.crChg)[0];
      if (best === worst || best.crChg === worst.crChg) return null;
      if (String(best.segment).length > 24 || String(worst.segment).length > 24) return dim ? `Tráfico y conversión por ${dim}` : null;   // nombres técnicos largos: título neutro, el detalle va en la tabla
      return `La conversión ${best.crChg > 0 ? 'sube más' : 'cae menos'} en ${best.segment} y ${worst.crChg < 0 ? 'cae más' : 'sube menos'} en ${worst.segment}`;
    },
    recovery(p) {
      const rem = kpi(p, 'remaining'), days = kpi(p, 'days'), daily = kpi(p, 'daily');
      if (!fin(rem) || !fin(days)) return null;
      if (rem <= 0) return 'La meta del período ya está cubierta';
      return `Faltan ${moneyC(rem)} en ${RB().fmt('int', days)} días${fin(daily) ? `: se requieren ${moneyC(daily)} por día` : ''}`;
    },
    closing(p, rep) {
      const st = standing(kpi(page(rep, 'pacing'), 'compliance')), per = periodOf(rep);
      const blk = (n) => (p.blocks || []).find((b) => b.title === n) || {};
      const down = blk('Qué resta').list && blk('Qué resta').list[0];
      if (!st) return null;
      const head = `${per ? per.split(' ')[0] : 'El período'} ${st.text}`;
      return down && down.name ? `${head}; ${cut(down.name, 30)} merece atención` : head;
    }
  };

  /** @returns {string|null} título con conclusión para la lámina, o null (la vista usa el título neutro). */
  function title(p, report) {
    try {
      const f = RULES[p && p.id]; if (!f || !report) return null;
      const s = f(p, report);
      return s && typeof s === 'string' && !/undefined|NaN|null|\[object/.test(s) ? s : null;
    } catch (e) { return null; }
  }
  FP.reportCopy = { title, standing };
})(typeof window !== 'undefined' ? window : globalThis);
