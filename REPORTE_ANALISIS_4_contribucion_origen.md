# Análisis 4 — Contribución y origen

## Objetivo
Explicar qué entidades explican un movimiento observado, cuánto contribuye cada una y qué tan concentrado está el cambio.

## Implementado
- `js/analytics/contributionEngine.js`.
- Cálculo determinístico de cambio por entidad.
- Ranking de contribuyentes positivos y negativos.
- Contribución relativa al movimiento total.
- Participación de cada entidad sobre el movimiento absoluto.
- Concentración necesaria para explicar 80% del movimiento.
- Medición de compensación entre crecimientos y caídas.
- Integración en `Análisis → Evolución y patrones`.

## Uso de datos
Consume los valores históricos que ya existen en IndexedDB y las series que usa el módulo de Evolución. No requiere un nuevo archivo ni un nuevo formato de importación.

## Límite
"Contribuye a" no significa "causa". La causalidad seguirá viniendo de señales, drivers y evidencia adicional.
