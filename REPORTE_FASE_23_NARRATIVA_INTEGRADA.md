# FASE 23 — NARRATIVA EJECUTIVA INTEGRADA

## Objetivo
Convertir los resultados ya calculados del módulo Análisis en una lectura ejecutiva trazable, respetando la arquitectura:

HECHO → DRIVER → SEÑAL → HIPÓTESIS → PROYECCIÓN → CICLO DE VIDA

La fase no crea métricas nuevas ni atribuye causalidad.

## Cambios

### `js/analytics/analysisNarrativeEngine.js`
- Evoluciona el contrato a `schemaVersion: 2`.
- Integra las seis capas analíticas.
- Cada claim conserva `layer`, `level`, `source` y `numbers`.
- Añade estado por capa: `available` / `insufficient`.
- Integra Ciclo de Vida/Cohortes.
- Protege explícitamente la frontera entre señal, hipótesis y causalidad.
- Genera una siguiente pregunta analítica verificable.
- Puede consumir hipótesis externas del motor diagnóstico sin convertirlas en hechos.

### `js/app.js`
- Pasa `cohort` a la narrativa para conectar la sexta capa.

### `js/ui/trend-view.js`
- Sustituye el bloque de narrativa por una lectura ejecutiva de las seis capas.
- Hace visible el estado de cada capa.
- Mantiene evidencia textual y trazabilidad.
- Añade “Siguiente pregunta analítica”.
- Conserva Cohere como opción de redacción, no como motor de cálculo.

### `css/styles.css`
- Añade tarjetas compactas para las seis capas.
- Responsive a 3 columnas y 2 columnas en pantallas menores.
- No introduce scroll horizontal.

## Principios preservados
- HECHO no es causa.
- DRIVER explica matemáticamente el movimiento; no demuestra causalidad.
- SEÑAL indica dónde investigar.
- HIPÓTESIS requiere validación.
- PROYECCIÓN es descriptiva y no representa certeza estadística.
- CICLO DE VIDA usa los estados de cohortes calculados previamente.
- Cohere solo redacta resultados calculados.

## Pruebas
- Fase 23 narrativa: **11/11 PASS**.
- Narrativa con fixture real: **PASS — 2,638 entidades / 6 de 6 capas disponibles**.
- Forecast: **13/13 PASS**.
- Forecast real: **7/7 PASS**.
- Arquitectura: **12/12 PASS**.
- Prioridades engine: **7/7 PASS**.
- Prioridades real: **6/6 PASS**.
- Prioridades UX/UI: **12/12 PASS**.
- Diagnóstico/Hipótesis: **15/15 PASS**.
- Patrones/regresión: **PASS**.
- Sintaxis JavaScript: **PASS**.

## Datos reales
CSV: `Venta Productos 2026.csv`

La narrativa se probó con el universo real comparable agosto→septiembre 2026 (2,638 productos).

Se verificaron como ejemplos de driver/señal:
- GARDASIL 9: +$1,421,601.92
- BEYFORTUS: +$1,296,680.00
- VIDAZA: −$58,057.65

Y ciclo de vida de septiembre:
- 159 nuevos
- 1,250 retenidos
- 673 reactivados
- 556 perdidos

## Pendiente
La prueba visual integral con Chromium/headless sigue limitada por el entorno. Los contratos de UX/UI, renderizado estructural, responsive CSS y lógica fueron validados mediante tests automatizados.

## Criterio de cierre de fase
La fase se considera aprobada cuando:
1. Las seis capas son visibles.
2. La narrativa reutiliza resultados existentes.
3. Cada afirmación tiene origen trazable.
4. No se declara causalidad sin evidencia.
5. Cohortes participa en la lectura ejecutiva.
6. Cohere permanece opcional.
7. Las regresiones anteriores permanecen en PASS.

**Estado: APROBADA.**
