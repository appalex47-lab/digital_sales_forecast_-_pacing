/**
 * calendar.js — Fechas, semanas, periodos.
 *
 * Todas las fechas se manejan como 'YYYY-MM-DD' y se operan en UTC
 * para evitar desfases por zona horaria.
 *
 * REGLA: la definición de semana vive únicamente en getWeekInfo().
 * Para cambiarla (ej. semana domingo-sábado o semanas fiscales),
 * se modifica esa función y/o FP.config.calendar, nada más.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const cfg = () => FP.config.calendar;

  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DAY_MS = 86400000;

  /** 'YYYY-MM-DD' | Date → Date (UTC medianoche) o null si inválida. */
  function parseDate(input) {
    if (input instanceof Date) {
      if (isNaN(input.getTime())) return null;
      return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
    }
    if (typeof input !== 'string') return null;
    const m = ISO_RE.exec(input.trim());
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    // Rechaza fechas imposibles (2026-02-30)
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  }

  function isValidISODate(str) { return parseDate(str) !== null; }

  function toISODate(date) {
    const d = parseDate(date);
    if (!d) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }

  function addDays(date, n) {
    const d = parseDate(date);
    return d ? toISODate(new Date(d.getTime() + n * DAY_MS)) : null;
  }

  function daysInMonth(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }

  /** Lunes = 1 … Domingo = 7 */
  function isoDayOfWeek(d) { const w = d.getUTCDay(); return w === 0 ? 7 : w; }

  function dayOfYear(d) {
    return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS) + 1;
  }

  /** Semana ISO-8601: { weekYear, week } */
  function getISOWeek(date) {
    const d = parseDate(date);
    if (!d) return null;
    const thursday = new Date(d.getTime() + (4 - isoDayOfWeek(d)) * DAY_MS);
    const weekYear = thursday.getUTCFullYear();
    const week = Math.ceil(dayOfYear(thursday) / 7);
    return { weekYear, week };
  }

  /** Semana dentro del mes según weekOfMonthMode. */
  function getWeekOfMonth(date) {
    const d = parseDate(date);
    if (!d) return null;
    // Único modo en Fase 0: 'calendar-days'
    return Math.min(5, Math.floor((d.getUTCDate() - 1) / 7) + 1);
  }

  /**
   * ★ Punto único de definición de semana.
   * Devuelve número de semana del año, llave estable y semana del mes (W1…W5).
   */
  function getWeekInfo(date) {
    const d = parseDate(date);
    if (!d) return null;
    const { weekYear, week } = getISOWeek(d); // cfg().weekDefinition === 'iso'
    const weekOfMonth = getWeekOfMonth(d);
    return {
      week,
      weekYear,
      weekKey: `${weekYear}-W${String(week).padStart(2, '0')}`,
      weekOfMonth,
      weekOfMonthLabel: `W${weekOfMonth}`
    };
  }

  function getQuarter(date) { const d = parseDate(date); return d ? Math.floor(d.getUTCMonth() / 3) + 1 : null; }

  /** Quincena del mes: 1 (días 1–15) o 2 (16–fin). */
  function getFortnight(date) {
    const d = parseDate(date);
    return d ? (d.getUTCDate() <= cfg().fortnightSplitDay ? 1 : 2) : null;
  }

  /** Atributos de calendario de un día (base para estacionalidad futura). */
  function getDateAttributes(date) {
    const d = parseDate(date);
    if (!d) return null;
    const dow = isoDayOfWeek(d);
    const wk = getWeekInfo(d);
    return {
      date: toISODate(d),
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      quarter: getQuarter(d),
      fortnight: getFortnight(d),
      week: wk.week,
      weekYear: wk.weekYear,
      weekKey: wk.weekKey,
      weekOfMonth: wk.weekOfMonth,
      weekOfMonthLabel: wk.weekOfMonthLabel,
      dayOfWeek: cfg().dayNames[dow - 1],
      dayOfWeekIndex: dow,
      dayOfYear: dayOfYear(d),
      isWeekend: dow >= 6
    };
  }

  const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

  /**
   * Fase 2: día de calendario completo para planeación.
   * Semana = ISO 8601 (lunes a domingo; la semana 1 contiene el primer jueves del año).
   * weekStart/weekEnd son el lunes y domingo de esa semana ISO, aunque caigan en otro mes;
   * `month` siempre es el mes del día. Las agregaciones semanales suman días, así que una
   * semana que cruza meses se reparte sin inconsistencias (cada día pertenece a un solo mes).
   * @param {string} date
   * @param {object} tags  { holiday, event, season, dayType } del día (datos o eventos configurados)
   */
  function getCalendarDay(date, tags = {}) {
    const a = getDateAttributes(date);
    if (!a) return null;
    const d = parseDate(date);
    const dow = a.dayOfWeekIndex;
    const monday = addDays(d, 1 - dow);
    return {
      ...a,
      dayOfWeekLabel: cfg().dayNamesEs[dow - 1],
      dayOfMonth: d.getUTCDate(),
      daysInMonth: daysInMonth(a.year, a.month),
      daysFromMonthEnd: daysInMonth(a.year, a.month) - d.getUTCDate(),
      weekStart: toISODate(monday),
      weekEnd: toISODate(addDays(monday, 6)),
      isLeapYear: isLeapYear(a.year),
      holiday: tags.holiday || null,
      isHoliday: Boolean(tags.holiday) || tags.dayType === 'holiday',
      event: tags.event || null,
      season: tags.season || null,
      dayType: tags.dayType || (tags.event ? 'event' : tags.holiday ? 'holiday' : 'regular')
    };
  }

  /** Lista de fechas ISO entre start y end (inclusive). */
  function eachDay(start, end) {
    const s = parseDate(start), e = parseDate(end);
    if (!s || !e || s > e) return [];
    const out = [];
    for (let t = s.getTime(); t <= e.getTime(); t += DAY_MS) out.push(toISODate(new Date(t)));
    return out;
  }

  function daysOfMonth(year, month) {
    const p = String(month).padStart(2, '0');
    return eachDay(`${year}-${p}-01`, `${year}-${p}-${daysInMonth(year, month)}`);
  }

  function daysOfYear(year) { return eachDay(`${year}-01-01`, `${year}-12-31`); }

  /**
   * Llave de periodo para una fecha y granularidad.
   * year '2026' | month '2026-09' | week '2026-W39' | day '2026-09-23'
   */
  function periodKey(date, granularity) {
    const a = getDateAttributes(date);
    if (!a) return null;
    switch (granularity) {
      case 'year': return String(a.year);
      case 'month': return `${a.year}-${String(a.month).padStart(2, '0')}`;
      case 'week': return a.weekKey;
      case 'day': return a.date;
      default: return null;
    }
  }

  function periodLabel(key, granularity) {
    if (!key) return '—';
    const c = cfg();
    if (granularity === 'month') {
      const [y, m] = key.split('-');
      return `${c.monthNamesEs[+m - 1]} ${y}`;
    }
    if (granularity === 'week') {
      const [y, w] = key.split('-W');
      return `Semana ${+w} · ${y}`;
    }
    if (granularity === 'day') {
      const a = getDateAttributes(key);
      return a ? `${c.dayNamesEs[a.dayOfWeekIndex - 1]} ${key}` : key;
    }
    return key;
  }

  FP.calendar = {
    getCalendarDay, isLeapYear,
    parseDate, isValidISODate, toISODate, addDays, daysInMonth,
    getISOWeek, getWeekOfMonth, getWeekInfo, getQuarter, getFortnight,
    getDateAttributes, eachDay, daysOfMonth, daysOfYear, periodKey, periodLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
