# Corrección 1 — Evolución y patrones

## Alcance

Corrección funcional y de interfaz de la tabla principal de **Evolución y patrones**.

No se modificó todavía la lógica de Share & Mix ni el rediseño de Patrones avanzados.

## Problemas corregidos

1. **Selector de patrón no filtraba**
   - El `<select>` entrega su valor mediante `el.value`.
   - El handler estaba leyendo `el.dataset.value`, que no existe en ese control.
   - Se corrigió el handler para usar `el.value`.
   - Al cambiar el patrón, la página vuelve a 1.

2. **Tabla sin paginación**
   - Antes se limitaba a `slice(0, 100)`.
   - Ahora muestra exactamente 10 registros por página.
   - Se agregaron Anterior / Siguiente.
   - Se muestra `X–Y de N productos` y `Página X de Y`.
   - El paginador respeta los filtros de patrón.

3. **Ver evolución parecía no funcionar**
   - La acción ya existía, pero el detalle se renderizaba al final de la vista.
   - Se agregó un destino identificable al panel de detalle.
   - Después de seleccionar un producto, la interfaz desplaza el viewport al detalle.

4. **Tabla excediendo el viewport**
   - Se confinó el overflow horizontal al contenedor de la tabla.
   - La página completa no debe crecer horizontalmente por las columnas.
   - Se mantiene un ancho mínimo interno para conservar legibilidad en desktop y móvil.

## Archivos modificados

- `js/app.js`
- `js/ui/trend-view.js`
- `css/design-system.css`

## Pruebas ejecutadas

### Sintaxis JavaScript

- `node --check js/app.js` → OK
- `node --check js/ui/trend-view.js` → OK
- `node --check js/analytics/trendEngine.js` → OK

### Prueba de paginación

Con 4,535 registros simulando el tamaño del dataset actual:

- Página 1 → 10 registros.
- Página 454 → 5 registros.
- Total → 454 páginas.

### Prueba de filtros

Con una distribución de tres patrones:

- crecimiento → filtro aplicado correctamente.
- deterioro → filtro aplicado correctamente.
- estable → filtro aplicado correctamente.

El cambio de filtro reinicia la página a 1.

## No incluido en esta corrección

- Recalculo de Ganadores/Perdedores de Share.
- Rediseño de Share & Mix Intelligence.
- Rediseño conceptual de Patrones avanzados.
- Comparación de octubre parcial contra septiembre.

Esos puntos quedan para la siguiente corrección analítica.
