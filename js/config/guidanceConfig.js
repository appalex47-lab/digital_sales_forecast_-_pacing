/**
 * guidanceConfig.js — Contenidos de la capa de guía (Fase 7).
 *
 * Solo texto y estructura: grupos de navegación, metadatos de cada vista, entradas de ayuda
 * y glosario, convenciones de estados, explicadores por vista, recorrido guiado y criterios de
 * detalle para los modos Ejecutivo / Analista. No contiene lógica de negocio ni cálculos.
 *
 * Entrada de ayuda: { id, title, shortDescription, detailedDescription, howToRead, formula,
 *                     interpretation, caveats, nextStep, state? }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  /* ---------- Navegación agrupada ---------- */

  const GROUPS = [
    { id: 'inicio', label: 'Inicio', views: ['inicio'] },
    { id: 'planear', label: 'Planear', verb: 'Planea',
      description: 'Prepara datos, metas, estacionalidad y el plan distribuido.',
      views: ['carga', 'calidad', 'datos', 'resumen', 'estacionalidad', 'plan', 'configuracion'] },
    { id: 'monitorear', label: 'Monitorear', verb: 'Compara y proyecta',
      description: 'Plan contra actual, gap, cumplimiento, forecast y alertas.', views: ['pacing'] },
    { id: 'diagnosticar', label: 'Diagnosticar', verb: 'Diagnostica',
      description: 'Qué driver explica la brecha, dónde ocurre y qué hipótesis investigar.', views: ['diagnostico'] },
    { id: 'recuperar', label: 'Recuperar', verb: 'Simula y actúa',
      description: 'Reforecast, escenarios y plan de acción.', views: ['reforecast', 'recovery'] },
    { id: 'medir', label: 'Medir y aprender', verb: 'Mide',
      description: 'Seguimiento, baseline vs escenario vs observado, trazabilidad y aprendizajes.', views: ['medir'] }
  ];

  /** Metadatos de vista: título, grupo, propósito, entradas de ayuda relacionadas y requisitos. */
  const VIEWS = {
    inicio: { title: 'Inicio', group: 'inicio', purpose: 'Centro de control: qué está pasando, contra qué se compara y qué sigue.',
      help: ['plan', 'actual', 'forecast', 'gap', 'forecastGap', 'recoveryPressure'] },
    carga: { title: 'Carga de datos', group: 'planear', purpose: 'Importar histórico, plan, venta real y segmentos. Nada se guarda sin revisión.',
      help: ['historico', 'actual', 'plan', 'segmentos'] },
    calidad: { title: 'Calidad de datos', group: 'planear', purpose: 'Qué tan completos y confiables son los datos cargados.',
      help: ['dataQuality', 'cobertura'] },
    datos: { title: 'Datos normalizados', group: 'planear', purpose: 'El modelo canónico con el origen de cada métrica (cargada, calculada, faltante, inválida).',
      help: ['observado', 'calculado'] },
    resumen: { title: 'Metas y motor', group: 'planear', purpose: 'Meta anual por canal, validación de identidades y pruebas del motor.',
      help: ['meta', 'plan', 'revenue'] },
    estacionalidad: { title: 'Estacionalidad', group: 'planear', purpose: 'Patrones históricos por mes, día de la semana, día del mes y eventos.',
      help: ['estacionalidad', 'confianza'] },
    plan: { title: 'Plan', group: 'planear', purpose: 'La meta repartida en meses, semanas y días, con cierre exacto.',
      help: ['meta', 'plan', 'planOriginal'] },
    configuracion: { title: 'Configuración de planeación', group: 'planear', purpose: 'Método, periodo histórico, suavizado y comparación de métodos.',
      help: ['estacionalidad', 'confianza'] },
    pacing: { title: 'Pacing & Forecast', group: 'monitorear', purpose: 'Cómo vamos contra el plan y dónde terminaríamos.',
      help: ['pacing', 'gap', 'cumplimiento', 'forecast', 'forecastGap', 'performanceIndex'] },
    diagnostico: { title: '¿Por qué? Diagnóstico', group: 'diagnosticar', purpose: 'Qué variable matemática explica la brecha, dónde ocurre y qué investigar.',
      help: ['hecho', 'driver', 'senal', 'hipotesis', 'atribucion'] },
    reforecast: { title: 'Recovery & Reforecast', group: 'recuperar', purpose: 'Qué tendría que venderse en los días restantes para conservar la meta original.',
      help: ['reforecast', 'forecast', 'recoveryPressure', 'surplus'] },
    recovery: { title: 'Recovery Center', group: 'recuperar', purpose: 'Hipótesis → escenario → acción → impacto simulado → resultado observado.',
      help: ['hipotesis', 'escenario', 'accion', 'impactoEsperado', 'impactoObservado'] },
    medir: { title: 'Seguimiento y aprendizaje', group: 'medir', purpose: 'Acciones, mediciones y la cadena completa de cada una.',
      help: ['baseline', 'impactoEsperado', 'impactoObservado', 'trazabilidad'] },
    ayuda: { title: '¿Cómo funciona?', group: 'ayuda', purpose: 'Cómo usar la herramienta, cómo leer un diagnóstico y glosario.', help: [] }
  };

  /* ---------- Convenciones de estados (nunca equivalentes) ---------- */

  const STATES = {
    plan: { label: 'Plan', short: 'Lo que originalmente se esperaba alcanzar.' },
    actual: { label: 'Actual', short: 'Lo que realmente ocurrió.' },
    forecast: { label: 'Forecast', short: 'Proyección de cierre basada en la información disponible.' },
    reforecast: { label: 'Reforecast', short: 'Distribución requerida de lo que falta para conservar el objetivo original.' },
    scenario: { label: 'Escenario', short: 'Simulación hipotética de qué ocurriría si cambian determinadas variables.' },
    observed: { label: 'Observado', short: 'Resultado posteriormente registrado.' }
  };

  /* ---------- Ayuda y glosario ---------- */

  const e = (id, title, shortDescription, o = {}) => ({ id, title, shortDescription, detailedDescription: '', howToRead: '',
    formula: '', interpretation: '', caveats: '', nextStep: '', ...o });

  const HELP = [
    e('revenue', 'Venta', 'Importe vendido en el periodo.', { formula: 'Venta = Volumen × CR × AOV = Pedidos × AOV',
      howToRead: 'Compárala siempre contra una referencia (plan, año anterior, forecast).',
      caveats: 'Una venta menor no dice por sí sola si faltó volumen, conversión o ticket: para eso está el diagnóstico.', glossary: true }),
    e('orders', 'Pedidos', 'Número de órdenes.', { formula: 'Pedidos = Volumen × CR', glossary: true,
      caveats: 'En el plan y en escenarios los pedidos se derivan; no se capturan a mano.' }),
    e('trafficVolume', 'Volumen', 'Sesiones (Ecommerce, App), mensajes o contactos (WhatsApp) o llamadas (Llamadas).',
      { formula: 'Dato cargado; en escenarios: Volumen × (1 + Δ%)', glossary: true,
        interpretation: 'Más volumen con la misma conversión y ticket produce más venta, en proporción.',
        caveats: 'El volumen de cada canal mide cosas distintas: no se comparan entre canales.' }),
    e('conversionRate', 'CR (conversión)', 'Proporción del volumen que terminó en pedido.', { formula: 'CR = Pedidos ÷ Volumen', glossary: true,
      howToRead: 'Se expresa en %. Sus cambios se leen en puntos porcentuales (pp): de 2.10 % a 2.30 % es +0.20 pp, que es +9.5 % relativo.',
      interpretation: 'Una caída del CR indica que una menor proporción del volumen terminó convirtiéndose en pedido.',
      caveats: 'No demuestra por sí sola la causa de la caída. En periodos se calcula como razón de sumas, nunca como promedio de días.' }),
    e('aov', 'AOV (ticket promedio)', 'Venta promedio por pedido.', { formula: 'AOV = Venta ÷ Pedidos', glossary: true,
      interpretation: 'Un AOV menor significa pedidos más chicos: menos artículos, mezcla distinta o precios más bajos.',
      caveats: 'No distingue entre esas explicaciones; los segmentos (categoría, items) ayudan a localizarla.' }),
    e('meta', 'Meta (Original Target)', 'La meta anual que la empresa estableció por canal.', { caveats: 'La app nunca la modifica para que "cuadre".' }),
    e('plan', 'Plan', STATES.plan.short, { state: 'plan', glossary: true,
      detailedDescription: 'La meta repartida en meses, semanas y días con los pesos de estacionalidad (Fase 2), o el plan importado.',
      caveats: 'El primer plan guardado queda congelado como Plan original; nada lo sobrescribe.' }),
    e('planOriginal', 'Plan original congelado', 'La primera versión guardada del plan distribuido.', { caveats: 'Las siguientes se guardan como revisiones.' }),
    e('actual', 'Actual', STATES.actual.short, { state: 'actual', glossary: true,
      detailedDescription: 'Venta real cargada. Solo cuenta hasta la fecha de corte; un día en curso con carga parcial no cuenta como cerrado.' }),
    e('forecast', 'Forecast', STATES.forecast.short, { state: 'forecast', glossary: true,
      detailedDescription: 'Actual acumulado + proyección de los días restantes con el método elegido (plan restante, performance acumulada, reciente o por drivers).',
      howToRead: '¿Dónde terminaríamos si continúa el comportamiento proyectado?',
      caveats: 'Forecast no es el objetivo. Es una estimación del cierre basada en la información disponible.' }),
    e('reforecast', 'Reforecast', STATES.reforecast.short, { state: 'reforecast', glossary: true,
      detailedDescription: 'Meta original − actual acumulado = pendiente; el pendiente se reparte en los días futuros con los pesos del plan.',
      howToRead: '¿Qué tendría que ocurrir en los días restantes para conservar la meta original?',
      caveats: 'No es una estimación de lo que ocurrirá: es un requerimiento. Lo esperado es el forecast.' }),
    e('gap', 'Gap', 'Diferencia entre el actual y el plan de los mismos días.', { formula: 'Gap = Actual − Plan (a la fecha)', glossary: true,
      interpretation: 'Negativo: vamos debajo del plan acumulado.', caveats: 'No es lo mismo que el gap forecast (al cierre).' }),
    e('forecastGap', 'Gap forecast', 'Diferencia esperada al cierre.', { formula: 'Gap forecast = Forecast − Meta del periodo',
      caveats: 'Depende del método de forecast elegido.' }),
    e('cumplimiento', 'Cumplimiento', 'Actual como porcentaje del plan de los mismos días.', { formula: 'Cumplimiento = Actual ÷ Plan' }),
    e('pacing', 'Pacing', 'Ritmo contra el plan: plan acumulado esperado vs actual acumulado.', { glossary: true,
      caveats: 'Usa el plan diario ponderado, no días transcurridos ÷ días totales. Un día aislado no indica una caída estructural.' }),
    e('performanceIndex', 'Performance index', 'Actual ÷ plan en una ventana (acumulado, mes, 7, 14 o 28 días).',
      { caveats: 'La app muestra acumulado y reciente juntos y no decide cuál es "correcta".' }),
    e('recoveryPressure', 'Presión de recuperación (Recovery Pressure)', 'Cuánto está el requerimiento por encima o debajo del plan de esos mismos días.',
      { formula: 'Requerido ÷ Plan de los días restantes − 1', glossary: true, interpretation: '+14 % significa que los días restantes necesitan 14 % más que su plan original.',
        caveats: 'Es descriptiva; no es una recomendación ni una probabilidad.' }),
    e('surplus', 'Surplus', 'Exceso de actual sobre la meta.', { caveats: 'No compensa el pendiente de otro canal.' }),
    e('driver', 'Driver', 'Variable matemática relacionada con el resultado (volumen, CR o AOV).', { glossary: true,
      interpretation: '"Volumen representa la mayor contribución matemática a la brecha bajo el método seleccionado".',
      caveats: 'Una gran contribución matemática no es la causa operativa.' }),
    e('atribucion', 'Atribución', 'Reparto de la brecha de venta entre volumen, CR y AOV.', { formula: 'Secuencial o Shapley; Σ contribuciones = brecha',
      caveats: 'Depende del método elegido; la app lo indica.' }),
    e('hecho', 'Hecho', 'Algo directamente observado en los datos.', { glossary: true }),
    e('senal', 'Señal', 'Comportamiento que merece investigación.', { glossary: true,
      caveats: 'No es causalidad demostrada. Su relevancia combina impacto, peso del segmento y confianza.' }),
    e('hipotesis', 'Hipótesis', 'Explicación posible que todavía requiere validación.', { glossary: true,
      caveats: 'Nunca se presenta como hecho. Sin evidencia localizada, la hipótesis es genérica y dice qué validar.' }),
    e('escenario', 'Escenario', STATES.scenario.short, { state: 'scenario', glossary: true,
      caveats: 'Este resultado es una simulación matemática. No representa una predicción ni garantiza que el cambio pueda alcanzarse.' }),
    e('accion', 'Acción', 'Algo que una persona o equipo decide hacer.', { glossary: true,
      caveats: 'Un escenario no es una acción. La acción se liga a un escenario y a una hipótesis; nada se ejecuta desde la app.' }),
    e('impactoEsperado', 'Impacto esperado', 'Resultado matemático del escenario (simulado).', { glossary: true,
      formula: 'Venta escenario − venta base; gap después = gap antes − incremento' }),
    e('impactoObservado', 'Impacto observado', 'Resultado registrado después de ejecutar una acción.', { state: 'observed', glossary: true,
      caveats: 'Se lee como "consistente / no consistente con el escenario"; nunca "la acción causó".' }),
    e('baseline', 'Baseline', 'La base contra la que se mide: el forecast de esos días al momento de simular.', { glossary: true }),
    e('trazabilidad', 'Trazabilidad', 'Recorrer plan → actual → gap → driver → señal → hipótesis → escenario → acción → medición.'),
    e('observado', 'Dato observado', 'Venía en el archivo y se pudo leer.'),
    e('calculado', 'Dato calculado', 'No venía; la app lo derivó con las fórmulas del motor.'),
    e('historico', 'Histórico', 'Venta real de periodos anteriores; alimenta la estacionalidad.'),
    e('segmentos', 'Segmentos', 'Desglose por dimensión (dispositivo, fuente, tipo de cliente…). Solo existe si se carga.'),
    e('dataQuality', 'Calidad de datos', 'Estado de los datos cargados: listos, con advertencias o no válidos.',
      { caveats: 'Un problema en una dimensión no bloquea el resto.' }),
    e('cobertura', 'Cobertura', 'Días con dato ÷ días esperados.'),
    e('estacionalidad', 'Estacionalidad', 'Patrón histórico de reparto por mes, día de la semana, día del mes y eventos.'),
    e('confianza', 'Confianza', 'Solidez de los insumos de un cálculo.', { caveats: 'No es una probabilidad de que algo ocurra ni de que una hipótesis sea cierta.' })
  ];

  /** Palabras en etiquetas de la interfaz que activan un ícono de ayuda (en orden). */
  const TRIGGERS = [
    [/^presi[oó]n/i, 'recoveryPressure'], [/gap forecast|forecast gap/i, 'forecastGap'], [/^reforecast/i, 'reforecast'],
    [/^forecast/i, 'forecast'], [/^gap/i, 'gap'], [/^cumplimiento/i, 'cumplimiento'], [/^cr\b/i, 'conversionRate'],
    [/^aov/i, 'aov'], [/^volumen/i, 'trafficVolume'], [/^pedidos/i, 'orders'], [/^venta\b/i, 'revenue'],
    [/^meta\b/i, 'meta'], [/^plan\b/i, 'plan'], [/^actual\b/i, 'actual'], [/^surplus/i, 'surplus'],
    [/^driver/i, 'driver'], [/^señales?/i, 'senal'], [/^hipótesis/i, 'hipotesis'], [/^baseline/i, 'baseline'],
    [/^recuperación requerida/i, 'reforecast'], [/^performance index/i, 'performanceIndex']
  ];

  /* ---------- Explicadores por vista ---------- */

  const EXPLAINERS = {
    pacing: { title: 'Cómo leer esta vista', flow: ['Plan', 'Actual', 'Forecast', 'Gap forecast'],
      points: ['Plan: lo que se esperaba a la fecha y al cierre.', 'Actual: lo que ocurrió hasta el corte.',
        'Forecast: dónde terminaríamos si continúa el comportamiento proyectado (no es el objetivo).',
        'Gap forecast: forecast − meta. El gap "a la fecha" compara solo los días transcurridos.'] },
    reforecast: { title: 'Forecast no es reforecast', flow: ['Meta original', 'Actual acumulado', 'Pendiente', 'Distribución futura requerida', 'Presión de recuperación'],
      points: ['Forecast: ¿dónde terminaríamos si continúa lo proyectado?', 'Reforecast: ¿qué tendría que ocurrir en los días restantes para conservar la meta original?',
        'El reforecast es un requerimiento, no un pronóstico.'] },
    diagnostico: { title: 'Brecha → driver → señal → hipótesis', flow: ['Hecho', 'Driver', 'Señal', 'Hipótesis'],
      points: ['Hecho: algo observado en los datos.', 'Driver: variable matemática relacionada con el resultado.',
        'Señal: comportamiento que merece investigación, no una causa demostrada.', 'Hipótesis: explicación posible que requiere validación.'] },
    recovery: { title: 'Hipótesis, escenario, acción y resultado son cosas distintas', flow: ['Hipótesis', 'Escenario', 'Acción', 'Resultado observado'],
      points: ['Hipótesis: una posible explicación.', 'Escenario: una simulación; su impacto es matemático, no una predicción.',
        'Acción: algo que alguien decide hacer (dueño, métrica, fechas).', 'Resultado observado: lo que después ocurrió, comparado contra baseline y escenario.'] },
    medir: { title: 'Un escenario no es una acción', flow: ['Escenario', 'Acción', 'Responsable', 'Métrica', 'Medición'],
      points: ['La medición compara baseline, escenario y observado en los mismos días.', 'La lectura es "consistente / no consistente con el escenario"; nunca "la acción causó".'] }
  };

  /* ---------- Recorrido guiado ---------- */

  const TOUR = [
    { id: 'meta', view: 'resumen', target: '#targets-form', title: 'Meta',
      what: 'La meta anual por canal: el Original Target.', why: 'Todo se mide contra ella y nunca se modifica.',
      lookFor: 'Que el total y los canales estén capturados y cuadren.', next: 'Revisar cómo vamos contra el plan.' },
    { id: 'pacing', view: 'pacing', target: '#fc-channels', title: 'Pacing',
      what: 'Plan acumulado vs actual acumulado por canal.', why: 'Dice si vamos arriba o debajo del plan de los días transcurridos.',
      lookFor: 'Canales con cumplimiento menor a 100 % y su gap.', next: 'Ver el forecast de cierre.' },
    { id: 'forecast', view: 'pacing', target: '#fc-kpis', title: 'Forecast',
      what: 'Dónde terminaríamos si continúa el comportamiento proyectado.', why: 'Separa lo que ya pasó de lo que se espera.',
      lookFor: 'El método en uso y el gap forecast.', next: 'Cuantificar la brecha.' },
    { id: 'gap', view: 'reforecast', target: '#rf-summary', title: 'Gap y recuperación',
      what: 'Plan, forecast y reforecast requerido lado a lado.', why: 'Muestra lo esperado vs lo necesario.',
      lookFor: 'Recuperación requerida y presión de recuperación.', next: 'Entender qué driver explica la brecha.' },
    { id: 'drivers', view: 'diagnostico', target: '#dx-level1', title: 'Drivers',
      what: 'Atribución de la brecha a volumen, CR y AOV.', why: 'Indica qué variable matemática pesa más.',
      lookFor: 'El driver principal y los offsets positivos.', next: 'Localizar dónde ocurre.' },
    { id: 'senales', view: 'diagnostico', target: '#dx-signals', title: 'Señales',
      what: 'Cambios relevantes por segmento, mezcla y anomalías.', why: 'Localizan dónde investigar.',
      lookFor: 'Prioridad alta con peso grande en la base.', next: 'Leer las hipótesis.' },
    { id: 'hipotesis', view: 'diagnostico', target: '#dx-hyps', title: 'Hipótesis',
      what: 'Explicaciones posibles ligadas a señales.', why: 'Convierten señales en preguntas a validar.',
      lookFor: 'Qué validar en cada una.', next: 'Simular un escenario.' },
    { id: 'escenario', view: 'recovery', target: '#rc-simulator', title: 'Escenario',
      what: 'Simulación de qué pasaría si cambia un driver.', why: 'Cuantifica cuánto del gap podría recuperarse.',
      lookFor: 'Venta incremental simulada y gap restante.', next: 'Plantear una acción.' },
    { id: 'accion', view: 'recovery', target: '#rc-library', title: 'Acción',
      what: 'Actividad concreta ligada a una hipótesis y un escenario.', why: 'Lo que alguien decide hacer, con responsable y métrica.',
      lookFor: 'Driver, área responsable y ventana de medición.', next: 'Medir el resultado.' },
    { id: 'medicion', view: 'medir', target: '#mx-actions', title: 'Medición',
      what: 'Baseline vs escenario vs observado.', why: 'Permite aprender qué fue consistente con lo simulado.',
      lookFor: 'Consistencia y factores que afectan la comparación.', next: 'Volver a monitorear.' }
  ];

  /* ---------- Modos Ejecutivo / Analista ---------- */

  /** Selectores de bloques técnicos que el modo Ejecutivo colapsa (nunca se eliminan). */
  const ANALYST_ONLY = [
    '#view-resumen [aria-labelledby="t-edge"]', '#view-resumen [aria-labelledby="t-engine"]', '#view-resumen [aria-labelledby="t-validation"]',
    '#view-pacing #fc-indices', '#view-pacing #fc-methods', '#view-pacing #fc-params',
    '#view-reforecast #rf-drivers', '#view-reforecast #rf-audit',
    '#view-diagnostico #dx-tree', '#view-diagnostico #dx-confidence',
    '#view-recovery #rc-inverse', '#view-configuracion'
  ];

  const HOW_IT_WORKS = [
    ['Planea', 'Carga datos, captura la meta y distribúyela con la estacionalidad.', 'plan'],
    ['Compara', 'Pacing: plan acumulado contra actual.', 'pacing'],
    ['Proyecta', 'Forecast de cierre y reforecast requerido.', 'pacing'],
    ['Diagnostica', 'Driver, señal e hipótesis.', 'diagnostico'],
    ['Simula', 'Escenarios de recuperación.', 'recovery'],
    ['Actúa', 'Plan de acción ligado a la evidencia.', 'recovery'],
    ['Mide', 'Baseline vs escenario vs observado.', 'medir']
  ];

  const READ_DIAGNOSIS = [
    '¿Qué tan grande es la brecha?', '¿Qué variable matemática explica parte de ella?', '¿Qué señales aparecen?',
    '¿Qué hipótesis vale investigar?', '¿Qué escenario puedo simular?', '¿Qué acción voy a medir?'
  ];

  FP.guidanceConfig = { GROUPS, VIEWS, STATES, HELP, TRIGGERS, EXPLAINERS, TOUR, ANALYST_ONLY, HOW_IT_WORKS, READ_DIAGNOSIS };
})(typeof window !== 'undefined' ? window : globalThis);
