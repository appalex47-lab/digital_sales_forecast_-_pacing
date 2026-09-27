/**
 * normalize.js — Reglas de normalización (Fase 1).
 *
 * Cada función recibe TEXTO crudo y devuelve un resultado explícito:
 *   { status: 'ok' | 'missing' | 'invalid' | 'ambiguous', value, raw, note? }
 * Nunca convierte un valor inválido en 0 ni adivina una fecha ambigua.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const Cal = () => FP.calendar;

  const isBlank = (raw) => raw === null || raw === undefined || String(raw).trim() === '';
  const res = (status, value, raw, note = null, extra = {}) => ({ status, value, raw: raw === undefined ? null : raw, note, ...extra });

  /** minúsculas, sin acentos, espacios simples. */
  function simplify(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  }

  /** Encabezado → forma comparable: 'Meta Venta ($)' → 'meta_venta'. */
  function normalizeHeader(h) {
    return simplify(h).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  /* ---------- Fechas ---------- */

  const pad = (n) => String(n).padStart(2, '0');

  function buildDate(y, m, d, raw, note, inferred = false) {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    return Cal().isValidISODate(iso) ? res('ok', iso, raw, note, { inferred })
      : res('invalid', null, raw, 'La fecha no existe en el calendario.');
  }

  /**
   * Acepta:
   *  - ISO: 2026-09-21, 2026-9-21, 2026/09/21 (año primero nunca es ambiguo)
   *  - Con '/', '-' o '.' y año al final: solo si el orden es inequívoco o el usuario eligió DMY/MDY.
   * Rechaza años de 2 dígitos, texto y fechas imposibles.
   */
  function normalizeDate(raw, { dateFormat = C().import.dateFormat } = {}) {
    if (isBlank(raw)) return res('missing', null, raw);
    const s = String(raw).trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2})?.*$/, ''); // quita hora "2026-09-21 00:00"

    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (m) {
      const note = /^\d{4}-\d{2}-\d{2}$/.test(s) ? null : 'Fecha reescrita a AAAA-MM-DD.';
      return buildDate(+m[1], +m[2], +m[3], raw, note);
    }

    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
    if (m) {
      if (m[3].length !== 4) return res('invalid', null, raw, 'El año debe tener 4 dígitos.');
      const a = +m[1], b = +m[2], y = +m[3];
      if (dateFormat === 'DMY') return buildDate(y, b, a, raw, 'Interpretada como DD/MM/AAAA (elegido por el usuario).');
      if (dateFormat === 'MDY') return buildDate(y, a, b, raw, 'Interpretada como MM/DD/AAAA (elegido por el usuario).');
      // Automático: solo si no hay ambigüedad posible
      if (a > 12 && b <= 12) return buildDate(y, b, a, raw, 'Interpretada como DD/MM/AAAA porque el primer número es mayor a 12.', true);
      if (b > 12 && a <= 12) return buildDate(y, a, b, raw, 'Interpretada como MM/DD/AAAA porque el segundo número es mayor a 12.', true);
      if (a > 12 && b > 12) return res('invalid', null, raw, 'Ni el día ni el mes son válidos.');
      if (a === b) return buildDate(y, a, b, raw, 'Día y mes iguales: sin ambigüedad.');
      return res('ambiguous', null, raw, 'No se puede saber si es día/mes o mes/día. Elige el formato de fecha en Opciones.');
    }
    return res('invalid', null, raw, 'Formato no reconocido. Usa AAAA-MM-DD.');
  }

  /**
   * Sugiere el formato de un archivo mirando todas sus fechas con '/':
   * si alguna solo es posible como DMY (o MDY) y ninguna contradice, lo sugiere.
   */
  function detectDateFormat(rawValues) {
    let dmy = false, mdy = false, slash = 0, iso = 0;
    rawValues.forEach((raw) => {
      const s = String(raw || '').trim();
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) { iso++; return; }
      const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}/.exec(s);
      if (!m) return;
      slash++;
      if (+m[1] > 12) dmy = true;
      if (+m[2] > 12) mdy = true;
    });
    if (!slash) return { suggestion: 'auto', iso, slash, reason: iso ? 'Fechas en formato ISO.' : 'Sin fechas reconocibles.' };
    if (dmy && !mdy) return { suggestion: 'DMY', iso, slash, reason: 'Hay fechas cuyo primer número es mayor a 12: el archivo parece DD/MM/AAAA.' };
    if (mdy && !dmy) return { suggestion: 'MDY', iso, slash, reason: 'Hay fechas cuyo segundo número es mayor a 12: el archivo parece MM/DD/AAAA.' };
    if (dmy && mdy) return { suggestion: null, iso, slash, reason: 'El archivo mezcla DD/MM y MM/DD: revisa la fuente.' };
    return { suggestion: null, iso, slash, reason: 'Todas las fechas con "/" son ambiguas: elige el formato manualmente.' };
  }

  /* ---------- Números ---------- */

  /**
   * Normaliza un número según el formato elegido ('dot' 1,234.56 | 'comma' 1.234,56).
   * Acepta $, MXN, espacios, signo negativo y negativos contables (1,234).
   * `percent`: permite sufijo % y lo convierte a fracción.
   * Separadores de miles solo válidos en grupos de 3 dígitos ('1,5' es inválido con 'dot').
   */
  function normalizeNumber(raw, { numberFormat = C().import.numberFormat, percent = false } = {}) {
    if (isBlank(raw)) return res('missing', null, raw);
    if (typeof raw === 'number') return Number.isFinite(raw) ? res('ok', raw, raw) : res('invalid', null, raw, 'Número no finito.');
    const fmt = C().import.numberFormats[numberFormat] || C().import.numberFormats.dot;
    let s = String(raw).trim().replace(/[\u00A0\u202F\s]/g, '');
    let negative = false;
    if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
    s = s.replace(/^(mxn|usd)|(mxn|usd)$/i, '').replace(/^\$|\$$/g, '');
    if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
    s = s.replace(/^\$/, '');
    let isPct = false;
    if (s.endsWith('%')) {
      if (!percent) return res('invalid', null, raw, 'No se esperaba un porcentaje en este campo.');
      isPct = true; s = s.slice(0, -1);
    }
    const t = fmt.thousands === '.' ? '\\.' : fmt.thousands;
    const d = fmt.decimal === '.' ? '\\.' : fmt.decimal;
    const grouped = new RegExp(`^\\d{1,3}(${t}\\d{3})+(${d}\\d+)?$`);
    const plain = new RegExp(`^\\d+(${d}\\d+)?$|^${d}\\d+$`);
    if (!grouped.test(s) && !plain.test(s)) {
      return res('invalid', null, raw, `No es un número válido en formato ${fmt.label}.`);
    }
    let n = Number(s.split(fmt.thousands).join('').replace(fmt.decimal, '.'));
    if (!Number.isFinite(n)) return res('invalid', null, raw, 'Número fuera de rango.');
    if (negative) n = -n;
    if (isPct) n = n / 100;
    const note = String(raw).trim() === String(n) ? null : 'Número limpiado de símbolos o separadores.';
    return res('ok', n, raw, note);
  }

  /* ---------- Canal y tipo de día ---------- */

  function normalizeChannel(raw) {
    if (isBlank(raw)) return res('missing', null, raw);
    const v = simplify(raw).replace(/[_-]+/g, (m) => (m === '-' ? '-' : ' '));
    const v2 = v.replace(/-/g, ' ');
    const ch = C().channels.find((c) => c.aliases.includes(v) || c.aliases.includes(v2) || c.aliases.includes(v2.replace(/\s/g, '')));
    return ch ? res('ok', ch.id, raw, ch.id === String(raw).trim() ? null : `Canal normalizado a "${ch.id}".`)
      : res('invalid', null, raw, `"${String(raw).trim()}" no es uno de los canales válidos (${C().channelIds.join(', ')}).`);
  }

  const DAY_TYPE_ALIASES = {
    regular: ['regular', 'normal', 'ordinario', 'habil'],
    holiday: ['holiday', 'festivo', 'feriado'],
    event: ['event', 'evento'],
    campaign: ['campaign', 'campana', 'campaña'],
    special: ['special', 'especial']
  };

  function normalizeDayType(raw) {
    if (isBlank(raw)) return res('missing', null, raw);
    const v = simplify(raw);
    const id = Object.keys(DAY_TYPE_ALIASES).find((k) => DAY_TYPE_ALIASES[k].includes(v));
    return id ? res('ok', id, raw) : res('invalid', null, raw, `Tipo de día no reconocido. Válidos: ${C().dayTypes.join(', ')}.`);
  }

  function normalizeText(raw) {
    if (isBlank(raw)) return res('missing', null, raw);
    return res('ok', String(raw).trim().replace(/\s+/g, ' '), raw);
  }

  /* ---------- Segmentos (Fase 5) ---------- */

  /** Dimensión → id conocido de config.diagnostics.dimensions o forma normalizada ('Tipo de cliente' → 'customer_type'). */
  function normalizeDimension(raw) {
    if (isBlank(raw)) return res('missing', null, raw);
    const h = normalizeHeader(raw);
    const dims = C().diagnostics.dimensions;
    const id = Object.keys(dims).find((k) => k === h || (dims[k].aliases || []).includes(h)) || h;
    return h ? res('ok', id, raw) : res('invalid', null, raw, 'Dimensión vacía.');
  }

  /** Segmento → { value: llave comparable, label: texto original limpio }. customer_type se unifica a new/returning. */
  function normalizeSegment(raw, dimensionId) {
    if (isBlank(raw)) return res('missing', null, raw);
    const label = String(raw).trim().replace(/\s+/g, ' ');
    let key = normalizeHeader(label);
    if (dimensionId === 'customer_type') {
      const al = C().diagnostics.customerTypeAliases;
      const hit = Object.keys(al).find((k) => al[k].includes(key));
      if (hit) key = hit;
    }
    return key ? res('ok', key, raw, null, { label }) : res('invalid', null, raw, 'Segmento vacío.');
  }

  FP.normalize = { normalizeDimension, normalizeSegment, simplify, normalizeHeader, normalizeDate, detectDateFormat, normalizeNumber,
    normalizeChannel, normalizeDayType, normalizeText, isBlank, DAY_TYPE_ALIASES };
})(typeof window !== 'undefined' ? window : globalThis);
