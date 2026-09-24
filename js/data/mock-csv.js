/**
 * mock-csv.js — Archivos CSV de prueba (Fase 1, solo QA).
 *
 * Pasan por el MISMO pipeline que un archivo real (stage → process → commit),
 * así que sirven para probar la carga de punta a punta sin datos propios.
 * Incluye los 10 casos de calidad pedidos y cuatro archivos grandes generados
 * (histórico 2025, histórico 2026, plan 2026, actual septiembre 2026).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  const lines = (...rows) => rows.join('\n');

  const CASES = [
    {
      id: 'valid', label: 'Caso válido (con formatos variados)', dataType: 'actual', fileName: 'caso_valido.csv',
      expect: 'Todas las filas válidas. Canales y números con formato se normalizan.',
      text: () => lines(
        'Fecha,Canal,Venta,Pedidos,Sesiones',
        '2026-09-21,ecommerce,820000,410,24500',
        '2026-09-21,app,570000,330,18000',
        '2026-09-21,whatsapp,390000,245,3100',
        '2026-09-21,llamadas,250000,155,1750',
        '2026-09-22,E-Commerce,"$815,300.50",402,"24,100"',
        '2026-09-22,APP,"$561,000",325,"17,850"',
        '2026-09-22,WhatsApp,"$388,450",241,"3,080"',
        '2026-09-22,CALLS,"$247,900",153,"1,740"')
    },
    {
      id: 'missing', label: 'Datos faltantes (y cero ≠ faltante)', dataType: 'actual', fileName: 'caso_faltantes.csv',
      expect: 'Celdas vacías como "Dato faltante"; venta 0 se acepta como cero real; falta el 17 y Llamadas el 16.',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume',
        '2026-09-15,ecommerce,801000,,23900',
        '2026-09-15,app,,318,17600',
        '2026-09-15,whatsapp,0,0,2950',
        '2026-09-15,llamadas,241000,150,1720',
        '2026-09-16,ecommerce,640000,330,21000',
        '2026-09-16,app,455000,270,16100',
        '2026-09-16,whatsapp,301000,190,2700',
        '2026-09-18,ecommerce,799000,400,23800',
        '2026-09-18,app,553000,321,17500',
        '2026-09-18,whatsapp,379000,236,3000',
        '2026-09-18,llamadas,238000,148,1700')
    },
    {
      id: 'duplicates', label: 'Duplicados', dataType: 'actual', fileName: 'caso_duplicados.csv',
      expect: 'Ecommerce del 21 aparece dos veces: ambas se conservan con advertencia.',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume',
        '2026-09-21,ecommerce,820000,410,24500',
        '2026-09-21,app,570000,330,18000',
        '2026-09-21,ecommerce,825000,412,24600',
        '2026-09-21,whatsapp,390000,245,3100')
    },
    {
      id: 'channel', label: 'Canal inválido', dataType: 'actual', fileName: 'caso_canal_invalido.csv',
      expect: 'marketplace, tienda, facebook y la fila sin canal se rechazan; el resto entra.',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume',
        '2026-09-20,ecommerce,780000,390,23000',
        '2026-09-20,marketplace,120000,60,4000',
        '2026-09-20,tienda,95000,40,0',
        '2026-09-20,facebook,30000,12,900',
        '2026-09-20,,50000,20,1000')
    },
    {
      id: 'date', label: 'Fechas inválidas y ambiguas', dataType: 'actual', fileName: 'caso_fechas.csv',
      expect: '32/01, 2026-15-20, abc, vacío, 30 de febrero y 03/04 (ambigua) se rechazan; 21/09/2026 se interpreta con aviso.',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume',
        '2026-09-19,app,540000,315,17000',
        '32/01/2026,app,540000,315,17000',
        '2026-15-20,app,540000,315,17000',
        'abc,app,540000,315,17000',
        ',app,540000,315,17000',
        '2026-02-30,app,540000,315,17000',
        '03/04/2026,app,540000,315,17000',
        '21/09/2026,app,540000,315,17000')
    },
    {
      id: 'negative', label: 'Venta negativa', dataType: 'actual', fileName: 'caso_venta_negativa.csv',
      expect: 'Venta -15,000 y (2,500) contable son errores; no se convierten a cero.',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume',
        '2026-09-19,whatsapp,-15000,10,2900',
        '2026-09-19,llamadas,"(2,500)",2,1600',
        '2026-09-19,ecommerce,790000,395,23500')
    },
    {
      id: 'cr', label: 'CR inconsistente', dataType: 'actual', fileName: 'caso_cr_inconsistente.csv',
      expect: 'CR 0.03 no cuadra con 410/24500; "2.5" parece porcentaje sin %; 1.67% sí cuadra.',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume,conversion_rate',
        '2026-09-21,ecommerce,820000,410,24500,0.0167',
        '2026-09-21,app,570000,330,18000,0.03',
        '2026-09-21,whatsapp,390000,245,3100,2.5',
        '2026-09-21,llamadas,250000,155,9281,1.67%')
    },
    {
      id: 'aov', label: 'AOV inconsistente', dataType: 'actual', fileName: 'caso_aov_inconsistente.csv',
      expect: 'AOV 2500 no cuadra con 820000/410 = 2000; se conserva y se advierte.',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume,aov',
        '2026-09-21,ecommerce,820000,410,24500,2500',
        '2026-09-21,app,570000,330,18000,1727.27')
    },
    {
      id: 'zero-orders', label: 'Cero pedidos', dataType: 'actual', fileName: 'caso_cero_pedidos.csv',
      expect: 'Venta con 0 pedidos es error; venta 0 con 0 pedidos es válida y el AOV queda "no calculable".',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume',
        '2026-09-20,llamadas,1200,0,300',
        '2026-09-20,whatsapp,0,0,500')
    },
    {
      id: 'zero-traffic', label: 'Cero tráfico', dataType: 'actual', fileName: 'caso_cero_trafico.csv',
      expect: 'Pedidos con volumen 0 es error; todo en cero es válido y el CR queda "no calculable".',
      text: () => lines(
        'fecha,canal,venta,pedidos,traffic_volume',
        '2026-09-20,app,5000,5,0',
        '2026-09-20,ecommerce,0,0,0')
    },
    {
      id: 'plan-example', label: 'Plan (ejemplo del brief)', dataType: 'plan', fileName: 'plan_ejemplo.csv',
      expect: 'Plan con todas las métricas; CR y AOV cargados se validan contra pedidos y venta.',
      text: () => lines(
        'fecha,canal,meta_venta,meta_pedidos,meta_traffic_volume,meta_conversion_rate,meta_aov',
        '2026-01-02,ecommerce,500000,250,25000,0.01,2000',
        '2026-01-02,app,350000,210,18000,0.0117,1666.67')
    }
  ];

  /* ---------- Archivos grandes generados ---------- */

  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DOW = [1.05, 1.03, 1.0, 0.98, 0.95, 0.85, 0.8];
  const MONTH = [0.9, 0.88, 0.95, 0.97, 1.08, 1.0, 0.97, 0.98, 0.96, 1.0, 1.12, 1.2];
  const HOLIDAYS = { '01-01': 'Año Nuevo', '05-01': 'Día del Trabajo', '09-16': 'Día de la Independencia', '12-25': 'Navidad' };
  const EVENTS = {
    2024: [['Hot Sale', '2024-05-13', '2024-05-21', 1.35], ['Buen Fin', '2024-11-15', '2024-11-18', 1.5]],
    2025: [['Hot Sale', '2025-05-26', '2025-06-03', 1.35], ['Buen Fin', '2025-11-14', '2025-11-17', 1.5]],
    2026: [['Hot Sale', '2026-05-25', '2026-06-02', 1.35]]
  };

  function dayInfo(date) {
    const a = FP.calendar.getDateAttributes(date);
    const holiday = HOLIDAYS[date.slice(5)] || '';
    const ev = (EVENTS[a.year] || []).find(([, s, e]) => date >= s && date <= e);
    // Efecto de quincena en el generador (pagos días 15-16 y últimos 2 días del mes) para que el
    // motor de estacionalidad tenga algo real que detectar.
    const dom = +date.slice(8, 10);
    const payday = dom === 15 || dom === 16 || dom >= FP.calendar.daysInMonth(a.year, a.month) - 1 ? 1.12 : 1;
    return { a, holiday, event: ev ? ev[0] : '', uplift: (ev ? ev[3] : holiday ? 0.7 : 1) * payday };
  }

  const r2 = (n) => Math.round(n * 100) / 100;

  /** Histórico / actual: venta real con ruido. `gaps`: {canal: n días a omitir}. */
  function generateActualRows(start, end, { seed, growth = 1, gaps = {} }) {
    const rnd = seeded(seed);
    const P = FP.mock.PROFILES;
    const days = FP.calendar.eachDay(start, end);
    const skip = {};
    Object.entries(gaps).forEach(([ch, n]) => {
      skip[ch] = new Set();
      while (skip[ch].size < n) skip[ch].add(days[Math.floor(rnd() * days.length)]);
    });
    const rows = [];
    days.forEach((date) => {
      const { a, holiday, event, uplift } = dayInfo(date);
      FP.config.channelIds.forEach((ch) => {
        if (skip[ch] && skip[ch].has(date)) return;
        const p = P[ch];
        const j = (s) => 1 + (rnd() * 2 - 1) * s;
        const traffic = Math.round(p.traffic * growth * DOW[a.dayOfWeekIndex - 1] * MONTH[a.month - 1] * uplift * j(0.08));
        const orders = Math.round(traffic * p.cr * j(0.07) * (event ? 1.1 : 1));
        rows.push({ fecha: date, canal: ch, venta: r2(orders * p.aov * j(0.05)), pedidos: orders, traffic_volume: traffic,
          evento: event, festivo: holiday, temporada: a.month >= 11 ? 'Fin de año' : '' });
      });
    });
    return rows;
  }

  function generatePlanRows(year) {
    const P = FP.mock.PROFILES;
    const rows = [];
    FP.calendar.daysOfYear(year).forEach((date) => {
      const { a, uplift } = dayInfo(date);
      FP.config.channelIds.forEach((ch) => {
        const p = P[ch];
        const traffic = Math.round(p.traffic * DOW[a.dayOfWeekIndex - 1] * MONTH[a.month - 1] * uplift);
        const orders = Math.round(traffic * p.cr);
        const revenue = r2(orders * p.aov);
        rows.push({ fecha: date, canal: ch, meta_venta: revenue, meta_pedidos: orders, meta_traffic_volume: traffic,
          meta_conversion_rate: FP.metrics.safeDivide(orders, traffic) === null ? '' : +(orders / traffic).toFixed(5),
          meta_aov: orders ? r2(revenue / orders) : '' });
      });
    });
    return rows;
  }

  const HIST_HEADERS = ['fecha', 'canal', 'venta', 'pedidos', 'traffic_volume', 'evento', 'festivo', 'temporada'];

  const GENERATED = [
    { id: 'gen-hist-2024', label: 'Histórico 2024 (año bisiesto completo)', dataType: 'historical', fileName: 'historico_2024.csv',
      expect: '1,464 filas (366 días × 4 canales). Da un segundo año completo a la estacionalidad.',
      text: () => FP.csv.stringify(HIST_HEADERS, generateActualRows('2024-01-01', '2024-12-31', { seed: 2024, growth: 0.8 })) },
    { id: 'gen-hist-2025', label: 'Histórico 2025 (año completo, con huecos)', dataType: 'historical', fileName: 'historico_2025.csv',
      expect: '~1,440 filas. WhatsApp y Llamadas tienen días faltantes para ver la cobertura.',
      text: () => FP.csv.stringify(HIST_HEADERS, generateActualRows('2025-01-01', '2025-12-31', { seed: 2025, growth: 0.88, gaps: { whatsapp: 9, llamadas: 14 } })) },
    { id: 'gen-hist-2026', label: 'Histórico 2026 (enero a agosto)', dataType: 'historical', fileName: 'historico_2026_ene_ago.csv',
      expect: '~970 filas, cobertura completa.',
      text: () => FP.csv.stringify(HIST_HEADERS, generateActualRows('2026-01-01', '2026-08-31', { seed: 2126 })) },
    { id: 'gen-plan-2026', label: 'Plan 2026 (diario, cuatro canales)', dataType: 'plan', fileName: 'plan_2026.csv',
      expect: '1,460 filas con meta de venta, pedidos, volumen, CR y AOV.',
      text: () => FP.csv.stringify(FP.config.dataTypes.plan.template, generatePlanRows(2026)) },
    { id: 'gen-actual-sep', label: 'Actual septiembre 2026 (1 al 22)', dataType: 'actual', fileName: 'actual_septiembre_2026.csv',
      expect: '88 filas de venta real del mes en curso.',
      text: () => FP.csv.stringify(HIST_HEADERS, generateActualRows('2026-09-01', '2026-09-22', { seed: 926 })) }
  ];

  const ALL = [...GENERATED, ...CASES];
  const get = (id) => ALL.find((f) => f.id === id) || null;

  FP.mockCsv = { CASES, GENERATED, ALL, get };
})(typeof window !== 'undefined' ? window : globalThis);
