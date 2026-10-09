# Reporte — Fase B · Modelo canónico, detección de datasets, métricas derivadas y disponibilidad

## 1 · Arquitectura encontrada (inspección)
- **Datos:** colecciones por tipo (histórico, plan, venta real, segmentos) con registros canónicos `{ date, channel, metrics: { revenue, orders, trafficVolume, conversionRate, aov } }`, cada celda con su origen (observed, calculated, missing, invalid y, desde la Fase A, quarantined) y su lote de carga. Productos vive aparte (IndexedDB).
- **Métricas:** `FP.metrics` ya derivaba CR y AOV por razón de sumas (`calcConversionRate`, `calcAov`, `deriveBlock`).
- **Disponibilidad:** el Diagnóstico calculaba qué dimensiones de segmentos existían y listaba el resto como «No disponible», sin distinguir causas. Contra plan, los segmentos se comparan con el mismo periodo del año anterior (no hay plan por segmento).
- **Periodos:** el Diagnóstico y Recovery trabajan con tipo y clave de periodo (`FP.app.periodRange` → from/to); no había un objeto explícito de periodo actual y de comparación con su cobertura.
- **Fase A presente y reutilizada:** `quality/rules.js` (cuarentena por celda), `quality/health.js`, lotes con fuente y duración.

## 2–3 · Archivos
**Nuevos:** `js/model/canonical.js`, `js/model/derivations.js`, `js/model/availability.js`, `tools/regression/batch_x.py`.
**Modificados:** `index.html` (scripts y panel «Qué puedes analizar»), `js/app.js` (detección al preparar cada archivo), `js/data/data-store.js` (el lote guarda la detección), `js/ui/import-view.js` (línea «Tipo detectado»), `js/ui/diagnostic-view.js` (tabla «Por qué cada dimensión está o no disponible»), `js/ui/quality-view.js` (matriz de análisis), `css/design-system.css`.

## 4 · Modelo canónico
Capa de **vocabulario** (decisión de la Fase 0): 45 campos en los grupos A–E con metadata `{ name, type, role, required, nullable, unit, semanticGroup, additive, allowedDerivations, validationProfile, app, synonyms }`; `app` dice a qué campo interno corresponde (p. ej. `sessions` ↔ `trafficVolume`), sin renombrar el contrato interno ni los exports. `users` y `new_users` son `additive: false`. Convención: `conversion_rate` es proporción 0–1.

## 5 · Perfiles de dataset
`ga4_segments`, `ga4_traffic`, `ecommerce_sales`, `sales_plan`, `segments_file`, `product_sales`, `product_funnel`, `orders`, `customers`, `marketing_performance`, `financial_summary`, `generic_tabular`. Cada uno con identificadores, esperados, opcionales, métricas y dimensiones compatibles, derivaciones, reglas de consistencia, mínimos y sección de la app a la que pertenece.

## 6 · Detección (determinística)
Encabezado → campo canónico por nombre, sinónimos del modelo y sinónimos ya configurados en la carga. Puntaje = (2·identificadores + esperados) / máximo, + 0.05 por opcional (los opcionales nunca restan). Sin todos los identificadores el perfil pesa ×0.6. Si el segundo queda a menos de 0.10 es **ambigua** (confianza ×0.75 para todos y alternativas listadas). Por debajo de 0.40 → `generic_tabular`. Si el archivo parece de otra sección, la revisión de carga lo avisa. Cohere no participa.

## 7 · Fórmulas
| Métrica | Fórmula | Requisitos | Motivos si no se calcula |
|---|---|---|---|
| `aov` v1 | revenue / orders | orders > 0, entradas válidas, misma moneda y periodo | MISSING_DEPENDENCY, QUARANTINED_DEPENDENCY, INVALID_DEPENDENCY, ZERO_DENOMINATOR, CURRENCY_MISMATCH, PERIOD_MISMATCH |
| `conversion_rate` v1 | orders / sessions (0–1) | sessions > 0 | los mismos |
Usan las funciones existentes de `FP.metrics`: los valores son idénticos a los de la app. Si hay valor original, se conserva y se concilia (diferencia > 1 % se reporta).

## 8 · Estados de disponibilidad
available, partial, missing, invalid, quarantined, derived, not_applicable, unavailable_source, incomplete_period, non_comparable. Procedencia de celdas: original, normalized (p. ej. «$1,000» → 1000), derived, quarantined, unavailable.

## 9 · Periodos
Periodo actual y de comparación explícitos (`previous`: mismo largo justo antes; `yoy`: mismo periodo del año anterior), cada uno con primera y última fecha, días esperados, presentes y faltantes, cobertura, filas y última actualización. Comparación: both_available, current_only, comparison_only, neither_available, partial_comparison (cobertura < 80 %).

## 10 · Matriz de análisis (configuración)
Tendencia de venta, tendencia de tráfico, conversión, ticket promedio, desempeño por canal, dispositivo, fuente y medio, campaña, landing, nuevos y recurrentes, producto y categoría, comparación contra el periodo anterior y comparación interanual. Cada uno devuelve estado, campos faltantes, inválidos y parciales, estado de comparación y recomendaciones específicas.

**El problema de GA4 (punto 13):** el Diagnóstico ahora explica, por dimensión: fuente no cargada, dimensión no incluida en el export de GA4, no importada, sin datos para el periodo, solo en el periodo actual (con el periodo exacto que falta y por qué contra plan se usa el año anterior), solo en el de comparación, valores vacíos o «(not set)», cobertura insuficiente, valores no homologables entre periodos (solo en dimensiones estables) y no aplica (WhatsApp y Llamadas).

## 11 · Ejemplos reales de salida (ejecutados sobre datos de prueba)
- `detectDataset(['fecha','canal','venta','pedidos','traffic_volume'])` → `ecommerce_sales`, confianza 1, método `deterministic`.
- `detectDataset(['fecha','sku','vistas_ficha','venta','unidades'])` → `product_sales`, confianza 0.5, ambigua, alternativa `product_funnel` 0.5.
- `derive('aov', {revenue:1000, orders:4})` → 250, `derived`, fórmula `revenue / orders`, v1; con orders = 0 → `unavailable`, `ZERO_DENOMINATOR`.
- `dimension('campaign')` sin segmentos → `unavailable_source`, `SOURCE_NOT_CONNECTED`, «Carga el CSV exportado de GA4 en Carga de datos → Segmentos».
- Venta real de septiembre con 1 venta negativa → venta `partial`, `QUARANTINED_VALUES`, 119 de 120 filas; AOV `derived` sin esa venta.

## 12 · Pruebas ejecutadas
- `batch_x.py` (nuevo): los 26 casos del punto 19, más «no aplica», diferencias de esquema, línea de detección en la carga, matriz en Calidad y `users` no sumable. **Pasa; falla en la versión anterior.**
- Motor 206/206; lint; contraste; Fase A (`batch_w`, `batch_m`); GA4 (`batch_s`); Segmentos y descubrimiento (`batch_r`, `batch_u`, `batch_v`); Producto en Diagnóstico (`batch_q`); periodo y canal (`batch_p`); Inicio (`batch_l`): OK.
- Batería del mismo día contra la versión anterior: 7 exports idénticos, sin errores de consola; Calidad y Diagnóstico suman una tabla cada uno y las anteriores siguen idénticas.

## 13 · Errores encontrados (durante el desarrollo, corregidos)
- La confianza castigaba los campos opcionales ausentes (un archivo de venta completo salía con 89 %).
- Una dependencia en cuarentena sin valor se reportaba como «faltante».
- El porqué del Diagnóstico no aparecía: el rango de periodo de la app usa from/to y el motor start/end.
- Con clasificación ambigua, una alternativa podía mostrar más confianza que la elegida.
- «Diferencia de esquema» marcaba campañas que simplemente cambian de un mes a otro; ahora solo aplica a dimensiones estables.

## 14 · Limitaciones pendientes
- La derivación de CR y AOV **por registro** al importar sigue en `FP.metrics` (misma fórmula); el motor nuevo la reutiliza, pero no la reemplaza.
- El usuario todavía no puede **corregir** la clasificación desde la UI: la sección elegida manda y la detección solo avisa.
- Productos (IndexedDB) solo se evalúa como «cargado o no», no por periodo.
- No hay columna de moneda en los archivos actuales; el control de monedas queda listo para cuando la haya.
- Los casos «fuente conectada, pero la consulta no incluyó la dimensión» y «fuente desconectada» se basan en los exports CSV; con conector directo (Fase C) se alimentarán de la consulta real.

## 15 · Compatibilidad con la Fase A
No se modificó ninguna regla de la Fase A. La disponibilidad lee registros, celdas en cuarentena y lotes tal como los deja la Fase A; sus pruebas siguen pasando.

## 16 · Recomendaciones para la Fase C (conector directo de GA4)
- Que el conector produzca registros de `ga4_segments` y pase por la misma carga (Fase A) y por este motor (Fase B).
- Que cada consulta guarde dimensiones y métricas pedidas: así «la consulta no incluyó la dimensión» se responde con datos reales.
- Que pida automáticamente el periodo de comparación (`comparisonPeriod`) para evitar los `current_only`.
- Requiere un proyecto de Google Cloud con OAuth (cliente web, solo lectura) autorizado para tu dominio de GitHub Pages; revisar la documentación vigente de la Analytics Data API antes de implementar.
