# FASE 21 — PROYECCIÓN / FORECAST

## Objetivo
Integrar Forecast como la capa de PROYECCIÓN de la arquitectura de análisis sin sustituir HECHO, DRIVER, SEÑAL, HIPÓTESIS ni las lógicas históricas de patrones.

## Regla conceptual
Forecast responde: **¿Qué puede pasar después si la trayectoria histórica continúa bajo el método elegido?**

No establece causalidad, no garantiza el futuro y no sustituye la investigación diagnóstica.

## Corrección adicional de patrones
Durante la fase se detectó que `startPeriod` podía representar el primer movimiento significativo de toda la historia, aunque el patrón clasificado correspondiera a una racha posterior.

Se añadieron:
- `patternStartPeriod`: inicio de la racha/patrón actual.
- `patternEndPeriod`: final observado de la racha actual.
- `patternDurationPeriods`: duración de la racha actual.

Se conserva `startPeriod` por compatibilidad, pero la UI ahora muestra **Inicio del patrón actual** y **Duración del patrón**.

Esto permite responder correctamente preguntas como:
- ¿Desde cuándo está cayendo?
- ¿Cuántos períodos lleva cayendo?
- ¿Desde cuándo se está recuperando?
- ¿Cuánto lleva acelerándose/desacelerándose?

## Forecast
Se conserva y valida:
- tendencia lineal;
- promedio reciente;
- combinado/ensemble;
- horizonte configurable;
- confianza descriptiva;
- backtest cronológico;
- variabilidad histórica como rango bajo/alto, sin presentarlo como intervalo estadístico de confianza;
- granularidad año/mes/semana/día.

Al cambiar el horizonte se conserva la granularidad temporal seleccionada.

Forecast también conserva el contexto de patrón actual:
- patrón;
- inicio;
- fin;
- duración.

## Validación con CSV real
Archivo: `Venta Productos 2026.csv`.

- 85,973+ registros.
- Se encontró una entidad con 10 períodos mensuales históricos: `MOUNJARO KWIKPEN MULTIDOSIS 5MG/0.6ML SOL INY PLUMA PRECARGADA C/1`.
- Forecast de 3 meses disponible.
- Backtest disponible.
- Períodos proyectados: 2026-11, 2026-12, 2027-01.
- El forecast conserva correctamente el contexto del patrón.

## Pruebas
- Forecast/patrones: 13/13 PASS.
- CSV real + forecast: 7/7 PASS.
- Diagnóstico/regresión de patrones: 15/15 PASS.
- Arquitectura de análisis: 12/12 PASS.
- Prioridades: 7/7 PASS.
- Prioridades con CSV real: 6/6 PASS.
- UX/UI Prioridades: 12/12 PASS.
- Regresión de patrones: PASS.
- Sintaxis completa de JS: PASS.

La validación visual completa mediante Chromium headless no se declara ejecutada por la limitación conocida del entorno.

## Criterios de aceptación
- Forecast está claramente marcado como PROYECCIÓN.
- No se presenta como causalidad.
- Respeta la granularidad temporal seleccionada.
- Conserva las lógicas históricas de patrones.
- Inicio y duración representan el patrón actual.
- Tiene validación histórica mediante backtest cuando hay historia suficiente.
- Funciona con el CSV real.
