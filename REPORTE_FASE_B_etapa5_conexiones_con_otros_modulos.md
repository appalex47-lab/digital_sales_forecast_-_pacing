# Producto y evolución · etapa 5: conexiones con otros módulos

Tres piezas que dejaban a la página sin contacto con el resto de la herramienta. Todo sale de datos que ya existen; nada es inventado. Módulo nuevo: `js/ui/prodevol-context.js` (+ `tools/test-prodevol-context.js`, 9 pruebas).

## 1 · ¿Es normal para la época? (capítulo 4)
Tres tarjetas para la selección (o la fila elegida): el cambio de este periodo contra su comparación frente al mismo cambio un año antes; el cambio contra el mismo periodo del año anterior; y los movimientos inusuales que ya detecta Evolución. `app.js · ensureSeasonalContext` calcula los cuatro periodos con el mismo almacén de productos; se verificó contra la venta sumada aparte. Si el año anterior no está en los datos, la página lo dice y no muestra cifras. Enlaza con Estacionalidad.
**Límite:** usa un solo año de referencia; no es un índice estacional (la página lo dice).

## 2 · Nuevo desde tu última visita (capítulo 1)
Compara la lectura de cada fila (dirección crece/cae/estable, patrón y movimiento inusual) con la de la última visita con la misma selección (canal, nivel, granularidad, comparación y ruta): empieza a caer, se recupera, cambió de patrón, movimiento inusual nuevo, aparece o desaparece. Marca «Nuevo» junto a la fila en la tabla. Primera visita y «sin cambios» se dicen explícitamente. La foto se guarda en este navegador (`localStorage`, 12 selecciones como máximo) y no se compara si los datos son más viejos que los de la foto.
**Límites:** «Qué cambió desde ayer» trabaja por canal contra el plan, no por producto; por eso esta pieza usa su propia foto y enlaza a esa página para el total. La foto no se sincroniza con la nube.

## 3 · ¿Qué hago? (capítulo 6; Evidencia pasa a ser el 7)
- **Hipótesis por validar:** salen de lo que muestran los datos (vistas arriba y conversión abajo con su paso más débil, vistas que caen, cobertura de tracking baja, caída sostenida, movimiento inusual a la baja). No afirman causas. «Abrir Recovery Center» solo abre la página: Recovery arma sus hipótesis desde el Diagnóstico y no admite hipótesis de producto, así que no se pueden crear ahí desde esta página.
- **Ya en marcha en esta selección:** promociones aprobadas, publicadas o en medición con SKU de la selección, exposiciones activas y ofertas pedidas a Comercial sin respuesta. La selección incluye la fila elegida; la conclusión del capítulo dice para cuál es. Las acciones del plan de Recovery son por canal y driver, no por producto, y no se muestran aquí.
- **Qué impulsar:** las oportunidades de los SKU de la selección (tipo, evidencia y ruta), con «Abrir Oportunidades» que filtra por categoría, subcategoría y producto o SKU. Usan su propio periodo (últimos 30 días contra los 30 previos), indicado en la tarjeta.

## Verificación
selftest 233/233; contexto 9/9; embudo 15/15; guía y fases 26/27/33. Navegador: etapa 5, 18 comprobaciones (periodos de época contra venta calculada aparte, sin año anterior, promoción/exposición/oferta pedida según la fila, hipótesis sin causas, Oportunidades con filtro, primera visita, sin cambios, cambio simulado con marca en la tabla, datos más viejos, ids únicos, móvil, consola); embudo 11, página nueva 9, 4b 14, 4c 12 y prueba de humo de 17 páginas sin errores.
No se ejecutaron las pruebas de regresión en Python (falta Playwright para Python en este entorno).
