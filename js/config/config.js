/**
 * config.js — Configuración central (única fuente de verdad).
 *
 * Todo lo que "describe el negocio" vive aquí: canales, métricas,
 * tolerancias de validación, reglas de calendario, claves de storage.
 * Ningún otro módulo debe declarar listas de canales o métricas propias.
 *
 * Patrón: scripts clásicos + namespace global `FP` (ver ARCHITECTURE.md §1).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach((k) => {
      const v = obj[k];
      if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
    });
    return Object.freeze(obj);
  }

  /** Canales oficiales. `trafficLabel` es lo que ve el usuario para traffic_volume. */
  /**
   * Canales oficiales. `trafficLabel` es lo que ve el usuario para traffic_volume.
   * `aliases` (Fase 1): variantes aceptadas en archivos, ya normalizadas
   * (minúsculas, sin acentos, espacios simples). Todo lo demás es canal no reconocido.
   */
  const CHANNELS = [
    { id: 'ecommerce', label: 'Ecommerce', trafficLabel: 'Sesiones', color: '#0E5E6F', order: 1,
      aliases: ['ecommerce', 'e-commerce', 'e commerce', 'e_commerce', 'ecom', 'web', 'sitio web', 'sitio'] },
    { id: 'app',       label: 'App',       trafficLabel: 'Sesiones', color: '#5B4FC7', order: 2,
      aliases: ['app', 'aplicacion', 'app movil', 'mobile app', 'mobile'] },
    { id: 'whatsapp',  label: 'WhatsApp',  trafficLabel: 'Mensajes / contactos', color: '#2E7D4F', order: 3,
      aliases: ['whatsapp', 'whats app', 'whats', 'wa', 'wsp'] },
    { id: 'llamadas',  label: 'Llamadas',  trafficLabel: 'Llamadas', color: '#A8661B', order: 4,
      aliases: ['llamadas', 'llamada', 'calls', 'call', 'call center', 'callcenter', 'telefono'] }
  ];

  /**
   * Campos canónicos de importación (Fase 1).
   * `synonyms`: encabezados reconocidos (ya normalizados: minúsculas, sin acentos,
   * separadores como "_"). `metric`: si es una de las 5 métricas del modelo.
   */
  const IMPORT_FIELDS = [
    { key: 'date', label: 'Fecha', type: 'date',
      synonyms: ['fecha', 'date', 'dia', 'day'] },
    { key: 'channel', label: 'Canal', type: 'channel',
      synonyms: ['canal', 'channel', 'canal_de_venta'] },
    { key: 'revenue', label: 'Venta', type: 'number', metric: true,
      synonyms: ['venta', 'ventas', 'revenue', 'sales', 'venta_total', 'importe', 'monto',
        'meta_venta', 'meta_ventas', 'plan_revenue', 'plan_venta', 'meta_revenue', 'objetivo_venta', 'actual_revenue'] },
    { key: 'orders', label: 'Pedidos', type: 'number', metric: true,
      synonyms: ['pedidos', 'orders', 'ordenes', 'transacciones', 'transactions',
        'meta_pedidos', 'plan_orders', 'plan_pedidos', 'meta_orders', 'actual_orders'] },
    { key: 'trafficVolume', label: 'Volumen (tráfico / contactos)', type: 'number', metric: true,
      synonyms: ['traffic_volume', 'sesiones', 'sessions', 'traffic', 'trafico', 'mensajes', 'contactos', 'llamadas', 'volumen',
        'meta_traffic_volume', 'plan_traffic_volume', 'meta_sesiones', 'meta_volumen', 'actual_traffic_volume'] },
    { key: 'conversionRate', label: 'CR', type: 'number', metric: true,
      synonyms: ['conversion_rate', 'cr', 'tasa_de_conversion', 'tasa_conversion', 'conversion',
        'meta_conversion_rate', 'plan_conversion_rate', 'meta_cr', 'actual_conversion_rate'] },
    { key: 'aov', label: 'AOV', type: 'number', metric: true,
      synonyms: ['aov', 'ticket_promedio', 'ticket', 'average_order_value',
        'meta_aov', 'plan_aov', 'meta_ticket', 'actual_aov'] },
    { key: 'event', label: 'Evento', type: 'text', synonyms: ['evento', 'event', 'eventos'] },
    { key: 'holiday', label: 'Festivo', type: 'text', synonyms: ['festivo', 'holiday', 'feriado'] },
    { key: 'season', label: 'Temporada', type: 'text', synonyms: ['temporada', 'season'] },
    { key: 'dayType', label: 'Tipo de día', type: 'dayType', synonyms: ['tipo_dia', 'tipo_de_dia', 'day_type', 'daytype'] },
    { key: 'notes', label: 'Observaciones', type: 'text', synonyms: ['observaciones', 'notas', 'notes', 'comentarios'] }
  ];

  /** Tipos de dato cargables y su contrato (Fase 1). */
  const DATA_TYPES = {
    historical: {
      id: 'historical', label: 'Histórico', storageKey: 'historicalData',
      description: 'Venta real de periodos anteriores. Alimentará la estacionalidad.',
      required: ['date', 'channel', 'revenue', 'orders', 'trafficVolume'],
      template: ['fecha', 'canal', 'venta', 'pedidos', 'traffic_volume', 'conversion_rate', 'aov', 'evento', 'festivo', 'temporada', 'tipo_dia']
    },
    plan: {
      id: 'plan', label: 'Plan / Meta', storageKey: 'planData',
      description: 'Lo que se esperaba vender, por día y canal.',
      required: ['date', 'channel', 'revenue'],
      template: ['fecha', 'canal', 'meta_venta', 'meta_pedidos', 'meta_traffic_volume', 'meta_conversion_rate', 'meta_aov']
    },
    actual: {
      id: 'actual', label: 'Venta real / Actual', storageKey: 'actualData',
      description: 'Lo que ocurrió en el periodo en curso.',
      required: ['date', 'channel', 'revenue', 'orders', 'trafficVolume'],
      template: ['fecha', 'canal', 'venta', 'pedidos', 'traffic_volume', 'conversion_rate', 'aov', 'evento', 'festivo', 'temporada', 'observaciones']
    }
  };

  /**
   * Catálogo de errores de calidad (Fase 1). `severity` es la severidad por defecto;
   * algunas reglas la elevan o bajan y lo documentan en ARCHITECTURE.md §10.
   */
  const ERROR_TYPES = {
    INVALID_DATE:               { severity: 'error',   label: 'Fecha inválida' },
    AMBIGUOUS_DATE:             { severity: 'error',   label: 'Fecha ambigua' },
    NON_ISO_DATE:               { severity: 'warning', label: 'Fecha no ISO interpretada' },
    FUTURE_DATE:                { severity: 'warning', label: 'Fecha futura en dato real' },
    MISSING_DATE:               { severity: 'error',   label: 'Falta fecha' },
    INVALID_CHANNEL:            { severity: 'error',   label: 'Canal no reconocido' },
    MISSING_CHANNEL:            { severity: 'error',   label: 'Falta canal' },
    INVALID_REVENUE:            { severity: 'error',   label: 'Venta inválida' },
    INVALID_ORDERS:             { severity: 'error',   label: 'Pedidos inválidos' },
    INVALID_TRAFFIC:            { severity: 'error',   label: 'Volumen inválido' },
    NEGATIVE_REVENUE:           { severity: 'error',   label: 'Venta negativa' },
    NEGATIVE_ORDERS:            { severity: 'error',   label: 'Pedidos negativos' },
    NEGATIVE_TRAFFIC:           { severity: 'error',   label: 'Volumen negativo' },
    INVALID_CONVERSION_RATE:    { severity: 'error',   label: 'CR inválido' },
    INVALID_AOV:                { severity: 'error',   label: 'AOV inválido' },
    MISSING_VALUE:              { severity: 'warning', label: 'Dato faltante' },
    MATHEMATICAL_INCONSISTENCY: { severity: 'warning', label: 'Inconsistencia matemática' },
    DUPLICATE_RECORD:           { severity: 'warning', label: 'Registro duplicado' },
    INVALID_DAY_TYPE:           { severity: 'warning', label: 'Tipo de día no reconocido' },
    MALFORMED_ROW:              { severity: 'warning', label: 'Fila con columnas de más o de menos' },
    MISSING_REQUIRED_COLUMN:    { severity: 'error',   label: 'Falta columna obligatoria' },
    DUPLICATE_MAPPING:          { severity: 'error',   label: 'Dos columnas al mismo campo' }
  };

  /**
   * Métricas. `additive` = se puede sumar entre días/canales.
   * Las no aditivas (CR, AOV) SIEMPRE se recalculan desde las sumas.
   * `csv` = nombre snake_case usado en CSV y exportaciones.
   */
  const METRICS = {
    revenue:        { key: 'revenue',        csv: 'revenue',         label: 'Venta',   kind: 'currency', additive: true,  primary: 'observed' },
    orders:         { key: 'orders',         csv: 'orders',          label: 'Pedidos', kind: 'integer',  additive: true,  primary: 'observed' },
    trafficVolume:  { key: 'trafficVolume',  csv: 'traffic_volume',  label: 'Volumen', kind: 'integer',  additive: true,  primary: 'observed' },
    conversionRate: { key: 'conversionRate', csv: 'conversion_rate', label: 'CR',      kind: 'percent',  additive: false, primary: 'calculated' },
    aov:            { key: 'aov',            csv: 'aov',             label: 'AOV',     kind: 'currency', additive: false, primary: 'calculated' }
  };

  FP.config = deepFreeze({
    app: {
      name: 'Digital Sales Forecast & Pacing',
      subtitle: 'Planeación, pacing y reforecast de ventas digitales',
      version: '0.2.0',
      phase: 1,
      phaseLabel: 'Fase 1 · Datos, carga y validación'
    },

    /** Versión del contrato de datos. Cambiarla exige nota en ARCHITECTURE.md §9. */
    schemaVersion: '1.1.0',

    locale: 'es-MX',
    currency: 'MXN',
    defaultYear: 2026,

    channels: CHANNELS,
    channelIds: CHANNELS.map((c) => c.id),

    metrics: METRICS,
    metricKeys: ['revenue', 'orders', 'trafficVolume', 'conversionRate', 'aov'],
    additiveMetricKeys: ['revenue', 'orders', 'trafficVolume'],
    derivedMetricKeys: ['conversionRate', 'aov'],

    /** Estados del dato. Nunca se mezclan en un mismo bloque. */
    dataStates: ['plan', 'actual', 'forecast'],
    dataStateLabels: { plan: 'Plan', actual: 'Real', forecast: 'Forecast' },

    /** Origen de cada valor: observed = dato real cargado; input = dato capturado/planeado;
     *  model = producido por el motor de forecast; calculated = derivado por identidad. */
    valueSources: ['observed', 'input', 'model', 'calculated'],

    dayTypes: ['regular', 'holiday', 'event', 'campaign', 'special'],
    eventTypes: ['commercial_event', 'campaign', 'holiday', 'operational', 'other'],

    granularities: ['year', 'month', 'week', 'day'],
    granularityLabels: { year: 'Año', month: 'Mes', week: 'Semana', day: 'Día' },

    /**
     * Calendario. La definición de semana se resuelve SOLO en
     * FP.calendar.getWeekInfo(); aquí se parametriza.
     *  - weekDefinition 'iso': semana ISO-8601 (lunes a domingo; W1 contiene el primer jueves).
     *  - weekOfMonthMode 'calendar-days': W1 = días 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–28, W5 = 29+.
     */
    calendar: {
      weekDefinition: 'iso',
      weekOfMonthMode: 'calendar-days',
      fortnightSplitDay: 15,
      dayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      dayNamesEs: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
      monthNamesEs: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
        'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    },

    /**
     * Tolerancias para comparar valores cargados vs calculados.
     * Se acepta la diferencia si cumple relativa O absoluta.
     */
    tolerances: {
      conversionRate: { relative: 0.01,   absolute: 0.00005 },
      aov:            { relative: 0.01,   absolute: 0.5 },
      orders:         { relative: 0.005,  absolute: 0.5 },
      revenue:        { relative: 0.005,  absolute: 1 },
      hierarchy:      { relative: 0.0001, absolute: 1 }
    },

    storage: {
      namespace: 'fp.v1',
      keys: {
        // Fase 0 (por año: '<clave>:<año>')
        dataset: 'dataset', targets: 'targets', versions: 'versions', events: 'events', milestones: 'milestones',
        // Fase 1 (globales: el histórico cruza años)
        historicalData: 'historicalData', planData: 'planData', actualData: 'actualData', settings: 'settings'
      }
    },

    /* ----- Fase 1: carga, normalización y calidad ----- */

    dataTypes: DATA_TYPES,
    dataTypeIds: ['historical', 'plan', 'actual'],
    importFields: IMPORT_FIELDS,
    metricCellSources: ['observed', 'calculated', 'missing', 'invalid'],
    errorTypes: ERROR_TYPES,

    /**
     * Valores por defecto de ajustes de importación (el usuario puede cambiarlos
     * en Carga de datos; se guardan en `settings`).
     */
    import: {
      /** Tolerancia relativa para comparar CR/AOV cargados vs calculados (0.01 = 1 %). */
      DATA_VALIDATION_TOLERANCE: 0.01,
      /** 'auto': solo ISO y fechas no ambiguas; 'DMY' / 'MDY': fuerza el orden en fechas con '/'. */
      dateFormat: 'auto',
      dateFormats: { auto: 'Automático (solo no ambiguas)', DMY: 'DD/MM/AAAA', MDY: 'MM/DD/AAAA' },
      /** 'dot' = 1,234.56 (México/EE.UU.); 'comma' = 1.234,56 */
      numberFormat: 'dot',
      numberFormats: { dot: { label: '1,234.56', decimal: '.', thousands: ',' }, comma: { label: '1.234,56', decimal: ',', thousands: '.' } },
      delimiters: [',', ';', '\t', '|'],
      previewRows: 20,
      pageSize: 50,
      maxFileSizeMB: 15
    },

    exportFiles: {
      forecast: 'forecast_export.json',
      /** Archivo que producirá la app de diagnóstico (solo referencia de integración). */
      analysisCounterpart: 'analysis_export.json'
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
