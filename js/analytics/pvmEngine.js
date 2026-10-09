/**
 * pvmEngine.js — Descomposición Volumen · Precio · Mezcla (PVM) de la VENTA.
 * Puro y determinístico. Explica MATEMÁTICAMENTE cuánto del cambio de venta viene de vender más/menos unidades
 * (volumen), de cobrar distinto por unidad (precio) o de cambiar qué se vende (mezcla). No determina causalidad.
 *
 * Por entidad i que vende en AMBOS períodos (U0>0 y U1>0), con P = venta / unidades y s0_i = U0_i / ΣU0 (de las continuas):
 *   Precio_i  = (P1_i − P0_i) · U1_i
 *   Volumen_i = (ΣU1 − ΣU0) · s0_i · P0_i          (cambio de unidades totales, a la mezcla y precios base)
 *   Mezcla_i  = (U1_i − ΣU1 · s0_i) · P0_i          (cambio de composición entre entidades, a precios base)
 * Entidades que sólo venden ahora → «Nuevas» (= venta actual); sólo antes → «Perdidas» (= −venta base);
 * entidades con venta pero sin unidades válidas → «Sin unidades» (no se pueden descomponer).
 * Garantía: Volumen + Precio + Mezcla + Nuevas + Perdidas + SinUnidades = ΔVenta total (reconciliación exacta).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const DEFAULTS = { partialUnattributedPct: 0.2 };

  /** rows: [{ entity, r0, u0, r1, u1 }]  (r = venta, u = unidades; null/undefined = dato ausente). */
  function analyze(rows, options = {}) {
    const c = { ...DEFAULTS, ...(options || {}) };
    const input = (Array.isArray(rows) ? rows : []).map((x) => ({ entity: x.entity, r0: fin(x.r0) ? x.r0 : 0, r1: fin(x.r1) ? x.r1 : 0,
      u0: fin(x.u0) && x.u0 > 0 ? x.u0 : 0, u1: fin(x.u1) && x.u1 > 0 ? x.u1 : 0 })).filter((x) => x.r0 > 0 || x.r1 > 0);
    if (!input.length) return { status: 'insufficient_data', rows: [], total: null, message: 'No hay venta en ninguno de los dos períodos.' };
    const kind = (x) => (x.r0 <= 0 && x.r1 > 0 ? 'new' : x.r1 <= 0 && x.r0 > 0 ? 'lost' : (x.u0 > 0 && x.u1 > 0 ? 'continuing' : 'no_units'));
    const items = input.map((x) => ({ ...x, kind: kind(x) }));
    const cont = items.filter((x) => x.kind === 'continuing');
    const U0 = cont.reduce((s, x) => s + x.u0, 0), U1 = cont.reduce((s, x) => s + x.u1, 0);
    const out = items.map((x) => {
      const base = { entity: x.entity, kind: x.kind, r0: x.r0, r1: x.r1, u0: x.u0, u1: x.u1, delta: x.r1 - x.r0, price: 0, volume: 0, mix: 0, newItems: 0, lost: 0, noUnits: 0,
        p0: x.u0 > 0 ? x.r0 / x.u0 : null, p1: x.u1 > 0 ? x.r1 / x.u1 : null };
      if (x.kind === 'new') base.newItems = x.r1;
      else if (x.kind === 'lost') base.lost = -x.r0;
      else if (x.kind === 'no_units') base.noUnits = x.r1 - x.r0;
      else {
        const p0 = x.r0 / x.u0, p1 = x.r1 / x.u1, s0 = U0 > 0 ? x.u0 / U0 : 0;
        base.price = (p1 - p0) * x.u1;
        base.volume = (U1 - U0) * s0 * p0;
        base.mix = (x.u1 - U1 * s0) * p0;
      }
      return base;
    }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const sum = (k) => out.reduce((s, x) => s + x[k], 0);
    const total = { delta: sum('delta'), volume: sum('volume'), price: sum('price'), mix: sum('mix'), newItems: sum('newItems'), lost: sum('lost'), noUnits: sum('noUnits'),
      revenue0: sum('r0'), revenue1: sum('r1'), units0: U0, units1: U1, continuing: cont.length, newCount: items.filter((x) => x.kind === 'new').length, lostCount: items.filter((x) => x.kind === 'lost').length, noUnitsCount: items.filter((x) => x.kind === 'no_units').length };
    const explained = total.volume + total.price + total.mix + total.newItems + total.lost + total.noUnits;
    const absTotal = out.reduce((s, x) => s + Math.abs(x.delta), 0);
    const unattributedPct = absTotal > 0 ? out.filter((x) => x.kind === 'no_units').reduce((s, x) => s + Math.abs(x.delta), 0) / absTotal : 0;
    const status = !cont.length ? 'unavailable' : unattributedPct > c.partialUnattributedPct ? 'partial' : 'available';
    return { status, rows: out, total, reconciliation: { sum: explained, delta: total.delta, diff: explained - total.delta, ok: Math.abs(explained - total.delta) <= 0.01 },
      unattributedPct, message: status === 'unavailable' ? 'Ninguna entidad tiene unidades válidas en ambos períodos: no se puede separar volumen, precio y mezcla.' : status === 'partial' ? 'Parte importante del cambio corresponde a entidades sin unidades válidas; la descomposición es parcial.' : null,
      method: 'Volumen = Δ unidades totales a mezcla y precio base · Precio = Δ precio por unidad × unidades actuales · Mezcla = cambio de composición a precio base · Nuevas / Perdidas = entidades que sólo venden en un período.' };
  }
  FP.pvmEngine = { DEFAULTS, analyze };
})(typeof window !== 'undefined' ? window : globalThis);
