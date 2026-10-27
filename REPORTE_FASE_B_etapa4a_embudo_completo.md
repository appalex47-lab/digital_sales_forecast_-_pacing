# Producto y evolución · etapa 4a: embudo completo

El capítulo «¿Por qué se mueve?» de la página nueva (`#prodevol`) deja de depender de nueve tarjetas sueltas del total y trae un módulo propio de embudo. Categoría → Producto y Evolución y patrones siguen disponibles.

## Qué muestra
1. **De la vista de ficha a la compra** (la fila elegida o toda la selección): vistas, carrito, checkout y compras GA4, con la tasa de cada paso contra la referencia en puntos porcentuales y una marca con la referencia.
2. **Dónde se pierde:** una tabla por categoría (o por el nivel de la tabla) con la tasa de cada paso, «compras ÷ vistas» y el paso más débil (cae más de 0.3 pp). Elegir una fila la pone como foco de los demás bloques.
3. **Tasas por periodo:** vista→carrito, carrito→checkout y checkout→compra, con los mismos periodos y granularidad que la evolución.
4. **Cuánto del cambio de venta viene de cada factor:** vistas × conversión de ficha × venta por compra; suma exactamente el cambio de venta.
La conclusión del capítulo se escribe con esas cifras. Con WhatsApp, Llamadas, o un filtro posterior a la ficha (estado, sucursal, entrega), la página dice que no hay embudo; sin archivo de funnel, manda a Carga de datos.
En el capítulo 1 se quitaron las tarjetas de funnel (viven aquí); la cobertura de tracking se muestra en el bloque 1.

## Cómo está hecho
- `js/analytics/funnelEngine.js` (puro): tasas, comparación, paso más débil y reparto (reutiliza `trafficConversionEngine.effects` con las vistas de ficha como tráfico). `tools/test-funnel-engine.js`: 15 pruebas.
- `app.js · ensureFunnelSeries`: serie por periodo con el mismo almacén, calculada una vez por selección y foco.
- `prodevol-view.js`: los cuatro bloques y la conclusión; `product-view.js`: opción `noFunnel`; estilos `.fnl*`.

## Para tener en cuenta
- «Compras ÷ vistas» usa compras GA4 (artículos); el CR de la tabla del capítulo 3 usa pedidos ÷ vistas. Pueden diferir y la página lo dice.
- Las vistas son de ficha, no sesiones: por eso el reparto difiere del árbol por sesiones de Diagnóstico.

## Verificación
Motor 15/15; selftest 233/233; pruebas de tráfico y conversión, contexto, guía y fases 26/33. Navegador con venta y funnel de prueba: embudo (11 comprobaciones: cuatro bloques, tasas iguales a las de Producto, suma exacta del reparto, foco por fila, periodos iguales a los de la evolución, WhatsApp sin embudo, ids únicos, móvil), página nueva (12) y etapa 1 (20). No se ejecutaron las pruebas de regresión en Python.
