# Corrección 11 — Regresión de comparación, contexto monetario y lectura de entidad

## Hallazgos

1. **Comparar contra → Mismo período año anterior** podía dejar la vista en estado de error cuando no existía el período de comparación. El CSV de prueba contiene 2026, pero no 2025.
2. La tarjeta **Venta actual** no indicaba el período al que pertenecía el importe.
3. La tabla principal de Evolución no tenía una acción visible por entidad para abrir **Lectura de la entidad**.
4. El motor reportaba **218/220** pruebas correctas.

## Correcciones

### Comparación año anterior
- La comparación ahora es opcional respecto de la disponibilidad real del dataset.
- Si falta el período anterior, Evolución y Patrones siguen funcionando con el histórico disponible.
- Mix y Contribución muestran que la comparación no está disponible en vez de provocar un error general.
- Se muestra un aviso explícito y el usuario puede volver a «Período anterior» sin recargar la página.
- Se eliminó la agregación inválida `groupBy:'total'` del camino de comparación YoY; el total se obtiene sumando el mapa de entidades disponible.

### Venta actual
- La tarjeta ahora muestra el período debajo de la etiqueta, por ejemplo `Venta actual · 2026-09`.
- La venta comparable muestra de la misma forma su período de referencia.

### Lectura de entidad
- Cada fila de Evolución/Patrones tiene botón **Leer**.
- El botón activa `an-select`, actualiza la tarjeta «Lectura de la entidad» y desplaza el foco visual hacia ella.
- El botón es accesible por teclado y tiene `aria-label` con el nombre de la entidad.

### Motor
- Se corrigió la prueba de ruptura para validar booleanamente la evidencia en lugar de devolver un string.
- Se reforzó la señal `trend_break` cuando existe un cambio de régimen real.
- Se aclaró la metodología del Forecast para declarar explícitamente que no establece causalidad.

## Validación

- **220 / 220 pruebas del motor correctas.**
- `node --check` de todos los JS: correcto.
- La prueba incluye los módulos de análisis, diagnóstico, navegación, trazabilidad y Forecast.

## Dataset de prueba

`Venta Productos 2026.csv`

- 85,973 registros.
- Fechas: 01/01/2026–04/10/2026.
- Octubre 2026 es parcial a nivel mensual; septiembre 2026 es el último mes mensual completo.
- No existe 2025 en este dataset, por lo que «Mismo período año anterior» debe informar comparación no disponible, no fallar toda la vista.
