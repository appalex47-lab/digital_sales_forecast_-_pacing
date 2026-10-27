# Producto y evolución · etapa 3: contribución y mix sin duplicados

Tercera etapa de la fusión. La página **Producto y evolución** (`#prodevol`) ahora se lee de arriba abajo en seis capítulos y la contribución se muestra una sola vez. Categoría → Producto y Evolución y patrones siguen disponibles sin cambios.

## Antes de unir: comparación de los dos cálculos de contribución
Se compararon `productAnalysis` (tabla de Producto) y `contributionEngine` / `shareMixEngine` (Evolución) con los mismos datos, en 64 combinaciones: mes completo y en curso, semana y año; contra el periodo anterior y el año anterior; Total digital y App; categoría, subcategoría, producto y SKU.
- **Coinciden exactamente** en venta actual, venta base, participación actual y base, contribución y totales en las 64 combinaciones.
- Solo dos diferencias de listado, ninguna de cálculo: (1) una entidad sin cambio (Δ = 0) no se lista en «Contribución y origen» de Evolución, pero sí en la tabla de Producto; (2) con cambio neto 0 la contribución no está definida en Producto («—») y Evolución usa el peso del movimiento. Se conserva el comportamiento de Producto en la tabla única.
- Conclusión: se puede dejar una sola tabla sin cambiar ninguna cifra.

## Capítulos
1. **¿Qué pasó?** Conclusión, contexto, resumen del análisis y KPIs.
2. **¿Contra la meta?** Puente al plan (solo sin selección de producto, como hoy).
3. **¿Quién lo mueve?** Una sola tabla: venta, referencia, Δ, participación, contribución, estado, **peso del movimiento, Δ participación, tendencia, patrón, persistencia y primera pista** (las columnas de «Contribución y origen» y de la tabla de patrones), con el rol (Arrastra/Compensa) bajo el nombre. Arriba: cambio neto, movimiento positivo y negativo, concentración, conciliación, aviso de materialidad, «Diagnosticar este periodo» y «Descargar CSV». Debajo: quiénes ganan y quiénes pierden participación.
4. **¿Desde cuándo y hacia dónde?** KPIs con detalle, tabla de patrones, lectura de la entidad con su gráfica y fases, forecast por entidad.
5. **¿Por qué se mueve?** Volumen · precio · mezcla y señales por patrón (el embudo completo llega en la etapa 4).
6. **Evidencia y detalle.** Trazabilidad y asistente «Pregúntale a tus datos».
Cada capítulo abre con una conclusión escrita con las cifras de la selección.

## Cambios de código
- `product-view.js`: `resultParts(state, extra)` acepta columnas y un subtítulo extra por fila.
- `trend-view.js`: nuevas `extras(state)` (rol, peso, Δ participación, persistencia, pista, tendencia y patrón por entidad) y `contributionKpis(state)`.
- `prodevol-view.js`: seis capítulos con sus conclusiones; la trazabilidad usa el id `pe-trace`.

## Verificación
`tools/selftest-node.js` 233/233; pruebas de contexto, guía y fases 25/26/27/33 sin cambios. Navegador: página nueva 12/12 (ids únicos, móvil sin desborde, filtros y chips) y etapa 1 20/20. No se ejecutaron las pruebas de regresión en Python (falta Playwright para Python).

## Pendiente
Etapa 4: embudo completo (dónde se pierde, tasas por mes, reparto vistas × conversión × ticket), redirecciones de `#producto` y `#analisis`, la franja «¿Por qué?» y retiro de las páginas viejas.
