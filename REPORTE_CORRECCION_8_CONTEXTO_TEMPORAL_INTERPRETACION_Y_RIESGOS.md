# Corrección 8 — Contexto temporal, interpretación, trazabilidad y riesgos accionables

## Objetivo

Convertir el módulo de análisis en un flujo interpretable: el usuario puede elegir granularidad temporal, ver claramente el período utilizado, entender cada señal y recibir riesgos/oportunidades que primero utilizan evidencia del dataset y sólo después señalan datos externos faltantes.

## Cambios implementados

### 1. Granularidad temporal
- Año
- Mes
- Semana ISO
- Día
- Número configurable de períodos.
- El último período incompleto se excluye automáticamente cuando la granularidad lo permite.
- El dataset de prueba termina el 04/10/2026; octubre mensual se considera parcial y septiembre 2026 queda como último mes completo.
- Semana 28/09–04/10 sí puede tratarse como semana completa porque el archivo llega al domingo 04/10.

### 2. Comparación
- Período anterior.
- Mismo período del año anterior, cuando existe en la fuente.
- La comparación anual consulta explícitamente el período homólogo; no se inventa si no existe.

### 3. Evolución y Patrones
- “Desde” se presenta como **Inicio del patrón**.
- Se conserva la duración del patrón.
- Se muestra contexto de granularidad y cantidad de períodos.
- Patrones y señales son dinámicos: los desplegables muestran sólo valores realmente presentes en los resultados del dataset actual.

### 4. Patrones avanzados
- Mantiene score como prioridad relativa, no como probabilidad.
- Las señales se interpretan como comportamiento observado y no como causalidad.

### 5. Mix Intelligence
- Mantiene comparación monetaria y de participación.
- Respeta la comparación temporal seleccionada.
- El cambio de participación se interpreta como cambio de composición, no como explicación causal.

### 6. Contribución y origen
- Mantiene reconciliación del movimiento monetario entre período base y período actual.
- Permite distinguir contribuyentes positivos y negativos.
- La interfaz deja explícito que contribución es atribución matemática descriptiva, no causalidad.

### 7. Riesgos y oportunidades
- El motor conserva priorización por magnitud, persistencia, aceleración, participación y confianza.
- Se agregó evidencia contextual por sucursal, estado y canal para los hallazgos prioritarios, cuando esas dimensiones existen.
- Cada hallazgo puede mostrar dónde se concentra el movimiento.
- Se separa:
  - evidencia disponible;
  - hipótesis o comprobaciones pendientes;
  - información externa que todavía no está conectada.
- Se reconocen como posibles fuentes externas faltantes: stock, precio de mercado, promociones y costos/margen.
- No se afirma “falta de stock” sólo porque haya una caída de ventas.

### 8. Forecast
- Se mantiene la proyección descriptiva por entidad.
- El motor ahora conserva la granularidad temporal seleccionada.
- Se agregó backtesting cronológico simple: se ocultan observaciones finales, se pronostican con historia previa y se calcula error histórico cuando hay datos suficientes.
- La interfaz muestra número de períodos validados y error medio porcentual cuando es calculable.
- El backtest no se presenta como garantía del futuro.

## Validaciones realizadas

- `node --check` sobre todos los JS: PASS.
- Regresión existente `test-patterns-correction-3.js`: PASS.
- Prueba aislada de Trend Engine + Forecast + Risk Engine: PASS.
- Forecast de ejemplo genera períodos futuros coherentes y un backtest cronológico.
- Dataset real revisado: 85,973 registros, 18 columnas, fechas 01/01/2026–04/10/2026.
- Confirmado: octubre 2026 está incompleto a nivel mensual; septiembre 2026 es el último mes completo.
- Confirmado: la semana que termina el 04/10/2026 sí puede considerarse completa para la granularidad semanal.

## Limitaciones honestas

No se ejecutó una prueba de navegador/IndexedDB sobre la interfaz final en este entorno. Las pruebas realizadas cubren sintaxis, regresiones existentes y motores aislados. Antes de release debe hacerse una prueba funcional en navegador con el CSV real para recorrer Año/Mes/Semana/Día, filtros dinámicos, Riesgos, Contribución, Forecast y Cohortes.

## Criterios de aceptación pendientes de prueba visual

1. Cambiar granularidad reconstruye la serie y actualiza período/comparación.
2. Los filtros Patrones/Señal muestran sólo resultados existentes.
3. Riesgos muestra desglose cuando las dimensiones están disponibles.
4. Forecast muestra backtest y no confunde precisión histórica con certeza futura.
5. Cohortes conserva su semántica después del cambio de granularidad.
6. Ningún período parcial se presenta como período completo.
