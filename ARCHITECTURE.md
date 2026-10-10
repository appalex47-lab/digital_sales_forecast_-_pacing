# ARCHITECTURE.md — RevNavigator

Documento de referencia para todas las fases. Antes de modificar cualquier módulo, léelo completo.
Versión de la app: 0.12.0 (Fase 9.1). Versión del contrato de datos: **1.10.0** (sin cambios en 9.1).
Guía de experiencia: `UX_GUIDE.md`.
Diccionario de campos: `DATA_DICTIONARY.md`.

Fases:
- **Fase 0** (secciones 1–9): arquitectura base, modelo Plan / Actual / Forecast, motor matemático.
- **Fase 1** (secciones 10–18): carga CSV, normalización, validación, calidad, cobertura, almacenamiento y exportación.
- **Fase 2** (secciones 19–29): estacionalidad, pesos, distribución de metas y plan distribuido.
- **Fase 3** (secciones 30–40): actual vs plan, pacing, gap, performance index, forecast y versiones.
- **Fase 4** (secciones 41–50): reforecast dinámico, redistribución del gap, recuperación y drivers.
- **Fase 5** (secciones 51–61): brecha → driver → señal → hipótesis, Cohere opcional y analysis_export.json.
- **Fase 6** (secciones 62–73): escenarios, recuperación, plan de acción, impacto simulado vs observado, Recovery Center.
- **Fase 7** (secciones 74–82): capa de UX guiada: navegación agrupada, Inicio, contexto y siguiente paso, ayuda, glosario, recorrido, modos Ejecutivo/Analista, trazabilidad visible.

---

## 1. Estructura de archivos

```
/index.html                     Estructura, navegación por vistas y orden de carga de scripts
/ARCHITECTURE.md                Este documento
/DATA_DICTIONARY.md             Diccionario de todos los campos del modelo            (Fase 1)
/css/styles.css                 Tokens (variables CSS) y componentes
/tools/idb-proof.html           Prueba técnica de IndexedDB (Fase 8, paso 14); no la usa la app
/tools/idb-proof.js             Lógica de la prueba (base separada 'fp-idb-proof')
/js/
  config/guidanceConfig.js      Contenidos de ayuda, glosario, grupos, recorrido (solo texto)   (Fase 7)
  config/config.js              Canales (+ alias), métricas, tolerancias, calendario, storage,
                                campos de importación, tipos de dato, catálogo de errores
  calendar/calendar.js          Fechas UTC, semana (punto único), atributos de día, periodos
  calculations/metrics.js       Núcleo matemático, derivación, validación, agregación, gap
  calculations/weights.js       Estadística robusta: mediana, MAD, winsorizado, encogimiento   (Fase 2)
  calculations/seasonality.js   Perfiles de estacionalidad por canal                         (Fase 2)
  calculations/gap.js           Gap, cumplimiento, gap forecast, semáforo de pacing           (Fase 3)
  calculations/pacing.js        Fecha de referencia, corte, estados temporales, acumulados    (Fase 3)
  calculations/self-test.js     Pruebas del motor (red de no-regresión)
  data/data-model.js            DailyRecord, Targets, Dataset, consultas y resúmenes
  data/data-store.js            Modelo canónico: colecciones, lotes, duplicados, consolidación  (Fase 1)
  data/mock-data.js             Datos de prueba determinísticos y casos límite (solo QA)
  data/mock-csv.js              Archivos CSV de prueba: 11 casos + 4 datasets generados (Fase 1)
  events/events.js              Entidades de eventos comerciales e hitos
  forecast/forecast.js          Registro de versiones: Original Plan inmutable, reforecasts
  forecast/distribution.js      Reparto exacto por mayor residuo (centavos / unidades)        (Fase 2)
  forecast/planningEngine.js    Motor de planeación: anual → mensual → semanal → diario       (Fase 2)
  forecast/performanceIndex.js  Índices actual ÷ plan por ventana y métrica                   (Fase 3)
  forecast/forecastMethods.js   Métodos A–D de proyección de un día                           (Fase 3)
  forecast/forecastEngine.js    Motor central: plan → actual → pacing → gap → forecast        (Fase 3)
  forecast/forecastVersioning.js Snapshots inmutables, forecast change, accuracy              (Fase 3)
  forecast/futureWeights.js     Pesos futuros = venta del plan original (salida de Fase 2)    (Fase 4)
  forecast/reforecastEngine.js  Pendiente, redistribución, recuperación, drivers, confianza   (Fase 4)
  forecast/reforecastVersioning.js Versiones rf_vN, evolución y reforecast change             (Fase 4)
  diagnostics/attribution.js    Atribución secuencial y Shapley de venta = volumen × CR × AOV (Fase 5)
  diagnostics/driverEngine.js   Pares actual/referencia por comparación, Nivel 1 y Nivel 2  (Fase 5)
  diagnostics/signalEngine.js   Señales, relevancia y prioridad de investigación, anomalías (Fase 5)
  diagnostics/hypothesisEngine.js Hipótesis por reglas ligadas a señales                    (Fase 5)
  diagnostics/diagnosticEngine.js runDiagnostic: orquesta la cadena y la confianza de datos (Fase 5)
  ai/cohereClient.js            Llamada compartida a Cohere (extraída de cohereDiagnostic)  (Fase 6)
  import/normalize.js            También expone mapeo semántico de cabeceras con Cohere, validado contra importFields
  ai/cohereDiagnostic.js        Redacción opcional de hipótesis con Cohere + validación     (Fase 5)
  ai/cohereActions.js           Líneas de acción posibles con Cohere + validación           (Fase 6)
  scenarios/scenarioValidation.js Entradas, bloques y restricciones de escenarios           (Fase 6)
  scenarios/scenarioEngine.js   Contexto, simulación por canal y segmento, persistencia     (Fase 6)
  scenarios/recoveryEngine.js   Cálculo inverso, runRecoveryAnalysis, contextos importados   (Fase 6)
  impact/impactCalculator.js    Impacto simulado (estructura expectedImpact)                (Fase 6)
  impact/impactMeasurement.js   Impacto observado: baseline vs escenario vs real            (Fase 6)
  actions/actionLibrary.js      Catálogo configurable de acciones posibles                  (Fase 6)
  actions/actionPlan.js         Plan de acción, estados, historial, prioridad descriptiva   (Fase 6)
  actions/actionTracking.js     Mediciones append-only                                      (Fase 6)
  storage/storage.js            Persistencia con adaptadores (localStorage / memoria)
  config/businessContext.js     Business Context: esquema, normalización, validación, bootstrap (Fase 8.2; carga ANTES de config.js)
  storage/idb.js                Envoltura mínima de IndexedDB (primitivas)                    (Fase 8.1)
  storage/repository.js         Repositorio: esquema IndexedDB, caché kv, almacenamiento enrutado (Fase 8.1)
  storage/migration.js          Migración no destructiva localStorage → IndexedDB con verificación (Fase 8.1)
  storage/storage-tests.js      Pruebas asíncronas de almacenamiento y volumen (en el navegador)   (Fase 8.1)
  products/productStore.js      Contrato, bloques día × canal, duplicados, persistencia, consultas (Fase 8.1)
  products/productImport.js     Carga de productos por partes (vista previa, validación, resumen)  (Fase 8.1)
  products/productAnalysis.js   Categoría → Producto: participación, contribución, señales         (Fase 8.1)
  export/categoryProductExport.js category_product_analysis_export.json                          (Fase 8.1)
  data/mock-products.js         Archivos de prueba de productos (solo QA)                         (Fase 8.1)
  ui/business-view.js           Vista Negocio (Business Setup)                                (Fase 8.2)
  ui/product-view.js            Vista Categoría → Producto y revisión de archivos de productos    (Fase 8.1)
  calculations/targetAssistant.js Propuesta de metas desde la venta real de un año base
  import/xlsx.js                XLSX → RAW (lector nativo, primera hoja, sin dependencia externa) (Fase 14)
  import/csv.js                 CSV → RAW (parser RFC 4180, separador, BOM, stringify)      (Fase 1)
  import/normalize.js           Reglas de normalización: fecha, número, canal, tipo de día (Fase 1)
  import/import.js              Pipeline: staging, mapeo, registro canónico, selección      (Fase 1)
  quality/validation.js         Reglas de validación, issues estructurados, duplicados     (Fase 1)
  quality/coverage.js           Cobertura temporal/canal/métrica y resumen de calidad      (Fase 1)
  export/export.js              forecast_export.json + exportaciones de Fase 1 + descargas
  export/planningExport.js      Contrato de planning_export.json                              (Fase 2)
  export/forecastExport.js      forecast_export.json de Fase 3 (superconjunto del de Fase 0)  (Fase 3)
  export/reforecastExport.js    reforecast_export.json                                        (Fase 4)
  export/analysisExport.js      analysis_export.json                                          (Fase 5)
  export/actionPlanExport.js    action_plan_export.json                                       (Fase 6)
  ui/format.js                  Número → texto (único lugar); nunca NaN/Infinity
  ui/ui.js                      Render de Resumen y motor; utilidades compartidas
  ui/import-view.js             Vista Carga de datos                                        (Fase 1)
  ui/quality-view.js            Vista Calidad de datos                                      (Fase 1)
  ui/data-view.js               Vista Datos normalizados                                    (Fase 1)
  ui/seasonality-view.js        Vista Estacionalidad                                        (Fase 2)
  ui/planning-view.js           Vista Plan: metas, vista previa, cierre, plan distribuido   (Fase 2)
  ui/planning-config-view.js    Vista Configuración de planeación y comparación de métodos  (Fase 2)
  ui/chart.js                   Gráfico de líneas SVG compartido y acumulados              (Fase 4)
  ui/pacing-view.js             Pacing & Forecast: tablero, tendencia, periodos, eventos    (Fase 3)
  ui/forecast-view.js           Pacing & Forecast: índices, métodos, alertas, versiones     (Fase 3)
  ui/reforecast-view.js         Recovery & Reforecast                                       (Fase 4)
  ui/diagnostic-view.js         ¿Por qué? Diagnóstico: hecho, drivers, árbol, señales, hipótesis (Fase 5)
  ui/recovery-center.js         Recovery Center: contexto, brecha, drivers, árbol trazable, E/S (Fase 6)
  ui/scenario-view.js           Simulador, cálculo inverso, escenarios guardados, comparación (Fase 6)
  ui/action-plan-view.js        Catálogo, plan de acción, IA y seguimiento                  (Fase 6)
  ui/guidance/contextEngine.js  Estado de la app, siguiente paso, descripción de vista       (Fase 7)
  ui/guidance/navigation.js     Grupos, submenú, migas, barra de contexto, filtros, modos   (Fase 7)
  ui/guidance/help.js           Íconos de ayuda, panel, glosario, etiquetas de estado       (Fase 7)
  ui/guidance/tour.js           Recorrido guiado de 10 pasos                                (Fase 7)
  ui/guidance/traceability.js   Cadena plan → … → medición de una acción (solo lectura)     (Fase 7)
  ui/guidance/explain.js        "¿Por qué este número?" y "¿Qué significa?" con la corrida real (Fase 9.1)
  ui/guidance/home-view.js      Inicio / centro de control                                  (Fase 7)
  ui/guidance/measure-view.js   Medir y aprender (vista global de acciones y mediciones)    (Fase 7)
  ui/guidance/help-view.js      ¿Cómo funciona? y ¿cómo leer un diagnóstico?                (Fase 7)
  ui/guidance/diagnostic-guide.js ¿Por qué está pasando? + árbol visual de drivers          (Fase 7)
  app.js                        Orquestador: estado, acciones, persistencia, arranque
```

Diferencias respecto a la propuesta inicial, con motivo:

- **Scripts clásicos con namespace `FP`** en lugar de módulos ES6. Los módulos ES6 no cargan
  al abrir `index.html` con doble clic (`file://`) por la política CORS del navegador; los
  scripts clásicos funcionan igual en `file://` y en GitHub Pages, sin servidor ni build.
  Cada archivo es un IIFE que registra un único objeto: `FP.config`, `FP.calendar`,
  `FP.metrics`, `FP.dataModel`, `FP.events`, `FP.forecast`, `FP.storage`, `FP.importer`,
  `FP.exporter`, `FP.mock`, `FP.selfTest`, `FP.format`, `FP.ui`, `FP.app`.
- **`/js/forecast` y `/js/events`** existen desde ya porque el versionado y las entidades
  de eventos forman parte del contrato de datos, aunque sus algoritmos lleguen después.
- **`ui/format.js`** separado de `ui.js`: todas las vistas futuras (dashboard, pacing,
  gráficos) formatearán igual.
- **`calculations/self-test.js`** y **`data/mock-data.js`**: permiten comprobar la
  arquitectura en el navegador sin datos reales. Nada del núcleo depende de ellos.
- **Fase 1 agrega la carpeta `/js/quality`** (validación y cobertura) separada de `/js/import`
  (lectura y normalización): leer un dato y juzgar su calidad son responsabilidades distintas,
  y la cobertura se usará también sobre datos que no vienen de CSV.

## 2. Modelo de datos

### 2.1 DailyRecord (un día × un canal)

```js
{
  id: "2026-09-23|ecommerce",          // llave única: date|channel
  // Atributos de calendario (FP.calendar.getDateAttributes)
  date: "2026-09-23", year: 2026, month: 9, quarter: 3, fortnight: 2,
  week: 39, weekYear: 2026, weekKey: "2026-W39",
  weekOfMonth: 4, weekOfMonthLabel: "W4",
  dayOfWeek: "Wednesday", dayOfWeekIndex: 3, dayOfYear: 266, isWeekend: false,
  // Negocio
  channel: "ecommerce",
  dayType: "regular",                  // regular | holiday | event | campaign | special
  holiday: null, event: null, season: null,
  // Estados (nunca se mezclan)
  plan:     { revenue, orders, trafficVolume, conversionRate, aov },
  actual:   { revenue, orders, trafficVolume, conversionRate, aov },
  forecast: { revenue, orders, trafficVolume, conversionRate, aov },
  // Origen de cada valor, por estado
  sources:  { plan: {revenue: "input", …}, actual: {revenue: "observed", conversionRate: "calculated", …}, forecast: {…} },
  // Resultado de FP.metrics.validateBlock por estado
  validation: { plan: {status, checks, issues}, actual: {…}, forecast: {…} }
}
```

Orígenes (`sources`): `observed` dato real cargado; `input` dato capturado/planeado;
`model` producido por el motor de forecast; `calculated` derivado por identidad matemática.

### 2.2 Targets (metas jerárquicas)

```js
{
  year: 2026, currency: "MXN",
  annual:    { revenue, orders, trafficVolume, conversionRate, aov },
  byChannel: { ecommerce: {…}, app: {…}, whatsapp: {…}, llamadas: {…} },
  byMonth:   { "2026-09": { total: {…}, byChannel: { ecommerce: {…} } } },   // futuro
  byWeek:    { "2026-W39": { total, byChannel } },                             // futuro
  byDay:     { "2026-09-23": { total, byChannel } },                           // futuro
  updatedAt: "ISO"
}
```

Jerarquía: META ANUAL → CANAL → MES → SEMANA → DÍA. La suma de hijos se valida contra el
padre con `FP.metrics.validateHierarchy(parent, children)`. En Fase 0 solo se valida
canales vs total. La distribución automática no existe todavía.

### 2.3 Dataset

```js
{ schemaVersion: "1.0.0", year: 2026, meta: { source, label, createdAt }, records: { [id]: DailyRecord } }
```

### 2.4 Versionado de plan/forecast (`FP.forecast`)

```js
registry = { schemaVersion, year, currentVersionId, versions: [
  { id: "original-plan", type: "original_plan", label: "Original Plan", locked: true, values: { [recordId]: Block } },
  { id: "reforecast-01", type: "reforecast", basedOn: "original-plan", reason: null, values: {…} },
  …
]}
```

- El Original Plan se crea una sola vez con `lockOriginalPlan()` y queda congelado
  (`Object.freeze` profundo). Un segundo intento lanza error.
- Cualquier redistribución futura crea una versión nueva con `addVersion()`; nunca edita otra.
- `record.forecast` es la vista materializada de la versión vigente (`currentVersionId`).
- `reason` queda reservado para vincular un reforecast con el diagnóstico/acción que lo motivó.

### 2.5 Eventos e hitos (`FP.events`)

```js
event     = { id: "hot-sale-2026", name, startDate, endDate, type: "commercial_event", channels: null, impactWeight: null, notes }
milestone = { id, date, type: "milestone", title, description, channel: null, impact: null }
```
`channels: null` significa todos los canales.

## 3. Relaciones matemáticas

```
Pedidos = traffic_volume × CR
Venta   = Pedidos × AOV = traffic_volume × CR × AOV
CR      = Pedidos ÷ traffic_volume
AOV     = Venta ÷ Pedidos
```

`traffic_volume` significa sesiones (Ecommerce, App), mensajes/contactos (WhatsApp) o
llamadas (Llamadas). El motor es común; la etiqueta visible sale de `config.channels[].trafficLabel`.

Reglas del motor (`FP.metrics`):

1. Ninguna función devuelve `NaN` ni `Infinity`. Lo inválido o indefinido es `null`.
   `safeDivide` devuelve `null` si el divisor es 0, nulo o no numérico.
2. `toNumberOrNull` acepta `'$1,250.50'`, `'1,000'`, `'1.25%'` (→ 0.0125). Texto no numérico
   → `null` y se reporta como error `numeric_input`.
3. CR se almacena como fracción (0.0125 = 1.25 %).
4. `deriveBlock` completa huecos sin sobrescribir lo cargado y marca lo derivado como `calculated`.
5. `validateBlock` revisa: negativos, volumen 0 con pedidos, pedidos 0 con venta, CR > 100 %,
   y las cuatro identidades con tolerancias de `config.tolerances`. Si un valor cargado no
   cuadra, se conserva y se genera `warning`.
6. Agregación: se suman solo métricas aditivas (venta, pedidos, volumen); CR y AOV se
   recalculan desde las sumas. **Nunca se promedian ratios.**
7. `calcGap(reference, value)` → `{ abs, pct, attainment }`, todo nulo-seguro.

## 4. Responsabilidades de cada módulo y dependencias

Orden de carga (cada módulo solo usa los anteriores):

| # | Módulo | Responsabilidad | Depende de |
|---|--------|-----------------|------------|
| 1 | config | Definiciones de negocio y parámetros | — |
| 2 | calendar | Fechas, semanas, periodos | config |
| 3 | metrics | Cálculo, derivación, validación, agregación | config |
| 4 | data-model | Crear/validar/consultar registros y metas | config, calendar, metrics |
| 5 | events | Eventos e hitos | config, calendar, metrics |
| 6 | forecast | Versionado (sin algoritmos) | config |
| 7 | storage | Persistencia local | config |
| 8 | csv | Texto CSV → filas RAW; filas → CSV | config |
| 9 | normalize | Texto → valor normalizado con estado | config, calendar |
| 10 | validation | Reglas de calidad, issues, duplicados | config, metrics |
| 11 | import | Pipeline stage → process → selectRows | csv, normalize, validation, metrics, calendar |
| 12 | data-store | Colecciones, lotes, consolidación | config, data-model, import |
| 13 | coverage | Cobertura y resumen de calidad | config, calendar, metrics, data-store |
| 14 | export | Contratos y descargas | config, metrics, data-model, forecast, data-store, coverage, csv |
| 15 | mock-data | Datos de prueba Fase 0 | data-model, calendar, events |
| 16 | mock-csv | Archivos CSV de prueba | csv, calendar, config, mock-data |
| 17 | self-test | Pruebas del motor | todos los anteriores |
| 18 | format | Presentación de números | config, metrics |
| 19 | ui | Render Resumen + utilidades | todo lo anterior |
| 20 | import-view, quality-view, data-view | Vistas de Fase 1 | ui, format y módulos de datos |
| 21 | app | Estado y acciones | todo lo anterior |

Los módulos acceden a sus dependencias en tiempo de llamada (`FP.x`), no al cargarse.

Reglas de capa:
- **UI no calcula**: pide resúmenes a `dataModel` y formatea con `format`.
- **Cálculos no tocan el DOM ni el storage.**
- **Solo `app.js` modifica el estado** y decide cuándo persistir.
- **Solo `config.js` declara** canales, métricas, tolerancias y claves.
- **Solo `calendar.getWeekInfo()` define qué es una semana.**
- **Solo `normalize.js` convierte texto de archivo en valores** (fechas, números, canales).
- **Solo `validation.js` decide qué es un problema de calidad** y con qué severidad.
- **La UI nunca lee el CSV original**: muestra `staged.parsed` (RAW) solo para mapear y la
  vista previa sale de registros canónicos.

## 5. Contrato de datos

> Fase 1 reemplazó las tablas 5.1 y 5.2 por los contratos de `config.dataTypes` y los
> sinónimos de `config.importFields` (ver §12). `FP.importer.CSV_CONTRACTS` sigue existiendo
> por compatibilidad y ahora se deriva de esa configuración. Las tablas quedan como referencia histórica.

### 5.1 CSV histórico (`FP.importer.CSV_CONTRACTS.historical`)

| Columna | Destino | Requerida | Alias aceptados |
|---|---|---|---|
| fecha | date (YYYY-MM-DD) | sí | date, dia |
| canal | channel | sí | channel |
| venta | actual.revenue | sí | revenue, actual_revenue |
| pedidos | actual.orders | sí | orders, actual_orders |
| traffic_volume | actual.trafficVolume | sí | volumen, sesiones, actual_traffic_volume |
| conversion_rate | actual.conversionRate | no | cr, actual_conversion_rate |
| aov | actual.aov | no | ticket_promedio, actual_aov |
| evento | event (→ dayType event) | no | event |
| festivo | holiday (→ dayType holiday) | no | holiday |
| temporada | season | no | season |

### 5.2 CSV de plan (`CSV_CONTRACTS.plan`)

`fecha, canal, plan_revenue` (requeridas), `plan_orders, plan_traffic_volume,
plan_conversion_rate, plan_aov` (opcionales).

Canales se normalizan con `CHANNEL_ALIASES` (ej. "e-commerce", "web" → ecommerce; "wa" → whatsapp;
"call center" → llamadas). `conversion_rate` se acepta como fracción o con `%`.

Flujo esperado para la fase de carga CSV:
`leer archivo → filas → validateHeaders() → mapRow() → dataModel.createDailyRecord()/setBlock() → upsertRecord()`.

### 5.3 forecast_export.json (`FP.exporter.buildForecastExport`)

```json
{
  "schema": "forecast_export",
  "schemaVersion": "1.0.0",
  "generatedAt": "ISO",
  "source": { "app": "RevNavigator", "version": "0.1.0" },
  "period": { "year": 2026, "start": "2026-09-01", "end": "2026-09-30", "granularity": "day", "currency": "MXN", "locale": "es-MX" },
  "channels": [{ "id": "ecommerce", "label": "Ecommerce", "traffic_volume_label": "Sesiones" }],
  "metrics_definition": [{ "key": "revenue", "label": "Venta", "kind": "currency", "additive": true, "formula": "traffic_volume * conversion_rate * aov" }],
  "targets": { "annual": {}, "byChannel": {} },
  "records": [{
    "date": "2026-09-01", "channel": "ecommerce", "week": "2026-W36",
    "day_type": "regular", "holiday": null, "event": null, "season": null,
    "plan":     { "revenue": 0, "orders": 0, "traffic_volume": 0, "conversion_rate": 0, "aov": 0 },
    "actual":   { "...": "..." },
    "forecast": { "...": "..." },
    "gap": { "actual_vs_plan": { "revenue": { "reference": 0, "value": 0, "abs": 0, "pct": 0, "attainment": 0 } } },
    "validation_status": { "plan": "ok", "actual": "warning" }
  }],
  "records_total": 120,
  "events": [], "milestones": [],
  "forecast_versions": [{ "id": "original-plan", "type": "original_plan", "locked": true }],
  "current_forecast_version": "original-plan",
  "integration": {
    "counterpart_file": "analysis_export.json",
    "join_keys": ["date", "channel"],
    "loop": ["forecast", "actual", "gap", "diagnosis", "hypothesis", "action", "reforecast"]
  }
}
```

La app de diagnóstico (`analysis_export.json`) debe poder unirse por `date` + `channel`.

## 6. Convenciones de nombres

- **Interno (JS):** camelCase → `trafficVolume`, `conversionRate`, `dayType`.
- **Externo (CSV, JSON exportado):** snake_case → `traffic_volume`, `conversion_rate`, `day_type`.
  La traducción vive en `config.metrics[k].csv` y en `exporter.toContractBlock()`.
- **Estados:** `plan`, `actual`, `forecast` (UI: Plan, Real, Forecast).
- **Canales:** `ecommerce`, `app`, `whatsapp`, `llamadas` (ids en minúscula, sin acentos).
- **Llaves de periodo:** año `2026`, mes `2026-09`, semana `2026-W39`, día `2026-09-23`.
- **Fechas:** siempre string `YYYY-MM-DD`, operadas en UTC.
- **Storage:** `fp.v1:<clave>:<año>` (ej. `fp.v1:dataset:2026`), guardadas en sobre
  `{ schemaVersion, savedAt, data }`.
- **Funciones:** `create*` construye, `validate*` revisa sin modificar, `calc*` calcula,
  `render*` pinta, `hydrate*` reconstruye desde storage.

## 7. Cómo agregar módulos futuros

1. Crear el archivo en la carpeta de su capa (ej. `js/forecast/seasonality.js`).
2. Usar el mismo patrón IIFE y registrar un solo objeto (`FP.seasonality`).
3. Agregar el `<script>` en `index.html` **después** de sus dependencias y antes de `ui.js`.
4. Reutilizar `FP.metrics` para toda operación numérica y `FP.calendar` para toda fecha.
5. Si necesita parámetros, agregarlos a `config.js` (no constantes locales).
6. Agregar pruebas en `self-test.js`.
7. Documentarlo en las secciones 1 y 4 de este archivo.

Destinos previstos por fase:
- Estacionalidad y pesos → `js/forecast/seasonality.js` (usa `dayType`, `dayOfWeek`, `month`, `fortnight`, eventos).
- Distribución de metas → `js/forecast/distribution.js` (llena `targets.byMonth/byWeek/byDay`).
- Pacing → `js/forecast/pacing.js` (usa `calcGap`, `summarize`).
- Reforecast → `js/forecast/reforecast.js` (crea versiones con `addVersion`).
- Carga CSV → lector en `js/import/`, pasando por `validateHeaders` y `mapRow`.
- Descarga JSON → `js/export/` usando `buildForecastExport` sin `sampleSize`.

## 8. Cómo evitar romper funcionalidades existentes

- Correr la app y confirmar **"120 de 120 pruebas correctas"** (o el total vigente) antes y
  después de cada cambio. Fase 0 aportó 24; Fase 1, 19; Fase 2, 16; Fase 3, 14; Fase 4, 14; Fase 5, 12; Fase 6, 14; Fase 7, 7. Las pruebas se agregan; nunca se borran ni se relajan.
- Los casos límite deben seguir mostrando "Coincide" en todas las filas.
- No renombrar funciones, campos ni llaves de storage. Si es inevitable: dejar alias del
  nombre anterior, subir `schemaVersion` y documentar en §9.
- No duplicar lógica: si se necesita un cálculo nuevo, va en `metrics.js`.
- No escribir sobre el Original Plan bloqueado. Desde Fase 1, `record.plan` del Dataset
  consolidado refleja el último plan importado; el Original Plan congelado no cambia (§16).
- No leer ni guardar CSV crudo como fuente: todo pasa por `stage → process → commitBatch`.
- No convertir inválidos en cero ni adivinar fechas ambiguas.
- No eliminar duplicados automáticamente.
- No sobrescribir valores con origen `observed` o `input`.
- No promediar CR ni AOV en ninguna agregación.
- Probar abriendo `index.html` directo (`file://`) y en GitHub Pages.

## 9. Registro de cambios del contrato

| Versión | Fase | Cambio |
|---|---|---|
| 1.0.0 | 0 | Contrato inicial: DailyRecord, Targets, Dataset, versiones, eventos, hitos, CSV, forecast_export. |
| 1.6.0 (sin cambio) | 7 | Fase 7 solo agrega presentación. Nueva clave local `uxSettings` (modo, contexto, vistas visitadas, paso del recorrido); no entra a ningún export. Vistas nuevas `#inicio`, `#medir`, `#ayuda`; la vista inicial pasa a ser Inicio. Única lógica tocada: ninguna de motores. |
| 1.7.0 | 8.1 | Aditivo: IndexedDB `fp-data` (stores kv, productDays, productRollups, productCatalog, productBatches, meta); claves localStorage `storageMigration`, `productSettings`; `config.storageDb`, `config.products`; `category_product_analysis_export.json`; `analysis_export.json` gana el campo opcional `categoryProduct`. Los datos grandes de la app pasan a IndexedDB con la misma forma de sobre; localStorage se conserva como respaldo. |
| 1.6.0 | 6 | Aditivo: `config.recovery` (drivers, objetivos, tipos de escenario, restricciones, estados, catálogo); claves `recoverySettings`, `scenarios:<año>`, `actionPlan:<año>`, `actionLibraryCustom`; `action_plan_export.json`. La llamada de red a Cohere se extrajo a `ai/cohereClient.js` sin cambiar el comportamiento del diagnóstico. |
| 1.5.0 | 5 | Aditivo: tipo de dato `segments` (clave `segmentsData`) con campos `dimension`, `segment` y métricas extra (`customers`, `newCustomers`, `returningCustomers`, `items`, también aceptadas en otros tipos); error `INVALID_NUMBER`; `config.diagnostics`; claves `diagnosticSettings` y `cohereApiKey` (solo si el usuario pide recordarla); `analysis_export.json`. Reforecast: se calcula también el horizonte alterno para mostrarlos lado a lado. El formato `packed-v1` agrega un elemento opcional al final (compatible). |
| 1.4.0 | 4 | Aditivo: `config.reforecast`; claves `reforecastSettings` y `reforecasts:<año>`; corrida `reforecast_run`; versiones `rf_vN`; `reforecast_export.json`. El gráfico SVG de Pacing se extrajo a `ui/chart.js` sin cambiar su salida. Plan, forecast y sus versiones solo se leen. |
| 1.3.0 | 3 | Aditivo: `config.forecast`, `pacingStatusLabels`; claves `forecastSettings` y `forecasts:<año>`; corrida `forecast_run`; snapshots `forecast-<año>-vN`; `forecast_export.json` de Fase 3 como superconjunto del de Fase 0 (mismas claves + secciones nuevas). El plan (Fase 2) solo se lee. |
| 1.2.0 | 2 | Aditivo: `config.planning`, `confidenceLevels`, `planValueSources`; claves `planningSettings` y `plans:<año>`; `calendar.getCalendarDay`; alias `calculate*` e `isApproximatelyEqual` en metrics; celdas de plan `{value, source, status, confidence}`; `planning_export`. `consolidate()` acepta `planFallback` (plan distribuido original) para días sin plan importado. |
| 1.1.0 | 1 | Aditivo, sin romper 1.0.0: CanonicalRecord con celdas `{value, source}`; colecciones historical/plan/actual con lotes; catálogo de errores; `config.channels[].aliases`, `config.importFields`, `config.dataTypes`, `config.errorTypes`, `config.import`; claves de storage `historicalData`, `planData`, `actualData`, `settings` (empaquetadas); exportaciones `normalized_data`, `data_errors`, `data_quality`, `consolidated_data`. El Dataset de Fase 0 pasa de guardarse a derivarse (`consolidate`); la clave `dataset:<año>` se migra una vez y se elimina. |


---

# FASE 1 — Datos, carga y validación

## 10. Flujo de importación

```
Archivo CSV
  │ FileReader (UTF-8; si hay caracteres rotos, reintenta Windows-1252)
  ▼
csv.parse()            RAW: encabezados + filas de TEXTO con número de línea
  ▼
importer.stage()       sugiere mapeo, detecta formato de fechas         ← aún no toca el modelo
  ▼  (el usuario corrige mapeo, tipo de dato, opciones)
importer.process()     normaliza cada celda, construye registro canónico,
                       valida, detecta duplicados (archivo + almacenado)
  ▼  (vista previa, errores, resumen; el usuario confirma)
dataStore.commitBatch() guarda registros seleccionados + lote con TODOS sus issues
  ▼
dataStore.consolidate() Dataset día × canal (Fase 0) para Resumen y forecast futuro
coverage.summarize()    calidad y cobertura
```

- **Staging**: `state.staging.items` guarda los archivos en revisión (en memoria, no se persisten).
  Se admiten varios archivos a la vez y de distintos tipos (importación múltiple).
- Al confirmar un archivo se revalida contra lo guardado en ese momento y los pendientes
  se reprocesan (pueden duplicar lo recién importado).
- **Qué filas entran** (`importer.selectRows`):
  - sin fecha o canal válidos → nunca (no tienen llave);
  - con errores en métricas → solo si el usuario activa "Importar también filas con errores";
    el valor inválido se guarda como `invalid` con su texto original;
  - válidas y con advertencias → siempre.
- Las filas que no entran quedan registradas en `batch.issues` con `rowImported: false`.

## 11. Reglas de normalización (`FP.normalize`)

Cada función devuelve `{ status: ok | missing | invalid | ambiguous, value, raw, note }`.

**Fechas → `YYYY-MM-DD`**
- Año primero (`2026-9-1`, `2026/09/01`, `2026.09.01`) siempre se acepta y se reescribe.
- Se ignora una hora al final (`2026-09-21 00:00`).
- Año al final con `/`, `-` o `.`:
  - opción `DMY` o `MDY` elegida por el usuario → se aplica;
  - automático → solo si es inequívoca (un número > 12, o día = mes), con advertencia `NON_ISO_DATE`;
  - ambas lecturas posibles (`03/04/2026`) → `AMBIGUOUS_DATE` (error). **Nunca se adivina.**
- Años de 2 dígitos, texto y fechas imposibles (`2026-02-30`, `32/01/2026`, `2026-15-20`) → `INVALID_DATE`.
- `detectDateFormat()` revisa todas las fechas del archivo y sugiere un formato con su razón;
  la UI ofrece aplicarlo, pero el usuario decide.

**Números** (formato `dot` 1,234.56 por defecto; `comma` 1.234,56 opcional)
- Se quitan `$`, `MXN`, `USD`, espacios y espacios no separables.
- Separador de miles solo válido en grupos de 3 (`1,5` es inválido en `dot`).
- Negativos con `-` o contables `(2,500)`.
- `%` solo se acepta en CR y se divide entre 100.
- Vacío → `missing`. Texto → `invalid`. **Nunca se convierte a 0.**
- Nota: `FP.metrics.toNumberOrNull` (Fase 0) sigue siendo permisivo para uso interno; los
  archivos siempre pasan por `normalizeNumber`, que es estricto.

**Canales**: minúsculas, sin acentos, separadores unificados; se comparan contra
`config.channels[].aliases`. Todo lo demás → `INVALID_CHANNEL` (no se acepta en silencio).

**Tipo de día**: `regular/normal`, `festivo/holiday`, `evento/event`, `campaña/campaign`,
`especial/special`. Si falta, se infiere: con evento → `event`; con festivo → `holiday`; si no → `regular`.

**Encabezados**: minúsculas, sin acentos, todo lo no alfanumérico → `_`
(`"Meta Venta ($)"` → `meta_venta`), y se buscan en `config.importFields[].synonyms`.

## 12. Mapeo de columnas y contratos por tipo

Campos canónicos (`config.importFields`): `date, channel, revenue, orders, trafficVolume,
conversionRate, aov, event, holiday, season, dayType, notes`. Sinónimos incluidos, entre otros:
`fecha/date`, `venta/ventas/revenue/sales/meta_venta`, `pedidos/orders/ordenes/meta_pedidos`,
`sesiones/sessions/traffic/traffic_volume/mensajes/llamadas/meta_traffic_volume`,
`conversion_rate/cr/meta_conversion_rate`, `aov/ticket_promedio/meta_aov`, `tipo_dia`, `observaciones`.

| Tipo | Obligatorias | Plantilla |
|---|---|---|
| historical | fecha, canal, venta, pedidos, traffic_volume | fecha, canal, venta, pedidos, traffic_volume, conversion_rate, aov, evento, festivo, temporada, tipo_dia |
| plan | fecha, canal, meta_venta | fecha, canal, meta_venta, meta_pedidos, meta_traffic_volume, meta_conversion_rate, meta_aov |
| actual | fecha, canal, venta, pedidos, traffic_volume | fecha, canal, venta, pedidos, traffic_volume, conversion_rate, aov, evento, festivo, temporada, observaciones |

- El mapeo se sugiere; el usuario puede cambiar o ignorar cualquier columna.
- Falta una columna obligatoria → `MISSING_REQUIRED_COLUMN`; dos columnas al mismo campo →
  `DUPLICATE_MAPPING`. Ambos bloquean la importación.
- Cualquier tipo acepta cualquier campo canónico (p. ej. un plan con columna de evento).
- Plantillas: solo encabezados, UTF-8 con BOM para que Excel respete acentos.

## 13. Modelo canónico (CanonicalRecord)

```js
{
  key: "2026-09-21|ecommerce|actual",     // fecha + canal + tipo de dato
  dataType: "historical" | "plan" | "actual",
  date: "2026-09-21", channel: "ecommerce",
  dayType: "regular", holiday: null, event: null, season: null, notes: null,
  metrics: {
    revenue:        { value: 820000,  source: "observed" },
    orders:         { value: 410,     source: "observed" },
    trafficVolume:  { value: 24500,   source: "observed" },
    conversionRate: { value: 0.01673, source: "calculated" },
    aov:            { value: null,    source: "invalid", raw: "abc" }
  },
  status: "valid" | "warning" | "error",
  issueCounts: { error: 0, warning: 1 },
  provenance: { batchId: "bat-…", fileName: "actual_sep.csv", row: 2 }
}
```

**Estado de cada métrica (`source`)**
| source | Significado | value |
|---|---|---|
| observed | Venía en el archivo y se pudo leer | número (puede ser 0) |
| calculated | No venía; se derivó con el motor de Fase 0 | número |
| missing | No venía y no se puede derivar | null (+ `note` si la razón es división entre 0) |
| invalid | Venía pero no se pudo leer | null + `raw` con el texto original |

- **Falta de dato ≠ cero**: `0` es `observed`; celda vacía es `missing`.
- `raw` también se guarda cuando un valor observado se limpió (`"$500,000"` → 500000).
- Negativos quedan `observed` (y con error), pero **no** se usan para derivar otras métricas.
- Derivación: `FP.metrics.deriveBlock` (Fase 0). Solo rellena `missing`; jamás toca `observed` ni `invalid`.

**Colecciones y lotes** (`FP.dataStore`)
```js
store = {
  historical: { batches: [Batch], records: [CanonicalRecord] },
  plan:       { … },
  actual:     { … }
}
Batch = { id, dataType, fileName, importedAt, rowCount, accepted, rejected, includeErrorRows,
          settings, mapping, delimiter, summary, issues: [Issue + {batchId, fileName, dataType, rowImported}],
          origin? ("mock-fase0" | "migration") }
```

**Histórico vs actual**: ambos son venta real, pero viven separados. El histórico alimentará la
estacionalidad; el actual es el periodo en curso. No se mezclan en la consolidación.

## 14. Reglas de validación y estructura de errores

```js
Issue = { type, severity: "error" | "warning", row, field, message, value, key }
```
`row` = línea del archivo (el encabezado es la 1). `field` = encabezado original de la columna.
Catálogo en `config.errorTypes` (severidad por defecto):

| Tipo | Sev. | Cuándo |
|---|---|---|
| MISSING_DATE / INVALID_DATE / AMBIGUOUS_DATE | error | fecha vacía / imposible o ilegible / ambigua |
| NON_ISO_DATE | warning | fecha no ISO interpretada automáticamente |
| FUTURE_DATE | warning | histórico o actual con fecha posterior a hoy |
| MISSING_CHANNEL / INVALID_CHANNEL | error | canal vacío / no reconocido |
| INVALID_REVENUE / INVALID_ORDERS / INVALID_TRAFFIC | error | texto no numérico (warning si pedidos o volumen no son enteros) |
| NEGATIVE_REVENUE / NEGATIVE_ORDERS / NEGATIVE_TRAFFIC | error | valor negativo |
| INVALID_CONVERSION_RATE | error | CR ilegible, negativo o > 1 (sugiere si venía en %) |
| INVALID_AOV | error | AOV ilegible o negativo |
| MISSING_VALUE | warning | celda vacía en columna obligatoria |
| MATHEMATICAL_INCONSISTENCY | warning | CR o AOV cargados fuera de tolerancia; venta 0 con pedidos |
| MATHEMATICAL_INCONSISTENCY | **error** | pedidos con volumen 0; pedidos > volumen; venta con 0 pedidos |
| DUPLICATE_RECORD | warning | misma llave en el archivo o ya almacenada |
| INVALID_DAY_TYPE | warning | tipo_dia no reconocido (se infiere) |
| MALFORMED_ROW | warning | fila con distinto número de columnas que el encabezado |
| MISSING_REQUIRED_COLUMN / DUPLICATE_MAPPING | error | mapeo incompleto o repetido (bloquea) |

**Tolerancia**: `config.import.DATA_VALIDATION_TOLERANCE` = 0.01 (1 % relativo). Editable en
Carga de datos; se guarda en `settings.tolerance` y se registra en cada lote. Es el único
lugar donde vive ese valor. (Las tolerancias de `config.tolerances` de Fase 0 siguen
gobernando la tabla de validación del Resumen.)

**Estado del registro**: `error` si tiene algún issue error; `warning` si solo advertencias; si no, `valid`.

**Duplicados** (llave fecha + canal + tipo): se marca la segunda aparición dentro del archivo y
toda fila cuya llave ya esté guardada. **Nunca se eliminan**. La vista consolidada usa la carga
más reciente (`resolveLatest`); el usuario resuelve quitando el archivo sobrante.

## 15. Cobertura y calidad (`FP.coverage`)

- **Temporal**: rango = primera a última fecha de la colección; días disponibles = fechas con al
  menos un registro; cobertura = disponibles ÷ esperados.
- **Por canal**: días con registro del canal ÷ días del rango. Canales sin datos = canales con 0 días.
- **Por métrica**: % de registros (uno por llave) con valor, separando observado y calculado.
- Registros con venta 0 se reportan aparte: cuentan como cubiertos.
- **Estado general** (el peor entre colecciones con datos), siempre con texto:
  - `Datos no válidos`: filas rechazadas o registros importados con error;
  - `Datos con advertencias`: advertencias, duplicados, fechas faltantes o canales faltantes;
  - `Datos listos`: nada de lo anterior;
  - `Sin datos`.

## 16. Consolidación y relación con Fase 0

`dataStore.consolidate(store, año)` crea el Dataset de Fase 0: un DailyRecord por fecha + canal,
`plan` desde planData y `actual` desde actualData (última carga en duplicados; solo valores
`observed`, lo calculado se re-deriva con el mismo motor, los `invalid` no pasan). Así la tabla
de validación, el export `forecast_export` y cualquier módulo de Fase 0 funcionan sobre datos reales.

- El botón "Generar datos de prueba" (Fase 0) ahora pasa por el pipeline como dos lotes con
  `origin: "mock-fase0"`, que se reemplazan al volver a generarlos.
- Migración: si existe la clave antigua `dataset:<año>` y no hay datos importados, se importa
  una vez como lotes `origin: "migration"` y la clave se elimina.
- El Original Plan congelado de Fase 0 no se modifica al importar planes.

## 17. Estrategia de almacenamiento

| Clave (`fp.v1:…`) | Contenido | Alcance |
|---|---|---|
| `historicalData`, `planData`, `actualData` | colección empaquetada `packed-v1` | global (cruza años) |
| `settings` | tolerancia, formato de fecha y número, incluir filas con error | global |
| `targets:<año>`, `versions:<año>`, `events:<año>`, `milestones:<año>` | Fase 0 | por año |

- Formato `packed-v1`: cada registro como arreglo (`[fecha, canal, tipo_día, …, [valor, código_origen, raw?, note?] × 5]`),
  ~5× más compacto que JSON plano; ida y vuelta sin pérdida (probado en self-test).
- No se guarda el CSV crudo; sí se guarda por lote el mapeo, las opciones y todos los issues.
- Si localStorage se llena o no existe, la app avisa y sigue en memoria; el usuario puede exportar el JSON.

## 18. Estrategia de exportación

| Archivo | Esquema | Contenido |
|---|---|---|
| `normalized_data_<fecha>.json` | `normalized_data` | lotes y registros canónicos de las tres colecciones (celdas con `value`/`source`/`raw`) |
| `data_errors_<fecha>.json` | `data_errors` | catálogo + todos los issues, incluidos los de filas no importadas |
| `data_quality_<fecha>.json` | `data_quality` | resumen de calidad y cobertura |
| `consolidated_data_<fecha>.json` | `consolidated_data` | por año, el `forecast_export` de Fase 0 sobre el Dataset consolidado |
| `normalized_<tipo>_<fecha>.csv` | — | CSV plano de una colección, con columna `_source` por métrica |
| `plantilla_<tipo>.csv` | — | solo encabezados |

Todos los JSON llevan `schema`, `schemaVersion`, `generatedAt` y `source`. Salida en snake_case.
Las descargas usan Blob + enlace temporal (`exporter.download`), válidas en GitHub Pages y `file://`.
El CSV normalizado usa `csv.stringify`, reutilizable para futuras exportaciones CSV.


---

# FASE 2 — Estacionalidad, pesos y distribución de metas

Pregunta que responde: *dada la meta y el histórico, ¿cómo debería repartirse en el tiempo y por canal?*
No proyecta cierre ni hace reforecast.

## 19. Módulos y responsabilidades

| Módulo | Responsabilidad | No hace |
|---|---|---|
| `calculations/weights.js` | Estadística robusta pura: media, mediana, MAD, límites de extremos, winsorizado, media recortada, encogimiento, `normalizeWeights`, niveles de confianza | No sabe de canales ni fechas |
| `calculations/seasonality.js` | Perfil por canal: pesos mensuales, día de semana, día del mes, eventos, festivos, temporadas, supuestos de CR y AOV por mes | No distribuye metas |
| `forecast/distribution.js` | `distributeTarget` (mayor residuo), `normalizeDistribution`, `exactSum` | No conoce el negocio |
| `forecast/planningEngine.js` | `generatePlan`, `generateAnnualPlan`, `generateMonthlyPlan`, `generateWeeklyPlan`, `generateDailyPlan`, `validatePlanClosure`, `compareMethods`, versionado del plan | No hace forecast |
| `export/planningExport.js` | `planning_export.json` | — |
| `calendar.getCalendarDay` | Día de calendario completo (ver §27) | — |

Las fórmulas de métricas siguen en un solo lugar (`metrics.js`). Fase 2 agregó alias con los nombres
del brief (`calculateOrders`, `calculateRevenue`, `calculateConversionRate`, `calculateAOV`,
`calculateTrafficVolume`, `calculateOrdersFromRevenue`) que apuntan a las mismas funciones, e
`isApproximatelyEqual(a, b, tol)` con tolerancia técnica configurable.

## 20. Modelo de estacionalidad (`FP.seasonality`)

Por canal y sobre venta **observada** del histórico (Fase 1, un registro por llave):

```
venta(día) ≈ base(año, mes) × F_díaSemana × F_calendario × F_evento × F_temporada
```

- **base(año, mes)**: promedio de los días regulares (sin evento ni festivo) de ese mes y año.
  Quita tendencia y efecto mensual para que los demás factores no los absorban.
- **Peso mensual**: índice de venta diaria del mes ÷ promedio anual, solo en **años completos**
  (cada mes con ≥ `monthMinCoverage` de días). Años parciales no cuentan para el mensual pero sí
  para los demás factores. Al distribuir se multiplica por los días del mes del año planeado,
  así febrero bisiesto recibe su día extra.
- **Día de la semana**: ratio día ÷ base, agrupado lunes…domingo, excluye días con evento o
  festivo, centro robusto; los 7 factores promedian 1. Cada canal tiene los suyos.
- **Día del mes (calendario)**: ratio ÷ F_díaSemana agrupado por día 1…31. Solo se aplica si el
  efecto supera `calendarEvidenceZ` errores estándar **y** `calendarMinEffect`; además se encoge.
  **No se asume quincena**: aparece solo si los datos la muestran. Se resumen segmentos inicio (1–3),
  quincena (14–16) y fin (28–31) como referencia.
- **Eventos y festivos**: ratio de los días marcados contra base × F_díaSemana, por nombre.
  Festivos sin muestra propia usan el factor "Festivo (general)". Acotados a `eventFactorBounds`.
- **Temporadas**: contraste contra días del mismo mes sin temporada. Si la temporada cubre meses
  completos no hay contraste; el efecto ya está en el peso mensual y el factor queda en 1 (se informa).
- **CR y AOV por mes**: razón de sumas (Σpedidos ÷ Σvolumen, Σventa ÷ Σpedidos) del histórico;
  si el mes no tiene datos, el promedio del canal; si no hay nada, el supuesto manual; si tampoco,
  `insufficient_data`.

**Eventos del año planeado**: vienen de planData/actualData del año (evento, festivo, temporada,
tipo_dia) y de los eventos configurados (Fase 0). **No se inventan**: un evento sin histórico
recibe factor 1 y se marca.

## 21. Suavizado y robustez (`FP.weights`)

1. **Calcular** los ratios históricos (copias; los registros originales no se tocan).
2. **Detectar extremos**: fuera de mediana ± k·σ̂, con σ̂ = MAD × 1.4826 (`outlierMadK`, default 3).
3. **Suavizar** según `smoothing`: `winsorized_mean` (recorta al límite y promedia, default),
   `trimmed_mean` (`trimShare`), `median` o `none`.
4. **Encoger hacia 1** según muestra: `f = 1 + (f_raw − 1) × n / (n + shrinkageK)`. Grupos con menos de
   `minSamples` no se aplican (factor 1, confianza insuficiente).
5. **Normalizar** de nuevo (día de semana promedia 1; los pesos diarios de cada mes suman 1).

## 22. Suficiencia y confianza

| Componente | Base de la confianza | Umbrales (configurables) |
|---|---|---|
| General / mensual | años completos | ≥3 excelente, ≥2 suficiente, ≥1 limitada, <1 insuficiente (`yearThresholds`) |
| Día de semana | observaciones | 104 / 52 / 8 (`sampleThresholds.dayOfWeek`) |
| Día del mes | observaciones | 36 / 24 / 12 (`sampleThresholds.calendar`) |
| Eventos | años en que ocurrió + `minSamples` días | 3 / 2 / 1 (`eventYearThresholds`) |

Con confianza insuficiente el componente **no se usa como si fuera robusto**: se omite (factor 1) o,
en el mensual, se reparte por días (`fallback`). La confianza viaja en cada celda del plan.

## 23. Distribución y prioridad de fuentes

```
Meta anual por canal (Original Target) — nunca se modifica
  ↓  meses explícitos se fijan; el remanente se reparte con peso mensual (o por días si no hay histórico)
Meta mensual
  ↓  días explícitos (planData) se fijan; el remanente se reparte con el peso diario
Plan diario
  ↓  agregación
Plan semanal (ISO) y totales
```

Peso diario (método D):

```
w(día) = F_díaSemana^α₁ × F_calendario^α₂ × F_evento^α₃ × F_temporada^α₄
w_normalizado = w / Σ w (del mes)
meta_día = meta_mes × w_normalizado      (repartido exacto con mayor residuo)
```

α = `componentWeights` (0 a 1). En el mensual, α mezcla el peso histórico con el reparto por días.

Prioridad (de mayor a menor), cada valor guarda su `source`:
1. meta diaria importada (`explicit_plan`), si `useExplicitPlan` está activo;
2. meta mensual explícita (`user_target`, o un mes completo importado → `explicit_plan`);
3. peso histórico mensual (`historical_seasonality`);
4. peso histórico diario (`historical_seasonality`);
5. reparto estándar por días (`fallback`).

La historia solo reparte lo que el usuario no definió. Si lo importado supera la meta del mes, el
remanente es 0 y se reporta un conflicto (no se ajusta la meta).

**Meta anual del canal**: la del usuario (Resumen → Meta anual). Si no hay y el plan importado cubre
todo el año, su suma. Si no hay ninguna, el canal queda `no_target` (no se reparte la meta total por
mezcla histórica en esta fase).

**Semanas**: ISO 8601. Son agregación de días, no un nivel de reparto, para que una semana que cruza
meses nunca rompa el cierre mensual; cada semana informa su desglose por mes.

## 24. Cierre exacto (`FP.distribution`)

Método del mayor residuo (Hamilton) en unidades enteras: centavos para dinero, unidades para pedidos y
volumen. Se asigna `floor(total × peso)` y las unidades sobrantes van, una por parte, a los mayores
residuos. Resultado: **Σ partes = total exacto**, sin tocar la meta y sin cargar el redondeo a un
solo día. Por eso una diferencia en el cierre nunca es de redondeo: es real (p. ej. plan importado ≠ meta).

`validatePlanClosure` verifica con `isApproximatelyEqual` (tolerancia técnica): Σ meses = meta anual,
Σ días = meta mensual por mes, Σ plan del canal = meta del canal, Σ canales = meta digital, y la
coherencia pedidos ↔ venta ÷ AOV y volumen ↔ pedidos ÷ CR.

## 25. Pedidos, volumen, CR y AOV

```
meta de venta del mes + AOV supuesto (histórico del mes)  → pedidos del mes (enteros)
pedidos del mes + CR supuesto (histórico del mes)          → volumen del mes (enteros)
pedidos y volumen se reparten a los días en proporción a la venta (mayor residuo)
CR diario = pedidos ÷ volumen;  AOV diario = venta ÷ pedidos   (recalculados: identidad exacta)
```

Sin AOV o CR (sin histórico ni supuesto manual): pedidos y volumen quedan `null` con status
`insufficient_data`. **Nunca 0.** Si el supuesto viene del promedio del canal (el mes no tiene datos) o de un supuesto manual, el status es `calculated_with_assumption`.

## 26. Celda del plan y trazabilidad

```js
plan.revenue = { value: 257308.84, source: "historical_seasonality", status: "calculated", confidence: "limited" }
```

| source | Significado |
|---|---|
| explicit_plan | venía en el plan importado |
| user_target | meta capturada por el usuario |
| historical_seasonality | repartido con pesos históricos |
| historical_average | supuesto de CR/AOV del histórico |
| calculated | derivado con las fórmulas del motor |
| user_assumption | supuesto manual de CR/AOV |
| fallback | reparto estándar por días |
| insufficient_data | no se pudo calcular (value null) |

status: `loaded`, `calculated`, `calculated_with_assumption`, `insufficient_data`.

**Auditoría** (`plan.audit`): `generatedAt`, `algorithmVersion` (`planning-v1`), `historicalPeriod`
(modo, desde/hasta, años completos, registros), `channels`, `distributionMethod`, `components`,
`assumptions`, `settings` usados y `confidence` por canal y general. Con esto un plan se reproduce.

## 27. Calendario

`calendar.getCalendarDay(date, tags)` devuelve los atributos de Fase 0 más `dayOfWeekLabel`,
`dayOfMonth`, `daysInMonth`, `daysFromMonthEnd`, `weekStart`, `weekEnd` (lunes y domingo de la semana
ISO), `isLeapYear`, `holiday`, `isHoliday`, `event`, `season`, `dayType`. La semana sigue definida
solo en `getWeekInfo` (ISO 8601); `month` es siempre el mes del día.

## 28. Plan vs forecast, versiones e integridad

- La vista Plan genera una **vista previa** (no se guarda) con meta, método, histórico y confianza.
- "Guardar": la **primera** versión del año es el **Plan distribuido original** y se congela
  (`Object.freeze` profundo, `type: original_distributed_plan`). Las siguientes son **Revisiones**
  (`plan_revision`). Nada se sobrescribe. Se guardan en `plans:<año>` (formato compacto por día).
- El Original Target (metas) y el Original Plan de Fase 0 no se modifican.
- `consolidate()` usa el plan original distribuido como `record.plan` en los días sin plan
  importado, así Resumen compara plan vs real con el plan distribuido.
- Para la siguiente fase: `FP.planning.getOriginalPlan(registry)` entrega la línea base; el
  forecast deberá generarse como versión **independiente** sin tocar `plan`.

## 29. Configuración, comparación y exportación

- **Configuración de planeación** (`planningSettings`): método aplicado, periodo histórico
  (anterior al año planeado, todo o personalizado), respetar plan importado, suavizado, k de
  extremos, encogimiento, mínimo de muestras, cobertura mínima por mes, intensidad de cada
  componente y supuestos manuales de CR/AOV. Valores por defecto solo en `config.planning`.
- **Comparación de métodos** A (uniforme), B (mensual), C (mensual + día de semana), D (histórico +
  calendario + eventos): cobertura, confianza y diferencia vs histórico (WAPE mensual y diario al
  repartir el último año completo y compararlo con lo ocurrido). Es ajuste dentro de muestra: sirve
  para comparar métodos entre sí. **La app no elige ganador**; se marca el método en uso.
- **`planning_export.json`**: `metadata` (versión, auditoría), `targets`, `annual_plan`,
  `total_digital`, `monthly_plan`, `weekly_plan`, `daily_plan` (celdas con source/status/confidence),
  `seasonality`, `assumptions`, `validation`. Pensado para que el diagnóstico lo lea en una fase futura.

**No implementado (por diseño)**: reforecast, redistribución del gap, forecast diario dinámico,
escenarios, simulación, diagnóstico, Cohere/IA, GA4, conexión con la app de diagnóstico,
`analysis_export.json`. Cohere nunca calculará metas, pesos ni métricas.


---

# FASE 3 — Actual vs plan, pacing y forecast

Responde: ¿qué debíamos vender (plan), qué vendimos (actual), cómo vamos (pacing/gap), qué proyectamos
cerrar (forecast) y qué tan lejos queda de la meta (forecast gap)? No responde qué hacer para recuperar.

## 30. Tres estados separados

| Estado | Fuente | Regla |
|---|---|---|
| plan | Plan distribuido **original** de Fase 2 (congelado). Si no existe, el plan importado (planData) del Dataset consolidado | Solo lectura. El motor copia valores; nunca escribe sobre el objeto del plan (probado en self-test) |
| actual | actualData (última carga por llave) + historicalData del mismo año en días sin actual (`useHistoricalAsActual`) | Observado o calculado; nunca inválido. Faltante ≠ 0 |
| forecast | día contado → su actual; día no contado → proyección del método sobre el plan diario | Vive en su propio campo y en versiones propias |

## 31. Fecha de referencia, corte y periodos (`FP.pacing`)

- `referenceDate` (Parámetros; vacío = fecha del dispositivo). Fijarla reproduce un análisis pasado.
- `todayStatus`: `completed` → corte = referencia; `in_progress` → corte = referencia − 1 (la carga de
  hoy es parcial: se muestra como "parcial, no cuenta").
- Día: `past` / `today` / `future` respecto a la referencia. **Contado** = día ≤ corte con venta real.
- Periodo (mes, semana, año, evento): `closed` (todos sus días ≤ corte), `current`, `future`.
- Días cerrados sin real: no entran al pacing, se proyectan con el método y generan alerta.

## 32. Pacing y gap (`FP.gap`, `FP.pacing`)

```
gap           = actual − plan
gapPct        = (actual − plan) ÷ plan          (plan 0 → null)
cumplimiento  = actual ÷ plan                   (plan 0 → null)
forecastGap   = forecast − plan del periodo completo
```

- **Gap a la fecha** compara el actual contra el plan de **los mismos días contados**. Como el plan
  diario viene ponderado (Fase 2), el plan acumulado nunca es "días transcurridos ÷ días totales".
- **Gap esperado al cierre** (forecast gap) es otra cosa y vive en otro campo.
- Capa explícita `gap`: `dailyGap`, `cumulativeGap`, `monthlyGap`, `annualGap`, `forecastGap`.
- CR y AOV del periodo = razón de sumas. Sumas estrictas: si un día trae la métrica en null, el total es
  null (datos insuficientes), nunca cero.
- **Semáforo** (`pacingThresholds`, configurable): cumplimiento ≥ `aboveFrom` (101 %) → Arriba del plan;
  ≥ `onPlanFrom` (99 %) → En plan; menor → Debajo del plan; sin dato → Datos insuficientes. Es un estado
  matemático, no un juicio sobre la causa.

## 33. Performance index (`FP.performanceIndex`)

`calculatePerformanceIndex(rows, { metric, from, to })` = Σactual ÷ Σplan sobre los días comparables de la
ventana. CR: (Σpedidos ÷ Σvolumen)real ÷ (Σpedidos ÷ Σvolumen)plan; AOV igual con venta ÷ pedidos.
Ventanas (`config.forecast.windows`), todas terminando en el corte: acumulado del año, mes en curso,
últimos 7, 14 y 28 días. Se calculan por canal, total digital y métrica. Suficiencia: ≥ `minComparableDays`
días y ≥ `minWindowCoverage` de cobertura; si no, `insufficient_data` y valor null (nunca 1 ni 0 por defecto).
La app muestra acumulado y reciente juntos; **no decide cuál es la correcta**.

## 34. Métodos de forecast (`FP.forecastMethods`)

| Método | Día no contado | Supuestos |
|---|---|---|
| A · Plan restante (baseline) | forecast = plan del día | ninguno |
| B · Performance acumulada | venta, pedidos y volumen = plan × su índice YTD; CR y AOV desde las sumas | índices YTD |
| C · Performance reciente | igual con la ventana `recentWindow` (28 días) | índices recientes |
| D · Por drivers | volumen = plan_vol × iVol; CR = plan_CR × iCR; AOV = plan_AOV × iAOV; **pedidos = volumen × CR; venta = pedidos × AOV** | ventana por driver (`driverWindows`) |

- **Sin doble conteo**: en D los índices solo tocan los drivers primarios (volumen, CR, AOV) y pedidos y
  venta se derivan. Nunca venta = plan × iVol × iCR × iAOV × iVenta.
- Todos conservan el patrón diario del plan (estacionalidad de Fase 2): nunca "restante ÷ días restantes".
- Índice sin datos suficientes → ese driver usa 1 (plan) y el día queda marcado `fallback` con el motivo.
- La app compara A–D (forecast, diferencia vs plan, supuestos, confianza) y **no elige ganador**.
- Confianza: A no aplica; B–D según el mínimo de días comparables de sus índices (≥90 excelente, ≥28 suficiente, menor limitada; sin índice, insuficiente).

## 35. Forecast por nivel

```
forecast del día      = actual (contado) | proyección del método (no contado)
forecast del mes      = Σ días → cerrado: = actual; en curso: actual acumulado + forecast de días restantes; futuro: Σ proyección
forecast del año      = Σ meses (cerrados reales + en curso + futuros con su estacionalidad)
forecast del total    = Σ canales día por día (el índice del total se muestra, no se usa para proyectar)
```

Cada canal se proyecta con sus propios índices: cambiar el real de Ecommerce no mueve App (probado).
Semanas ISO: agregación de días; una semana que cruza meses se reporta completa en ambos meses.

## 36. Motor central (`FP.forecastEngine`)

- `runForecast({ year, store, planVersion, dataset, events, settings })` → `forecast_run` con `channels`,
  `total`, `comparison` (A–D), `events`, `alerts`, `plan` (fuente, versión), `referenceDate`, `cutoff`,
  `method`, `settings` efectivos y `algorithmVersion` (`forecast-v1`).
- `generateForecast({ run | …, channel, period: { type: year|month|week, key }, method })` → la API del brief:
  `{ plan, actual, gap, performance, forecast, forecastGap, assumptions, method, confidence }`.
- Eventos: etiquetas del año desde planData, actualData, historicalData del año (si cuenta como real) y
  eventos configurados. Por evento: plan, actual, gap, forecast y una observación descriptiva
  ("durante el periodo se observó un gap de X %"). **No se asume causalidad.**
- Alertas descriptivas (`config.forecast.alerts`): gap creciente o decreciente (racha de N días), performance
  reciente distinta a la acumulada, forecast alejado del plan, días pasados sin real. Sin recomendaciones.

## 37. Versionado, cambio y accuracy (`FP.forecastVersioning`)

- "Guardar forecast" crea `{ forecastVersion: 'vN', generatedAt, referenceDate, cutoff, todayStatus,
  algorithmVersion, method, plan, assumptions, results }` congelado. Nunca se sobrescribe. Se guarda en
  `forecasts:<año>` (resultados por mes y anuales por canal; los diarios se regeneran).
- **Forecast change**: forecast actual vs la última versión (del mismo método si existe).
- **Accuracy** (preparado): para cada versión solo se evalúan meses que estaban abiertos en su fecha de
  corte y hoy ya cerraron completos, así nunca se usa información que no existía. Error, APE, MAPE, bias y
  accuracy = 1 − MAPE. Sin meses evaluables: `insufficient_data`.

## 38. Vista Pacing & Forecast

Controles (fecha de referencia, atajo "último día con real", día completo o en curso, método, métrica),
tablero total y por canal (meta, plan a la fecha, actual, cumplimiento, gap, forecast, gap forecast, estado),
tendencia acumulada en SVG (plan, actual, forecast y línea de corte), tablas por mes, semana y día (con
"todos los canales"), índices por ventana, comparación de métodos, alertas, eventos, versiones y parámetros.
El selector de métrica aplica a Revenue, Orders, Traffic, CR y AOV.

## 39. forecast_export.json

Superconjunto del contrato de Fase 0: conserva `schema, schemaVersion, generatedAt, source, period,
channels, metrics_definition, targets, records[]` (ahora con `forecast` lleno) y agrega `metadata`,
`referenceDate`, `forecastVersion`, `plan`, `actual`, `pacing`, `forecast`, `gaps`, `performance`,
`assumptions`, `method_comparison`, `forecast_change`, `events`, `alerts`. Pensado para la futura app de
diagnóstico (gap → driver → hipótesis → acción); no hay integración automática.

## 40. Fuera de alcance (por diseño)

Reforecast dinámico con redistribución del gap, escenarios, recomendaciones, diagnóstico, Cohere/IA
(nunca calculará forecast, gap, índices ni métricas), GA4 y conexión automática con el diagnóstico.
La siguiente fase leerá `plan` + `actual` + `forecast` + `gap` y creará el reforecast como versión nueva,
sin tocar el plan original.


---

# FASE 4 — Reforecast dinámico y recuperación

Pregunta: *con lo que ya ocurrió, ¿qué tendría que venderse en cada día futuro para llegar a la meta
original?* Solo matemática; no diagnóstico, hipótesis ni recomendaciones.

## 41. Tres realidades separadas

| Estado | Qué es | Dónde vive |
|---|---|---|
| plan | Lo que debíamos vender. Nunca cambia | Plan distribuido original (Fase 2), solo lectura |
| forecast | Lo que estimamos que ocurrirá (actual + proyección del método) | `forecast_run` (Fase 3) |
| reforecast | Lo que **tendría** que ocurrir para conservar la meta: real congelado + pendiente redistribuido | `reforecast_run` (Fase 4) |

Reforecast ≠ forecast: un reforecast requerido de $100M con forecast de $94M no significa que se venderán $100M.

## 42. Flujo (`FP.reforecastEngine.runReforecast`)

```
1 leer plan original     2 leer actual acumulado (días contados ≤ corte)
3 identificar periodo abierto (horizonte)        4 pendiente = max(0, meta − actual); surplus = max(0, actual − meta)
5 pesos futuros (FP.futureWeights)   6 excluir días cerrados   7 normalizar sobre los días restantes
8 repartir el pendiente al centavo (mayor residuo)   9 validar actual + Σ requerido = meta
10 pedidos y volumen requeridos por AOV y CR   11 guardar versión (FP.reforecastVersioning)
```

Se ejecuta por canal de forma independiente; el total digital es la suma de canales día por día.
El pendiente de un canal no se compensa con el surplus de otro. Se recalcula automáticamente cuando
cambia el forecast (nuevo real, plan, año, fecha de referencia o ajustes): actual → pacing → gap →
forecast → reforecast, sin tocar el plan.

## 43. Horizonte del pendiente (`config.reforecast.horizon`)

| Horizonte | Pendiente | Días que lo reciben | Meses futuros | Cierra |
|---|---|---|---|---|
| `year` (default) | meta anual del canal − actual YTD | todos los días futuros del año | reciben requerido | la meta anual |
| `month` | meta del mes en curso − actual del mes | días futuros del mes en curso | = plan original | la meta del mes |

**Ajuste posterior (Fase 5):** el default sigue siendo `year`, pero la vista calcula siempre los dos
horizontes y los muestra lado a lado (meta, actual, forecast, requerido, días y presión del año y del mes en
curso). El selector solo decide cuál alimenta las tablas y el gráfico. Así el gap de meses cerrados nunca
desaparece de la vista y la cifra operativa del mes siempre está a mano. Razón: con el modo año, un gap se
reparte más en los meses de mayor peso (Buen Fin, diciembre); ver ambos evita que el requerimiento parezca
"alcanzable después".

Con `month` se sigue literalmente la lógica "meses cerrados = actual; mes actual = actual + requerido;
meses futuros = plan". El año solo cierra si los meses cerrados no dejaron gap; esa diferencia se ve
en el reforecast anual y no se esconde. Con `year` el gap de meses cerrados sí se redistribuye y el año cierra.

## 44. Pesos futuros (`FP.futureWeights`)

`Seasonality Engine → Plan distribuido → Future Weights → Reforecast Engine`. No hay lógica de
estacionalidad nueva: el peso futuro de un día es su venta en el plan original, que es exactamente
meta_mes × peso diario normalizado de Fase 2.

```
peso_normalizado(d) = plan(d) / Σ plan(días futuros del horizonte)
requerido(d)        = pendiente × peso_normalizado(d)
```

- Cada peso lleva la fuente y confianza de su celda del plan (`historical_seasonality`, `fallback`, `explicit_plan`).
- Peso 0 → el día recibe 0, salvo `zeroWeightFloor` > 0 (mínimo explícito: múltiplo del peso promedio).
- Sin pesos utilizables → `uniform_future_distribution` (configurable), confianza limitada.
- Nunca "pendiente ÷ días restantes" si los días tienen pesos distintos.

## 45. Días congelados, parciales y pasados sin real

- Día contado (≤ corte con real): **congelado**; su reforecast es el actual y nunca se redistribuye.
- Día de referencia en curso (`todayStatus = in_progress`, el mismo ajuste de Fase 3): no está cerrado;
  recibe requerimiento y su real parcial se muestra como avance, sin descontarse del pendiente.
- Día pasado sin real: no se puede vender ni congelar con un valor; queda en null, no recibe
  requerimiento, se cuenta aparte y baja la confianza.
- Sin días futuros (referencia al final del periodo): el pendiente queda reportado (alcanzado o no) y el requerido es 0.

## 46. Métricas de recuperación

| Métrica | Fórmula | Nota |
|---|---|---|
| Remaining target | max(0, meta − actual acumulado) | por canal, mes, semana y año (`targetRemaining`) y del horizonte |
| Surplus | max(0, actual − meta) | se registra aparte; los días futuros se conservan con requerido 0 |
| Surplus vs plan a la fecha | max(0, actual − plan acumulado) | adelanto contra el plan; reduce el pendiente |
| Recuperación requerida | Σ requerido de los días futuros | venta que tendría que ocurrir |
| Recovery gap | requerido − plan original de esos mismos días | + = hay que recuperar; − = hay margen |
| Recovery pressure | requerido ÷ plan de esos días − 1 | descriptiva, no una recomendación |
| Venta adicional requerida | meta − forecast del periodo | escenario de recuperación: lo necesario vs lo esperado |

Para pedidos, volumen, CR y AOV la presión compara el requerido de cada métrica contra el plan.

## 47. Drivers, escenarios y realismo

- **Cadena**: venta requerida ÷ AOV → pedidos requeridos ÷ CR → volumen requerido. Fuente de AOV y CR
  (`assumptionSource`): plan original del día (default), forecast del día o real acumulado del año; se registra.
  Sin AOV o CR: pedidos y volumen null (`insufficient_data`), nunca 0.
- **Qué tendría que cambiar** (vs forecast): venta adicional, pedidos adicionales con AOV constante,
  volumen adicional con CR y AOV constantes.
- **Escenarios** (solo matemáticos, base = forecast de los mismos días): A volumen requerido con CR y AOV
  del forecast; B CR requerido con volumen y AOV del forecast; C AOV requerido con volumen y CR del forecast.
  No se elige ninguno ni se asignan probabilidades.
- **Realismo**: requerido vs histórico de los mismos días del calendario en años anteriores (CR y AOV
  como razón de sumas; volumen como promedio por año), junto al forecast y al plan.

## 48. Confianza

Componentes: pesos futuros (confianza de la estacionalidad del plan; limitada si hay reparto estándar o
uniforme), días futuros, días con real en el horizonte, días pasados sin real y consistencia de métricas
(AOV y CR disponibles). El nivel es el más bajo de los componentes. **No es una probabilidad de alcanzar la meta.**

## 49. Versiones, evolución y simulación

- "Guardar reforecast" crea `{ reforecastVersion: 'rf_vN', generatedAt, referenceDate, cutoff, simulated,
  horizon, method: 'future_weighted_distribution', planVersion, forecastVersion, assumptionSource, results,
  validation }` congelado en `reforecasts:<año>`. `forecastVersion` apunta a la última versión guardada del
  forecast si coincide en fecha y método; si no, se anota que el forecast se calculó al momento.
- **Evolución**: versión, referencia, horizonte, forecast, reforecast, gap forecast, requerido, presión y cambio.
- **Reforecast change** = requerido actual − requerido de la versión anterior (y el mismo cálculo del cierre).
  Se marca cuando el horizonte difiere. No se interpreta la causa.
- **Simulación**: fecha de referencia temporal para la vista. Recalcula forecast y reforecast ignorando el
  real posterior, sin modificar datos ni la fecha de referencia de Pacing. Las versiones guardadas desde una
  simulación quedan marcadas `simulated`.

## 50. Exportación y conexión futura

`reforecast_export.json`: `metadata, referenceDate, plan, actual, forecast, reforecast (horizonte, anual,
meses, semanas, diario con peso normalizado), remainingTarget, surplus, recoveryGap, recoveryPressure,
driverRequirements, versions, reforecastChange, assumptions, confidence, validation`.
Preparado para: plan → actual → gap → forecast → reforecast → requerimiento por driver → diagnóstico.
Fuera de alcance: diagnóstico, hipótesis, recomendaciones, IA (Cohere nunca calculará valores), atribución
causal, campañas y conexión definitiva con la app de diagnóstico.


---

# FASE 5 — Diagnóstico de drivers: brecha → driver → señal → hipótesis

Pregunta: *¿qué variables explican la diferencia entre el resultado y su referencia?* Regla central:
primero demostrar la brecha, después cuantificar el driver, después encontrar la señal, después formular
la hipótesis. Nunca saltarse pasos. Termina en "qué validar"; no hay acciones ni recomendaciones.

## 51. Hecho, driver, señal, hipótesis

| Pieza | Qué es | Ejemplo de redacción |
|---|---|---|
| Hecho | Dato observado | "Venta actual $5.5 M vs $5.46 M plan (+1.1 %)" |
| Driver | Variable con contribución matemática | "Volumen representa la mayor contribución matemática a la brecha observada bajo el método seleccionado" |
| Señal | Comportamiento cuantificado que merece investigación | "Dispositivo Mobile · CR 0.80 % vs 0.89 % (−10.3 %), peso 45.7 %" |
| Hipótesis | Explicación posible, siempre "requiere investigación" | "La caída de CR en Mobile podría estar contribuyendo…" |

Nunca "X es la causa" ni "el problema está en X".

## 52. Comparaciones (`FP.driverEngine`)

Todas se reducen a **pares diarios** `{ date, channel, current, baseline }`; el resto del motor es el
mismo para todas (sin duplicar código). El usuario elige; nunca se mezclan.

| Comparación | Días | current | baseline |
|---|---|---|---|
| actual_vs_plan | contados del periodo | actual | plan de esos días |
| forecast_vs_plan | todos los del periodo | forecast (Fase 3) | plan |
| actual_vs_previous | contados | actual | actual del periodo anterior equivalente (mes: mismo día del mes anterior; semana: 7 días antes; año: año anterior) |
| actual_vs_yoy | contados | actual | actual del mismo día del año anterior |
| reforecast_vs_forecast | futuros del horizonte | requerido (Fase 4) | forecast |

Periodo: mes, semana ISO o año. Canal: total o uno. Métrica: venta (volumen × CR × AOV) o pedidos (volumen × CR).
Botones "Diagnosticar gap" (Pacing & Forecast) y "Diagnosticar recuperación" (Reforecast) abren el
diagnóstico ya configurado con forecast vs plan o requerido vs forecast.

## 53. Nivel 1 — atribución (`FP.attribution`)

Venta = volumen × CR × AOV (pedidos = volumen × CR), con CR y AOV como razón de sumas del periodo.

- **Secuencial** (default, orden configurable `attributionOrder`):
  volumen = (T1 − T0)·CR0·AOV0; CR = T1·(CR1 − CR0)·AOV0; AOV = T1·CR1·(AOV1 − AOV0).
  Suma telescópica: cierra exacto. Depende del orden (se informa).
- **Shapley** (simétrico): promedio de las contribuciones secuenciales sobre todos los órdenes. También cierra.
- Validación: Σ contribuciones = current − baseline (tolerancia técnica); se muestra.
- **Driver principal** = mayor contribución absoluta. **Contribuciones negativas** y **offsets positivos**
  se muestran por separado para ver compensaciones.

## 54. Nivel 2 — descomposición por dimensión

Estructura genérica por grupo: `{ dimension, value, metric, current, baseline, delta, deltaPct, contribution, exposure }`.

- Dimensiones **core** (siempre disponibles): canal (en total digital), tipo de día / evento, día de la semana, semana ISO.
- Dimensiones de **segmentos** (tipo de dato opcional `segments`): device, source, medium, campaign,
  landing, geography, customer_type, category, product, search, checkout, payment, delivery, discount y
  cualquier otra que venga en el archivo. `config.diagnostics.dimensions` dice qué drivers ayuda a explicar cada una.
- **Data-driven**: solo se muestran dimensiones con datos; las demás se listan como "no disponible en los
  datos actuales". Nunca se crean Mobile/Desktop, nuevos/recurrentes, etc. si no existen.
- Contribución por grupo: atribución del driver dentro de cada grupo. La diferencia entre la contribución
  del driver y la suma de sus grupos se muestra como **efecto mezcla** (cambio de participación entre grupos),
  así el árbol siempre cierra con el Nivel 1.
- Segmentos contra plan o forecast: no existen segmentos de plan, así que la referencia de los segmentos es
  el año anterior (se etiqueta "vs año anterior"). En reforecast vs forecast no aplica (el requerido no tiene desglose).

## 55. Clientes y métricas extra

Si el archivo trae `clientes`, `clientes_nuevos`, `clientes_recurrentes` o `items`, se calculan por segmento
(incluido tipo de cliente) junto a venta, pedidos, volumen, CR, AOV e items por pedido. Una caída de clientes
nuevos aparece como **señal adicional** y nunca sustituye al driver principal (prueba 6).

## 56. Señales (`FP.signalEngine.detectSignals`)

Tipos: cambio de driver (Nivel 1), cambio por segmento, cambio de mezcla (participación), métricas de
clientes y anomalías diarias.

```
señal = { id, kind, level, metric, dimension, value, label, current, baseline, delta, deltaPct,
          direction, relevance: { impact, exposure, confidence, score, priority }, evidence, reference }
```

- **Relevancia** no es solo el %: `score = impact × exposure × confidence`.
  impact = |contribución| ÷ max(|brecha|, 1 % de la base); exposure = peso del segmento en la base;
  confidence por días observados. Una caída de 50 % en 0.2 % del negocio pesa menos que una de 5 % en 40 % (probado).
- **Prioridad de investigación** alta / media / baja por umbrales (`signals.priority`). Significa "mira aquí primero", no "culpable".
- Umbrales mínimos: cambio 3 %, exposición 2 %, mezcla 3 pp.
- **Anomalías**: día fuera de mediana ± 3.5·MAD·1.4826 o con ratio ≥ 3× (o ≤ 1/3) contra la base. Se marcan
  "posible anomalía"; nunca se eliminan.

## 57. Hipótesis (`FP.hypothesisEngine`)

`{ id, hypothesis, priority, evidence, mechanism, validationNeeded, relatedSignals, driver, status: 'requires_investigation', source: 'rules'|'cohere' }`

- Siempre cita señales existentes y un driver. Si el driver no tiene señales localizadas, la hipótesis es
  genérica ("existe un deterioro en alguna etapa del proceso de conversión que requiere localizarse";
  validar: funnel por etapa). Sin datos de customer_type no hay hipótesis de nuevos vs recurrentes.
- La vista de evidencia expande cada hipótesis: señales → datos → comparación → mecanismo → qué validar.

## 58. Cohere (`FP.cohereDiagnostic`, opcional)

```
JavaScript → cálculos → drivers → señales → [Cohere] → redacción de hipótesis
```

- Payload: `{ period, comparison, channel, revenueGap, level1Drivers, level2Signals, dataQuality, constraints }`.
  Cohere no recibe ni calcula métricas nuevas.
- Respuesta: JSON `{ hypotheses: [{ id, hypothesis, priority, justification, relatedSignals, mechanism, investigation }] }`
  con `response_format` de esquema. Se valida: JSON parseable, campos obligatorios, prioridades permitidas y
  `relatedSignals` existentes (las inventadas se descartan; si una hipótesis se queda sin señales, se descarta).
- Reglas del sistema: solo evidencia dada, no inventar datos, dimensiones ni causas, distinguir hecho de
  hipótesis, expresar incertidumbre, no convertir correlación en causalidad, no cambiar cálculos ni prioridades.
- Falla de red, timeout, sin key, JSON inválido → "Análisis con IA no disponible"; el diagnóstico matemático
  y las hipótesis por reglas siguen completos (pruebas 8 y 9).
- La API key la escribe el usuario; se guarda en este navegador solo si él lo marca, y nunca se exporta.
  Endpoint `https://api.cohere.com/v2/chat`, modelo configurable.

## 59. Data confidence

Componentes: cobertura de días, observaciones, calidad de datos (estado de Fase 1), consistencia entre
segmentos y total (la suma de segmentos contra la venta total), tamaño de muestra. Nivel = el más bajo.
No es la probabilidad de que una hipótesis sea cierta.

## 60. Recuperación (desde Reforecast)

Con reforecast vs forecast el diagnóstico descompone qué drivers tendrían que cambiar para cerrar el
requerido y lo expresa como volumen, CR y AOV requeridos (con los otros dos constantes), además de pedidos
adicionales con AOV constante y volumen adicional con CR constante. Es matemática, no recomendación.

## 61. analysis_export.json (`FP.analysisExport`)

`schema, schemaVersion, metadata, comparison, period, channel, plan, actual, forecast, reforecast, gap,
level1Drivers, mainDriver, level2, level2Signals, hypotheses, aiAnalysis, recovery, dataQuality, assumptions,
attributionMethod, validation, generatedAt`. Pensado para la app "Diagnóstico de brecha de ventas";
no hay conexión automática ni ciclo acción → impacto → reforecast todavía.

`runDiagnostic({ period, channel, comparison, metric, method, run, rf, store, quality })` devuelve
`{ result, gap, level1Drivers, level2, driverTree, level2Signals, signals, hypotheses, recovery, confidence,
availability, assumptions, validation }` y solo lee copias: plan, actual, forecast y reforecast no cambian (prueba 10).


---

# FASE 6 — Escenarios de recuperación y plan de acción

Cadena: plan → actual → gap → driver → señal → hipótesis → **escenario → acción → impacto simulado →
seguimiento (observado)**. La app diagnostica, simula, propone, registra y mide. No ejecuta nada.

## 62. Hipótesis, escenario, acción e impacto

| Pieza | Qué es | Dónde vive |
|---|---|---|
| Hipótesis | Explicación posible, requiere validación | Fase 5 (`diagnosis.hypotheses`) |
| Escenario | Simulación cuantitativa: "¿qué pasaría si CR +0.15 pp?" | `scenarios:<año>` (inmutable, versionado) |
| Acción | Actividad concreta de una persona o equipo | `actionPlan:<año>` |
| Impacto simulado | Resultado matemático del escenario | `scenario.expectedImpact`, copiado en la acción |
| Impacto observado | Resultado real medido después | `actionPlan.measurements` |

Simulado y observado nunca se mezclan (campos, etiquetas "Simulado" / "Observado" y colores distintos).

## 63. Scenario Engine (`FP.scenarioEngine`)

**Contexto** (`buildContext`): canal (o total), periodo (año, mes, semana, día o rango) y `applyTo`.
Por día: base = real si el día está contado, forecast (método en uso de Fase 3) si no; plan original del día;
`editable` = día no cerrado (default) o todo el periodo (modo retrospectivo). También trae el reforecast del
periodo (Fase 4) y las participaciones de segmentos.

**Fórmulas** (día por día, usando `FP.metrics.calculateOrders` y `calculateRevenue`, sin duplicar):
```
volumen' = volumen × (1 + Δvol%)
CR'      = CR + Δpp            (o CR × (1 + Δ%))       ← pp y % nunca se confunden
AOV'     = AOV × (1 + Δ%)       (o AOV + Δ$)
pedidos' = volumen' × CR'
venta'   = pedidos' × AOV'
```
Pedidos y venta siempre se derivan. Escenarios combinados aplican los tres cambios a la vez (con interacción).

**Segmentos (Nivel 2)**: solo dimensiones y segmentos presentes en los datos de segmentos. La exposición se
estima con su participación en los últimos `segmentShareDays` (28) días con datos (volumen, pedidos y venta por
separado); el cambio se aplica a esa parte del día y el incremento se suma al canal. Se registra como supuesto.

**Canales**: cada canal se simula por separado; total digital = Σ canales. Un escenario de App no toca Ecommerce.

**Gap** (convención "falta para el plan", positivo = falta):
```
gapBefore = plan del periodo − base del periodo
gapAfter  = gapBefore − venta incremental simulada
recovery% = incremental ÷ gapBefore      (sin brecha: no aplica)
```

**Persistencia**: `saveScenario` guarda `{ scenarioId (SC_001_v1), family, version, supersedes, name, type, createdAt,
context, target, inputs, links (hypothesisId, signalIds, driver, hypothesisDriver), outputs, expectedImpact,
assumptions, warnings, days }` congelado. Editar crea `SC_001_v2` con `supersedes`; la v1 no cambia. `days` guarda
la base y el valor simulado de cada día editable para medir después contra el real.
Tipos: Base, Conservador, Intermedio, Agresivo, Personalizado (etiquetas, no predicciones).

## 64. Validación (`FP.scenarioValidation`)

Errores que bloquean: NaN, Infinity, bajas de más de 100 %, CR resultante > 100 % o < 0, cualquier valor negativo,
variable no disponible (sin volumen, CR o AOV en la base), segmento inexistente, periodo sin días editables.
Advertencias siempre visibles: cambios que exceden `maxTrafficIncrease` (%), `maxCRIncrease` (pp; un cambio en % se
convierte con el CR base) o `maxAOVIncrease` (%). Presupuesto, capacidad, inventario y fecha se registran como
restricciones de referencia (no entran al cálculo).

## 65. Recovery Engine (`FP.recoveryEngine`)

**Cálculo inverso** con I = gap × objetivo (10, 25, 50, 75, 100 %) sobre los días editables:
```
A solo volumen : Δvol% = I ÷ R          B solo CR : Δpp = I ÷ Σ(volumen_d × AOV_d)       C solo AOV : Δ% = I ÷ R
D, E, F dos drivers : mismo x relativo, (1 + x)² = 1 + I ÷ R        G tres drivers : (1 + x)³ = 1 + I ÷ R
```
R = venta base editable. Cada alternativa se re-simula y se marca: posible / no posible (p. ej. CR > 100 %) /
excede restricción. Con restricciones definidas se muestra el recovery máximo dentro de ellas. No se ordenan como
mejor o peor.

**API principal**: `runRecoveryAnalysis({ ctx, diagnosis, constraints, scenarioStore, actionPlan, customActions, targetPct })`
→ `{ context, gap, drivers, signals, hypotheses, scenarios, recoveryOptions, actions, catalog, reforecast, mainDriver,
assumptions, dataQuality }`. El diagnóstico de origen se corre con la comparación elegida (default forecast vs plan)
para mes, semana o año.

## 66. Relación con analysis_export.json y reforecast_export.json

- `contextFromAnalysisExport`: lee gap, drivers, señales e hipótesis; arma un contexto **agregado** del periodo con
  la parte ya ocurrida (actual) y la restante (forecast − actual) como editable. Permite escenarios y acciones.
- `contextFromReforecastExport`: lee el detalle diario (real congelado, forecast futuro, plan), gap restante,
  requerimiento, días disponibles y presión, en el periodo del horizonte y los cuatro canales.
- Los contextos importados se marcan en pantalla y no modifican los datos de la app.

## 67. Action Library (`FP.actionLibrary`)

Catálogo configurable (`config.recovery.actionLibrary` + acciones propias en `actionLibraryCustom`):
`{ actionId, name, description, driver, applicableChannels, applicableSignals, requiredData, ownerArea,
measurementMetric, defaultWindowDays }`. Se filtra por driver y canal; si pide datos que no existen (p. ej.
`customer_type`) se marca, no se oculta. Es un catálogo de acciones **posibles**, no recomendaciones.

## 68. Action Plan (`FP.actionPlan`)

Una acción solo se crea desde un escenario guardado ligado a una hipótesis (la cadena no se salta).
`{ actionId, title, description, catalogId, source (catalog|cohere), hypothesisId, hypothesis, scenarioId, signalIds,
driver, channel, period, owner, status, priority, expectedImpact, measurement, startDate, endDate, notes, createdAt, history }`.
Estados: proposed, approved, in_progress, completed, measuring, validated, rejected, cancelled. Cada cambio de campo o
estado se agrega a `history`; nada se borra.
**Prioridad descriptiva**: impacto simulado (recovery ≥ 25 % alto, ≥ 10 % medio), exposición (peso del alcance en la
venta digital), urgencia (días al fin del periodo ≤ 14 alta, ≤ 45 media), evidencia (hipótesis localizada = alta),
restricciones. Nunca "mejor acción".

## 69. Impact Measurement (`FP.impactMeasurement`, `FP.actionTracking`)

Sobre los mismos días de la ventana de la acción y solo donde ya hay real:
```
baseline = base guardada en el escenario (forecast de esos días al simular)
escenario = valor simulado guardado
observado = real cargado después
realización = (observado − baseline) ÷ (escenario − baseline)
≥ 0.8 consistente · ≥ 0.2 parcialmente consistente · menor no consistente · sin real: sin datos
```
Lectura: "El resultado observado es consistente / no consistente con el escenario". Factores listados: eventos y
festivos de la ventana, otros drivers que se movieron ≥ 5 %, días sin real, y mix / promociones / precio / canal como
no medidos. Nunca "la acción causó". Mediciones append-only en `actionPlan.measurements`.

## 70. Cohere en esta fase (`FP.cohereActions`)

Recibe `{ hypothesis, driver, signals, scenario, availableDimensions, dataQuality, constraints, catalog }` y devuelve
`{ actions: [{ actionId, action, rationale, relatedDriver, relatedSignals, informationNeeded }] }`. Se valida: JSON,
driver permitido (volumen, CR, AOV), señales existentes (las inventadas se descartan). No calcula venta, CR, AOV,
volumen, gap ni impacto, no modifica plan ni actual y no afirma causalidad. Falla o JSON inválido → "Análisis con IA
no disponible" y el resto del módulo sigue. Una propuesta de IA entra al plan solo si el usuario la agrega y queda
marcada como tal. La llamada de red es la misma de Fase 5 (`FP.cohereClient`).

## 71. Recovery Center (vista)

Contexto (canal, periodo, aplicar a días no cerrados o todo el periodo, diagnóstico de origen, restricciones,
importar/exportar) → brecha (plan, actual, forecast, forecast gap, reforecast requerido, presión) → drivers e hipótesis →
simulador → "¿qué tendría que cambiar?" → "¿cuánto del gap puedo recuperar?" (suma simple de escenarios marcada como
tal, sin interacción) con líneas plan / actual / forecast / reforecast / escenarios y tabla comparativa → catálogo e IA →
plan de acción → seguimiento → **cadena de trazabilidad** por acción (brecha → driver → señal → hipótesis → escenario →
acción → impacto simulado → resultado observado), cada nodo con su origen. Las cifras de la brecha muestran su origen
al pasar el cursor; el simulador tiene "¿De dónde salen estas cifras?".

## 72. action_plan_export.json

`schema, schemaVersion, metadata, period, channel, comparison, gap, drivers, signals, hypotheses, scenarios,
recoveryOptions, actions, measurements, traceability[] (actionId → gap, driver, signalIds, hypothesisId, scenarioId,
simulatedImpact, measurementIds, lastObserved), assumptions, dataQuality, generatedAt`.

## 73. Integridad y fuera de alcance

Escenarios, acciones y mediciones nunca modifican plan, actual, forecast base ni reforecast base (probado).
Fuera de alcance: envío de emails, automatización de campañas, ejecución de acciones, Google Ads, Meta Ads, GA4 en
tiempo real, CRM, Magento, A/B automático, causalidad automática, machine learning, optimización de presupuesto.


---

# FASE 7 — Experiencia guiada, navegación contextual y ayuda

Principio: *la aplicación ya sabe calcular; ahora enseña a leer, interpretar y recorrer lo que calcula.*
Esta fase es una capa de presentación: no cambia motores, fórmulas, contratos, exports ni el plan original.
Detalle para el usuario en `UX_GUIDE.md`.

## 74. Navegación agrupada

| Grupo | Vistas existentes a las que apunta |
|---|---|
| Inicio | `#inicio` (nuevo, centro de control) |
| Planear | Carga, Calidad, Datos normalizados, Metas y motor (`#resumen`), Estacionalidad, Plan, Configuración |
| Monitorear | Pacing & Forecast |
| Diagnosticar | ¿Por qué? Diagnóstico |
| Recuperar | Recovery & Reforecast, Recovery Center |
| Medir y aprender | `#medir` (nuevo: acciones, mediciones, cadena y aprendizajes de todos los canales) |
| ¿Cómo funciona? | `#ayuda` (nuevo) |

Las vistas y sus hashes no cambian (los enlaces viejos siguen funcionando). El menú muestra grupos y un submenú del
grupo activo; cada grupo recuerda la última vista visitada. Migas: Inicio › Grupo › Vista (› detalle).

## 75. Motor de contexto y siguiente paso (`FP.contextEngine`)

`collectStatus(state)` arma un estado plano y congelable (datos, meta, plan, real, forecast, reforecast, diagnóstico,
escenarios, acciones, mediciones, vistas visitadas) **leyendo** lo que ya calcularon los motores; no calcula métricas.
`describe(view, status)` → `{ whereAmI, whatAmISeeing, whatDoesItMean, whatShouldIInvestigate, nextStep, availableActions }`.
`headline(status)` produce frases descriptivas (sin scores). `requirements(view, status)` alimenta los estados vacíos.

`getNextStep(status)` evalúa reglas en orden fijo y devuelve la primera que aplica:
cargar datos → revisar calidad (si hay filas inválidas) → capturar meta → configurar plan → cargar real del año →
revisar pacing → revisar drivers (si hay brecha) → buscar evidencia (diagnóstico sin hipótesis) → simular recuperación →
plantear acción → configurar seguimiento → monitorear. Sin IA.

## 76. Sistema de ayuda (`FP.help`, `FP.guidanceConfig`)

Una sola estructura de entrada: `{ id, title, shortDescription, detailedDescription, howToRead, formula, interpretation,
caveats, nextStep, state? }` (37 entradas: métricas, estados, conceptos de diagnóstico y recuperación). Un solo componente
la muestra como ícono "?", panel lateral, glosario con búsqueda y explicadores por vista. `decorate()` agrega el ícono a
encabezados y etiquetas conocidos (21 disparadores) sin tocar el HTML de las vistas. Escape cierra el panel.

## 77. Convención de estados

Plan, Actual, Forecast, Reforecast, Escenario y Observado tienen etiqueta con **texto**, color y estilo de borde (sólido, contorno,
punteado, doble, rayado), con definición corta en Inicio, glosario y ayuda. Nunca dependen solo del color.
Forecast = "¿dónde terminaríamos?"; Reforecast = "¿qué tendría que pasar en los días restantes para conservar la meta?"
(nunca se llama pronóstico).

## 78. Inicio, estados vacíos y calidad visible

Inicio muestra, para canal y periodo elegidos: venta acumulada, meta acumulada, gap, cumplimiento, forecast, gap forecast y
presión de recuperación (tarjetas con estado, comparación, periodo y ayuda), frases descriptivas, el recorrido del sistema
(Planear → … → Aprender, marcado como hecho o pendiente) y el siguiente paso. Si el plan no cubre el periodo elegido, se
explica en vez de cambiar el periodo.
Los estados vacíos dicen qué falta y llevan a la vista correcta. Cuando la calidad de datos tiene advertencias o errores,
la barra de contexto lo muestra en todas las vistas con enlace a Calidad, sin bloquear el resto.

## 79. Filtros persistentes

Contexto compartido `{ channel, periodType, periodKey, comparison }`: al salir de Inicio, Pacing, Reforecast, Diagnóstico
o Recovery Center se lee de sus filtros, y al entrar a otra se aplica si es compatible. Si la vista no admite la
selección (p. ej. "día" en el diagnóstico) se ajusta y se **explica** en la barra; nunca se cambia en silencio.

## 80. Recorrido guiado y modos

- Recorrido opcional de 10 pasos (meta, pacing, forecast, gap, drivers, señales, hipótesis, escenario, acción, medición):
  qué vemos, por qué importa, qué buscar, qué sigue; avanzar, retroceder, salir y retomar; progreso "Paso n de 10"
  (de navegación, no del negocio); resalta el bloque correspondiente.
- **Ejecutivo** colapsa bloques técnicos listados en `ANALYST_ONLY` (métodos, índices, parámetros, auditoría, árbol,
  confianza, cálculo inverso, configuración) y avisa cuántos ocultó con botón para verlos. **Analista** (default) muestra todo.
  No se elimina información.

## 81. Diagnóstico guiado y trazabilidad visible

- "¿Por qué está pasando?": brecha → drivers → señales → hipótesis → información faltante → siguiente investigación,
  con la leyenda Hecho / Driver / Señal / Hipótesis y un árbol visual que solo expande dimensiones existentes.
- `FP.traceability` arma la cadena plan → forecast → gap → driver → señal → hipótesis → escenario → acción → impacto
  simulado → medición de cada acción (solo lectura) para Medir y aprender y el Recovery Center.

## 82. Accesibilidad y responsive

Foco visible, `aria-current` en navegación y migas, `role="progressbar"` en el recorrido, botones con texto, ayuda con
teclado y Escape, estados con texto y forma además de color. El menú de grupos se desplaza horizontalmente en móvil.
Cohere no participa en la navegación ni en la ayuda: todo funciona sin IA.

**Nota de presentación (Fase 7):** `btn--quiet` (texto rojo) queda reservado para acciones destructivas o de
restablecimiento (borrar datos, quitar archivo, restablecer parámetros). Las acciones secundarias neutras usan
`btn--ghost`. La barra de navegación agrupada ocupa el ancho del contenedor y queda alineada con el contenido.


---

# FASE 8 — Preparación: auditoría de almacenamiento y prueba técnica de IndexedDB

Pasos 1 a 4 del alcance confirmado (granularidad diaria, todos los SKU). **Todavía no cambia el
almacenamiento de la app**: se entrega la auditoría, la prueba técnica y el diseño para aprobar.

## 74. Auditoría del almacenamiento actual

Todo pasa por un solo objeto `storage` (FP.storage) en `app.js`: ningún motor ni vista llama a
`localStorage` directamente. Eso permite cambiar el adaptador sin tocar motores.

| Clave (`fp.v1:…`) | Tamaño medido* | Crece con | Destino propuesto |
|---|---|---|---|
| `historicalData` | ~624 KB | días × canales | IndexedDB (store `kv`) |
| `segmentsData` | ~468 KB | días × canales × segmentos | IndexedDB (`kv`) |
| `planData` | ~190 KB (plan diario 2026) | días × canales | IndexedDB (`kv`) |
| `plans:<año>` | ~115 KB | versiones de plan | IndexedDB (`kv`) |
| `actualData` | ~15 KB | días × canales | IndexedDB (`kv`) |
| `forecasts:<año>`, `reforecasts:<año>`, `scenarios:<año>`, `actionPlan:<año>` | 4–10 KB c/u | versiones guardadas (append-only) | IndexedDB (`kv`) |
| `settings`, `planningSettings`, `forecastSettings`, `reforecastSettings`, `diagnosticSettings`, `recoverySettings`, `uxSettings`, `cohereApiKey`, `actionLibraryCustom`, `targets:<año>`, `events:<año>`, `milestones:<año>`, `versions:<año>` | < 1 KB c/u | casi nada | **Se quedan en localStorage** |

\*Sesión de prueba completa: ~1.24 MB de ~5 MB disponibles en localStorage.

## 75. Prueba técnica (tools/idb-proof.html)

Base separada `fp-idb-proof`. Datos sintéticos diarios por SKU. Dos diseños:

- **A · una fila por fecha × canal × SKU** con 5 índices (fecha, SKU, categoría, canal+fecha, categoría+fecha).
- **B · una partición por fecha × canal** con columnas tipadas (todos los SKU del día) + rollup diario por categoría.

Resultados (Chromium, sin interfaz):

| Verificación | A (filas) · 540 mil SKU-días | B (particiones) · 4.38 millones SKU-días (365 d × 3,000 SKU × 4 canales) |
|---|---|---|
| Escribir | 129 s (4,173 filas/s) | **5.0 s** (~875 mil SKU-días/s) |
| Espacio | ~125 MB | **~86 MB** |
| Un día, 4 canales | 259 ms | 6 ms |
| Serie de un SKU (todo el periodo) | 28 ms | 749 ms (año completo) |
| Categoría, 30 días | 651 ms | 2 ms (rollup) · 81 ms recalculado desde SKUs |
| Canal, 30 días | 643 ms | 55 ms |
| Pausa máxima de la interfaz al cargar | 140 ms | 29 ms |
| Persiste tras recargar | Sí | Sí |
| file:// y http(s) | Sí | Sí |

Las 12 verificaciones del alcance pasan con B. **Conclusión: IndexedDB es viable y el diseño B es el recomendado.**
El diseño A se descarta: escribir un año de 3,000 SKU tomaría ~17 minutos.
Falta confirmarlo en el GitHub Pages real (el origen https de la app): abrir `/tools/idb-proof.html` en el sitio.

**Cuello de botella encontrado: la importación, no el almacenamiento.** El pipeline actual de Fase 1 crea un
objeto canónico por fila (~26 mil filas/s y mucha memoria): sirve para día × canal, no para millones de filas.
Leer CSV sí es rápido (~230 mil filas/s). Los productos necesitan una ruta de importación ligera (§77).

## 76. Diseño propuesto (pendiente de aprobación)

```
UI / vistas
   ↓
Servicios de la app (app.js, acciones)
   ↓
Repositorio (FP.repository, asíncrono)
   ├── Preferencias ──▶ FP.storage (localStorage, síncrono)   — sin cambios
   ├── Datos de la app ─▶ IndexedDB store `kv` (se cargan a memoria al arrancar; los motores no cambian)
   └── Productos ──────▶ IndexedDB `productDays` (particiones) + `productRollups` + `productCatalog`
                          (nunca se cargan completos; se consultan por fecha, canal, categoría o SKU)
```

Stores de IndexedDB (base `fp-data`):
- `kv` { key, value, savedAt, schemaVersion } — mismas colecciones empaquetadas que hoy.
- `productDays` clave [fecha, canal] — columnas: índice de SKU, venta, pedidos, unidades, vistas (null = faltante,
  nunca 0) y origen por métrica (observado / faltante / inválido).
- `productRollups` clave [fecha, canal, nivel, clave] — categoría y subcategoría por día.
- `productCatalog` clave sku — categoría, subcategoría, producto, índice.
- `productBatches` — archivos importados, resumen, issues (con ejemplos acotados).
- `meta` — versión del esquema y estado de migración.

## 77. Estrategia de migración y compatibilidad

1. Al arrancar, si IndexedDB está disponible y no hay bandera de migración: copiar cada clave de datos de
   localStorage a `kv`, leerla de vuelta y compararla; si coincide, guardar la bandera `storageMigration`.
2. Desde ese momento los datos se leen de IndexedDB. **localStorage no se borra automáticamente**: queda como respaldo
   hasta que el usuario pulse "Liberar espacio de datos anteriores".
3. Si IndexedDB no está disponible (navegador muy restringido), la app sigue como hoy con localStorage y la capa de
   productos se desactiva con un aviso.
4. El arranque pasa a ser asíncrono solo en la carga inicial; después los motores siguen trabajando en memoria.
5. Se pide almacenamiento persistente (`navigator.storage.persist()`) y se muestra si el navegador lo concedió.

Importación de productos: lectura del archivo por partes, validación ligera por fila con las mismas reglas de
normalización (fecha, número, canal; faltante ≠ 0; inválido ≠ 0), escritura directa en particiones, rollups y
catálogo; vista previa de las primeras filas y errores resumidos por tipo con ejemplos. Recomendado: un archivo por mes.

## 78. Límites a conocer

- Los datos de IndexedDB quedan ligados al navegador, al equipo y al dominio: lo cargado en el GitHub Pages no se ve
  al abrir la app desde el archivo local ni desde otra computadora. Los exports JSON siguen siendo el respaldo portable.
- Si el navegador no concede almacenamiento persistente, puede liberar datos bajo presión de espacio.
- Un año completo de todos los SKU en un solo CSV pesaría cientos de MB: conviene cargar por mes.

## Asistente de metas (ajuste posterior a Fase 7)

En Meta anual, "Calcular metas desde el histórico" (`FP.targetAssistant`) propone las metas del año seleccionado:
venta real del año base por canal (actual si existe para la llave; si no, histórico) × (1 + crecimiento), o un total
fijo; repartido con la mezcla real del año base o con porcentajes capturados (los cuatro, sumando 100 %). El reparto es
exacto en pesos (Σ canales = total). **Solo llena el formulario**: la meta se guarda únicamente con "Guardar metas" y
sigue siendo decisión del negocio. Si el año base tiene menos de 95 % de días con datos en algún canal, se advierte.


---

# FASE 8.1 — IndexedDB, carga de productos y Categoría → Producto

## 79. Arquitectura de almacenamiento (implementada)

```
UI / vistas
  ↓
Servicios (app.js, motores) ─── misma interfaz síncrona save/load/remove/clear
  ↓
Repositorio (FP.repository)
  ├── createRoutedStorage: claves de datos → IndexedDB `kv` (caché en memoria + escritura en cola)
  │                        preferencias y banderas → localStorage (FP.storage)
  └── FP.productStore: productos → productDays / productRollups / productCatalog / productBatches
  ↓
FP.idb (primitivas: open, put, get, getAll, iterate, count, putMany con cesión de hilo)
```

- Arranque asíncrono: `repo.init()` abre `fp-data` y carga `kv` a memoria → migración → carga normal. Los motores
  siguen trabajando en memoria y síncronos: ninguno cambió.
- Datos en IndexedDB (`config.storageDb.dataKeys`): historicalData, planData, actualData, segmentsData, dataset (legado),
  plans, forecasts, reforecasts, scenarios, actionPlan. Se quedan en localStorage: settings, planningSettings,
  forecastSettings, reforecastSettings, diagnosticSettings, recoverySettings, uxSettings, cohereApiKey,
  actionLibraryCustom, targets, events, milestones, versions (Fase 0), storageMigration, productSettings.
- Si IndexedDB no está disponible, todo sigue en localStorage como antes y la capa de productos se desactiva con aviso.
- "Borrar datos guardados" (acción explícita) limpia localStorage de la app e IndexedDB.

### Stores e índices (`fp-data` v1)

| Store | Llave | Índices | Para qué consulta |
|---|---|---|---|
| kv | key | — | datos de la app (mismo sobre `{schemaVersion, savedAt, data}`) |
| productDays | [fecha, canal] | channel_date [canal, fecha] | día, rango, canal + fecha; SKU/producto recorriendo el rango |
| productRollups | [fecha, canal, nivel, clave] | level_key_date [nivel, clave, fecha] | categoría y subcategoría + fecha sin recorrer SKU |
| productCatalog | sku | category, product | atributos del SKU, búsquedas por categoría o producto |
| productBatches | id | — | archivo, mapeo, resumen, issues con ejemplos, conflictos |
| meta | key | — | resumen de productos cargados (fechas, canales, métricas, SKU) |

Índices descartados a propósito: fecha + SKU y fecha + canal + SKU como índices por fila exigirían una fila por SKU-día
(diseño A de la prueba: 17 min para escribir un año). Con bloques día × canal, la serie de un SKU en un año completo
se obtiene recorriendo 1,460 bloques en ~0.6 s; categoría y subcategoría salen de los resúmenes en milisegundos.
Los resúmenes se guardan porque la consulta más frecuente (categoría × rango) pasa de recorrer millones de celdas a
leer decenas de filas; ocupan una fracción del bloque (categoría + subcategoría por día y canal).

## 80. Migración (no destructiva, idempotente, verificable)

`FP.storageMigration.migrate`: localStorage → copia → IndexedDB → verificación → `verified`. Nunca borra localStorage.
- Estado en localStorage `storageMigration`: `{ schema, status (pending|copying|verified|failed|unavailable), attempts,
  startedAt, finishedAt, keys[{ key, action (copied|kept_newer|skipped), source, target, verified }], error,
  localStorageKept: true }`.
- Verificación leyendo directo de IndexedDB: contenido JSON idéntico + resumen por clave (registros, lotes, fecha
  mínima y máxima, canales, versiones). "Tiene datos" no basta.
- Idempotente: la copia es por clave; repetirla no duplica. Si IndexedDB ya tiene una versión más reciente de una
  clave, no se sobrescribe (`kept_newer`).
- Si falla: la app sigue leyendo y guardando en localStorage; "Reintentar migración" en Categoría → Producto.
- Mientras la migración no esté `verified`, los datos no se enrutan a IndexedDB.

## 81. Contrato de producto (oficial desde el 25-09-2026, Fase 8.1.1)

Dos archivos, cada uno con su propia granularidad, porque **la vista de ficha ocurre antes de elegir sucursal**:

**Productos · venta** (sistema de ventas) — un renglón por fecha × canal × SKU × estado × sucursal × tipo de entrega:
`fecha, canal, sku, codigo_producto, producto, marca, categoria, subcategoria, presentacion, estado, sucursal, tipo_entrega, venta, pedidos, unidades`

**Productos · funnel** (GA4, métricas por artículo) — un renglón por fecha × canal × SKU, sin estado ni sucursal:
`fecha, canal, sku, vistas_ficha, agregados_carrito, inicio_checkout, compras_ga4`

| Campo | Archivo | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| date, channel, sku | ambos | fecha / canal / texto | sí | mismas reglas de Fase 1 |
| state | venta | catálogo fijo (32 estados) | sí | variantes aceptadas (CDMX, Edo. Méx., etc.); no reconocido = rechazo, no se adivina |
| branch | venta | texto | sí | identificador estable; incluye recolección y envío a domicilio |
| delivery | venta | domicilio \| recolección | sí | variantes aceptadas (pickup, click & collect…) |
| productCode, product, category, subcategory, brand, presentation | venta | texto | no | atributos del catálogo |
| extraDimension | venta | texto | no | otra dimensión legítima: se suma por renglón |
| revenue, orders, units | venta | número | ≥ 1 | observadas |
| views, addToCart, beginCheckout, purchasesGa4 | funnel | número | ≥ 1 | observadas; misma unidad GA4 por artículo |

`config.products.dataType` (venta) y `config.products.funnelType` (funnel) declaran encabezados y obligatorios;
`FP.productStore.detectKind` adivina el tipo por las columnas y el usuario puede corregirlo. El archivo de venta es
transaccional: un SKU con vistas que no aparece ese día × canal se interpreta como 0 pedidos (no como faltante) para
el cálculo de CR — ver §90.

## 82. Reglas de métricas y disponibilidad

- Celdas: observed | missing (vacía) | invalid (texto o negativo). En columnas tipadas se guardan como NaN y en la
  salida como null con su estado. **Nunca 0.**
- Estados agregados: available, partial (hay faltantes), missing, invalid, unavailable (la columna no existe o no se
  puede cruzar), not_calculable.
- Venta, pedidos y unidades del archivo de venta = observadas; vistas, agregados al carrito, inicios de checkout y
  compras GA4 del archivo de funnel = observadas. Ninguna se reconstruye ni se sobrescribe con otra fuente.
- CR, AOV y las tres tasas del funnel siempre se marcan `calculated` (ver fórmulas en §90).
- **Estado, sucursal y tipo de entrega ocurren en el checkout, después de la vista de ficha**: al agrupar o filtrar
  por cualquiera de los tres, el funnel completo (vistas, tasas, CR) se reporta `unavailable` con la nota
  correspondiente — no es una falta de datos, es que la pregunta no tiene esa respuesta.

## 83. Duplicados

Llave: fecha + canal + SKU en el funnel; fecha + canal + SKU + estado + sucursal + tipo de entrega en venta
(+ otra dimensión si está mapeada).

| Caso | Regla |
|---|---|
| Duplicado exacto (misma llave y métricas) | se conserva una vez, se cuenta |
| Conflicto (misma llave, métricas distintas) | no se elimina: se conserva la primera fila, la celda se marca y todas las versiones van a `batch.conflicts` y al reporte |
| Multiplicidad válida (misma llave, otra dimensión adicional) | se conservan y se suman en el renglón; se informa |
| Contra lo ya guardado: idéntico | se omite |
| Contra lo ya guardado: distinto | conflicto; por defecto se conserva lo guardado y se marca; "reemplazar" es una corrección explícita del usuario y queda registrada con el valor anterior |

Otras validaciones (venta): SKU, estado, sucursal o tipo de entrega faltantes (rechazo), estado o tipo de entrega no
reconocidos (rechazo, catálogo fijo), fecha o canal inválidos (rechazo), producto, categoría o subcategoría
faltantes, SKU con atributos distintos entre filas, negativos, texto en métricas, filas con columnas de más o de
menos. Nada se corrige en silencio.

## 84. Carga de productos

Integrada a Carga de datos (misma revisión), una tarjeta con los dos archivos: seleccionar → tipo de archivo
detectado (corregible) → vista previa (20 filas normalizadas con estado por métrica) → mapeo → validación del
archivo completo → resumen → confirmación → persistencia → resultado. Técnica: el texto se lee por partes sin crear
un objeto por fila (`FP.productImport.readRow`), normalización con caché, lotes de 10 mil filas con cesión del hilo.
Medido: un mes de venta de 3,000 SKU × 4 canales (410 mil renglones, ~53 MB) se valida y guarda en unos 5 s.
Recomendado: un archivo de venta y uno de funnel por mes. Todos los SKU válidos se guardan: no hay Top N en
almacenamiento.

## 85. Análisis Categoría → Producto (`FP.productAnalysis`)

Negocio → canal → categoría → subcategoría → producto → SKU con drilldown, contra el periodo anterior de igual
duración o el mismo periodo del año anterior (no existe plan por producto).
- Participación = venta del grupo ÷ total del periodo. Contribución = Δ del grupo ÷ Δ total (null si Δ total = 0;
  puede pasar de 100 % cuando otros grupos compensan). No son sinónimos.
- Estado por grupo: crece, cae, estable (< 3 %), nuevo, sin venta.
- Compensación (caídas cubiertas por crecimientos) y concentración (cuántos grupos explican el 80 % del deterioro o
  del crecimiento).
- Patrones A–D (tráfico/CR, §35 del brief) y E–G (en qué paso del funnel cae la conversión: vista→carrito,
  carrito→checkout, checkout→compra) como **señales**, con evidencia y la nota de que no indican causa.
- "Ver por": Categoría (categoría → subcategoría → producto → SKU) o Estado y sucursal (estado → sucursal), más un
  filtro independiente de tipo de entrega. Top N (20, 50, 100 o todos paginado) es solo visual.
- Filtros: periodo, canal (el mismo contexto persistente de Fase 7), categoría/subcategoría/producto/SKU o
  estado/sucursal según la vista, y tipo de entrega.

## 86. Integración con Diagnóstico, exportación y trazabilidad

- "Usar periodo y canal del diagnóstico" lleva el contexto de Fase 5; si el diagnóstico compara contra plan, se
  aclara que productos compara contra el periodo anterior.
- `analysis_export.json` agrega de forma opcional `categoryProduct` (principales contribuciones, compensación y señales)
  cuando el análisis de productos del mismo canal ya se calculó. El resto del contrato no cambia.
- `category_product_analysis_export.json`: schema, versión, fecha, periodo, referencia, corte, filtros, nivel,
  métricas disponibles, reglas, total, filas (participación, contribución, estado, métricas con estado y fuente,
  drivers, señales, SKU, conflictos), compensación, concentración, vínculo con el diagnóstico y archivos de origen.
- Trazabilidad de un SKU: archivo → fila → fecha → canal → SKU → métrica (observada, faltante o inválida) → marca de
  conflicto o de suma por multiplicidad.

## 87. Pruebas y validación

- Síncronas: 136 (122 de Fases 1-7 + 14 de productos, Fase 8.1.1: contrato de dos archivos, estado/sucursal/entrega
  obligatorios, duplicados con la llave ampliada, el funnel no se cruza con geografía, CR con pedidos reales
  implícitos en 0, cobertura de tracking, AOV, fusión con lo guardado, resúmenes por estado y sucursal, participación
  y contribución con funnel, patrones A-G, periodos, migración de esquema v1→v2, integración).
- Asíncronas (`FP.storageTests.run`, botón "Pruebas de almacenamiento"): 22 — las 20 de Fase 8.1 más migración de
  esquema v1→v2 y consultas/persistencia con los dos archivos y las tres dimensiones nuevas. Volumen de referencia:
  4.38 millones de SKU-días (365 × 3,000 × 4) con dimensiones de venta: ~34 s de escritura, sin congelar la interfaz.
- Verificadas aquí en Chromium desde `file://` y `http://` (mismo modelo que GitHub Pages). La validación en
  `https://appalex47-lab.github.io` se hace con el botón de pruebas en ese sitio.

---

# FASE 8.1.1 — Producto por sucursal, estado y tipo de entrega + funnel GA4

Extiende la Fase 8.1 a petición del usuario, antes de cargar datos reales, para no tener que migrar después
(auditoría §85 R5: "decidir si sucursal o geografía importan por producto antes de acumular datos reales").
Las fases 8.3 (canales) y 8.5 (métricas configurables) siguen en pausa: esta fase no las adelanta — las tres
métricas de venta y las cuatro del funnel son listas fijas, igual que en 8.1.

## 88. Por qué dos archivos y no uno

La vista de ficha (GA4) ocurre **antes** de que la persona elija sucursal, estado o tipo de entrega en el checkout:
un paracetamol visto hoy no tiene todavía dirección de entrega. Poner las vistas en el mismo renglón que la
sucursal las repetiría por cada sucursal del SKU y las contaría varias veces. Por eso:

- **Productos · venta**: sistema de ventas, con estado, sucursal y tipo de entrega — porque ahí sí se conocen.
- **Productos · funnel**: GA4 por artículo, sin esas tres dimensiones — porque ahí todavía no existen.

CR y las tres tasas del funnel se calculan a nivel SKU (o categoría/producto), nunca por estado, sucursal o
tipo de entrega: no es una limitación de datos, es que la pregunta no aplica antes del checkout.

## 89. Esquema IndexedDB v2 (`fp-data`, versión 2)

Nuevo store y dimensiones en el bloque de venta:

| Store | Llave | Índices | Novedad |
|---|---|---|---|
| `productFunnel` | [fecha, canal] | channel_date | igual forma que `productDays`, cuatro métricas del funnel |
| `productDays` | [fecha, canal] | channel_date | agrega `stateIdx`, `branchIdx`, `deliveryIdx` (Uint8/Uint16) por renglón |
| `productRollups` | [fecha, canal, nivel, clave] | level_key_date | `nivel` ahora incluye `state`, `branch` y `delivery` además de `category`/`subcategory` |

Catálogos en memoria (`FP.productStore.dims`): `states` (32 fijos + variantes), `deliveries` (2 fijos + variantes),
`branches` (dinámico, se descubre al cargar y se guarda en `meta.productDims`). Los tres se resuelven a un índice
numérico al cargar; nunca se guarda el texto libre en el bloque.

**Migración v1 → v2 (automática, sin pérdida):** al abrir la base con la versión anterior, cada bloque de
`productDays` (4 métricas por SKU-día, sin dimensiones) se separa en un bloque de venta (revenue/orders/units,
estado/sucursal/entrega = "(sin dato)") y uno de funnel (solo vistas; las tres métricas nuevas del funnel quedan
`missing`). No se pierde ningún valor. Al terminar la conversión (`onupgradeneeded`), se marca `productRebuild:
pending` en `meta`; en el siguiente `init()` la app separa `mappedMetrics`/`funnelMetrics` y recalcula todos los
resúmenes con ambos bloques. Esta migración es del esquema de IndexedDB (independiente de la migración
localStorage → IndexedDB de la Fase 8.1, que sigue igual).

## 90. Cálculos que cruzan venta y funnel

- **CR del producto** = Σ pedidos reales ÷ Σ vistas de ficha, en los mismos SKU-días. El archivo de venta es
  transaccional: si el SKU tiene vistas ese día × canal pero no aparece en venta, sus pedidos son 0 implícito
  (se cuenta, no se descarta); si el archivo de venta de ese día × canal no está cargado, la vista se excluye del
  cálculo en vez de asumir 0 (`impliedZero` registra cuántas veces ocurrió lo primero).
- **Tasas del funnel** (todas `calculated`): vista→carrito = agregados ÷ vistas; carrito→checkout = inicios de
  checkout ÷ agregados; checkout→compra = compras GA4 ÷ inicios de checkout.
- **Cobertura de tracking** = compras GA4 ÷ unidades reales, en los mismos SKU-días — señal de pérdida de medición,
  no una métrica de negocio; se avisa cuando cae más de `products.signals.trackingGapPct` (15 %) por debajo de 1.
- **AOV** = venta ÷ pedidos con pedidos > 0 (sin cambios respecto a 8.1).
- Agrupar o filtrar por `state`, `branch` o `delivery` desactiva el cruce con el funnel para ese cálculo
  (`funnelJoinable = false`): CR, vistas y las tres tasas se reportan `unavailable` con la nota correspondiente.

## 91. Señales E–G (funnel)

Además de los patrones A–D (tráfico/CR) de la Fase 8.1, con datos de funnel:
- **E** vistas estables o al alza con menos agregados al carrito por vista (paso vista → carrito).
- **F** carrito estable con menos checkouts por carrito (paso carrito → checkout).
- **G** checkout estable con menos compras por checkout (paso checkout → compra).

Igual que A–D: señales descriptivas con evidencia, nunca una causa.

## 92. UX

- Carga: la tarjeta "Productos · venta" ofrece dos plantillas (venta y funnel); el tipo de archivo se detecta por
  encabezados y es corregible; la revisión muestra estado, sucursal y entrega en la vista previa de venta.
- Categoría → Producto: "Ver por" alterna entre Categoría (categoría→subcategoría→producto→SKU) y Estado y sucursal
  (estado→sucursal), con un filtro independiente de tipo de entrega; al usar geografía o filtrar por entrega se
  explica que el funnel no está disponible ahí.
- Trazabilidad de un SKU: venta y funnel en renglones separados (son archivos distintos), venta con su
  estado/sucursal/entrega.

## 93. Datos de prueba

`FP.mockProducts.generate()` produce los dos archivos coherentes entre sí (600 SKU, 100 sucursales en 10 estados,
funnel solo en canales web). Escenario simulado: en septiembre, Dermocosmética recibe más vistas pero cae su paso
vista→carrito (patrón E); Vitaminas crece en tráfico; la venta a domicilio en Jalisco cae ~18-25 % (verificado en
pantalla). `qualityCase()` cubre estado/sucursal/entrega inválidos o faltantes además de los casos de 8.1.


---

# FASE 8.2 — Business Setup: "¿Qué tipo de negocio estoy analizando y cómo funciona?"

## 94. Una sola fuente de verdad: Business Context → config bootstrap → runtime config

```
Business Context (guardado por el usuario, localStorage `fp.v1:businessContext`)
        ↓  config.js lo lee de forma síncrona ANTES de congelarse (FP.businessContext.readStored + deriveConfig)
Runtime config FP.config (deepFreeze, igual que siempre)
        ├── config.currency  ← business.currency (si es ISO 4217 válida; si no, MXN)
        └── config.business  ← { configured, source, schemaVersion, savedAt, name, terms, context }
        ↓
Motores y vistas existentes (sin cambios)
```

- No existen dos fuentes: el Business Context guardado es la entrada; `FP.config` es la configuración efectiva
  derivada de él al arrancar. Ningún módulo lee el Business Context directamente salvo la vista Negocio (borrador).
- `businessContext.js` se carga antes que `config.js` y no depende de `FP.config`.
- Se mantiene el congelado: la configuración no se edita en caliente. Guardar el contexto avisa que el cambio se
  aplica al recargar (botón "Recargar y aplicar"), para no mezclar definiciones viejas y nuevas en una misma sesión
  (riesgo #3 de la auditoría).

**Qué alimenta y qué no.** Alimenta solo lo que describe el negocio: moneda, nombre (se muestra en el encabezado),
terminología y el contexto declarativo completo (`config.business.context`) para fases futuras. **No alimenta**
canales (`config.channelIds`), métricas (`config.metricKeys`), fórmula, métodos de forecast, diagnóstico,
dimensiones, geografía real ni catálogo real: eso pertenece a 8.3, 8.5 y 8.4 (pausadas o futuras). La lista viva de
lo que alimenta está en `FP.businessContext.FEEDS` y `DOES_NOT_CHANGE`, y la vista la muestra.

## 95. Persistencia, versionado y compatibilidad

- **localStorage, no IndexedDB:** es configuración pequeña y `config.js` necesita leerla de forma síncrona antes de
  congelarse; IndexedDB es asíncrono y llegaría tarde. Clave `businessContext` fuera de `storageDb.dataKeys`, así
  que el almacenamiento enrutado de Fase 8.1 la mantiene en localStorage. Se escribe con `FP.storage` (mismo sobre
  `{ schemaVersion, savedAt, data }`).
- **Versión propia:** `data.schemaVersion = 1`. `migrate()` acepta v1 y contexto sin versión (tratado como v1);
  una versión mayor desconocida no se interpreta (no se adivina) y la app arranca con los valores por defecto.
- **Compatibilidad hacia atrás:** sin contexto guardado, o si está corrupto o no pasa la validación, `deriveConfig`
  devuelve exactamente la configuración de siempre (MXN, `business.configured = false`). Una instalación existente
  arranca sin pasos manuales. Si hay algo guardado que no se puede leer (JSON dañado o versión desconocida), la vista
  Negocio lo avisa y permite quitarlo o guardar uno nuevo encima; nunca se interpreta a medias.
- **Trazabilidad:** `config.business` dice si está configurado, de dónde viene (`businessContext` o `default`), la
  versión de esquema y cuándo se guardó; la vista Negocio lo muestra en "Contexto activo".
- **Export/import `business_context.json`:** sí se agregó, porque los datos del navegador no viajan entre equipos ni
  dominios (§78) y el contexto es lo primero que se configura en una instalación nueva. Forma:
  `{ schema: 'business_context', schemaVersion, metadata, context }`. Importar llena el borrador; nada se aplica
  hasta guardar. No se modificó ningún export existente.

## 96. Validación

Tres niveles: error (bloquea guardar), recomendado (no bloquea) e informativo. Solo el **nombre** es obligatorio.
Errores: nombre vacío, moneda que no es ISO 4217 real, niveles de geografía o catálogo repetidos. Recomendados:
industria, modelo de negocio, qué vende, cómo vende, comportamiento de compra, si geografía y catálogo son
relevantes, niveles cuando se marcó "relevante", descripción de "Otro", términos repetidos. Las listas son cerradas
(con "Otro" en texto) y los textos se recortan a un largo máximo.

## 97. Contexto, no causa ni cálculo

Los factores relevantes (precio, inventario, promociones…) son contexto para interpretar: no se convierten en causas
ni alteran el diagnóstico. Geografía y catálogo se describen de forma conceptual (niveles); la estructura real sigue
siendo la de productos (Fase 8.1.1) hasta la Fase 8.4. La terminología queda disponible en `config.business.terms`;
los textos de la app todavía no se reemplazan. Cohere no participa: el contexto es estructurado y determinístico.

## 98. UX e integración con la Fase 7

Vista **Negocio** (`#negocio`) como primera vista del grupo Planear; misma navegación, migas, contexto, ayuda
(`businessContext`, `terminologia`, `factoresNegocio`), explicador ("Contexto, no configuración de cálculo") y modos.
Secciones numeradas: identidad, modelo, cómo vende, comportamiento de compra, geografía conceptual, catálogo
conceptual, factores, terminología, notas. "Proponer desde la configuración actual" arma un borrador con lo que la
app ya sabe (moneda, canales, catálogo de productos cargado) sin guardarlo. No se implementó nada de la Fase 9.1.

## 99. Pruebas

- Síncronas: 144 (136 anteriores + 8 de Fase 8.2: estructura y normalización con `schemaVersion`, versión
  desconocida no interpretada, validación por niveles, terminología y geografía, lectura del sobre guardado (vacío,
  válido, corrupto, inválido), runtime config sin y con contexto, congelado y canales/métricas intactos,
  export/import).
- Navegador (file:// y http): sin contexto la app arranca con MXN; guardar no cambia la sesión en curso; al recargar
  la moneda, el nombre y la terminología vienen del contexto; canales (4) y métricas (5) intactos; `FP.config` y
  `config.business.context` congelados; datos cargados sin cambios; export → borrar → recargar vuelve a valores por
  defecto → importar llena el borrador; un contexto corrupto no impide arrancar. Regresión de Fases 1–8.1.1 sin
  errores y 22/22 pruebas de almacenamiento.

---

# FASE 8.4 — Geografía y estructura operativa del análisis de productos

## 100. Alcance: solo la capa de productos

```
PRODUCT DATA                                   (no: APPLICATION → GLOBAL GEOGRAPHY)
├── Categoría → Subcategoría → Producto → SKU
└── Geografía / operación del pedido
    ├── Región   (derivada: de su estado o de su sucursal)
    ├── Estado   (catálogo fijo de 32, con código estable)
    ├── Ciudad   (identidad = estado + nombre)
    ├── Sucursal (identidad = código; nombre aparte)
    └── Tipo de entrega (operativa, no geográfica)
```

Canal = dónde se vende; región/estado/ciudad/sucursal/entrega = dónde se atiende el pedido. No se tocó planeación,
metas, forecast, pacing, reforecast, recovery, escenarios, acciones, diagnóstico general, filtros ni navegación global,
canales (`config.channels`) ni métricas (`config.metricKeys`, `packed-v1`). La geografía vive en `productStore`,
`productAnalysis`, `productImport`, `product-view` y en el export de productos.

## 101. Modelo y jerarquía (`FP.productStore`: `dims`, `geo`, `entity`, `geoOptions`)

- **IDs estables:** estado → código (`JAL`, `CDMX`… en `config.products.stateCodes`, mismo orden que `states`, que no
  cambia porque los bloques guardan el índice); ciudad → `JAL-GUADALAJARA`; sucursal → su código (`025`), con nombre
  aparte (`nombre_sucursal`); región → nombre normalizado (`OCCIDENTE`). Nunca el nombre visible como identificador si
  hay código.
- **Jerarquía derivada de los propios archivos de venta (no se inventa):**
  - región de un estado = valor más frecuente de la columna `region` para ese estado (si no hay estado, la de la sucursal);
  - ubicación de una sucursal = estado y ciudad más frecuentes de sus pedidos de **recolección** (en domicilio el estado
    es el del cliente); sin recolecciones, los de todos sus pedidos;
  - nombre de sucursal = `nombre_sucursal` más frecuente; si no hay, el código.
- **Ruta completa:** `entity(nivel, clave)` devuelve `{ level, id, code, name, path[] }`, p. ej.
  Occidente → Jalisco → Guadalajara → Sucursal Guadalajara Centro. Sin duplicar: la región no se guarda por renglón.
- **Persistencia:** listas en `meta.productDims` (sucursales y ciudades) y votos del modelo en `meta.productGeo`; la
  jerarquía se recalcula (`deriveGeo`) al abrir. Todo en IndexedDB, dentro de las stores existentes.

## 102. Datos por renglón y compatibilidad

- **Bloque de venta:** se agregan dos columnas opcionales: `cityIdx` (Uint16) y `geoFlags` (Uint8: 1 estado inválido,
  2 entrega inválida). Los bloques anteriores no las tienen y se leen como "ciudad faltante, sin banderas".
  **No hizo falta esquema v3:** no cambian stores, llaves ni índices; solo campos opcionales dentro del objeto.
- **Llave de venta:** fecha + canal + SKU + estado + sucursal + entrega + ciudad (+ bandera). Compatibilidad: si un día ya
  guardado sin ciudad se vuelve a cargar con ciudad, y los renglones nuevos suman lo mismo que el guardado, se
  **enriquece** (se sustituye por el detalle, sin duplicar); si no cuadran, es conflicto con la política elegida.
- **Resúmenes:** `productRollups` gana el nivel `city`. En instalaciones previas se reconstruyen una sola vez al abrir
  (bandera `meta.productGeoRollups`), sin tocar los bloques. Región no tiene resumen propio: se calcula al consultar.
- **Funnel:** sin cambios; nunca recibe geografía. Al ver o filtrar por región, estado, ciudad, sucursal o entrega, CR y
  funnel quedan "No disponible".

## 103. Importación y calidad

Mismo importador (8.1.1), con campos nuevos opcionales `region`, `ciudad`, `nombre_sucursal` y alias revisados
(`estado_nombre`, `store_id`, `codigo_sucursal`, `municipio`, `store_name`).
**Cambio de contrato respecto a 8.1.1:** estado, sucursal y tipo de entrega pasan de obligatorios a recomendados. Un
renglón sin geografía o con geografía parcial se conserva y se analiza al nivel disponible; nada se descarta por eso.

| Situación | Tratamiento |
|---|---|
| Nivel faltante | "No disponible" (o "No aplica" si el Business Context declara geografía no relevante); nunca 0 |
| Estado o entrega no reconocidos | se conserva el renglón, el valor queda "Inválido" (bandera), no se adivina |
| Geografía parcial / sin geografía | aviso informativo `PARTIAL_GEOGRAPHY` / `NO_GEOGRAPHY` |
| Ciudad sin estado válido | `CITY_WITHOUT_STATE` |
| Nombre de sucursal sin código | `BRANCH_NAME_WITHOUT_CODE` (no se usa como identificador) |
| Estado en varias regiones | `REGION_CONFLICT` (se usa la más frecuente) |
| Sucursal con recolecciones en varios estados | `BRANCH_STATE_CONFLICT` |
| Sucursal con varios nombres / nombre repetido en varios códigos | `BRANCH_NAME_CONFLICT` / `DUPLICATE_BRANCH_NAME` |
| Sucursal sin estado en ningún renglón | `BRANCH_WITHOUT_STATE` |

Solo se rechaza un renglón sin fecha, canal o SKU válidos (igual que antes).

## 104. Análisis y señales

- Un solo motor: `aggregate({ groupBy, filter })` acepta cualquier combinación de niveles de producto y geografía
  (Categoría × Región, Producto × Ciudad, SKU × Sucursal…). Sin funciones por combinación.
- Ruta de navegación genérica (`pa.drill`): se empieza por categoría o por un nivel geográfico y se baja por el
  siguiente natural (región → estado → ciudad → sucursal → categoría…) o por el que se elija en "Desglosar por".
- Filtros de geografía solo dentro de la vista de productos, con jerarquía: estados de la región, ciudades del estado,
  sucursales de la ciudad; al cambiar un nivel se limpian los inferiores. No hay filtro global.
- **Señales geográficas:** para los grupos que más caen y más crecen, si la variación se concentra en pocos estados o
  sucursales (≥ 60 % de la variación en ≤ 2 estados / 3 sucursales con ≤ 50 % de la venta de referencia) o dónde se
  movió más. Cada señal trae dimensión, entidad, periodo, métrica, variación y base de comparación. Se calculan en dos
  pasadas (`crossRevenue`), no una por grupo. Son descriptivas: dónde, no por qué. Cohere no participa en esta fase;
  las señales quedan en el export para que fases posteriores las usen como contexto.
- **Terminología:** la vista usa el término de "sucursal" del Business Context (8.2), p. ej. "Tienda".

## 105. Export y contratos

`category_product_analysis_export.json` gana, de forma aditiva: `rows[].geography` (`{ level, id, code, name, path }`,
null si no aplica), `geoSignals[]` y `geography` (`scope: 'products'`, niveles disponibles, filtros activos, avisos de
calidad). Ningún campo existente cambió. `analysis_export.json` y `reforecast_export.json` (consumidos por Recovery
Center) no se tocaron.

## 106. Pruebas y rendimiento

- Síncronas: 157 (144 anteriores, 2 actualizadas al nuevo contrato de geografía opcional, + 13 de 8.4: códigos,
  jerarquía y rutas, ubicación por recolecciones, CSV completo/parcial/sin geografía/solo estado, calidad y huérfanos,
  faltante vs inválido, cruces que cuadran con el total, filtros jerárquicos, funnel sin geografía, enriquecimiento de
  bloques anteriores, export, alcance solo productos).
- Asíncronas: 25 (se ajustaron 2 a nombres de columna y a la nueva semántica; + 4 de 8.4 sobre IndexedDB: persistencia
  del modelo y resúmenes por ciudad, filtros y desgloses, enriquecimiento al recargar, reconstrucción única).
- Rendimiento (410 mil renglones de venta de prueba): filtro región + estado + ciudad con señales geográficas ~0.4 s.

---

# FASE 9.1 — UX pedagógica ("aprender mientras usas la herramienta")

Extiende la capa de guía de Fase 7; no crea navegación, ayuda, recorrido ni modos paralelos. No toca motores, datos,
exports, IndexedDB ni contratos (el único dato nuevo es la lista de lecciones vistas, dentro de `uxSettings`).

## 105. Qué se reutilizó y cómo se extendió

| Pieza de Fase 7 | Extensión de 9.1 |
|---|---|
| `HELP` (una entrada por concepto) | Campos opcionales `purpose`, `whenToUse`, `decision`, `related`, fusionados desde `PEDAGOGY` en las mismas entradas; 3 entradas nuevas (`diagnostico`, `recovery`, `metodologia`) |
| `EXPLAINERS` (flujo + puntos por vista) | Bloque `learn` (método, supuestos, ejemplo ilustrativo, límites, conceptos relacionados) = nivel 3 |
| `TRIGGERS` | 3 disparadores más (diagnóstico, escenario, pacing) |
| `TOUR` (10 pasos) | 13 pasos: se agregan Plan, Real y Recovery; cada paso con capítulo (Planear, Monitorear, Diagnosticar, Recuperar, Medir) para retomarlo por partes |
| `state.ux.mode` (Ejecutivo / Analista) | Tercer valor `learner` (Aprendiz); mismo selector, lista en `MODES` |
| Siguiente paso (`contextEngine.getNextStep`) | La barra de aprendizaje lo muestra como "¿Qué hago ahora?"; no hay una segunda lógica |
| Panel lateral de ayuda (`FP.help`) | Lo usan también las explicaciones "¿Por qué?" (`FP.help.openPanel`) |
| Estados vacíos (`enhanceEmpty`) | Agregan "Por qué" con el propósito de la vista requerida |

Contenido nuevo en `guidanceConfig.js`, todo como datos: `PEDAGOGY`, `METHOD_GUIDE`, `METHODOLOGY` (13 pasos, narrativa
marcada como fase futura), `VIEW_STEP`, `LESSONS` (10 lecciones), `MODES`.

## 106. Divulgación progresiva

1. **Nivel 1 (siempre visible):** título del explicador, etiqueta de estado, descripción corta del concepto.
2. **Nivel 2 ("¿Cómo funciona?"):** flujo y puntos del explicador; entrada completa de ayuda con las 8 preguntas.
3. **Nivel 3 ("Aprender más"):** método, supuestos, ejemplo ilustrativo, límites y conceptos relacionados. Siempre a
   pedido, en todos los modos, para no sobrecargar.

Las 8 preguntas se mapean a campos de HELP: qué es (`shortDescription`), para qué sirve (`purpose`), cómo funciona
(`detailedDescription`), cómo se calcula (`formula`), qué significa (`interpretation`/`howToRead`), cuándo usarlo
(`whenToUse`), qué NO significa (`caveats`) y qué decisión ayuda a tomar (`decision`).

## 107. Modos

| Modo | Qué cambia (solo presentación) |
|---|---|
| Aprendiz | Barra de aprendizaje (dónde está la vista en la metodología, para qué sirve, qué decisión ayuda a tomar, qué hacer ahora) + microlearning |
| Analista | Igual que antes de 9.1 (explicadores abiertos, todo el detalle técnico) |
| Ejecutivo | Igual que antes de 9.1 (bloques técnicos colapsados, nunca eliminados) |

Cambiar de modo no altera filtros, contexto, vista ni resultados (probado). Los botones "¿Por qué?" y las guías de
método están disponibles en los tres modos.

## 108. "¿Por qué este número?" (`FP.explain`)

Recompone la cifra con la corrida real del motor, sin calcular nada nuevo:

- **Forecast:** actual de los días contados + Σ proyección de los días restantes (del mismo `run.days`), método y
  descripción de `config.forecast.methods`, e índices usados por canal (de `run.channels[ch].assumptions`).
- **Gap a la fecha, cumplimiento, gap forecast:** actual, plan de los mismos días, meta y forecast del resumen del
  periodo (año o mes) que usan las vistas.
- **Identidad:** volumen × CR × AOV con `FP.metrics.calculateOrders/calculateRevenue`.
- **Reforecast:** meta − actual = pendiente, días futuros, requerido y presión (de la corrida de reforecast).

Cada explicación trae una **verificación**: si la suma de los pasos no coincide con la cifra del motor, lo muestra en
lugar de ocultarlo. Separa "¿cómo se calculó?", "¿qué significa?" y "¿qué NO significa?".

Dónde aparece: KPIs de Pacing & Forecast, tarjetas de Inicio y recuperación requerida en Recovery & Reforecast.

## 109. Métodos de forecast: la explicación coincide con el código

Los nombres y descripciones se leen de `config.forecast.methods` (la misma fuente que el motor). `METHOD_GUIDE`
solo agrega lo pedagógico, redactado leyendo `forecastMethods.js`:

| Método | Usa | Supone |
|---|---|---|
| A · Plan restante | el plan de cada día restante | lo que falta será como se planeó |
| B · Performance acumulada | plan × índice acumulado del año | el desempeño del año se mantiene |
| C · Performance reciente | plan × índice de la ventana reciente (28 días por defecto) | el desempeño reciente se mantiene |
| D · Por drivers | volumen, CR y AOV del plan × el índice de cada uno (28 días / acumulado / acumulado); pedidos y venta derivados | cada palanca mantiene su desempeño |

Nota: el prompt de 9.1 nombraba los métodos "Ritmo, Reciente, Acumulado, Combinado". Esos nombres no existen en el
código; se documentaron los cuatro métodos reales para no contradecir al motor.

## 110b. Preparación de datos (ajuste posterior a 9.1)

En Inicio, junto a "Siguiente paso". NO es un puntaje de desempeño del negocio (viola a propósito la regla de
Fase 7 de "nunca un score" si se leyera así, por eso el texto siempre aclara "No mide el desempeño del negocio";
mide qué tan completa está la información para que plan, pacing y forecast sean confiables): usa los mismos
campos de `collectStatus` que ya usa el siguiente paso, sin agregar una segunda fuente de verdad.

Seis requisitos con peso (suman 100), calculados en `contextEngine.dataReadiness` y con las etiquetas en
`guidanceConfig.READINESS`:

| Requisito | Peso | Tipo |
|---|---|---|
| Meta anual definida | 15 | Bloqueante |
| Plan distribuido (propio o importado) | 20 | Bloqueante |
| Venta real cargada (≥ 1 día) | 30 | Bloqueante |
| Cobertura reciente de venta real (≥ 70 % de los días transcurridos del año) | 15 | Recomendado |
| Histórico cargado | 10 | Recomendado |
| Sin errores de calidad | 10 | Recomendado |

Compuerta dura: sin ningún día de venta real, el resultado se limita a 45 % aunque el resto esté completo,
porque sin real no hay pacing ni forecast que mostrar (no es "menos confiable": no hay nada que mostrar). Semáforo:
≥ 85 verde, 50–84 ámbar, < 50 rojo. El recorrido guiado (`TOUR`) siempre empieza en Meta porque enseña el orden
conceptual completo, no el estado real de los datos; su primer paso incluye una nota aclarando que el
siguiente paso *real* está en Inicio, para no confundir las dos cosas. La misma barra de preparación (mismo
`dataReadiness`, no un segundo cálculo) viaja además con el recorrido en la cabecera de `tour-bar` en los 13
pasos, y se actualiza en vivo si el usuario carga datos o guarda el plan mientras el recorrido sigue abierto.

**Consolidación de "siguiente paso" en Inicio:** existían tres mecanismos mostrando qué hacer después en la misma
pantalla: el "Siguiente paso" chico de la barra de contexto (en todas las vistas), una tarjeta ancha idéntica
dentro de "Recorrido del sistema" (solo en Inicio) y el checklist "Para usar esta vista necesitas" (con una regla
distinta, `NEEDS`, que para `pacing` no incluía la meta y mandaba a Plan cuando lo que faltaba era la meta). Se
corrigieron ambas cosas: `NEEDS.pacing/reforecast/diagnostico/recovery` ahora empiezan por `targets` (la cadena
real es meta → plan → actual), y se quitó la tarjeta ancha duplicada de "Recorrido del sistema" (que solo repetía
el chico de arriba), dejando una nota que apunta a él. Quedan dos rutas, no tres: el recorrido guiado (fijo, para
quien no sabe qué hacer) y "qué me falta" (el chico de la barra de contexto + el checklist, ambos con la misma
cadena real de dependencias).

**Corrección de CSS:** `.why-steps` (lista numerada 1-6 de `diagnostic-guide.js`, grid de 28px + contenido) y la
lista de pasos de cálculo de `explain.js` (etiqueta ↔ valor, `justify-content: space-between`) compartían por
accidente el mismo nombre de clase; la segunda definición, más reciente, ganaba la cascada y descomponía la lista
numerada (número a la izquierda, contenido empujado al extremo derecho con un hueco enorme). Se separaron: la
numerada conserva `.why-steps`, la de cálculo pasa a `.calc-steps`.

**Nota de referencia en señales (`diagnostic-guide.js`):** cuando la comparación activa no es ya contra el año
anterior y alguna de las señales mostradas cayó a esa referencia porque el plan o el forecast no tienen desglose
por segmento (`driverEngine.segmentDimensions`, ver §Fase 5), el paso "Señales relacionadas" agrega una línea
explícita: "El plan y el forecast no tienen desglose por segmento: estas señales comparan contra el año anterior."
Antes solo constaba al final de cada evidencia individual; ahora se avisa una vez, de forma visible, sin cambiar
el cálculo.

## 110. Microlearning

`LESSONS`: una idea por evento real (plan guardado, datos cargados, pacing visto, forecast visto, método cambiado,
señal vista, reforecast visto, escenario guardado, acción medida, geografía de productos vista). Solo en modo
Aprendiz, una lección a la vez, descartable ("Entendido") y nunca repetida (`uxSettings.learned`).

## 111. Integridad y terminología

- Los ejemplos se etiquetan "Ejemplo ilustrativo"; no se muestran cifras inventadas como reales.
- Ninguna explicación afirma causas; la de diagnóstico enseña explícitamente driver ≠ señal ≠ hipótesis.
- La geografía se explica como exclusiva del análisis de productos (Fase 8.4).
- Los textos nuevos pueden usar `{{sale}}`, `{{order}}`, `{{customer}}`, `{{product}}`, `{{location}}` (y plurales),
  resueltos con la terminología del Business Context (Fase 8.2).
- Cohere no interviene: la metodología es determinística y versionada con el código.

## 112. Pruebas

- Síncronas: 168 (157 anteriores + 11 de 9.1: pedagogía completa de conceptos clave, un solo sistema de ayuda, guía
  de métodos = configuración del motor, "¿por qué?" = cifras del motor en los 4 métodos, identidad y reforecast,
  significado sin causalidad, cadena metodológica, lecciones, modos, terminología, ejemplos ilustrativos). Una
  prueba de Fase 7 se ajustó: exigía exactamente 10 pasos de recorrido; ahora exige que los 10 originales sigan en
  orden dentro del recorrido extendido.
- Asíncronas: 25, sin cambios.

# FASE 9.2 — Narrativa ejecutiva

## 113. Principio: capa de comunicación, no un motor nuevo

```
DATOS → CÁLCULOS DETERMINÍSTICOS → DIAGNÓSTICOS → SEÑALES → HIPÓTESIS → NARRATIVA
```

`js/narrative/narrativeEngine.js` no calcula nada: lee `run.total.annual` (Fase 3, mismo objeto que pinta
Pacing), `diag.level1/level1Drivers/signals/hypotheses` (Fase 5 — `signal.evidence` e `hypothesis.hypothesis`
ya vienen redactados y validados por `signalEngine`/`hypothesisEngine`; aquí solo se citan tal cual),
`pa.rows/compensation/geoSignals` (Fase 8.1.1/8.4, solo si ya se calculó antes en la sesión) y
`rf.total.horizon(Summary)` (Fase 4). El siguiente paso reutiliza `FP.contextEngine.getNextStep` (Fase 7):
no existe un segundo motor de recomendaciones.

## 114. Seis niveles de certeza (nunca se mezclan)

| Nivel | Significa | Fuente |
|---|---|---|
| `hecho` | Dato observado | `run.total.annual.actualToDate/plan` |
| `calculo` | Resultado del motor determinístico | `run.total.annual.toDate/forecast`, `rf.total.horizon` |
| `driver` | Atribución matemática (nunca una causa) | `diag.level1.statement`, `diag.level1Drivers` |
| `senal` | Patrón que amerita investigación (nunca una causa confirmada) | `diag.signals[].evidence`, `pa.geoSignals[].label` |
| `hipotesis` | Explicación posible, siempre con lenguaje de posibilidad | `diag.hypotheses[].hypothesis` |
| `accion` | Siguiente paso, nunca una promesa de resultado | `contextEngine.getNextStep` |

Cada afirmación (`claim`) es `{ id, level, text, source: {module, field, …}, numbers: [...] }`. `numbers` es
el registro de cifras que el texto cita (extraídas del propio texto ya formateado); sirve para la UI
("¿Por qué dices eso?") y para la validación anti-alucinación de Cohere (§116).

## 115. Ready to narrate

`narrativeEngine.readyToNarrate({ run, rf, diag, pa, rcAnalysis })` → `{ performance, forecast, diagnosis,
signals, hypotheses, productAnalysis, recovery, scenarios }`, todas booleanas e independientes. `performance`
exige `run.plan.source !== 'none'` y `run.total.annual.actualToDate.revenue` finito (un `run` existe casi
siempre; sin plan ni real, sigue existiendo la forma pero sin datos — de ahí el chequeo explícito, no solo
"¿existe el objeto?"). Ninguna sección se rellena si falta: cada una trae en `EMPTY` (dentro del propio
motor, mismo patrón que `productAnalysis.compensation`/`impactMeasurement`, no en `guidanceConfig`, porque es
texto que el motor produce a partir de datos, no ayuda estática de la app) el mensaje informativo que la UI
muestra en su lugar.

## 116. Cohere — redacción validada, nunca fuente de cálculo

`js/ai/cohereNarrative.js` sigue el mismo patrón de `cohereDiagnostic.js` (Fase 5): system rules explícitas,
`RESPONSE_SCHEMA`, y validación de la respuesta antes de mostrarla. El payload (`buildPayload`) solo manda
`{ level, text }` de cada claim ya calculado, agrupado por sección — nunca `store`, `run` ni los motores.
Tres validaciones, cualquiera que falle descarta la respuesta completa (fallback: la narrativa determinística
de arriba, que nunca depende de Cohere):

1. JSON con `summary` y `narrative` no vacíos.
2. **Anti-alucinación numérica**: se extraen todos los números del texto de Cohere y cada uno debe
   corresponder (con tolerancia de formato — comas, redondeo a ≤ 0.05 de diferencia o ≤ 0.5 % relativo) a
   alguno de los `numbers` ya citados por los claims. Un número nuevo = respuesta rechazada.
3. Lenguaje causal no permitido ("la causa es", "esto demuestra", "se debe a") en cualquier parte del texto.

## 117. Alcance de producto y geografía (respeta el límite de Fase 8.4)

`narrativeEngine` solo cita `pa` (productAnalysis) si ya se calculó antes en la sesión (`state.pa.result`):
no lo fuerza a calcularse ni le agrega un segundo selector de periodo. Sin eso, la sección "Producto y
geografía" queda vacía con su mensaje informativo. La geografía (región/estado/ciudad/sucursal/entrega) solo
aparece dentro de esta sección, citando `pa.geoSignals[].label` tal cual — nunca se convierte en una
dimensión transversal del resto de la narrativa.

## 118. UI: una vista más del grupo "Medir y aprender", no una segunda navegación

`js/ui/narrative-view.js` se integra en la Fase 7/9.1 existente:

- Vista `narrativa`, grupo `medir` (junto a `medir`/Seguimiento). Sin filtros propios: narra el mismo
  canal/periodo/comparación de `state.dx.settings` (Diagnóstico) — un enlace, no un segundo picker.
- El paso de metodología que ya existía como reservado (`{ id: 'narrativa', ..., upcoming: true }`, agregado
  en 9.1 previendo esta fase) se activó con `help: 'narrativa'` y `view: 'narrativa'`.
- Modo Ejecutivo: solo el resumen ejecutivo, el driver principal, la señal de mayor prioridad y el siguiente
  paso quedan visibles (`data-analyst` en el resto, mismo mecanismo de Fase 7 — sin selectores nuevos en
  `ANALYST_ONLY`, marcados inline en el HTML que genera la vista). Modo Analista: todo. Modo Aprendiz: la
  barra de aprendizaje y el explicador de la vista los sigue pintando el render genérico de 9.1 — no hay
  código propio de esta vista para ese modo.
- "¿Por qué dices eso?" es un `<details>` por afirmación con su `source` y sus `numbers`; no es un modal
  nuevo, y no recalcula nada: muestra el mismo `source` que ya trae el claim.
- El recorrido guiado ganó un paso final (`narrativa`, capítulo "Medir") y el microaprendizaje una lección
  (`narrative-generated`).

## 119. Export: narrative_export.json (aditivo)

`js/export/narrativeExport.js` empaqueta la narrativa (period, channel, comparison, businessContext,
readyToNarrate, executiveSummary, sections, claims, assumptions, provenance) y, si existe, la redacción de
Cohere ya validada. No modifica ningún campo de `planning_export.json`, `forecast_export.json`,
`reforecast_export.json`, `analysis_export.json`, `action_plan_export.json` ni
`category_product_analysis_export.json` — es un archivo nuevo. Pensado para que la futura Fase 10 (paquete de
análisis) lo consuma sin rearmar la narrativa desde cero.

## 120. Pruebas

Síncronas: 186 (186 anteriores + 15 de 9.2: ready-to-narrate por sección, construcción con y sin datos,
niveles de certeza sin mezclarse, integridad numérica — el motor no cambia nada de lo que ya calcularon
forecast/diagnóstico al construir la narrativa —, producto/recovery opcionales, siguiente paso reutilizando
`contextEngine`, registro de cifras citadas, export, y cuatro de Cohere: payload sin datos crudos,
anti-alucinación, lenguaje causal y disponibilidad sin narrativa lista). Una prueba de Fase 9.1 se corrigió:
dependía de que `config.business.terms` estuviera en sus valores por defecto en tiempo de ejecución, lo cual
no siempre es cierto (Business Context activo) — ahora pasa explícitamente los términos por defecto,
independiente del contexto de negocio activo en el navegador.

Se corrigió además un olvido de integración: `VIEWS` en `app.js` (la lista maestra del enrutador) no incluía
`'narrativa'`, así que la vista existía en `guidanceConfig`/HTML pero el router nunca la mostraba. Se agregó.

# FASE 9.2.x — Hardening de narrativa

## 121. Principio: obtener, no esperar a que el usuario haya navegado

Antes de esta fase, `ensureNarrative()` leía `state.pa.result` y `state.rc.analysis` tal como estuvieran —
`null` si el usuario nunca había visitado Categoría → Producto o Recovery Center, aunque los datos para
calcularlos existieran. Se corrigió sin crear un segundo motor ni un segundo selector:

```
ANTES                                    DESPUÉS
Producto → visitar la vista → Narrativa   Narrativa → ensureProductAnalysisForNarrative()
Recovery → visitar la vista → Narrativa   Narrativa → ensureRecoveryAnalysisForNarrative()
```

`ensureProductAnalysisForNarrative(diag)` (en `app.js`): si `state.pa.result` ya existe (el usuario visitó
Producto antes, con su propio alcance), lo respeta tal cual — nunca lo reescribe para forzarlo a coincidir
con Diagnóstico. Si no existe ninguno, usa `FP.productAnalysis.fromDiagnosis(diag)` (función ya existente,
la misma que alimenta el botón "Usar periodo y canal del diagnóstico") como valor por defecto razonable la
primera vez, y llama a `ensureProductAnalysis()` — el mismo motor y la misma caché de siempre (`state.pa.key`).
Como `productAnalysis.run()` toca IndexedDB, es asíncrono: la narrativa se pinta primero con lo que ya está
disponible (rendimiento, drivers, señales) y, cuando el cálculo de producto termina, se repinta solo si el
usuario sigue en la vista Narrativa — mismo patrón que ya usaba `ensureProductAnalysis` para refrescar la
vista de Producto.

`ensureRecoveryAnalysisForNarrative(diag)`: `ensureRecovery()` ya es síncrono (no toca IndexedDB), así que
aquí no hace falta nada asíncrono. Si no hay ya un análisis (`state.rc.analysis`) ni un recovery importado,
se toma el canal/periodo de Diagnóstico como valor por defecto de `state.rc.settings` la primera vez; si ya
existe uno (visitado antes, con su propio canal/periodo/horizonte), se deja intacto.

## 122. Contrato de alcance (scope)

Cada afirmación que proviene de una fuente con contexto propio (Producto, Recovery) trae en `source.scope`
de qué canal, periodo, comparación y nivel viene — nunca se asume que coincide con el canal/periodo/
comparación de Diagnóstico, que sigue siendo el contexto **principal** de toda la narrativa:

```js
// Producto
{ source: 'productAnalysis', channel, period: { from, to }, comparison, level, levelLabel }
// Recovery (dos partes independientes: el horizonte es de Reforecast, el canal/periodo de Recovery Center)
{ reforecast: { source: 'reforecastEngine', channel, horizon }, recoveryCenter: { source: 'recoveryEngine', channel, period } }
```

`narrativeEngine.build()` expone esto en dos lugares: `n.sections.product.scope` / `n.sections.recovery.scope`
(para el banner compacto de la UI) y dentro de `source.scope` de cada claim individual de esas secciones
(para "¿Por qué dices eso?" y para que Fase 10 pueda leer el alcance sin tener que re-derivarlo). La UI
(`narrative-view.js`) pinta un banner una sola vez por sección — no se repite en cada afirmación — con el
canal, el periodo y (para Producto) el nivel, o (para Recovery) el horizonte real del reforecast, que puede
ser anual o mensual según lo que haya calculado el motor, nunca asumido.

## 123. Bug de etiquetas corregido

`levelLabel(level, businessTerms)` reutiliza el catálogo ya existente `FP.productView.LEVEL` (una sola fuente
de verdad — antes vivía privado dentro de `product-view.js`; ahora se exporta) y, solo para `branch`, respeta
`businessTerms.location` si el Business Context (Fase 8.2) definió otro nombre (por ejemplo, "Farmacia"). Antes
de esta corrección, cualquier nivel distinto de `category` se imprimía tal cual, en inglés: *"En state..."*,
*"En branch..."*.

## 124. geoSignals: "sin datos" ≠ "sin señal para este nivel"

`productGeoNote(pa, hasGeoData)` distingue tres casos, en vez de guardar silencio o decir "no hay información
geográfica" cuando sí la hay:

1. Sin `hasGeoData` (el archivo de venta no trae estado/sucursal/entrega): *"No hay datos geográficos
   cargados en productos..."*
2. Con datos geográficos pero viendo ya por región/estado/ciudad/sucursal/entrega (`geoSignals` no se calcula
   en esos niveles — comportamiento intencional de Fase 8.4, sin modificar): *"Hay datos geográficos, pero
   al ver ya por geografía no se generan señales geográficas adicionales..."*
3. Con datos geográficos, en un nivel de producto, pero sin ninguna concentración que supere el umbral:
   *"Hay datos geográficos, pero no se generó ninguna señal geográfica para este periodo y nivel..."*

`hasGeoData` se calcula en `app.js` desde `FP.productStore.meta` (`states`/`branches` con más de la entrada
"(sin dato)") y se pasa a `build()` — `productAnalysis.js` no se modificó.

## 125. Bug adicional encontrado y corregido: fuga de "null" como texto

Al validar visualmente esta fase se encontró que, cuando una fila de producto no tenía una variación
porcentual calculable (referencia en cero), el texto imprimía literalmente la palabra `null` (p. ej.
*"Medicamentos: estable null, participación..."*). Se agregó `spctOr(valor, textoAlterno)` y se aplicó en las
tres construcciones de texto que podían filtrar `null`: la fila de producto, la contribución de un driver, y
el forecast de cierre cuando la meta del periodo es cero. Ninguna combinación de valores no finitos puede ya
producir la palabra "null" visible.

## 126. Preparación para Fase 10

Con esta fase, toda fuente que la narrativa cita —Producto, Recovery— es recuperable de forma determinística
sin depender de qué haya visitado el usuario, y cada una declara su propio alcance de forma explícita y
trazable por afirmación (`source.scope`). Esto es exactamente lo que una futura Fase 10 (Analysis Package)
necesitaría para consolidar: no hace falta "adivinar" qué contexto usó cada motor, porque ya viaja con cada
resultado. No se implementó ningún paquete de consolidación en esta fase — solo se garantizó que la
información existiera y fuera recuperable.

## 127. Pruebas

Síncronas: 196 (186 anteriores + 10 de 9.2.x: catálogo de etiquetas completo y su respeto al Business Context,
alcance de Producto expuesto e independiente del de Diagnóstico, no reutilización incorrecta de un resultado
de otro nivel/canal, alcance de Recovery con horizonte real —anual y mensual, probado explícitamente en
ambos casos—, provenance con alcance en cada claim de fuentes secundarias, las tres distinciones de
`geoSignals`, ausencia de scope geográfico fuera de Producto, funcionamiento de Producto sin diagnóstico
activo, y ausencia de la palabra "null" en cualquier claim). Los casos A/B/C/D de dependencia de navegación
(§121) se validaron en navegador, no en `self-test.js`, porque requieren IndexedDB real — mismo criterio que
el resto de las pruebas de Producto en este proyecto.

# FASE 9.1.x — Capa de propósito y acción por vista + RevNavigator

## 128. Auditoría previa (obligatoria antes de tocar código)

Antes de escribir nada se confirmó dónde vive cada pieza del sistema pedagógico de Fase 7/9.1, para extenderlo
en el lugar correcto y no crear nada paralelo:

| Pieza | Vive en | Ya cubría |
|---|---|---|
| `purpose` por vista | `guidanceConfig.VIEWS[view].purpose` | "¿Para qué sirve?" — **ya se pintaba en todas las vistas y modos**, vía `ux-context__purpose` |
| Descripción dinámica por estado | `contextEngine.WHAT_IT_MEANS[view](status)` | "¿Qué está pasando ahora?" (cuenta de hipótesis, disponibilidad de forecast, etc.) |
| Qué falta para avanzar | `contextEngine.NEEDS` + `requirements(view, status)` | El checklist de estado vacío y "Preparación de datos" (9.1) |
| Siguiente paso | `contextEngine.RULES` + `getNextStep(status)` | El widget "Siguiente paso" en la barra de contexto |
| Ayuda profunda por concepto | `HELP`, `EXPLAINERS`, glosario | Nivel 4 ("¿qué significa?", "¿por qué este número?") |
| Metodología completa | `METHODOLOGY` + `VIEW_STEP` + `learningBar()` (solo modo Aprendiz) | La cadena Meta→…→Narrativa con "¿para qué sirve?" y "¿qué decisión ayuda a tomar?" por paso |

Conclusión de la auditoría: **faltaban específicamente "¿qué hago aquí?" (acción) y "¿qué obtengo?" (resultado)**
como campos propios de cada vista — "para qué" y "qué necesito" ya existían, solo había que conectarlos.

## 129. Qué se reutilizó y qué se extendió

**Reutilizado sin cambios:** `NEEDS`/`requirements()` para "¿qué necesito?" (nunca se creó una segunda lista
de pendientes), `getNextStep()` para "¿qué sigue?", `HELP`/`EXPLAINERS`/glosario para la ayuda profunda,
`FP.explain.term()` para la terminología del Business Context, el propio objeto `VIEWS` como única fuente de
contenido por vista, y `learningBar()` como el único lugar donde vive el detalle de modo Aprendiz.

**Extendido:** `VIEWS[view]` ganó dos campos nuevos, `action` y `produces`, en las 17 vistas (16 con
`produces`; `ayuda` no tiene un "resultado" que producir). `contextEngine.describe()` los expone como
`whatToDo`/`whatYouGet`. `navigation.js` pinta `whatToDo` en una línea nueva, compacta, siempre visible, justo
debajo del propósito existente. `help.js`'s `learningBar()` (modo Aprendiz) ahora también muestra "¿Qué hago
aquí?" y, en el lugar de "¿qué decisión ayuda a tomar?", intercala "¿Qué necesito?" (primer pendiente de
`requirements()`) o "¿Qué obtengo?" (`produces`) según si falta algo o no — sin crear una tercera pregunta
paralela a las que ya existían.

No se creó: un segundo `HELP`, un segundo `TOUR`, un segundo objeto de contenido pedagógico, ni una nueva
lógica de *readiness*.

## 130. Estado dinámico (reutiliza `requirements()`, no una lógica nueva)

Verificado en navegador: en Plan, sin histórico ni meta capturada, el modo Aprendiz muestra *"¿Qué necesito?
Capturar la meta anual por canal → Ir"*. En cuanto se carga histórico y se guarda la meta, la misma línea
cambia sola a *"¿Qué obtengo? Un plan distribuido que alimentará Pacing, Forecast y Recovery."* — sin tocar
ninguna lógica de estado: es el mismo `requirements()` de siempre, ahora también leído desde `learningBar()`.

## 131. Modos

`describe()` no depende de `state.ux.mode`: `whatToDo`/`whatYouGet` existen siempre, igual que `purpose`. Lo
que cambia por modo es **qué se pinta**, no el contenido disponible:

- **Analista/Ejecutivo:** propósito + acción, ambos compactos, siempre visibles. Ayuda profunda bajo demanda
  ("Ayuda de esta sección"). El modo Ejecutivo, además, sigue colapsando los bloques marcados `data-analyst`
  (sin cambios de esta fase).
- **Aprendiz:** además de lo anterior, la barra de aprendizaje agrega "¿qué hago aquí?", "¿para qué sirve?"
  (del paso de metodología), "¿qué necesito?"/"¿qué obtengo?" dinámico, y "¿qué hago ahora?".

## 132. Negocio genérico

`action`/`produces` usan `{{sale}}` donde corresponde (por ejemplo, en Pacing y Reforecast) y se resuelven con
`FP.explain.term()` — el mismo mecanismo de Fase 8.2/9.1, no uno nuevo. Ningún texto asume un giro de negocio
específico.

## 133. Cambio de nombre: RevNavigator

El nombre visible de la herramienta pasa de "Digital Sales Forecast & Pacing" a **RevNavigator**. Se
clasificó cada aparición antes de tocar nada:

| Referencia | Tipo | Acción |
|---|---|---|
| `config.app.name` | Branding visible (fuente única: `<title>`, `<h1>` y el pie de página se pintan desde aquí en tiempo de ejecución) | Cambiada |
| `<title>` y `<h1>` en `index.html` | Branding visible (además de ser el valor de arranque antes de que cargue JS) | Cambiada |
| `tools/idb-proof.html` (título) | Documentación visible de una herramienta de prueba | Cambiada |
| Encabezados de `ARCHITECTURE.md`, `UX_GUIDE.md`, `DATA_DICTIONARY.md`, y un ejemplo de export en `ARCHITECTURE.md` | Documentación visible | Cambiada |
| `STORAGE_NAMESPACE = 'fp.v1'` (prefijo de `localStorage`) | Identificador técnico | **Conservado** — cambiarlo invalidaría las preferencias guardadas de instalaciones existentes |
| `storageDb.name = 'fp-data'` (base de IndexedDB) | Identificador técnico | **Conservado** — cambiarlo crearía una base vacía nueva, perdiendo el acceso a los datos ya guardados |
| Namespace global `FP` | Identificador técnico (variable JS) | **Conservado** — no aporta nada cambiarlo y es la base de todo el código |
| Nombre del archivo de entrega (`forecast-pacing.zip`) | Identificador técnico de empaquetado | **Conservado** |

`config.business.name` (el nombre del **negocio** que configura el usuario en Business Setup, Fase 8.2) es un
campo completamente distinto y no se tocó — RevNavigator es la herramienta; el nombre del negocio sigue
siendo independiente, exactamente como pide esta fase.

## 134. Pruebas

Síncronas: 205 (196 anteriores + 9 de 9.1.x: cobertura de `action`/`produces` en las 17 vistas, `describe()`
expone `whatToDo`/`whatYouGet` leyendo `VIEWS` sin segunda fuente, una vista puede representar las seis
respuestas a la vez, el estado dinámico con y sin requisitos pendientes reutilizando `requirements()`, la
terminología de negocio interpolada en `action`, independencia de `describe()` respecto al modo, y dos de
branding: el nombre visible es RevNavigator y ningún campo de `config` conserva el nombre anterior, con el
namespace de storage y la base IndexedDB intactos). Validación manual adicional en navegador: barrido de las
17 vistas confirmando la línea de acción con texto real y correcto en modo Analista, y confirmación de que el
modo Ejecutivo la conserva mientras oculta la barra de aprendizaje (exclusiva de Aprendiz).

## Etapa H (9.x) — Módulos analíticos: cambios de estructura CSS/UI

- `css/design-system.css` incorpora el bloque «ETAPA H»: `state-tag` con paleta de `ds-badge`, `metric-grid--{2,3,4}`, encabezados de tabla por estado (`th[data-state]`), barras de cierre por estado, `ds-badge--chain` (cadena de evidencia), `ds-badge--neutral/baseline`, `geo-filters`, `tree-node` con `minmax(0, 1fr)` y ajustes del acordeón plano. Sin cambios en `js/` fuera de las vistas, `PV().card` (componente de métrica compartido, `pacing-view.js`) y `FP.recoveryCenter.NODE_BADGE`.
- Sin cambios en el motor, los exports ni el almacenamiento: los exports se comparan campo a campo en cada lote (`tools/regression/`).
- `tools/regression/` suma: `shots.py`, `batch_h.py`, `geom.py`, `products_snapshot.py` + `compare_products.py`, `recovery_state.py` + `recovery_snapshot.py` + `compare_recovery.py` / `compare_medir.py` / `compare_narrativa.py` (estados con datos de Producto, Recovery Center, Medir y Narrativa), y `compare.py --allow-add`.

## Revisiones de uso (post-etapa H)

- Nueva vista especial `ajustes` («Configuración de RevNavigator», `js/ui/settings-view.js`): solo orienta, sin lógica ni almacenamiento. Registrada en `VIEWS` de `app.js`, en `guidanceConfig.VIEWS` (grupo `ayuda`) y en el pie del menú.
- `navigation.js`: grupos plegables (`FP.navigation.toggleGroup`, acción `nav-group`); estado solo en memoria de sesión.
- `app.js`: arrastrar y soltar delegado en `document` (`dragenter/dragover/dragleave/drop`) hacia `stageFiles()`, que comparte el camino de `pickFiles()`.
- `help.js`: la tarjeta del explicador ya no lleva `open`; recuerda la apertura manual solo mientras se está en la misma vista.
- CSS: `design-system.css` suma el bloque «REVISIONES DE USO» (tope de ancho 1400 px, densidad de tablas, ritmo vertical, menú plegable). Sin cambios en el motor, los exports ni el almacenamiento.
- `tools/regression/`: `batch_i.py`, `spacing.py`, `tables_fit.py`; la batería lee el texto con los `<details>` abiertos y admite `EXCLUDE=vista,…` para correr sobre una base anterior a una vista nueva.

## Revisiones de uso · segunda tanda

- `negocio` deja de ser una vista: su HTML vive en `#view-ajustes` (`#st-negocio`) y `readHash()` traduce `#negocio` a `#ajustes` (con `state.ajustesSection`). `VIEWS` de `app.js` ya no lo lista; `guidanceConfig.GROUPS.planear.views` tampoco; `guidanceConfig.VIEWS.negocio` se conserva (grupo `ayuda`) por sus metadatos y entradas de ayuda.
- `FP.settingsView.render(state)` pinta modo / IA / almacenamiento y enlaces; `FP.businessView.render(state)` se llama también desde `ajustes`. `FP.productView.storageBlock(state)` es el bloque de almacenamiento (antes dentro de `renderStatus`).
- `navigation.js`: `toggleGroup(id)` navega a la primera vista del grupo si no es el actual; `renderNav` deja abierta solo la sección de la vista actual. Sin estado persistente.

## Revisiones de uso · tercera tanda

- La sección `status-bar` (fuera de las vistas) desaparece de `index.html`. `FP.ui.renderStatus` pinta siempre las tres píldoras en `#topbar-status` (encabezado) y la ficha completa en `#status-bar` solo si existe (dentro de la vista `ajustes`, que la reescribe cada vez que `settings-view` repinta; por eso `app.js` llama a `renderStatus` justo después de `settingsView.render`).
- Enlaces con `data-section` (las píldoras): `app.js` fija `state.ajustesSection` y, si el hash ya es el destino, repinta para llegar a la sección.
- `guidanceConfig.GROUPS.planear.views` define el orden del menú de Planear.

## Revisiones de uso · cuarta tanda

- `guidanceConfig.MODES` = `[['learner','Aprendiz'],['analyst','Analista']]`; `FP.app` migra un modo guardado inexistente a `analyst` en `loadUx`. `navigation.applyMode` solo alterna `mode-learner`.
- `contextEngine.RULES`: regla `load_historical` (view `carga`) entre `fix_quality` y `set_targets`.
- `guidanceConfig.TOUR`: nuevo primer paso `datos` (capítulo «Planear»); `CH.datos`.
- `planning-view.header`: aviso `ds-alert--warning` cuando la vista previa no tiene histórico y no existe plan original.

## Etapa I-final

- `navigation.renderContextBar`: nuevo marcado (`.ux-context__top` → migas + `.ux-context__actions`; `.ux-context__text`; `.next-step`; `.ux-context__meta`). Modificador `.ux-context__inner--solo` cuando no hay siguiente paso (o en Inicio). Sin cambios en `contextEngine`, en las acciones (`help-section`, `glossary`, `tour-start`, `go`) ni en `learningBar`.
- CSS: bloque «I-final» al final de `design-system.css` (grid con áreas `top / text next / meta`, apilado ≤ 1100 px, acciones en 3 columnas ≤ 600 px, barra de aprendizaje en dos columnas ≥ 900 px).

## Etapa J · Accesibilidad

- `index.html`: `a.skip-link[data-skip]` (primer elemento del `<body>`) y `#route-announcer` (`role="status"`, `aria-live="polite"`, `visually-hidden`). `app.js`: `announceView()` (título de pestaña + anuncio, solo al cambiar de vista) y un manejador de clic para `a[data-skip]` que enfoca `main.app-main:not([hidden])`.
- `design-system.css`: bloque «ETAPA J» (skip-link, tokens `--ds-fs-micro/title/lead` y `--ds-r-xs`, clases `tour-step__n--N`, `.ds-h4`, objetivos táctiles de 44 px con áreas ampliadas por pseudo-elemento y `--ds-header-h` de 108 / 152 px en móvil). `styles.css`: `--c-na` y `--c-ok` corregidos.
- `help-view.js`: `STEP_COLORS` son índices de clase, ya no hex. `index.html`: el contexto de negocio (dentro de `#view-ajustes`) usa `h3`.
- `tools/regression/`: `a11y_audit.py`, `a11y_report.py`, `batch_k.py`; `contrast.py` cubre `--c-*`, encabezado oscuro y blanco sobre color de estado (`A11Y_ONLY=390` limita la auditoría a los objetivos táctiles).

## Inicio · datos primero

- `guidanceConfig.READINESS.items`: nuevo orden y `hint` opcional por ítem; `contextEngine.dataReadiness` lo expone sin cambiar pesos.
- `contextEngine.NEEDS.inicio` (con 4.º y 5.º elemento opcionales: `optional`, `note`) y `requirements()` que los devuelve; `help.enhanceEmpty` ignora los opcionales para el botón y lista sus notas.
- `home-view.render`: rama `planOnly` (plan sin venta real) con tarjetas del plan; Inicio usa `requirements('inicio')` en vez de `requirements('pacing')`.

## Calidad de datos · huecos por canal

- `quality-view.js`: `gapSentences(q)` (banner), `loadedMissingChannels(q)` (Total de «Canales sin datos»), `dateRanges`/`missingByChannel` (bloque plegable de fechas faltantes por canal) e `issuesByType` con el aviso de cobertura. `coverage.js` no cambia: `summarize()` y el export `data_quality` son idénticos.

## Renombre a RevNavigator y árbol de drivers

- `config.app.name` = `'RevNavigator'` (única fuente del nombre; los 7 exports lo leen en `source.app` / `metadata.app`). `FP.config.storage.namespace` (`fp.v1`) y `storageDb.name` (`fp-data`) no cambian: son independientes del nombre visible.
- `diagnostic-view.renderTree`: `<details class="driver-node">` dentro de `.driver-tree`; `.tree-node` queda solo para la cadena trazable (Recovery Center y Medir).

## Fase 10 · Paquete de análisis

- `js/export/zip.js` → `FP.zip.create(files) / download(name, bytes) / crc32` (zip «stored», UTF-8, sin dependencias).
- `js/export/analysisPackage.js` → `FP.analysisPackage.build(entries, meta)`: lista fija `EXPORTS` (7), `records(obj)`, `redact()` (narrativa sin `businessContext`), archivo vacío con aviso, `indice.json` (schema `analysis_package` 1.0.0) y `LEEME.txt`.
- `app.js` → `EXPORT_BUILDERS` (un constructor por export, usado por los botones individuales y por el paquete), `previewPackage()` (estado por export para la página) y `buildAnalysisPackage()` (calcula forecast, reforecast, diagnóstico y productos antes de armar); acción `pkg-download`.
- `js/ui/package-view.js` + vista `paquete` (grupo `medir`) en `guidanceConfig.VIEWS`/`GROUPS`, `index.html` y el menú.

## Mes por defecto y selección de periodo y canal

- `app.js`: `defaultMonth(cutoff)` (usa `lastActualDate()`), `periodRange(type, key)`, acción `pkg-context`.
- `narrative-view.js`: `contextControls(state, idPrefix, keyAction, typeAction)`, usado por la Narrativa (`dx-setting` / `dx-period-type`) y por el paquete (`pkg-context`). `diagnostic-view.js` exporta `periodOptions`.
- `navigation.js`: `extractContext`/`applyContext` tratan `narrativa` y `paquete` como `diagnostico`; `dx.run` solo se invalida si cambia la selección.

## Fase 11

- `app.js`: `ensureDiagnosticProducts(d)` (asíncrona; guarda en `state.dx.products`; vuelve a pintar solo la sección), vista `segmentos` en `VIEWS`, acción `seg-dim`; `FP.app.periodRange` público.
- `diagnostic-view.js`: `renderProducts(state)`; la lista «no disponible» excluye `category`, `product` y `geography` cuando hay datos de producto.
- `segments-view.js`: `FP.segmentsView.render/summarize` (lee `dataStore.resolveLatest(store, 'segments')`).
- `guidanceConfig`: vista `segmentos` en el grupo `diagnosticar`; `navigation.js`: icono y contexto compartido como Diagnóstico.
- `js/import/ga4Segments.js` → `FP.ga4Segments.detect(text) / translate(text)`: CSV de GA4 → CSV de Segmentos (sin usuarios). `app.js stageFilesInner` lo aplica solo a la tarjeta de Segmentos cuando `detect` reconoce fecha, plataforma y sesiones.

## Tráfico y conversión · descubrimiento (parte 1)

- `js/ui/segmentInsights.js` → `FP.segmentInsights.analyze(summary)` (umbral, Wilson, cuadrantes, oportunidad, rankings, frases); `segments-view.js` → `discovery()` y `quadrantMap()`; columna «Cuadrante» en la tabla principal.
- Parte 2: `segmentInsights.analyze` devuelve también `changes` (ganadores/perdedores con efectos tráfico, CR y AOV), `lowAov` y `quality`; `customerSplit(summary)` para nuevos y recurrentes. `segments-view.js`: `changesBlock`, `lowAovBlock`, `splitBlock`.


## Integración de normalización semántica con IA

La carga mantiene dos capas de mapeo:

1. `FP.importer.suggestMapping()` aplica primero `IMPORT_FIELDS` y sus sinónimos de forma determinística.
2. Si quedan cabeceras desconocidas o campos obligatorios sin asignar y la opción está habilitada, `FP.normalize.suggestHeaderMappingWithAI()` consulta Cohere.
3. La respuesta se limita a campos existentes, exige confianza mínima de 0.78 y evita asignaciones duplicadas.
4. El mapeo resultante se muestra en staging y sigue siendo editable por el usuario antes de importar.
5. Si Cohere no está disponible, el flujo continúa con el mapeo estático y las columnas no resueltas quedan para revisión manual.

La API key se reutiliza desde la configuración existente de Cohere (`state.dx.apiKey`); no se incluye en exports.

### XLSX

`js/import/xlsx.js` no añade una dependencia de terceros. Lee la primera hoja de archivos `.xlsx` usando `DecompressionStream` y `DOMParser`, y la entrega al mismo contrato RAW que el parser CSV. No ejecuta macros ni calcula fórmulas: utiliza el valor almacenado por Excel.

## Tráfico y conversión · parte 3 y arreglos

- `ga4Segments.translate`: dimensión `dispositivo_fuente` (config `device_source`, `derived: true`; `driverEngine.unavailableDimensions` ignora las `derived`).
- `segments-view.js`: `weeklyTrend()`, `spark()`, `trendBlock()`; botón `seg-simulate` (acción en `app.js`: precarga `rc.settings` y `rc.draft` con `crMode: 'pct'`).
- `ui.toast`: duración según el largo; CSS `.toast` con ancho máximo y modo móvil.
- `cohereNarrative.narrate`: un reintento con la lista de cifras inválidas; misma `validateResponse`.

## Fase A · calidad de datos
- `js/quality/rules.js` → `FP.qualityRules` (`RULES`, `catalog`, `actionOf`, `applyQuarantine`, `quarantineList`). Celda en cuarentena: `{ value: null, source: 'quarantined', raw, parsedValue, rule, note }`; registro `status: 'quarantined'`. Empaquetado: código `q` con 5.º elemento `{ p, r }`.
- `js/quality/health.js` → `FP.dataHealth.collection(store, dataType)` / `overview(store)`.
- Lote: `quarantined`, `source`, `durationMs`. `FP.normalize.looksPersonal(header, examples)`.

## Fase B · modelo
- `js/model/canonical.js` → `FP.canonical` (`FIELDS`, `PROFILES`, `canonicalOf`, `detectDataset`, `provenanceOf`, `appToCanonical`).
- `js/model/derivations.js` → `FP.derivations` (`DEFS`, `derive`, `fromRecords`).
- `js/model/availability.js` → `FP.availability` (`comparisonPeriod`, `periodCoverage`, `comparisonStatus`, `dimension`, `metric`, `analyses`, `ANALYSES`, `REASONS`), con caché por firma de lotes.
- Lote: `detection`.

## Rendimiento
- `FP.dataStore`: `cached`/`latestList`/`segmentIndex` (caché por firma con tope de 300), `cloneRecord`, `markSaved`/`reusableChunks`/`chunkKeyOf` (guardado incremental; el índice `packed-chunked-v1` trae `stamps` por bloque).
- `FP.importer.processAsync`; `app.js`: `addToStagingAsync` (más de 40 mil filas), `saveLargeCollection` (reutiliza bloques).

## Worker de importación
- `js/workers/import-worker.js`: `importScripts` de los mismos módulos que la página; mensajes `stage`, `reprocess`, `retype`, `commit`, `drop`, `stats`. Mantiene por trabajo el archivo en revisión y su resultado; `commit` envía los registros en bloques de 4,000.
- `FP.importWorker` (`js/import/workerClient.js`): `start`, `stage`, `reprocess`, `retype`, `commit`, `drop`, `existingOf`, `minBytes/setMinBytes`.
- `FP.dataStore.commitRemote`, `FP.importer.stageParsed`, `FP.ga4Segments.translateRows`; en `app.js`: `stageViaWorker`, `reprocessRemote`, `commitRemote`, `finishCommit`. Los elementos remotos de `state.staging.items` llevan `remote: { jobId }` y su resultado `remote: true`.

## Carga robusta
- `validation.js`: severidad de las inconsistencias según `ctx.dataType` (`segments` → warning).
- `app.js saveLargeCollection`: `await repo.flush()` + `repo.kvRead` (índice y último bloque) antes de marcar guardado; `state.saveFailure` → `FP.ui.renderSaveFailure` (banner `#save-failure`, dibujado desde `renderStatus`).
- `import-view.js rejectionNote`: motivo y ejemplo de las filas que quedan fuera.

## Cuarentena de Productos, IA en Worker y vista de Segmentos
- `FP.qualityRules`: `slimProductBatch`, `productQuarantineList`, `productQuarantineTotals`, `productRuleLabel`, `productFieldLabel`; `FP.dataHealth.products(slim)`; `app.js`: `state.productQuality` + `refreshProductQuality()`.
- `app.js aiMapRemote(item)`; el Worker recibe `learned` (columnas aprendidas) en `stage` y `reprocess`/`retype`.
- `segments-view.js`: `card()`, `kpiCards()`, `discovery()` devuelve `{ nav, html }`; `narrative-view.contextControls(state, idp, keyAction, typeAction, extra)` acepta un control adicional en la misma fila.

## Proyección del año siguiente
- `js/projection/projection.js` → `FP.projection` (`collect` con caché por firma de histórico y real, `build`, `toExport`, `toCsv`); `js/ui/projection-view.js` → `FP.projectionView` (`render`, `compute`); vista `proyeccion` en el grupo Planear de `guidanceConfig.js`; estado `state.proj` (crecimiento, participaciones, canal) y acciones `proj-*` en `app.js`; las metas se guardan con la misma clave por año que Planear (`targets:AAAA`).

## Fase H · Cohere avanzado
- `js/ai/cohereAudit.js` → `FP.aiAudit` (`record`, `list`, `clear`, `count`); `cohereClient.chatJson` envuelve `chatJsonRaw` y registra cada consulta que sale (`audit: { purpose, columns }`; `sent: false` si no salió).
- `js/ai/cohereDataset.js` → `FP.cohereDataset.resolve(detection, headers)`; enganchado tras `detectDataset` en `stageFilesInner` y `stageViaWorker`.
- `FP.normalize`: `personalReason`, `looksPersonal`, `setPersonalColumns`; `suggestHeaderMappingWithAI` devuelve `doubtful` y `protectedColumns`.
- Ajustes: `aiControlPanels()` en `settings-view.js`; acciones `ia-log-clear`, `learn-set`, `learn-del`, `learn-clear`, `pii-save`; preferencia `settings.piiColumns`.

## Fase I
- `js/quality/dataSources.js` → `FP.dataSources` (`build(state)`, `datasets`, `freshness`, `ago`, `CATALOG`); panel `sourcesPanel` en `settings-view.js`.
- `quality-view.js`: `quarantineLines(state)` (expuesta como `FP.qualityViewLines`), `quarantineBlock` con resumen y consolidado; estado `state.qFilters` y acciones `q-filter`, `q-page`, `q-download` en `app.js`.

## Configuración con desplegables
- `settings-view.js`: `accStart(state, id, title, desc)` / `accEnd()`, `metaFor(state, id)` (resumen de cada sección), `SECTIONS`; el estado abierto vive en `state.stOpen` (se actualiza con el evento `toggle` en captura); acciones `st-expand-all` y `st-collapse-all` en `app.js`; `#st-negocio` es HTML estático dentro de `view-ajustes` y se sincroniza al pintar.

## Análisis · contexto único (canal + período + comparación)
`js/analytics/analysisContext.js` (`FP.analysisContext`) es la única fuente de verdad del módulo Análisis: canal seleccionado (`state.an.channel`: total · ecommerce · app · whatsapp · llamadas), período focal (completo o parcial), período de comparación equivalente (MoM/WoW/DoD/YoY, mismos días cuando el foco es parcial) y la etiqueta «Período actual vs Período de comparación». `ensureTrendAnalysis()` (app.js) lo construye una vez y TODOS los módulos (Evolución, Patrones, Share & Mix, Contribución, Prioridades, Forecast, Cohortes, Narrativa, detalle) leen de ahí. Patrones, forecast y cohortes usan solo períodos cerrados. El detalle (`openDrill/loadDrill`) conserva Canal + Período + Comparación + Nivel + Métrica. Ver REPORTE_AUDITORIA_ANALISIS_CANAL_COMPARACIONES_DRILLDOWN.md.


### Análisis · métrica, PVM y puente al plan (2026-10-07)
`FP.analysisContext.METRICS/normMetric` (revenue · orders · units; aov excluido por no aditivo) viaja en el contexto (`ctx.metric`, `ctx.metricLabel`); `an.metric` + acción `an-metric` pasan por `resetAnalysis`. `sumMap(map, metric)` devuelve además `parts` {r,u,o} por entidad. `js/analytics/pvmEngine.js` (`FP.pvmEngine.analyze`) descompone Δ venta en Volumen/Precio/Mezcla/Nuevas/Perdidas/Sin unidades (Σ = Δ exacta); `js/analytics/planBridgeEngine.js` (`FP.planBridgeEngine.analyze`) reparte la brecha Real − Meta por canal (sin supuestos) y por entidad (supuesto de crecimiento parejo). `planForRange()` (app.js) lee `plan.revenue` de `state.dataset` por fecha × canal y calcula cobertura. Sólo con métrica Venta; con otra métrica el estado es `not_applicable`. `shareMixEngine.DEFAULTS.significantPp = 0.25` (pp).

`js/analytics/trendStoryEngine.js` (`FP.trendStoryEngine.analyze/priceVolume`): fases por zigzag, estado actual, variabilidad propia, confiabilidad y contexto (total del canal y categoría). `ensureTrendAnalysis` (5a) adjunta `row.story`; `trend-view.js` la muestra (columna «Ahora», filtro `an-state`, `storyBlock`, `levelChart`).

### Línea de tendencia (outlook) y estructura de la página Análisis (2026-10-08)
`FP.trendStoryEngine.outlook(series,{current,story,horizon,nextPeriod})` devuelve `{status, direction, window, fitted[], projection[{period,value,low,high}], confidence{level,mape,tests,reasons}, contradiction}`. `ensureTrendAnalysis` (5a) lo adjunta como `row.story.outlook` (con `unit`) usando `TE.rangeForKey/add/periodKey` para nombrar períodos futuros; `levelChart` extiende el eje y dibuja recta ajustada, proyección punteada y banda; `outlookNote` escribe la frase. Orden de render: Filtros → Contexto → Resumen → 4 KPIs → Tabla → Lectura de la entidad → Contribución (con Persist. y Primera pista) → PVM → Puente al plan → Mix → Forecast (plegado) → Asistente. `priorityPanel`, `cohortPanel` y `analysisMapPanel` se eliminaron de la vista.

### Detalle del Análisis en dos fases, scan de una pasada y borrado en Recovery (2026-10-08)
`loadDrill` (app.js): FASE A = `FP.productStore.aggregateScan({from,to,channel,filter,groupBys:['total',hijo]})` para el período actual y el de comparación (Map canal → grupo → llave → acumulador; `mergeMaps` une canales); de ahí salen resumen, desglose por canal e hijos. Termina con `d.loading=false, d.pending=true`. FASE B (temporal por período y registros fuente) corre después; `d.pending=false` al terminar. `d.error` + `an-drill-retry` cubren fallas, y `an.drillTimeoutMs` (90 s) evita el «Cargando…» eterno. `FP.idb.keys` lee llaves sin deserializar. Recovery: `FP.scenarioEngine.deleteScenario`, `FP.actionPlan.deleteAction/actionsOfScenario/unlinkScenario`, `FP.actionLibrary.removeCustom`; ids por máximo.


### Periodo de referencia de productos (2026-10-08)
`FP.productAnalysis.baselinePeriod({from,to,periodType},comparison)`: mes/año completos o periodo en curso desde su inicio → periodo de calendario anterior con los mismos días (vía `FP.temporalEngine.shiftRange`); rango libre → N días inmediatamente anteriores; `yoy` → mismas fechas del año anterior. `run` acota `to` al último día con datos de producto cuando hay `periodType`. Misma definición que Análisis (`temporalEngine.comparisonRanges`). El titular de Diagnóstico sigue contando solo días×canal pareados; la sección de productos explica la diferencia (`[data-recon]`).


### Tráfico y conversión: descomposición (2026-10-08)
`FP.trafficConversionEngine.analyze(res)` (puro; entrada = filas de `segmentsView.summarize`): Venta = sesiones × CR × ticket; efectos secuenciales tráfico → conversión → ticket por segmento (suman su Δ venta) y en total; mezcla del CR (dentro / mezcla); prueba z de dos proporciones por segmento; «Otros» bajo el umbral de volumen. `findings()` genera las frases. `FP.segmentsDecompView.card/dimsCard` solo arman HTML. Orden de carga en `index.html`: `trafficConversionEngine.js` → `segmentInsights.js` → `segments-decomp-view.js` → `segments-view.js`.

### Análisis ↔ Diagnóstico y calidad de tráfico (2026-10-08)
- `an-diagnose` (app.js) no escribe en `state.dx.settings`: fija `state.ux.ctx` y cambia el hash; `FP.navigation.applyContext` traslada canal/periodo/comparación (único camino de contexto entre vistas).
- `an-export-contrib` / `an-export-reading` usan `FP.exporter.download` directamente; no pasan por `EXPORT_BUILDERS` (el paquete sigue en 7 exports).
- `FP.trafficConversionEngine.analyze` devuelve además `quality` (`qualityChecks`): marcas aritméticas, sin causa; la vista las pinta en `.sgd-quality`.
- `ga4Segments.translateCore` agrega por la **llave normalizada** del segmento (`segKey`, igual que `normalizeSegment`), no por el texto: variantes que comparten llave se suman antes de llegar al almacén (que guarda una fila por llave, la última). `normalizeSegment` da llave `sym_…` a textos solo de símbolos (p. ej. «/»).
- `trafficConversionEngine.analyze` devuelve `others` ({ segments, sessions, share }); `findings` descarta frases cuyo monto sea < 2 % de la suma de los tres efectos.

### Inicio · resumen general (2026-10-09)
`FP.homeSummaryEngine.compute(state, home)` (solo lee; no crea cálculos nuevos) compone cuatro bloques para el canal y periodo de Inicio: (1) `why` — pares de días de `driverEngine.buildPairs` con comparación `actual_vs_previous` (días exactos contra días exactos), agregados con `driverEngine.aggregate` y partidos con `trafficConversionEngine.effects` (tráfico → conversión → ticket; si falta alguna sesión en el canal o en «Total digital», solo el Δ venta); (2) `where` — por dimensión de GA4, `segmentsView.summarize` + `trafficConversionEngine.analyze`, el segmento con mayor |Δ venta| fuera de «Otros» (se omite `device_source`), más `analyze().quality`; (3) `channels` — `run.channels[id].months[i]`/`annual` y `FP.gap.pacingStatus` con los umbrales de pacing; (4) `trust` — `FP.coverage.summarize`, `state.fc.lastActualDate`, cobertura de pares y fechas de segmentos/productos. `FP.homeSummaryView.render` solo arma HTML y lo inserta `home-view.js` entre «¿Qué está pasando?» (sin tocar) y Preparación de datos. Acciones nuevas en `app.js`: `home-pick-channel` (cambia el Canal de Inicio) y `home-seg` (abre Segmentos con la dimensión, canal y periodo de Inicio). Orden de carga: `homeSummaryEngine.js` después de `trafficConversionEngine.js`; `home-summary-view.js` antes de `home-view.js`. Pendiente conocido: productos/categorías en «Dónde mirar hoy» (el análisis de producto es asíncrono).

### Inicio simplificado (2026-10-09)
`FP.homeSummaryView.build(state, home, figures, next)` calcula una vez `homeSummaryEngine.compute` y devuelve `{ key, blocks }`; `keyBlock` arma «Lo esencial» con cifras de `periodFigures` (las mismas de las tarjetas) y del motor. `home-view.js` inserta `key` y envuelve cada bloque con `FP.homeSummaryView.more()` (`<details class="home-more" data-home-more>`); el estado abierto/cerrado se guarda en memoria con un `toggle` en captura. Las pruebas y la batería abren los desplegables antes de leer (el texto de un `<details>` cerrado no es visible, pero sí está en el DOM).

### Pacing & Forecast reordenado (2026-10-09)
`index.html` (`#view-pacing`): respuesta (`#fc-kpis`, `#fc-channels`) → `#fc-alerts` → `#fc-controls` (sección `.pacing-adjust`) → `#fc-chart` → seis `<details class="ds-accordion home-more pacing-more" data-pacing-more=…>` con periodos, índices, métodos, eventos, versiones y parámetros. Los ids no cambian: `pacing-view.js` y `forecast-view.js` pintan igual. `pacingView.render` pone `hidden` a `.pacing-more` y a la etiqueta «Ver más» cuando no hay corrida. Inicio: `keyBlock` agrega la venta real (`[data-key-real]`) y el plan a la fecha.

### Entrada «¿Por qué?» y Diagnóstico reordenado (2026-10-09)
`ui/guidance/why-hub.js` (`FP.whyHub.render(view)`, llamado desde `app.js render()`) pinta `#why-hub-<vista>` en diagnostico, analisis, segmentos y producto. `#view-diagnostico`: resultado, driver, señales, hipótesis y recovery arriba; cuatro `<details class="ds-accordion pacing-more dx-more" data-dx-more=…>` (why, tree, products, confidence). `diagnosticView.syncMore()` oculta los vacíos (se llama al final de `render`, de `renderProducts` y después de `diagnosticGuide.render`).

### Reforecast y Recovery Center reordenados (2026-10-09)
`#view-reforecast`: `#rf-summary`, `#rf-channels`, `#rf-recovery`, `#rf-controls` (sección `.pacing-adjust`), `#rf-chart` y cuatro `<details class="ds-accordion pacing-more rf-more">` (periods, drivers, audit, versions). `#view-recovery`: filtros en `#rc-context`; flujo visible; tres `<details class="… rc-more">` (extra = `#rc-extra`, inverse, tree). `recoveryCenter.renderContext` escribe el banner y los filtros de canal/periodo en `#rc-context` y el diagnóstico de origen, los archivos y las restricciones en `#rc-extra`. `reforecastView.syncMore` y `recoveryCenter.syncMore` ocultan los desplegables vacíos.

### Metas y motor reordenado (2026-10-10)
`#view-resumen`: `#targets-form` y `#validation-table` arriba; tres `<details class="ds-accordion pacing-more rs-more" data-rs-more=…>` (tools, edge, engine) y el contrato de `forecast_export.json`. `app.js renderView` abre `tools` una sola vez cuando no hay datos (`data-auto`).
