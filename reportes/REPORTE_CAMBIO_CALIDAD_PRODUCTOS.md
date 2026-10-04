# Cambio — Cuarentena determinística de valores inválidos en productos

## Objetivo
Evitar que valores negativos o no numéricos de Venta/Unidades/Pedidos/Funnel contaminen las métricas agregadas, sin delegar la decisión de calidad a Cohere.

## Comportamiento
- Cohere sigue limitado al mapeo semántico de columnas.
- El motor determinístico de productos clasifica valores negativos o no numéricos como `invalid`.
- Esas celdas no participan en sumas ni ratios.
- Los registros/celdas se conservan para trazabilidad y las incidencias continúan visibles en la revisión de carga.
- Si existe al menos un valor observado utilizable, la métrica se muestra como `Disponible` (o `Parcial` si además hay faltantes), aunque tenga celdas excluidas.
- Si todas las celdas de una métrica son inválidas, permanece `Inválido` porque no existe ningún valor utilizable.
- Cada métrica expone `excluded` con el número de celdas excluidas; la vista muestra ese detalle mediante tooltip.

## Validación
- `node --check` ejecutado sobre todos los JS del proyecto.
- Prueba dirigida: 3 filas de venta, con una Venta negativa y una Venta no numérica. Resultado: Venta agregada = 100, estado `available`, 2 celdas excluidas; Pedidos = 4 y Unidades = 6.
