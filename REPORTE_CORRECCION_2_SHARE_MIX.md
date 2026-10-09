# CORRECCIÓN 2 — Sangre & Mix Inteligente / Share & Mix

## Objetivo
Corregir la comparación de participación para que no compare el primer mes histórico contra un mes parcial y para que diferencie ganancias, pérdidas, productos nuevos y productos perdidos.

## Causa raíz
La implementación anterior tomaba:
- periodo base = primer mes del histórico;
- periodo actual = último mes disponible.

Con el dataset actual, octubre de 2026 solo contiene datos hasta el día 4. Por tanto, usar octubre como periodo actual hacía que la comparación no fuera homogénea.

## Cambio implementado
El motor ahora identifica los dos últimos periodos completos disponibles y los utiliza para Share & Mix.

Para el dataset actual:
- Base: 2026-08
- Actual: 2026-09
- Octubre 2026 parcial: excluido del comparativo de Share & Mix.

La evolución histórica continúa utilizando sus meses disponibles; el cambio afecta específicamente la comparación de participación.

## Clasificación
- `gaining`: aumento significativo de share.
- `losing`: disminución significativa de share.
- `stable`: cambio dentro del umbral de estabilidad.
- `new`: sin venta en base y con venta en actual.
- `lost`: con venta en base y sin venta en actual.

Los nuevos/perdidos ya no se cuentan como ganadores/perdedores de share, porque no tienen dos participaciones comparables.

## Validación con dataset real
Archivo: `Venta Productos 2026.csv`

Comparación agosto → septiembre, nivel SKU/producto:
- Entidades comparables o presentes en al menos uno de los dos periodos: 2,646
- Ganadores significativos: 264
- Perdedores significativos: 366
- Estables: 2,016
- Nuevos: 831
- Perdidos: 556

Como referencia, si se contaran simplemente todos los cambios positivos/negativos sin umbral, habría 1,302 positivos y 1,336 negativos. La interfaz ahora usa el umbral significativo del motor para evitar ruido.

## UI
La sección ahora se presenta como `Sangre & Mix Inteligente` e informa:
- periodo base y periodo actual;
- ganadores;
- perdedores;
- nuevos;
- perdidos;
- estables;
- HHI/concentración.

## Pruebas
- Sintaxis `app.js`: OK
- Sintaxis `shareMixEngine.js`: OK
- Sintaxis `trend-view.js`: OK
- Prueba unitaria sintética del motor: OK
- Validación independiente con CSV real: OK
- Regresión de la Corrección 1: conservada en la copia de trabajo.

## No incluido en esta corrección
No se modificó todavía:
- motor de patrones avanzados;
- lógica de cohortes;
- conexión con APIs;
- narrativa de IA más allá de consumir el nuevo resultado calculado.

## Archivos modificados
- `js/app.js`
- `js/analytics/shareMixEngine.js`
- `js/ui/trend-view.js`

## Addendum — auditoría integral posterior

Durante la auditoría de las lógicas se volvió a ejecutar el motor con una serie mensual completa y con el umbral actualmente definido en `shareMixEngine.DEFAULTS.significantPp = 0.01` puntos porcentuales.

La salida reproducible del motor para la comparación agosto → septiembre a nivel Producto en la serie de prueba independiente es:
- Ganadores: 147
- Perdedores: 261
- Estables: 842
- Nuevos: 832
- Perdidos: 556
- HHI: 0.0274

La cifra anterior documentada de 264 ganadores / 366 perdedores no se reproduce con la implementación actual y no debe tratarse como resultado de referencia. La implementación actual conserva la regla explícita del umbral y la separación entre nuevos/perdidos y movimientos comparables.
