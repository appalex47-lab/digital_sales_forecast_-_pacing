# Producto y evolución · etapa 2: la página nueva (foto y evolución)

Segunda etapa de la fusión. Se agrega la página **Producto y evolución** (`#prodevol`, en Diagnosticar). Categoría → Producto y Evolución y patrones siguen disponibles sin cambios de comportamiento.

## Qué muestra (de lo más importante a lo menos)
1. **Filtros y ruta únicos:** canal, granularidad, periodo y comparación (los de la etapa 1), la ruta categoría › producto › SKU con «Desglosar por», y en «Filtros» la geografía y los filtros de resultado de Evolución (métrica, historia, estado, búsqueda, patrón, señal, anomalía, materialidad, impacto). Los filtros de resultado salen como chips en la misma barra.
2. **¿Qué pesa y qué cambió?** Conclusión escrita con las cifras de la selección, KPIs, la tabla de participación y contribución, señales y trazabilidad (todo lo de Categoría → Producto).
3. **¿Desde cuándo y hacia dónde?** Resumen del análisis, KPIs, tabla de patrones, lectura de la entidad con su gráfica y fases, y forecast por entidad (todo lo de Evolución).
4. **Contribución y mix:** contribución y origen, volumen‑precio‑mezcla, puente al plan, participación y asistente. Pasan a su propio capítulo, sin duplicados, en la etapa 3.

## Cómo está construida
- **Una sola fuente por dato.** Producto manda en canal, periodo, comparación y ruta; Evolución los toma de él antes de calcular (`peSync` en `app.js`). El nivel que se analiza en el tiempo es el nivel de la tabla de Producto.
- **Sin duplicar código.** `product-view.js` expone `controlsHtml` y `resultParts`; `trend-view.js` expone `build` y `filters(state, true)`. Las páginas viejas usan las mismas funciones y se pintan igual.
- **Ids únicos.** Las tres páginas comparten ids internos: al pintar una se vacían las otras (`clearOldPages`, `clearPe`).
- Nuevos: `js/ui/prodevol-view.js`, estilos `.chap` en `design-system.css`, registro en `guidanceConfig.js`, `navigation.js`, `index.html` y `app.js`.

## Verificación
- `tools/selftest-node.js` 233/233; pruebas de contexto, guía, fases 25/26/27/33 y prioridades sin cambios.
- Navegador, página nueva (12 comprobaciones): filtros únicos, conclusión con cifras, ids únicos, cambio de granularidad que mueve la evolución, bajar a una categoría que filtra y cambia el nivel de la evolución, chips de resultado, alternar entre las tres páginas, móvil sin desborde y sin errores de consola.
- Navegador, etapa 1 (20 comprobaciones) sin cambios.
- No se pudieron ejecutar las pruebas de regresión en Python (falta Playwright para Python en este entorno).

## Pendiente
Etapa 3: capítulo «Contribución y mix» sin duplicados (una tabla de contribución, comparar antes los dos motores). Etapa 4: embudo completo, redirecciones de `#producto` y `#analisis` y retiro de las páginas viejas.
