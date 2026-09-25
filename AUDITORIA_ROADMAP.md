# Auditoría arquitectónica y validación del roadmap

Fecha: 25 de septiembre de 2026 · Versión auditada: 0.9.0 (Fase 8.1) · Contrato de datos 1.7.0
Alcance: auditoría de solo lectura. **No se modificó código como parte de la auditoría.** El único cambio de esta
entrega es previo y separado: los encabezados oficiales del reporte de producto (ver al final).

---

## A. Estado actual (lo que existe realmente)

| Área | Existe | Evidencia en código |
|---|---|---|
| Configuración central | Sí | `config/config.js` (congelada con `deepFreeze` al cargar) |
| Fórmula única | Sí | `calculations/metrics.js` (venta = volumen × CR × AOV; alias `calculate*`) |
| Calendario ISO | Sí | `calendar/calendar.js` |
| Carga CSV, normalización, validación, calidad | Sí | `import/*`, `quality/*`, `data/data-store.js` |
| Planeación, estacionalidad, plan congelado | Sí | `calculations/seasonality.js`, `weights.js`, `forecast/planningEngine.js` |
| Pacing y forecast | Sí | `forecast/forecastEngine.js`, `forecastMethods.js`, `performanceIndex.js` |
| Reforecast | Sí | `forecast/reforecastEngine.js`, `futureWeights.js` |
| Diagnóstico, señales, hipótesis | Sí | `diagnostics/*` |
| Escenarios, acciones, medición | Sí | `scenarios/*`, `actions/*`, `impact/*` |
| Experiencia guiada | Sí | `ui/guidance/*`, `config/guidanceConfig.js` |
| IndexedDB + migración | Sí | `storage/idb.js`, `repository.js`, `migration.js` |
| Categoría → Producto → SKU | Sí | `products/*`, `ui/product-view.js` |
| Cohere (opcional) | Sí | `ai/cohereClient.js`, `cohereDiagnostic.js`, `cohereActions.js` |
| Exports | 7 archivos | planning, forecast, reforecast, analysis, action_plan, category_product_analysis + datos (normalized, errors, quality, consolidated) |
| Pruebas | 134 síncronas + 20 asíncronas | `calculations/self-test.js`, `storage/storage-tests.js` |
| **BUSINESS_CONTEXT** | **No existe** | No hay objeto ni módulo con ese nombre. Hoy el "contexto de negocio" está repartido en `config.js` |
| Canales configurables en tiempo de ejecución | No | Canales fijos en `config.channels` |
| Geografía / sucursales | No | Solo existe como segmento opcional o como "dimensión adicional" que se suma en productos |
| Métricas configurables | No | `metricKeys` fijo de 5; productos con 4 métricas fijas |
| Narrativa ejecutiva, paquete de análisis, App 1, PowerPoint, automatización | No | Solo previstos |

Tamaño: 89 archivos JS, 15 vistas, ~1.3 MB de código y documentación.

---

## B. Arquitectura actual

```
config.js (congelada) ─┬─ calendar ─ metrics ─ data-model
                       │
Carga: csv → normalize → validation → import → data-store (histórico, plan, actual, segmentos)
       productImport → productStore (IndexedDB: productDays, productRollups, productCatalog)
                       │
Almacenamiento: app.js → almacenamiento enrutado (repository) ─┬─ localStorage (preferencias)
                                                              └─ IndexedDB kv (datos) + productos
                       │
Motores: planningEngine ─→ forecastEngine ─→ reforecastEngine ─→ diagnosticEngine ─→ scenario/recovery ─→ actions/impact
            (plan)          (actual, forecast)   (requerido)        (drivers, señales)     (simulado)          (observado)
                                                                        ↑
                                                         productAnalysis (categoría → SKU)
                       │
Exports: planning → forecast → reforecast → analysis (+categoryProduct) → action_plan ; category_product
Imports: analysis_export y reforecast_export (Recovery Center)
                       │
UI: app.js (estado, acciones, render por vista) + vistas + capa de guía (navegación, contexto, ayuda, recorrido)
```

Rasgos que importan para el roadmap:
1. **Configuración congelada al cargar** y varios módulos calculan constantes a partir de ella al cargar el script
   (p. ej. `CSV_CONTRACTS` y `CHANNEL_ALIASES` en `import.js`). Cambiar configuración en caliente no se propaga.
2. **Los motores iteran `C().channelIds` y `C().metricKeys`**: bien centralizado, pero asume que la lista es la misma
   con la que se guardaron los datos y las versiones.
3. **Formatos binarios posicionales**: `packed-v1` (datos de la app) guarda las métricas por posición según
   `metricKeys`; `productDays` guarda 4 métricas por posición y un byte de estado por métrica (`n × 4`).
4. **Versiones congeladas** (plan original, forecast, reforecast, escenarios) guardan resultados por canal.

---

## C. Roadmap entendido

| Fase | Para qué sirve |
|---|---|
| 8.1 | Cierre técnico de Categoría → Producto → SKU (hecho; pendiente validación en GitHub Pages) |
| 8.2 Business Setup | Definir el negocio (nombre, moneda, periodos, canales, dimensiones, métricas, terminología) como fuente única |
| 8.3 Canales configurables | Agregar, renombrar o desactivar canales sin tocar código |
| 8.4 Dimensiones / geografía / sucursales | Analizar por región, estado, sucursal u otras dimensiones de primer nivel |
| 8.5 Modelo de métricas configurable | Métricas adicionales y su relación con la fórmula central |
| 9.1 UX pedagógica | Profundizar la enseñanza (sobre la capa de guía de Fase 7) |
| 9.2 Narrativa ejecutiva | Convertir resultados calculados en lectura ejecutiva, sin inventar análisis |
| 10 Paquete de análisis | Empaquetar todo lo necesario para transportar un análisis |
| 11 Integración App 1 | Intercambio con la app de tráfico, conversión, productos y venta real |
| 12 PowerPoint | Generar presentaciones dentro de esta app |
| 13 Automatización e inteligencia | Automatizar rutinas y lecturas con IA, sin que la IA calcule |

---

## D. Dependencias

```
8.1 ──┐
      ▼
8.2 Business Setup ──▶ 8.3 Canales ──▶ 8.4 Dimensiones ──▶ 8.5 Métricas
                                                             │
                   ┌─────────────────────────────────────────┘
                   ▼
            9.1 UX pedagógica ──▶ 9.2 Narrativa ──▶ 10 Paquete ──▶ 11 App 1
                                          │               │
                                          └──────▶ 12 PowerPoint ◀┘
                                                          │
                                                          ▼
                                                  13 Automatización
```

Observaciones (propuestas, no cambios):
- **8.5 afecta el almacenamiento de 8.1** (formatos posicionales). Conviene diseñar el formato de almacenamiento de
  8.5 antes de acumular muchos datos reales de producto (ver recomendación R2).
- **8.4 afecta a 8.1**: hoy la "dimensión adicional" en productos se suma por SKU-día y se pierde el desglose. Si
  sucursal o geografía deben analizarse por producto, la llave del bloque tendría que incluirla.
- **12 depende de 9.2 y de 10**, no solo de 11. PowerPoint puede construirse sin App 1.
- **9.1 depende poco de 8.x**: puede adelantarse si se quiere, siempre que no fije textos que 8.2 volverá configurables.

---

## E. Riesgos (qué podría romperse)

| # | Riesgo | Fase | Nivel |
|---|---|---|---|
| 1 | Cambiar el orden o la lista de `metricKeys` hace ilegibles los datos guardados en `packed-v1` y las celdas de `productDays` | 8.5 | **Crítico** |
| 2 | Quitar o renombrar un canal deja versiones congeladas (plan original, forecast, reforecast, escenarios) con canales que la app ya no recorre, o recorre canales que la versión no tiene | 8.3 | **Crítico** |
| 3 | Configuración editable en caliente sobre un `config` congelado y constantes calculadas al cargar (`CSV_CONTRACTS`, `CHANNEL_ALIASES`) → la app mezclaría definiciones viejas y nuevas | 8.2 / 8.3 | Alto |
| 4 | Sucursal como dimensión de primer nivel exige cambiar la llave de `productDays` (hoy día × canal) → migración de esquema de IndexedDB v1 → v2 | 8.4 | Alto |
| 5 | Métricas nuevas no aditivas (p. ej. márgenes, tasas) mezcladas con la fórmula central → dos fórmulas de venta | 8.5 | Alto |
| 6 | Pedidos por producto = pedidos que incluyen el SKU; su suma no cuadra con los pedidos del canal. Una narrativa que los compare directamente daría conclusiones falsas | 9.2 / 10 | Alto |
| 7 | Cambiar la estructura de los exports rompe a Recovery Center (que importa analysis y reforecast) y a consumidores futuros (App 1, PowerPoint) | 10 / 11 / 12 | Alto |
| 8 | App 1 y esta app cargando la misma venta real → dos fuentes de verdad | 11 | Medio |
| 9 | Textos de UI en español repartidos en ~20 vistas; "terminología configurable" obliga a tocar muchas vistas | 8.2 / 9.1 | Medio |
| 10 | Filtros persistentes (Fase 7) asumen canal, periodo y comparación; nuevas dimensiones requieren extender el contexto sin romper vistas | 8.4 / 9.1 | Medio |
| 11 | "Automatización" sin backend solo puede ejecutarse con la app abierta (no hay tareas programadas) | 13 | Medio (expectativa) |
| 12 | Límite práctico de un archivo de productos por carga (hoy recomendado mensual; un año en un CSV serían cientos de MB) | 11 | Medio |
| 13 | Generar PowerPoint en el navegador requiere una librería externa; debe cargarse desde un dominio permitido y funcionar sin conexión en file:// | 12 | Bajo |
| 14 | Los datos de IndexedDB viven por navegador y dominio; un paquete de análisis (10) es la única forma de moverlos | 10 | Bajo (conocido) |
| 15 | Cálculo de venta, volumen, CR y AOV centrales | todas | Bajo mientras 8.5 no cree fórmulas alternativas |

---

## F. Hardcodes detectados (deberán evolucionar; no se cambian ahora)

| Elemento | Dónde vive hoy | Evolución prevista |
|---|---|---|
| Canales (id, nombre, color, alias, etiqueta de volumen) | `config.channels` | 8.3 |
| Canal por defecto `'ecommerce'` | `app.js` (filtros de planeación y estacionalidad), `planning-view.js`, `reforecast-view.js` | 8.3 |
| Canales en datos de prueba | `mock-data.js`, `mock-csv.js`, `mock-products.js` | 8.3 (solo QA) |
| Métricas del modelo (5, con fórmula) | `config.metricKeys`, `additiveMetricKeys`, `metrics.js` | 8.5 |
| Listas literales de métricas en vistas | `diagnostic-view.js`, `pacing-view.js`, `chart.js` | 8.5 |
| Métricas de producto (4) y ancho de estado por celda | `config.products.metrics`, `productStore.js` (`n × 4`) | 8.5 |
| Posición de métricas en almacenamiento | `data-store.js` (`packed-v1`) | 8.5 (formato v2) |
| Dimensiones de diagnóstico | `config.diagnostics.dimensions` | 8.4 |
| Dimensión adicional de producto (se suma) | `productStore.js` | 8.4 |
| Moneda (`MXN`) y formato numérico | `config.currency`, `format.js` | 8.2 |
| Festivos y eventos de ejemplo | `mock-*` | 8.2 (catálogo de eventos) |
| Terminología y textos de UI | vistas `ui/*` y `guidanceConfig.js` | 8.2 / 9.1 |
| Catálogo de acciones | `config.recovery.actionLibrary` (ya ampliable por el usuario) | 8.2 |
| Tipos de dato de carga | `config.dataTypes` + `config.products.dataType` | 8.4 / 8.5 |
| Filtros del contexto (canal, periodo, comparación) | `ui/guidance/navigation.js` | 8.4 |

---

## G. Contratos que deben protegerse

| Contrato | Genera | Consume hoy | Consumirá | Campos críticos | Cambios que romperían |
|---|---|---|---|---|---|
| Modelos internos (CanonicalRecord, DailyRecord, bloques de producto) | data-store, productStore | todos los motores | 8.3–8.5 | `key`, `date`, `channel`, `metrics.{k}.value/source`, orden de métricas en `packed-v1` y `productDays` | cambiar orden o lista de métricas, cambiar llaves |
| BUSINESS_CONTEXT | **no existe** | — | 8.2 en adelante | a definir | nacerá versionado desde el inicio |
| planning_export.json | planningExport | nadie en la app | 10, 11, 12 | `metadata.algorithmVersion`, `targets`, `daily_plan[].cells` | renombrar canales, cambiar celdas |
| forecast_export.json | forecastExport | nadie en la app | 10, 11, 12 | claves de Fase 0 (`records`, `channels`) + `forecast`, `gaps` | quitar claves de Fase 0 |
| reforecast_export.json | reforecastExport | Recovery Center | 10, 11, 12 | `schema`, `reforecast.{canal}.daily[]`, `remainingTarget.total`, `metadata.cutoff` | cambiar `daily` o nombres de canal |
| analysis_export.json | analysisExport | Recovery Center | app "Diagnóstico de brecha de ventas", 9.2, 10, 11, 12 | `schema`, `plan/actual/forecast` (bloques snake_case), `level1Drivers`, `level2Signals`, `hypotheses`, `period`, `channel` | renombrar bloques o drivers |
| action_plan_export.json | actionPlanExport | nadie en la app | 10, 11, 13 | `traceability[]`, `scenarios`, `measurements` | mezclar simulado y observado |
| category_product_analysis_export.json | categoryProductExport | nadie en la app | 9.2, 10, 11, 12 | `rows[].share/contribution/status`, `rules`, `metricsAvailable` | cambiar semántica de participación o contribución |

Todos llevan `schema` y `schemaVersion`. Hoy no hay pruebas que fijen su forma (salvo la de producto): ver R1.

---

## H. Recomendaciones antes de continuar (no implementadas)

- **R1 · Antes de 8.2: pruebas de contrato de los exports.** Fijar en pruebas los campos críticos de cada export
  (tabla G) y una política de versión: agregar campos = versión menor; quitar o renombrar = versión mayor con
  compatibilidad de lectura. Evita que 8.2–8.5 rompan consumidores sin notarlo.
- **R2 · Antes de 8.5 (idealmente antes de cargar muchos datos reales de producto): almacenamiento por nombre de
  métrica.** Pasar `packed-v1` y `productDays` a un formato que guarde qué métricas contiene y en qué posición
  (encabezado de métricas por colección y por bloque), con migración. Es el riesgo crítico #1.
- **R3 · En 8.2: arranque de configuración ("config bootstrap").** Construir el `config` a partir del Business
  Setup guardado **antes** de cargar los demás módulos (y recargar la página al cambiarlo), en lugar de editar la
  configuración en caliente. Mantiene el congelado y evita el riesgo #3.
- **R4 · En 8.3: cada versión guarda su propio catálogo de canales.** Plan original, forecast, reforecast y
  escenarios deben leerse con los canales con que se crearon; los canales se desactivan, no se borran.
- **R5 · Antes de 8.4 con productos reales: decidir si sucursal o geografía importan por producto.** Si sí, la
  llave de `productDays` debe incluirla (esquema v2) antes de acumular datos; si no, basta como segmento.
- **R6 · En 8.5: métricas adicionales sí, fórmulas de venta alternativas no.** Las métricas nuevas se declaran
  como observadas o derivadas de las existentes; venta = volumen × CR × AOV sigue siendo la única identidad.
- **R7 · En 9.2 y 10: reglas de comparabilidad explícitas.** Por ejemplo, no comparar pedidos por producto con
  pedidos del canal, ni CR de producto (pedidos ÷ vistas de ficha) con CR de canal (pedidos ÷ sesiones).
- **R8 · Quitar los tres `'ecommerce'` por defecto** en `app.js`, `planning-view.js` y `reforecast-view.js`
  (usar el primer canal activo) como parte de 8.3.

---

## I. Validación del roadmap

**El roadmap es coherente con la arquitectura actual.** La app ya centraliza fórmulas, canales, métricas y
almacenamiento, lo que hace viables 8.2–8.5 sin reescritura. Puntos a señalar explícitamente:

1. **Dependencia faltante:** 8.5 (métricas) y 8.4 (dimensiones) impactan el almacenamiento de 8.1. No es una
   contradicción, pero el orden actual permitiría acumular datos reales en un formato que después habría que migrar.
   Propuesta (espera confirmación): adelantar R2 y la decisión de R5 al inicio de 8.2.
2. **9.1 y Fase 7:** 9.1 debe extender la capa de guía existente (`guidanceConfig`, contexto, siguiente paso), no
   reemplazarla.
3. **13 sin backend:** la automatización solo podrá ocurrir con la app abierta (al abrir, al cargar datos, con un
   botón). Si se espera ejecución programada sin intervención, contradice la regla "sin backend".
4. **12 no depende de 11:** PowerPoint puede construirse con 9.2 y 10.
5. **BUSINESS_CONTEXT** aparece como contrato a proteger pero todavía no existe: debe nacer en 8.2 con `schemaVersion`.

Fin de la auditoría. No se avanza a 8.2 sin el prompt correspondiente.

---

## Anexo · Cambio previo a la auditoría (cierre de 8.1)

A petición del usuario, se fijaron los **encabezados oficiales del reporte de producto** (plantilla en Carga de
datos y `DATA_DICTIONARY.md` §37):

`fecha, canal, sku, codigo_producto, producto, marca, categoria, subcategoria, presentacion, venta, pedidos, unidades, vistas_ficha`

Cambio de una línea en `config.products.dataType.template`; el mapeo ya reconocía todos los encabezados.
Pruebas: 134 de 134.
