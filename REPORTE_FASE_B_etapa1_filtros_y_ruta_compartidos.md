# Producto y evolución · etapa 1: filtros y ruta compartidos

Primera etapa de la fusión de Categoría → Producto con Evolución y patrones. No retira ninguna página: las dos siguen existiendo y ahora leen los mismos filtros y la misma selección.

## Cambios
1. **Una sola selección.** La ruta de Producto (categoría › subcategoría › producto y filtros de ubicación) y el filtro de Evolución son la misma selección: cambia en una y la otra la adopta al navegar, y sobrevive a una visita a Diagnóstico. SKU y región solo existen como ruta de Producto; al pasar a Evolución se omiten y se avisa. Si la selección ya es la categoría que Evolución analizaba, el nivel baja al siguiente. (`navigation.js`: `paContext`, `anContext`, `applyContext`.)
2. **Mismos controles de periodo.** Producto cambia «Desde/Hasta» por Granularidad (año, mes, semana, día o rango) y Periodo, como Evolución. «Rango» conserva desde–hasta. Canal, granularidad, periodo y comparación quedan en la fila principal de las dos páginas. (`product-view.js`, `trend-view.js`; acciones `pa-gran` y `pa-focus`.)
3. **Periodos del calendario en las dos.** Semana y día viajan entre páginas (antes solo año y mes).
4. **Mes en curso.** Producto compara el mes en curso con los mismos días del mes anterior (1–5 oct contra 1–5 sep), igual que Evolución. Antes comparaba contra los N días inmediatamente anteriores.
5. Los botones de salto entre páginas pasan la selección por el contexto de ruta para que la navegación no la pise.

## Verificación
`tools/selftest-node.js` 233/233 y pruebas de contexto, guía y fases 26/33 sin cambios. Prueba en navegador (20 comprobaciones): controles unificados, mes en curso, semana, día y año en ambos sentidos, selección en ambos sentidos y al limpiar, y que Diagnóstico no cambie su periodo.
`tools/regression/batch_filtros_shell.py` (8b) se actualizó al nuevo diseño pero no se pudo ejecutar en este entorno (falta Playwright para Python).

## Pendiente
Etapa 2: pestañas/capítulos Foto y Evolución en la página nueva.
