# FASE 25 — UX/UI de Prioridades de acción + Mix Intelligence

## Objetivo
Corregir la lectura en pantalla de **Prioridades de acción** y **Mix Intelligence**, reduciendo tablas anchas y haciendo explícita la comparación temporal.

## Hallazgos principales
1. **Prioridades de acción** sí ordenaba por impacto monetario absoluto, pero la primera vista mezclaba demasiadas dimensiones en una tabla de nueve columnas.
2. La interfaz no hacía suficientemente visible **qué períodos se estaban comparando**.
3. La prioridad no mostraba en primera vista cuánto representaba una entidad dentro del **movimiento negativo/positivo total**.
4. Un período parcial seleccionado podía interpretarse visualmente como comparable completo; ahora se marca explícitamente.
5. **Mix Intelligence** concentraba demasiada información en tablas horizontales, provocando truncamiento visual de entidades y dificultando leer dinero vs crecimiento vs participación.

## Nueva lógica de Prioridades
La jerarquía queda:

1. **Impacto monetario absoluto del período comparable** — determina el orden principal.
2. **Participación dentro del movimiento** — qué porcentaje de toda la caída/compensación representa la entidad.
3. **Persistencia** — cuántos períodos consecutivos mantiene el patrón.
4. **Patrón / aceleración** — crecimiento, caída, aceleración, recuperación, anomalía, etc.
5. **Cambio relativo y share** — contextualizan el impacto monetario.
6. **Confianza** — desempata/orienta la investigación.

El score ya no pretende sustituir el impacto monetario. El impacto sigue siendo la regla principal de orden.

### Regla de interpretación
- 🔴 **Arrastre** = cambio monetario negativo.
- 🟢 **Compensación** = cambio monetario positivo.
- Ninguno implica causalidad.

## Nueva UX de Prioridades
La primera vista ahora usa tarjetas en lugar de una tabla ancha.
Cada entidad muestra:
- ranking;
- nombre completo con truncamiento controlado;
- período base → actual;
- impacto $;
- cambio %;
- participación dentro del movimiento;
- persistencia;
- patrón;
- score;
- primera pista de evidencia cuando existe;
- botón **Leer evidencia**.

También se muestran:
- caída acumulada;
- crecimiento acumulado;
- balance neto;
- número de prioridades visibles;
- comparación temporal explícita.

Si el período actual es parcial, aparece **⚠ período actual parcial**.

## Nueva UX de Mix Intelligence
La primera lectura usa tarjetas para:
- quién gana participación;
- quién pierde participación.

Cada tarjeta muestra:
- venta base;
- venta actual;
- cambio $;
- participación base → actual;
- cambio en pp;
- crecimiento %;
- ranking base → actual;
- período comparado.

El detalle completo conserva la tabla dentro de **Ver mix completo**.

## Datos reales utilizados
CSV: `Venta Productos 2026.csv`

- 85,973 filas
- 2,638 entidades comparables agosto → septiembre 2026
- Septiembre 2026: $27,980,973.65
- Agosto 2026: $18,016,165.78
- Cambio: +$9,964,807.87 (+55.31%)

Top arrastres reales agosto → septiembre:
1. VIDAZA — -$58,057.65
2. ADEMPAS — -$51,435.40
3. NGENLA — -$41,394.48
4. HYRIMOZ — -$37,882.62
5. KI-CAB — -$36,214.40

Top compensadores reales:
1. GARDASIL 9 — +$1,421,601.92
2. BEYFORTUS — +$1,296,680.00
3. MOUNJARO 5 mg — +$565,914.41
4. MOUNJARO 10 mg — +$333,326.81
5. MOUNJARO 2.5 mg — +$267,977.05

## Pruebas
- Motor Prioridades Fase 25: **10/10 PASS**
- Datos reales Fase 25: **8/8 PASS**
- UX/UI Fase 25: **12/12 PASS**
- UX/UI Prioridades histórico: **12/12 PASS**
- Prioridades histórico: **7/7 PASS**
- Prioridades reales histórico: **6/6 PASS**
- Diagnóstico/regresión Fase 20: **15/15 PASS**
- Forecast Fase 21: **13/13 PASS**
- Forecast real: **7/7 PASS**
- Arquitectura Fase 15: **12/12 PASS**
- Narrativa Fase 23: **11/11 PASS**
- Narrativa real: **6/6 capas PASS**
- Auditoría Fase 24: **PASS**
- Sintaxis JS: **PASS**
- IDs HTML duplicados: **0**

## Limitación
No se declara una prueba visual completa con Chromium/headless porque el entorno de ejecución no ofrece una validación gráfica fiable. La corrección visual se verificó mediante inspección estructural, CSS responsive y pruebas de render-contract.

## Archivos funcionales modificados
- `js/analytics/actionPriorityEngine.js`
- `js/app.js`
- `js/ui/trend-view.js`
- `css/styles.css`
- pruebas de Prioridades

No se introdujeron cambios funcionales fuera de la sección de **Análisis**.
