# ¿Por qué? · contexto compartido y enlaces cruzados (paso A)

Revisión de Evolución y patrones, Tráfico y conversión y Categoría → Producto (Diagnóstico y Clientes y LTV quedaron fuera). Evolución y Producto leen los mismos datos y la misma jerarquía, con filtros propios que se desalineaban. Este paso no fusiona páginas (eso es el paso B); quita la fricción entre ellas.

## Cambios
1. **Contexto compartido.** Canal siempre; periodo y comparación solo si la persona los cambió en esa vista (`pa.touched`, `an.ctxTouched`), para que pasar por Producto o Evolución con su periodo por defecto no pise el de Diagnóstico. `navigation.js` (`paContext`, `anContext`, `applyContext`). Producto trabaja por mes/semana/año (antes el aviso lo prometía pero no se aplicaba); Evolución por año/mes. Semana, día o rango se ajustan al mes y se avisa en la barra de contexto. Si los datos de productos no llegan al periodo, se conserva el que tenía la vista y se avisa.
2. **Enlaces cruzados.** Producto → Evolución: botón «Evolución» por fila (misma ruta, canal y periodo; abre la lectura de esa fila). Evolución → Producto: «Ver embudo y señales» en la lectura de la entidad.
3. **Una trazabilidad.** La completa (venta y funnel, archivo y fila) es la de Producto. «Registros fuente» de Evolución se queda como vista previa con su conciliación y trae «Ver trazabilidad completa en Categoría → Producto».
4. **Franja «¿Por qué?».** Ya no dice «con los mismos datos»: indica de qué datos sale cada opción (plan y venta real, venta por producto, segmentos de GA4) y que canal, periodo y comparación acompañan.

## Verificación
`tools/selftest-node.js` 233/233; pruebas de contexto, guía y fase 26/33 sin cambios. Prueba en navegador (9 comprobaciones): contexto en ambos sentidos, no contaminar Diagnóstico, enlaces de fila y trazabilidad, sin errores de consola.

## Pendiente (paso B)
Fusionar Categoría → Producto con Evolución y patrones en una página con pestañas; requiere unificar el modelo de periodo (rango libre contra calendario).
