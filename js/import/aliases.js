/**
 * aliases.js — Equivalencias de nombres (homologación): una sola tabla que los normalizadores consultan al importar.
 * Formato de cada regla (una por línea):   campo: valor = canónico      (sin «campo:» vale para cualquier campo)
 * Campos: canal, estado, region, ciudad, sucursal, tipo_entrega, dispositivo, fuente, medio, campaña, landing, tipo_cliente, dimension.
 * Solo se aplica lo que el usuario escribe o lo que el catálogo ya conoce (exacto, sin acentos ni mayúsculas): nunca se corrige «a ojo».
 * Las sugerencias por parecido (similarGroups / suggest) solo se muestran; el usuario decide.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const norm = (s) => String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();

  const FIELD_ALIASES = {
    canal: ['canal', 'channel'], estado: ['estado', 'state'], region: ['region', 'región'], ciudad: ['ciudad', 'city', 'municipio'],
    sucursal: ['sucursal', 'branch', 'tienda'], tipo_entrega: ['tipo_entrega', 'tipo de entrega', 'entrega', 'delivery'],
    dispositivo: ['dispositivo', 'device'], fuente: ['fuente', 'source'], medio: ['medio', 'medium'], 'campaña': ['campaña', 'campana', 'campaign'],
    landing: ['landing', 'landing page', 'pagina de destino'], tipo_cliente: ['tipo_cliente', 'tipo de cliente', 'cliente', 'customer type'],
    dimension: ['dimension', 'dimensión']
  };
  const FIELD_OF = {};
  Object.entries(FIELD_ALIASES).forEach(([f, names]) => names.forEach((n) => { FIELD_OF[norm(n)] = f; }));
  FIELD_OF[norm('*')] = '*';

  /** Dimensión interna → campo de equivalencias. */
  const DIM_FIELD = { device: 'dispositivo', source: 'fuente', medium: 'medio', campaign: 'campaña', landing: 'landing', customer_type: 'tipo_cliente', geography: 'estado' };

  /** Dispositivos conocidos (cualquier export): se unifican siempre. */
  const DEVICES = [['Móvil', ['mobile', 'movil', 'celular', 'smartphone', 'telefono', 'phone']], ['Escritorio', ['desktop', 'escritorio', 'pc', 'computadora', 'computador', 'laptop']],
    ['Tableta', ['tablet', 'tableta', 'tablets']], ['Smart TV', ['smart tv', 'smarttv', 'tv']]];
  const DEVICE_MAP = new Map();
  DEVICES.forEach(([label, al]) => { DEVICE_MAP.set(norm(label), label); al.forEach((a) => DEVICE_MAP.set(norm(a), label)); });
  const device = (raw) => DEVICE_MAP.get(norm(raw)) || null;

  let rules = [];                       // [{ field, from, to }]
  let index = new Map();                // `${field}|${norm(from)}` → to
  const unknown = new Map();            // `${field}|${norm(value)}` → { field, value, n }

  function rebuild() { index = new Map(); rules.forEach((r) => index.set(`${r.field}|${norm(r.from)}`, r.to)); }

  /** Texto → reglas. Devuelve también las líneas que no se entendieron. */
  function parse(text) {
    const out = []; const errors = [];
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const eq = line.indexOf('=');
      if (eq < 1) { errors.push({ line: i + 1, text: raw, why: 'Falta «=» entre el valor y su equivalente.' }); return; }
      let left = line.slice(0, eq).trim(); const to = line.slice(eq + 1).trim();
      let field = '*';
      const colon = left.indexOf(':');
      if (colon > 0) {
        const f = FIELD_OF[norm(left.slice(0, colon))];
        if (!f) { errors.push({ line: i + 1, text: raw, why: `Campo «${left.slice(0, colon).trim()}» no reconocido.` }); return; }
        field = f; left = left.slice(colon + 1).trim();
      }
      if (!left || !to) { errors.push({ line: i + 1, text: raw, why: 'Falta el valor o su equivalente.' }); return; }
      out.push({ field, from: left, to });
    });
    return { rules: out, errors };
  }
  const serialize = (rs) => (rs || rules).map((r) => `${r.field === '*' ? '' : `${r.field}: `}${r.from} = ${r.to}`).join('\n');

  function set(rs) { rules = (rs || []).filter((r) => r && r.from && r.to); rebuild(); }
  function add(rule) { rules = rules.filter((r) => !(r.field === rule.field && norm(r.from) === norm(rule.from))).concat([rule]); rebuild(); }

  /** Equivalente canónico de un valor, o null. Busca primero en el campo y después en las reglas sin campo. */
  function resolve(field, raw) {
    if (!rules.length || raw === undefined || raw === null || raw === '') return null;
    const k = norm(raw);
    return index.get(`${field}|${k}`) || index.get(`*|${k}`) || null;
  }

  function noteUnknown(field, raw) {
    const k = `${field}|${norm(raw)}`;
    const e = unknown.get(k) || { field, value: String(raw).trim(), n: 0 };
    e.n++; unknown.set(k, e);
  }
  const unknowns = () => [...unknown.values()].sort((a, b) => b.n - a.n);
  const clearUnknowns = () => unknown.clear();

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) { const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur.push(v); if (v < best) best = v; }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /** Opción más parecida de un catálogo cerrado (solo sugerencia). */
  function suggest(raw, options) {
    const k = norm(raw); if (!k) return null;
    let best = null, bestD = 99;
    options.forEach((o) => {
      const ok = norm(o); const max = k.length >= 8 ? 2 : 1;
      const d = ok.includes(k) || k.includes(ok) ? 0 : lev(k, ok, max);
      if (d <= max && d < bestD) { best = o; bestD = d; }
    });
    return best;
  }

  /**
   * Grupos de valores libres que parecen el mismo (mismas letras sin espacios ni signos, o a 1–2 letras de distancia).
   * @param {Map<string, number>} counts valor → veces. @returns [{ canonical, variants:[{value, n}] }] solo grupos con 2+ variantes.
   */
  function similarGroups(counts) {
    const vals = [...counts.entries()].map(([value, n]) => ({ value, n, k: norm(value).replace(/ /g, '') })).filter((v) => v.k);
    const parent = vals.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const byKey = new Map();
    vals.forEach((v, i) => { if (byKey.has(v.k)) parent[find(i)] = find(byKey.get(v.k)); else byKey.set(v.k, i); });
    const keys = [...byKey.keys()];
    if (keys.length <= 3000) {
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i], b = keys[j]; const len = Math.min(a.length, b.length);
        if (len < 6 || Math.abs(a.length - b.length) > 2) continue;
        const max = len >= 10 ? 2 : 1;
        if (lev(a, b, max) <= max) parent[find(byKey.get(a))] = find(byKey.get(b));
      }
    }
    const groups = new Map();
    vals.forEach((v, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(v); });
    return [...groups.values()].filter((g) => g.length > 1).map((g) => {
      g.sort((a, b) => b.n - a.n);
      return { canonical: g[0].value, variants: g.map((v) => ({ value: v.value, n: v.n })) };
    }).sort((a, b) => b.variants.reduce((s, v) => s + v.n, 0) - a.variants.reduce((s, v) => s + v.n, 0));
  }

  FP.aliases = { norm, parse, serialize, set, add, rules: () => rules.slice(), resolve, noteUnknown, unknowns, clearUnknowns, suggest, similarGroups, device, DIM_FIELD, FIELDS: Object.keys(FIELD_ALIASES) };
})(typeof window !== 'undefined' ? window : globalThis);
