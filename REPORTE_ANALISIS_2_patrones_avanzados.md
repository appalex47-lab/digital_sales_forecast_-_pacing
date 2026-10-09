# REPORTE ANÁLISIS 2 — Detección avanzada de patrones

## Estado
Implementado y validado.

## Objetivo
Construir una segunda capa sobre el Motor de Evolución para priorizar comportamientos relevantes sin afirmar causalidad.

## Nuevo motor
- `js/analytics/patternEngine.js`
- Consume resultados de `FP.trendEngine`.
- No duplica el cálculo de series ni modifica IndexedDB.

## Capacidades
- familia de patrón: growth, decline, recovery, volatile, break, anomaly, stable;
- deterioro estructural;
- crecimiento estructural;
- alerta temprana;
- ruptura de tendencia;
- recuperación;
- anomalía;
- cambios de régimen;
- persistencia;
- severidad relativa: low/medium/high/critical;
- score de priorización 0–100;
- agrupación de entidades con el mismo patrón/señal.

## Integración UX
La sección `Análisis → Evolución y patrones` ahora incluye `Patrones avanzados`, con indicadores de señales, deterioros estructurales, alertas tempranas y rupturas, además de una tabla priorizada.

## Principio de evidencia
El score no es una probabilidad, no representa causalidad y no sustituye el diagnóstico. Se construye únicamente con magnitud acumulada, persistencia y aceleración.

## Pruebas
Se agregaron pruebas al `self-test.js` para: deterioro estructural, crecimiento estructural, ruptura, recuperación, agrupación y rango del score.

## No incluido
- Share & Mix avanzado.
- Contribución/origen avanzado.
- Cohortes.
- Forecast específico de tendencias.
- Narrativa IA.

## Resultado
RevNavigator ahora puede pasar de `cayó/creció` a una lectura de patrón y prioridad: qué tipo de comportamiento presenta, qué tan persistente es, si parece estructural y qué entidades comparten el mismo comportamiento.
