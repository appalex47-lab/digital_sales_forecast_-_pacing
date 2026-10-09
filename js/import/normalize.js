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
    const AL = FP.aliases;
    const src = (AL && AL.resolve('canal', raw)) || raw;   // equivalencias del usuario («tienda = ecommerce»)
    const v = simplify(src).replace(/[_-]+/g, (m) => (m === '-' ? '-' : ' '));
    const v2 = v.replace(/-/g, ' ');
    const ch = C().channels.find((c) => c.aliases.includes(v) || c.aliases.includes(v2) || c.aliases.includes(v2.replace(/\s/g, '')));
    if (!ch && AL) AL.noteUnknown('canal', raw);
    return ch ? res('ok', ch.id, raw, ch.id === String(raw).trim() ? null : `Canal normalizado a "${ch.id}".`)
      : res('invalid', null, raw, `"${String(raw).trim()}" no es uno de los canales válidos (${C().channelIds.join(', ')}). Puedes agregar una equivalencia en Configuración › Equivalencias de nombres.`);
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
    const AL = FP.aliases;
    const h = normalizeHeader((AL && AL.resolve('dimension', raw)) || raw);
    const dims = C().diagnostics.dimensions;
    const known = Object.keys(dims).find((k) => k === h || (dims[k].aliases || []).includes(h));
    if (!known && h && AL) AL.noteUnknown('dimension', raw);
    return h ? res('ok', known || h, raw) : res('invalid', null, raw, 'Dimensión vacía.');
  }

  /** Segmento → { value: llave comparable, label: texto original limpio }. customer_type se unifica a new/returning. */
  function normalizeSegment(raw, dimensionId) {
    if (isBlank(raw)) return res('missing', null, raw);
    let label = String(raw).trim().replace(/\s+/g, ' ');
    const AL = FP.aliases;
    if (AL) {   // equivalencias del usuario y dispositivos conocidos (Mobile, móvil, celular → Móvil)
      const field = AL.DIM_FIELD[dimensionId];
      const al = (field && AL.resolve(field, label)) || AL.resolve('*', label);
      if (al) label = String(al).trim().replace(/\s+/g, ' ');
      else if (dimensionId === 'device') label = AL.device(label) || label;
    }
    let key = normalizeHeader(label);
    // Segmentos hechos solo de símbolos (p. ej. la página de inicio «/» en Página de destino) no se pierden: llave determinista a partir de sus caracteres.
    if (!key && label) key = 'sym_' + Array.from(label).map((c) => c.codePointAt(0).toString(16)).join('_');
    if (dimensionId === 'customer_type') {
      const al = C().diagnostics.customerTypeAliases;
      const hit = Object.keys(al).find((k) => al[k].includes(key));
      if (hit) key = hit;
    }
    return key ? res('ok', key, raw, null, { label }) : res('invalid', null, raw, 'Segmento vacío.');
  }

  /**
   * Mapeo semántico asistido por Cohere para cabeceras que el diccionario estático no resolvió.
   * Solo puede devolver campos existentes en C().importFields. La decisión final se valida
   * nuevamente en import.js para impedir campos inventados o duplicados.
   */
  /**
   * Datos personales (Fase H3). Determinístico y conservador: ante la duda se protege (la columna viaja sin ejemplos; el mapeo sigue
   * funcionando solo con su encabezado). Tres fuentes de protección:
   *  1) el NOMBRE de la columna (correo, teléfono, nombre de persona, paciente, receta, diagnóstico, domicilio, identificadores de cliente…);
   *  2) el CONTENIDO de los ejemplos (correo, teléfono, RFC, CURP, NSS, UUID, IP, identificadores numéricos largos, domicilios y nombres de persona);
   *  3) las columnas que el usuario marcó a mano en Ajustes.
   * Los falsos positivos son aceptables (se pierden ejemplos, no datos); los falsos negativos no.
   */
  const PII_HEADER = /(e-?mail|correo|tel[eé]fono|phone|celular|whats?app?\s*(num|n[uú]m)|m[oó]vil\s*del|\brfc\b|\bcurp\b|\bnss\b|seguro\s*social|direcci[oó]n|domicilio|address|street|\bcalle\b|c[oó]digo\s*postal|\bcp\b|\bzip\b|(^|[\s_-])ip($|[\s_-])|apellido|first[_\s-]*name|last[_\s-]*name|full[_\s-]*name|^(nombre|name)$|nombre\s*(del?\s*|de\s*la\s*)?(cliente|paciente|comprador|usuario|persona|contacto|titular|beneficiario|doctor|m[eé]dico|asegurado)|paciente|beneficiario|derechohabiente|asegurado|titular|receta|diagn[oó]stico|padecimiento|c[eé]dula|customer[_\s-]*(name|id)|client[_\s-]*id|user[_\s-]*(name|id)|id\s*(de\s*)?(cliente|usuario|paciente)|^usuario$)/i;
  const PII_VALUE = [
    [/[^\s@]+@[^\s@]+\.[^\s@]+/, 'correo'],
    [/^\d{11,18}$/, 'identificador numérico largo'],        // solo dígitos y largo: casi siempre un identificador (cliente, folio, cuenta)
    [/(?:\+?\d[\s-]?){10,}/, 'teléfono o número largo'],
    [/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i, 'RFC'],
    [/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/i, 'CURP'],
    [/^\d{9}$/, 'identificador numérico largo'],
    [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'identificador (UUID)'],
    [/^\d{1,3}(?:\.\d{1,3}){3}$/, 'dirección IP']
  ];
  const ADDRESS = /(\bcalle\b|\bav(?:enida|\.)?\s|\bblvd\b|\bboulevard\b|\bcol(?:onia|\.)\s|\bc\.?\s?p\.?\s*\d{5}\b|\bcarretera\b|\bandador\b|\bprivada\b|#\s*\d+|\bn[uú]m(?:ero|\.)?\s*\d+)/i;
  const PERSON = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:de|del|la|las|los|y|[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)){1,4}$/;
  let personalMarked = new Set();   // encabezados normalizados que el usuario marcó como datos personales
  const keyOf = (h) => (FP.normalize && FP.normalize.normalizeHeader ? normalizeHeader(h) : String(h).trim().toLowerCase());
  function setPersonalColumns(list = []) { personalMarked = new Set((list || []).map((h) => keyOf(h)).filter(Boolean)); }
  function personalColumns() { return [...personalMarked]; }
  /** Por qué una columna se protege: 'marcada por ti' | 'nombre de la columna' | un motivo de contenido | null si no parece personal. */
  function personalReason(header, examples = []) {
    if (personalMarked.has(keyOf(header))) return 'marcada por ti';
    if (PII_HEADER.test(String(header || ''))) return 'nombre de la columna';
    const vals = (examples || []).map((v) => String(v).trim()).filter(Boolean);
    for (const v of vals) { for (const [re, why] of PII_VALUE) if (re.test(v)) return `contenido: ${why}`; if (ADDRESS.test(v) && /\d/.test(v)) return 'contenido: domicilio'; }
    if (vals.filter((v) => PERSON.test(v)).length >= Math.min(2, vals.length) && vals.length >= 2) return 'contenido: nombres de persona';
    return null;
  }
  function looksPersonal(header, examples = []) { return personalReason(header, examples) !== null; }

  async function suggestHeaderMappingWithAI(headers, {
    dataType,
    samples = {},
    customPrompt = '',
    apiKey = '',
    model = null,
    timeoutMs = null
  } = {}) {
    const staticMapping = {};
    const unknownHeaders = [];
    headers.forEach((h) => {
      const f = FP.importer && FP.importer.suggestField ? FP.importer.suggestField(h) : null;
      staticMapping[h] = f;
      if (!f) unknownHeaders.push(h);
    });

    const required = (C().dataTypes[dataType] && C().dataTypes[dataType].required) || [];
    const missingRequired = required.filter((f) => !Object.values(staticMapping).includes(f));
    if (!unknownHeaders.length && !missingRequired.length) {
      return { ok: true, mapping: staticMapping, usedAI: false, mapped: [], unmapped: [] };
    }
    // Reutiliza la conexión central de Ajustes si el caller no pasó una key.
    if (!apiKey && FP.cohereConnection && typeof FP.cohereConnection.get === 'function') {
      const connection = FP.cohereConnection.get();
      apiKey = connection && connection.apiKey ? connection.apiKey : '';
      if (!model && connection && connection.model) model = connection.model;
    }
    if (!apiKey) {
      return { ok: false, status: 'unavailable', mapping: staticMapping, usedAI: false,
        mapped: [], unmapped: unknownHeaders, errors: ['No hay conexión Cohere configurada en Ajustes. El mapeo estático se conserva.'] };
    }
    if (!FP.cohereClient || typeof FP.cohereClient.chatJson !== 'function') {
      return { ok: false, status: 'unavailable', mapping: staticMapping, usedAI: false,
        mapped: [], unmapped: unknownHeaders, errors: ['El cliente de Cohere no está disponible. El mapeo estático se conserva.'] };
    }

    const fields = C().importFields.map((f) => ({
      key: f.key, label: f.label, type: f.type, required: required.includes(f.key),
      synonyms: f.synonyms.slice(0, 20)
    }));
    // Fase A · privacidad (decisión de arquitectura adelantada de la Fase H): a Cohere solo van encabezados y, como ejemplos,
    // valores que NO parezcan datos personales. Si el encabezado o cualquiera de los valores parece correo, teléfono, RFC, CURP,
    // nombre de persona, dirección o identificador de cliente, esa columna viaja sin ejemplos.
    const auditColumns = [];
    const inputHeaders = unknownHeaders.map((h) => {
      const ex = (samples[h] || []).slice(0, 3).map((v) => String(v)).filter(Boolean);
      const why = personalReason(h, ex);
      auditColumns.push({ header: h, examplesSent: why ? 0 : ex.length, protected: why });
      return { header: h, examples: why ? [] : ex, ...(why ? { note: 'ejemplos omitidos: posible dato personal' } : {}) };
    });
    const protectedColumns = auditColumns.filter((c) => c.protected).map((c) => ({ header: c.header, reason: c.protected }));

    const schema = {
      type: 'object',
      required: ['mappings'],
      properties: {
        mappings: {
          type: 'array',
          items: {
            type: 'object',
            required: ['header', 'field', 'confidence', 'reason'],
            properties: {
              header: { type: 'string' },
              field: { type: 'string', enum: fields.map((f) => f.key) },
              confidence: { type: 'number' },
              reason: { type: 'string' },
              alternatives: { type: 'array', items: { type: 'object', required: ['field', 'confidence'], properties: { field: { type: 'string', enum: fields.map((f) => f.key) }, confidence: { type: 'number' } } } }
            }
          }
        }
      }
    };

    const system = [
      'Eres un mapeador de columnas para un pipeline ETL.',
      'Tu tarea es relacionar cabeceras desconocidas de un archivo con campos canónicos EXISTENTES.',
      'Devuelve únicamente JSON válido conforme al schema.',
      'No inventes campos. Si no hay equivalencia suficientemente clara, no incluyas esa cabecera.',
      'Prioriza el significado semántico de la cabecera y sus ejemplos.',
      'No uses una misma cabecera para varios campos. El cliente aplicará una segunda validación.',
      'No transformes valores de las filas; solo mapea nombres de columnas.',
      'Si dudas entre dos campos, devuelve el más probable y el otro en alternatives con su confidence.',
      'Confidence debe estar entre 0 y 1.'
    ].join('\n');

    const user = [
      `Tipo de dato: ${dataType}`,
      `Campos permitidos: ${JSON.stringify(fields)}`,
      `Cabeceras desconocidas: ${JSON.stringify(inputHeaders)}`,
      `Campos obligatorios aún faltantes: ${JSON.stringify(missingRequired)}`,
      customPrompt ? `Instrucción adicional del usuario: ${String(customPrompt).slice(0, 1000)}` : ''
    ].filter(Boolean).join('\n');

    const result = await FP.cohereClient.chatJson({
      audit: { purpose: 'Mapeo de columnas', columns: auditColumns },
      system, user, schema, apiKey,
      model: model || C().diagnostics.cohere.model,
      timeoutMs: timeoutMs || C().diagnostics.cohere.timeoutMs
    });
    if (!result.ok) {
      return { ok: false, status: result.status, mapping: staticMapping, usedAI: false,
        mapped: [], unmapped: unknownHeaders, errors: result.errors || ['Cohere no pudo resolver el mapeo.'] };
    }

    const parsed = FP.cohereClient.parseJson(result.text);
    if (!parsed.ok || !parsed.value || !Array.isArray(parsed.value.mappings)) {
      return { ok: false, status: 'invalid', mapping: staticMapping, usedAI: false,
        mapped: [], unmapped: unknownHeaders, errors: ['Cohere devolvió un mapeo que no pudo validarse como JSON.'] };
    }

    const allowed = new Set(fields.map((f) => f.key));
    const used = new Set(Object.values(staticMapping).filter(Boolean));
    const knownHeaders = new Set(headers);
    const mapped = [];
    const unmapped = [];
    const errors = [];
    const doubtful = [];   // Fase H5: columnas que la IA no resolvió con seguridad y por qué
    const minConfidence = 0.78;
    const closeBand = 0.1;

    parsed.value.mappings.forEach((m) => {
      const header = typeof m.header === 'string' ? m.header : '';
      const field = typeof m.field === 'string' ? m.field : '';
      const confidence = Number(m.confidence);
      if (!knownHeaders.has(header) || !unknownHeaders.includes(header)) return;
      if (!allowed.has(field)) { errors.push(`Cohere propuso un campo inexistente para "${header}".`); return; }
      const alts = (Array.isArray(m.alternatives) ? m.alternatives : []).filter((a) => a && allowed.has(a.field) && a.field !== field && Number.isFinite(Number(a.confidence)))
        .map((a) => ({ field: a.field, confidence: Number(a.confidence) })).sort((x, y) => y.confidence - x.confidence);
      if (!Number.isFinite(confidence) || confidence < minConfidence) {
        doubtful.push({ header, field, confidence: Number.isFinite(confidence) ? confidence : null, alternatives: alts.slice(0, 2), why: `confianza baja (${Number.isFinite(confidence) ? confidence.toFixed(2) : 'sin dato'}; se pide al menos ${minConfidence})`, reason: String(m.reason || '').slice(0, 240) });
        return;
      }
      if (used.has(field)) {
        errors.push(`Cohere quiso asignar ${field} a más de una columna; se conservó el primer mapeo.`);
        doubtful.push({ header, field, confidence, alternatives: alts.slice(0, 2), why: 'ese campo ya está asignado a otra columna', reason: String(m.reason || '').slice(0, 240) });
        return;
      }
      const near = alts.find((a) => confidence - a.confidence <= closeBand && a.confidence >= minConfidence);
      if (near) doubtful.push({ header, field, confidence, alternatives: alts.slice(0, 2), assigned: true, why: `dos candidatos cercanos (${field} ${confidence.toFixed(2)} y ${near.field} ${near.confidence.toFixed(2)}); se asignó ${field}, revísalo`, reason: String(m.reason || '').slice(0, 240) });
      staticMapping[header] = field;
      used.add(field);
      mapped.push({ header, field, confidence, reason: String(m.reason || '').slice(0, 240) });
    });

    unknownHeaders.forEach((h) => { if (!staticMapping[h]) unmapped.push(h); });
    return {
      ok: true, status: 'ok', mapping: staticMapping, usedAI: mapped.length > 0,
      mapped, unmapped, errors, doubtful, protectedColumns, model: model || C().diagnostics.cohere.model
    };
  }

  FP.normalize = { looksPersonal, personalReason, setPersonalColumns, personalColumns, normalizeDimension, normalizeSegment, simplify, normalizeHeader, normalizeDate, detectDateFormat, normalizeNumber,
    normalizeChannel, normalizeDayType, normalizeText, isBlank, DAY_TYPE_ALIASES, suggestHeaderMappingWithAI };
})(typeof window !== 'undefined' ? window : globalThis);
