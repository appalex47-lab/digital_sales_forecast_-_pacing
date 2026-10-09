# Fase 6 — Forecast de tendencias

## Objetivo
Agregar al módulo **📊 Análisis** una proyección de la trayectoria histórica de cada entidad, sin duplicar ni sustituir el Forecast operativo existente de PLAN → ACTUAL → FORECAST.

## Implementación
- Nuevo motor: `js/analytics/trendForecastEngine.js`.
- Reutiliza las series históricas ya construidas por `ensureTrendAnalysis()` desde IndexedDB.
- No crea una nueva fuente de datos ni una segunda persistencia.
- Integrado en `state.an.forecast`.
- Integrado visualmente en `js/ui/trend-view.js`.
- Script registrado en `index.html`.

## Métodos
1. **Tendencia lineal**: extrapola la pendiente histórica.
2. **Promedio reciente**: usa el promedio de las últimas observaciones disponibles.
3. **Combinado**: promedio entre tendencia lineal y promedio reciente.

## Horizonte
La interfaz permite 3, 6 y 12 meses.

## Evidencia y límites
Cada proyección informa:
- última observación y periodo;
- valores futuros por periodo;
- cambio esperado al final del horizonte;
- pendiente histórica;
- número de observaciones históricas;
- confianza descriptiva (`high`, `medium`, `low`, `insufficient`);
- variabilidad histórica cuando puede estimarse mediante residuos.

Los límites bajo/alto son una referencia de variabilidad histórica. **No son intervalos de confianza estadísticos ni probabilidades.** El forecast tampoco establece causalidad.

## Diferencia frente al Forecast operativo
El sistema existente de `forecastEngine.js` sigue siendo el motor operativo para PLAN → ACTUAL → PROYECCIÓN. Esta Fase 6 agrega un forecast de tendencia dentro de Análisis para responder: **“si la trayectoria histórica continúa, ¿hacia dónde podría dirigirse?”**

## Manejo de datos insuficientes
No se inventan meses faltantes como cero. Si una entidad tiene menos de 4 observaciones útiles, se marca como `insufficient_data`.

## Pruebas realizadas
- Crecimiento histórico → proyección creciente.
- Deterioro histórico → proyección decreciente con método lineal.
- Historia insuficiente → no genera forecast.
- Valores proyectados negativos → se acotan a cero.
- Fechas futuras → se generan consecutivamente desde el último periodo real disponible.
- Múltiples entidades → se clasifican por crecimiento/deterioro esperado.
- Validación sintáctica completa: **126 archivos JS, 0 errores**.
- Se agregaron pruebas de Fase 6 al `self-test.js`.

## Nota sobre el método combinado
El método combinado puede suavizar una caída o crecimiento muy pronunciado al mezclar la extrapolación lineal con el promedio reciente. Esto es intencional y se muestra como supuesto metodológico; para preservar mejor la dirección de la tendencia debe utilizarse **Tendencia lineal**.

## Resultado
Fase 6 completada e integrada con el módulo de Análisis existente.
