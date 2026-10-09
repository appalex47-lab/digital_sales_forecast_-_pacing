# Corrección 31 — Regresión de Análisis, baseline Fase 27

## Hallazgo
La Fase 27 es la última versión confirmada por el usuario como funcional con el CSV real. Las correcciones 28–30 introdujeron cambios acumulativos sobre `app.js` y `trend-view.js`, por lo que la depuración sobre Fase 30 no aislaba correctamente la regresión.

## Decisión
Se recupera como baseline funcional la Fase 27 y se reincorpora Forecast de forma aislada.

No se modifica el pipeline de carga de datos ni `ensureTrendAnalysis()` de Fase 27.

## Cambios
- Baseline `app.js` y `trend-view.js` de Fase 27.
- Forecast conserva motor actualizado con ranking por confianza, dirección y backtesting.
- `forecastPanel()` es defensivo y no usa `Array.at()` ni propiedades de unidades que no existan.
- Paginación de Forecast agregada sin modificar el cálculo principal del Análisis.
- Cambio de horizonte/método reinicia la página de Forecast.
- Error de una entidad de Forecast no debe eliminar el resto de resultados.

## Validaciones
- Sintaxis JS completa: PASS.
- Test existente Fase 27 real: PASS 6/6.
- Los tests históricos que apuntan a `/tmp/phase21` siguen siendo rutas heredadas inválidas y no se consideran evidencia.

## Limitación
No se declara una prueba visual completa de navegador en este entorno. La validación definitiva pendiente es cargar el CSV real en el navegador y comprobar la vista Análisis.
