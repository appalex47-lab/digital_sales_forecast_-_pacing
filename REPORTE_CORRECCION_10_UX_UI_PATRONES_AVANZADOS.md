# Corrección 10 — Patrones avanzados y revisión final UX/UI

## Correcciones
- Impacto de Patrones avanzados se presenta explícitamente como **Impacto reciente $**, usando el cambio monetario entre los dos últimos períodos válidos y con respaldo al cambio acumulado cuando el reciente no existe.
- Persistencia ya no aparece como un número desnudo: se muestra en períodos y su significado queda explicado en la ayuda de la tabla.
- Rupturas/cambios ahora cuentan tanto señales `trend_break` como cambios de régimen detectados por el motor. Si el valor es 0, se explica que significa ausencia de una ruptura que supere los umbrales actuales.
- Score tiene tooltip aclarando que es un índice relativo de priorización, no una probabilidad.
- Se mantuvo la primera vista compacta y las seis señales de mayor score.

## UX/UI final revisada
- Datos esenciales permanecen visibles en la primera vista.
- Las tablas principales están limitadas a pocas filas visibles y no requieren un desplegable para acceder a los datos esenciales.
- Los desplegables quedan para metodología, interpretación y evidencia secundaria.
- No se añaden columnas puramente decorativas.
- Los valores monetarios permanecen alineados y legibles en escritorio y móvil.
- Se conservan filtros dinámicos basados en resultados reales.

## Pruebas
- `node --check` de UI, controlador y módulos analíticos: PASS.
- Regresión existente de patrones: PASS.
- Validación estática de etiquetas/columnas y mensajes de interpretación: PASS.
