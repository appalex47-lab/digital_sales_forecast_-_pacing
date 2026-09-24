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
    { key: 'notes', label: 'Observaciones', type: 'text', synonyms: ['observaciones', 'notas', 'notes', 'comentarios'] },
    // Fase 5: segmentos (formato largo: una fila por fecha, canal, dimensión y segmento)
    { key: 'dimension', label: 'Dimensión', type: 'text', synonyms: ['dimension', 'dimension_name', 'dimensiones', 'eje'] },
    { key: 'segment', label: 'Segmento', type: 'text', synonyms: ['segmento', 'segment', 'segment_value', 'valor_dimension'] },
    { key: 'customers', label: 'Clientes', type: 'number', extra: true, synonyms: ['clientes', 'customers', 'pacientes', 'usuarios_compradores'] },
    { key: 'newCustomers', label: 'Clientes nuevos', type: 'number', extra: true, synonyms: ['clientes_nuevos', 'new_customers', 'nuevos'] },
    { key: 'returningCustomers', label: 'Clientes recurrentes', type: 'number', extra: true, synonyms: ['clientes_recurrentes', 'returning_customers', 'recurrentes'] },
    { key: 'items', label: 'Artículos', type: 'number', extra: true, synonyms: ['items', 'articulos', 'piezas', 'unidades', 'productos_vendidos'] }
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
    },
    segments: {
      id: 'segments', label: 'Segmentos (opcional)', storageKey: 'segmentsData',
      description: 'Desglose de la venta real por dimensión (dispositivo, fuente, tipo de cliente, categoría…). Alimenta el Nivel 2 del diagnóstico.',
      required: ['date', 'channel', 'dimension', 'segment'],
      template: ['fecha', 'canal', 'dimension', 'segmento', 'venta', 'pedidos', 'traffic_volume', 'clientes', 'clientes_nuevos', 'clientes_recurrentes', 'items']
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
    INVALID_NUMBER:             { severity: 'warning', label: 'Número inválido' },
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
      version: '0.7.0',
      phase: 6,
      phaseLabel: 'Fase 6 · Escenarios y plan de acción'
    },

    /** Versión del contrato de datos. Cambiarla exige nota en ARCHITECTURE.md §9. */
    schemaVersion: '1.6.0',

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
      hierarchy:      { relative: 0.0001, absolute: 1 },
      /** Fase 2: tolerancia técnica para comparar flotantes (isApproximatelyEqual). No es tolerancia de negocio. */
      technical:      { relative: 1e-9,   absolute: 0.005 }
    },

    storage: {
      namespace: 'fp.v1',
      keys: {
        // Fase 0 (por año: '<clave>:<año>')
        dataset: 'dataset', targets: 'targets', versions: 'versions', events: 'events', milestones: 'milestones',
        // Fase 1 (globales: el histórico cruza años)
        historicalData: 'historicalData', planData: 'planData', actualData: 'actualData', settings: 'settings',
        segmentsData: 'segmentsData',
        // Fase 2
        planningSettings: 'planningSettings', plans: 'plans', // plans:<año>
        // Fase 3
        forecastSettings: 'forecastSettings', forecasts: 'forecasts', // forecasts:<año>
        // Fase 4
        reforecastSettings: 'reforecastSettings', reforecasts: 'reforecasts', // reforecasts:<año>
        // Fase 5
        diagnosticSettings: 'diagnosticSettings', cohereApiKey: 'cohereApiKey',
        // Fase 6 (scenarios y actionPlan por año)
        recoverySettings: 'recoverySettings', scenarios: 'scenarios', actionPlan: 'actionPlan', actionLibraryCustom: 'actionLibraryCustom'
      }
    },

    /* ----- Fase 2: motor de planeación y estacionalidad ----- */

    /**
     * Todos los parámetros del motor de planeación viven aquí (defaults).
     * El usuario los cambia en "Configuración de planeación" y se guardan en
     * `planningSettings`; cada plan generado copia los valores usados en su auditoría.
     */
    planning: {
      algorithmVersion: 'planning-v1',
      /** Periodo histórico: 'before_target' = todo el histórico anterior al año planeado; 'all'; 'custom' (from/to). */
      historicalPeriod: { mode: 'before_target', from: null, to: null },
      /** Métodos de distribución comparables. El aplicado se elige en configuración; nunca se elige solo. */
      methods: {
        A: { label: 'Uniforme', description: 'Mismo peso para todos los días del año.', components: [] },
        B: { label: 'Histórico mensual', description: 'Peso mensual histórico; días iguales dentro del mes.', components: ['monthly'] },
        C: { label: 'Histórico mensual + día de semana', description: 'Mensual histórico y factor por día de la semana.', components: ['monthly', 'dayOfWeek'] },
        D: { label: 'Histórico + calendario + eventos', description: 'Mensual, día de semana, día del mes, festivos, eventos y temporadas.', components: ['monthly', 'dayOfWeek', 'calendar', 'events', 'season'] }
      },
      method: 'D',
      /** Usar el plan diario importado (planData) como meta explícita que no se toca. */
      useExplicitPlan: true,
      /**
       * Intensidad de cada componente (0 a 1). 1 = factor histórico completo; 0 = sin efecto.
       * Se aplica como exponente sobre el factor (f^α) y, en el mensual, como mezcla con la distribución por días.
       */
      componentWeights: { monthly: 1, dayOfWeek: 1, calendar: 1, events: 1, season: 1 },
      /** Suavizado: 'winsorized_mean' | 'trimmed_mean' | 'median' | 'none'. */
      smoothing: 'winsorized_mean',
      /** Valores a más de k desviaciones robustas (MAD × 1.4826) de la mediana son extremos. */
      outlierMadK: 3,
      trimShare: 0.1,
      /** Mínimo de observaciones para usar un grupo (evento, temporada, día del mes). */
      minSamples: 3,
      /** Encogimiento hacia 1: f = 1 + (f_raw − 1) × n / (n + k). Evita factores extremos con pocos datos. */
      shrinkageK: 6,
      /** Día del mes: solo se aplica si |f − 1| supera z errores estándar (evidencia). */
      calendarEvidenceZ: 2,
      /** …y además el efecto debe ser de al menos este tamaño (1 %). */
      calendarMinEffect: 0.01,
      /** Límites de factor para eventos y temporadas. */
      eventFactorBounds: [0.25, 4],
      /** Un mes cuenta para el peso mensual si tiene al menos esta fracción de días con dato. */
      monthMinCoverage: 0.8,
      /** Suficiencia de datos por años completos de histórico. */
      yearThresholds: { excellent: 3, sufficient: 2, limited: 1 },
      /** Confianza por número de observaciones (día de semana, día del mes). */
      sampleThresholds: {
        dayOfWeek: { excellent: 104, sufficient: 52, limited: 8 },
        calendar:  { excellent: 36,  sufficient: 24, limited: 12 }
      },
      /** Confianza de eventos por ocurrencias (años distintos). */
      eventYearThresholds: { excellent: 3, sufficient: 2, limited: 1 },
      /** Supuestos manuales de CR y AOV por canal (se usan solo si no hay histórico). null = sin supuesto. */
      assumptions: {
        ecommerce: { conversionRate: null, aov: null },
        app:       { conversionRate: null, aov: null },
        whatsapp:  { conversionRate: null, aov: null },
        llamadas:  { conversionRate: null, aov: null }
      },
      /** Dinero se distribuye en centavos exactos; pedidos y volumen en unidades enteras. */
      moneyDecimals: 2
    },

    /* ----- Fase 3: pacing y forecast ----- */
    forecast: {
      algorithmVersion: 'forecast-v1',
      /** Fecha de referencia. null = fecha del dispositivo. Fijarla permite reproducir análisis. */
      referenceDate: null,
      /** Día de referencia: 'completed' (su venta real es final) o 'in_progress' (carga parcial). */
      todayStatus: 'completed',
      /** Método mostrado por defecto. 'A' es el baseline neutral; la app no elige "mejor" método. */
      method: 'A',
      methods: {
        A: { label: 'Plan restante', description: 'Actual acumulado + plan restante (baseline).' },
        B: { label: 'Performance acumulada', description: 'Actual acumulado + plan futuro × índice acumulado del año.' },
        C: { label: 'Performance reciente', description: 'Actual acumulado + plan futuro × índice de la ventana reciente.' },
        D: { label: 'Por drivers', description: 'Volumen × CR × AOV futuros, cada driver con su índice; pedidos y venta se derivan.' }
      },
      /** Ventanas de performance. `days` null = acumulado del año o mes en curso. */
      windows: {
        ytd:    { label: 'Acumulado del año', days: null },
        month:  { label: 'Mes en curso', days: null },
        last7:  { label: 'Últimos 7 días', days: 7 },
        last14: { label: 'Últimos 14 días', days: 14 },
        last28: { label: 'Últimos 28 días', days: 28 }
      },
      /** Ventana del método C. */
      recentWindow: 'last28',
      /** Ventana de cada driver en el método D. */
      driverWindows: { trafficVolume: 'last28', conversionRate: 'ytd', aov: 'ytd' },
      /** Un índice exige al menos esta fracción de días comparables en su ventana y este mínimo de días. */
      minWindowCoverage: 0.7,
      minComparableDays: 5,
      /** Completar días sin actualData con historicalData del mismo año (ambos son venta real). */
      useHistoricalAsActual: true,
      /** Estado de pacing por cumplimiento: ≥ aboveFrom arriba; ≥ onPlanFrom en plan; menor, debajo. */
      pacingThresholds: { aboveFrom: 1.01, onPlanFrom: 0.99 },
      /** Alertas descriptivas. */
      alerts: { streakDays: 5, recentVsCumulative: 0.05, forecastGapPct: 0.03 }
    },
    /* ----- Fase 4: reforecast y recuperación ----- */
    reforecast: {
      algorithmVersion: 'reforecast-v1',
      /** Único método en esta fase: el pendiente se reparte con los pesos futuros del plan (Fase 2). */
      method: 'future_weighted_distribution',
      /**
       * Periodo sobre el que se redistribuye el pendiente:
       *  'year'  → meta anual − actual YTD, repartido en todos los días futuros del año (cierra la meta anual).
       *  'month' → meta del mes en curso − actual del mes, repartido en sus días futuros; meses futuros = plan.
       */
      horizon: 'year',
      horizons: { year: 'Año (meta anual)', month: 'Mes en curso (meta mensual)' },
      /** Fuente de AOV y CR para convertir venta requerida en pedidos y volumen. */
      assumptionSource: 'plan',
      assumptionSources: { plan: 'Plan original del día', forecast: 'Forecast del día (método en uso)', actual_ytd: 'Real acumulado del año' },
      /** Si no hay pesos futuros utilizables (suma 0 o sin plan): reparto uniforme, confianza limitada. */
      fallback: 'uniform_future_distribution',
      /**
       * Días con peso futuro 0 no reciben requerimiento. Con un valor > 0, reciben este múltiplo
       * del peso promedio de los días con peso (mínimo explícito del usuario).
       */
      zeroWeightFloor: 0,
      /** Confianza por días con real dentro del horizonte y días futuros restantes. */
      actualDaysThresholds: { excellent: 90, sufficient: 28, limited: 1 },
      futureDaysThresholds: { excellent: 28, sufficient: 7, limited: 1 }
    },

    /* ----- Fase 5: diagnóstico de drivers ----- */
    diagnostics: {
      algorithmVersion: 'diagnostic-v1',
      /** 'sequential' (volumen → CR → AOV) o 'shapley' (simétrico: promedio de todos los órdenes). */
      attributionMethod: 'sequential',
      attributionMethods: { sequential: 'Secuencial (volumen → CR → AOV)', shapley: 'Shapley (simétrico)' },
      attributionOrder: ['trafficVolume', 'conversionRate', 'aov'],
      comparisons: {
        actual_vs_plan:         { label: 'Actual vs Plan', current: 'Actual', baseline: 'Plan' },
        forecast_vs_plan:       { label: 'Forecast vs Plan', current: 'Forecast', baseline: 'Plan' },
        actual_vs_previous:     { label: 'Actual vs periodo anterior', current: 'Actual', baseline: 'Periodo anterior' },
        actual_vs_yoy:          { label: 'Actual vs año anterior', current: 'Actual', baseline: 'Año anterior' },
        reforecast_vs_forecast: { label: 'Reforecast requerido vs Forecast', current: 'Requerido', baseline: 'Forecast' }
      },
      signals: {
        minDeltaPct: 0.03,       // cambio mínimo para ser señal
        minExposure: 0.02,       // peso mínimo del segmento en la base
        minMixPp: 0.03,          // cambio mínimo de participación (puntos)
        anomalyMadK: 3.5,        // extremos diarios: mediana ± k × MAD × 1.4826
        anomalyRatio: 3,         // o ratio actual/base ≥ 3 o ≤ 1/3
        priority: { high: 0.15, medium: 0.05 },
        maxSignals: 40
      },
      minObservations: 7,        // días mínimos para confianza suficiente
      cohere: {
        endpoint: 'https://api.cohere.com/v2/chat',
        model: 'command-a-03-2025',
        timeoutMs: 45000,
        maxHypotheses: 6,
        temperature: 0.2
      },
      /** Dimensiones conocidas y los drivers que ayudan a explicar. Las no listadas se aceptan igual. */
      dimensions: {
        channel:       { label: 'Canal', drivers: ['trafficVolume', 'conversionRate', 'aov'], builtin: true },
        dayType:       { label: 'Tipo de día / evento', drivers: ['trafficVolume', 'conversionRate', 'aov'], builtin: true },
        dayOfWeek:     { label: 'Día de la semana', drivers: ['trafficVolume', 'conversionRate', 'aov'], builtin: true },
        week:          { label: 'Semana ISO', drivers: ['trafficVolume', 'conversionRate', 'aov'], builtin: true },
        device:        { label: 'Dispositivo', drivers: ['trafficVolume', 'conversionRate', 'aov'], aliases: ['dispositivo', 'device', 'plataforma'] },
        source:        { label: 'Fuente', drivers: ['trafficVolume', 'conversionRate'], aliases: ['fuente', 'source', 'origen', 'source_medium'] },
        medium:        { label: 'Medio', drivers: ['trafficVolume', 'conversionRate'], aliases: ['medio', 'medium'] },
        campaign:      { label: 'Campaña', drivers: ['trafficVolume', 'conversionRate'], aliases: ['campana', 'campaign', 'campaña'] },
        landing:       { label: 'Landing', drivers: ['trafficVolume', 'conversionRate'], aliases: ['landing', 'landing_page', 'pagina_de_entrada'] },
        geography:     { label: 'Geografía', drivers: ['trafficVolume', 'conversionRate', 'aov'], aliases: ['geografia', 'region', 'estado', 'ciudad', 'geography'] },
        customer_type: { label: 'Tipo de cliente', drivers: ['trafficVolume', 'conversionRate', 'aov'], aliases: ['tipo_cliente', 'tipo_de_cliente', 'customer_type', 'cliente', 'new_returning'] },
        category:      { label: 'Categoría', drivers: ['conversionRate', 'aov'], aliases: ['categoria', 'category'] },
        product:       { label: 'Producto', drivers: ['conversionRate', 'aov'], aliases: ['producto', 'product', 'sku'] },
        search:        { label: 'Búsqueda', drivers: ['conversionRate'], aliases: ['busqueda', 'search'] },
        checkout:      { label: 'Checkout', drivers: ['conversionRate'], aliases: ['checkout', 'etapa_checkout'] },
        payment:       { label: 'Método de pago', drivers: ['conversionRate'], aliases: ['pago', 'metodo_pago', 'payment'] },
        delivery:      { label: 'Entrega', drivers: ['conversionRate'], aliases: ['entrega', 'delivery', 'envio'] },
        discount:      { label: 'Descuento', drivers: ['aov'], aliases: ['descuento', 'discount', 'promocion'] }
      },
      customerTypeAliases: { new: ['new', 'nuevo', 'nuevos', 'nueva', 'primera_compra'], returning: ['returning', 'recurrente', 'recurrentes', 'existente', 'repetido'] }
    },

    /* ----- Fase 6: escenarios, recuperación y plan de acción ----- */
    recovery: {
      algorithmVersion: 'recovery-v1',
      /** Drivers primarios simulables. Pedidos y venta siempre se derivan. */
      drivers: {
        trafficVolume: { label: 'Volumen', unit: '%' },
        conversionRate: { label: 'CR', unit: 'pp' },
        aov: { label: 'AOV', unit: '%' }
      },
      /** Objetivos de recuperación del gap para el cálculo inverso. */
      recoveryTargets: [0.1, 0.25, 0.5, 0.75, 1],
      /** Tipos de escenario (etiquetas; no son predicciones). */
      scenarioTypes: { base: 'Base', conservative: 'Conservador', moderate: 'Intermedio', aggressive: 'Agresivo', custom: 'Personalizado' },
      /** Restricciones opcionales (null = sin restricción). */
      constraints: { maxTrafficIncrease: null, maxCRIncrease: null, maxAOVIncrease: null, budget: null,
        operationalCapacity: null, inventoryConstraint: null, dateConstraint: null },
      /** Días de datos de segmentos usados para estimar la exposición de un segmento. */
      segmentShareDays: 28,
      /** Consistencia observado vs escenario: realización = (observado − base) ÷ (escenario − base). */
      consistency: { consistent: 0.8, partial: 0.2 },
      /** Prioridad operativa descriptiva (sin "mejor acción"). */
      priority: { impactHigh: 0.25, impactMedium: 0.1, urgentDays: 14, soonDays: 45 },
      actionStatuses: {
        proposed: 'Propuesta', approved: 'Aprobada', in_progress: 'En curso', completed: 'Terminada',
        measuring: 'En medición', validated: 'Validada', rejected: 'Rechazada', cancelled: 'Cancelada'
      },
      /**
       * Catálogo de acciones POSIBLES (no recomendaciones). Editable: el usuario agrega las suyas.
       * requiredData: dimensiones o métricas que deben existir para que la acción aplique.
       */
      actionLibrary: [
        { actionId: 'cr_checkout_review', name: 'Revisión del checkout', driver: 'conversionRate', description: 'Revisar pasos, errores y abandono del checkout.', applicableChannels: ['ecommerce', 'app'], applicableSignals: ['conversionRate'], requiredData: [], ownerArea: 'Producto / UX', measurementMetric: 'conversionRate', defaultWindowDays: 14 },
        { actionId: 'cr_payment_errors', name: 'Revisión de errores de pago', driver: 'conversionRate', description: 'Validar rechazos y errores por método de pago.', applicableChannels: ['ecommerce', 'app'], applicableSignals: ['conversionRate'], requiredData: [], ownerArea: 'Pagos / Operaciones', measurementMetric: 'conversionRate', defaultWindowDays: 14 },
        { actionId: 'cr_pdp', name: 'Mejora de PDP', driver: 'conversionRate', description: 'Contenido, disponibilidad y precio visibles en la ficha de producto.', applicableChannels: ['ecommerce', 'app'], applicableSignals: ['conversionRate'], requiredData: [], ownerArea: 'Catálogo / Contenido', measurementMetric: 'conversionRate', defaultWindowDays: 21 },
        { actionId: 'cr_search', name: 'Mejora de búsqueda', driver: 'conversionRate', description: 'Resultados sin coincidencias, orden y sinónimos del buscador.', applicableChannels: ['ecommerce', 'app'], applicableSignals: ['conversionRate'], requiredData: [], ownerArea: 'Producto', measurementMetric: 'conversionRate', defaultWindowDays: 21 },
        { actionId: 'cr_landing', name: 'Optimización de landing', driver: 'conversionRate', description: 'Revisar páginas de entrada con más tráfico y menor conversión.', applicableChannels: ['ecommerce'], applicableSignals: ['conversionRate'], requiredData: [], ownerArea: 'Ecommerce', measurementMetric: 'conversionRate', defaultWindowDays: 14 },
        { actionId: 'cr_ux_tests', name: 'Pruebas UX', driver: 'conversionRate', description: 'Pruebas con usuarios o grabaciones de sesión en el flujo afectado.', applicableChannels: ['ecommerce', 'app'], applicableSignals: ['conversionRate'], requiredData: [], ownerArea: 'Producto / UX', measurementMetric: 'conversionRate', defaultWindowDays: 28 },
        { actionId: 'cr_contact_script', name: 'Revisión de guion y tiempos de atención', driver: 'conversionRate', description: 'Tiempos de respuesta y cierre en WhatsApp y llamadas.', applicableChannels: ['whatsapp', 'llamadas'], applicableSignals: ['conversionRate'], requiredData: [], ownerArea: 'Contact center', measurementMetric: 'conversionRate', defaultWindowDays: 14 },
        { actionId: 'tr_recovery', name: 'Recuperación de tráfico', driver: 'trafficVolume', description: 'Localizar fuentes o dispositivos con caída de volumen.', applicableChannels: ['ecommerce', 'app'], applicableSignals: ['trafficVolume'], requiredData: [], ownerArea: 'Ecommerce', measurementMetric: 'trafficVolume', defaultWindowDays: 14 },
        { actionId: 'tr_seo', name: 'SEO de fichas y categorías', driver: 'trafficVolume', description: 'Contenido y posicionamiento de fichas con demanda.', applicableChannels: ['ecommerce'], applicableSignals: ['trafficVolume'], requiredData: [], ownerArea: 'Contenido / SEO', measurementMetric: 'trafficVolume', defaultWindowDays: 45 },
        { actionId: 'tr_campaigns', name: 'Campañas', driver: 'trafficVolume', description: 'Campañas para el segmento o canal con caída de volumen.', applicableChannels: ['ecommerce', 'app', 'whatsapp', 'llamadas'], applicableSignals: ['trafficVolume'], requiredData: [], ownerArea: 'Marketing', measurementMetric: 'trafficVolume', defaultWindowDays: 14 },
        { actionId: 'tr_push_email', name: 'Push y email', driver: 'trafficVolume', description: 'Comunicación a base propia para generar visitas o contactos.', applicableChannels: ['ecommerce', 'app', 'whatsapp'], applicableSignals: ['trafficVolume'], requiredData: [], ownerArea: 'CRM', measurementMetric: 'trafficVolume', defaultWindowDays: 7 },
        { actionId: 'tr_reactivation', name: 'Reactivación de clientes', driver: 'trafficVolume', description: 'Contactar clientes inactivos.', applicableChannels: ['ecommerce', 'app', 'whatsapp', 'llamadas'], applicableSignals: ['trafficVolume', 'customers'], requiredData: [], ownerArea: 'CRM', measurementMetric: 'trafficVolume', defaultWindowDays: 21 },
        { actionId: 'aov_bundles', name: 'Bundles', driver: 'aov', description: 'Paquetes de productos complementarios.', applicableChannels: ['ecommerce', 'app'], applicableSignals: ['aov'], requiredData: [], ownerArea: 'Comercial', measurementMetric: 'aov', defaultWindowDays: 21 },
        { actionId: 'aov_cross_sell', name: 'Cross-sell y recomendaciones', driver: 'aov', description: 'Sugerencias en carrito, ficha o por el asesor.', applicableChannels: ['ecommerce', 'app', 'whatsapp', 'llamadas'], applicableSignals: ['aov'], requiredData: [], ownerArea: 'Comercial / Producto', measurementMetric: 'aov', defaultWindowDays: 21 },
        { actionId: 'aov_upsell', name: 'Upsell (presentaciones mayores)', driver: 'aov', description: 'Ofrecer presentaciones o tratamientos completos.', applicableChannels: ['ecommerce', 'app', 'whatsapp', 'llamadas'], applicableSignals: ['aov'], requiredData: [], ownerArea: 'Comercial', measurementMetric: 'aov', defaultWindowDays: 21 },
        { actionId: 'aov_mix', name: 'Revisión de mix', driver: 'aov', description: 'Participación de categorías de mayor ticket.', applicableChannels: ['ecommerce', 'app', 'whatsapp', 'llamadas'], applicableSignals: ['aov'], requiredData: ['category'], ownerArea: 'Comercial', measurementMetric: 'aov', defaultWindowDays: 28 },
        { actionId: 'aov_promotions', name: 'Revisión de promociones y umbral de envío', driver: 'aov', description: 'Umbrales de envío gratis y mecánicas por monto.', applicableChannels: ['ecommerce', 'app'], applicableSignals: ['aov'], requiredData: [], ownerArea: 'Comercial', measurementMetric: 'aov', defaultWindowDays: 21 },
        { actionId: 'rec_refill', name: 'Recordatorio de recompra (refill)', driver: 'trafficVolume', description: 'Recordatorios por ciclo de consumo en tratamientos crónicos.', applicableChannels: ['ecommerce', 'app', 'whatsapp', 'llamadas'], applicableSignals: ['trafficVolume', 'returningCustomers'], requiredData: ['customer_type'], ownerArea: 'CRM', measurementMetric: 'trafficVolume', defaultWindowDays: 30 },
        { actionId: 'rec_post_purchase', name: 'Comunicación post-compra', driver: 'conversionRate', description: 'Seguimiento después de la compra para recurrentes.', applicableChannels: ['ecommerce', 'app', 'whatsapp'], applicableSignals: ['conversionRate', 'returningCustomers'], requiredData: ['customer_type'], ownerArea: 'CRM', measurementMetric: 'conversionRate', defaultWindowDays: 30 }
      ]
    },

    pacingStatusLabels: { above: 'Arriba del plan', on_plan: 'En plan', below: 'Debajo del plan', insufficient_data: 'Datos insuficientes' },

    confidenceLevels: ['excellent', 'sufficient', 'limited', 'insufficient'],
    confidenceLabels: { excellent: 'Excelente', sufficient: 'Suficiente', limited: 'Limitada', insufficient: 'Insuficiente' },
    planValueSources: ['explicit_plan', 'user_target', 'historical_average', 'historical_seasonality', 'calculated', 'user_assumption', 'fallback', 'insufficient_data'],

    /* ----- Fase 1: carga, normalización y calidad ----- */

    dataTypes: DATA_TYPES,
    dataTypeIds: ['historical', 'plan', 'actual', 'segments'],
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
