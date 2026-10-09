# Análisis 3 — Share & Mix Intelligence

## Implementado
- Nuevo `js/analytics/shareMixEngine.js`.
- Cálculo determinístico de share base/actual.
- Cambio de participación en puntos porcentuales.
- Clasificación gaining/losing/stable.
- Ranking base vs actual y cambio de posición.
- Ganadores y perdedores de participación.
- Índice HHI de concentración y nivel de concentración.
- Integración con la vista `Análisis → Evolución y patrones`.
- Cálculo a partir de las series históricas de IndexedDB existentes; no se crea almacenamiento paralelo.

## Integración
La Fase 3 consume la serie temporal construida en Fases 1–2 y añade una capa de mix. No sustituye `productAnalysis`, `trendEngine` ni `patternEngine`.

## Límites deliberados
- No determina causalidad.
- No afirma que un ganador de share haya robado demanda a un perdedor.
- No implementa todavía análisis de origen/contribución; corresponde a la siguiente fase.
- Cohortes permanece fuera del alcance hasta el final del módulo.

## Pruebas
- Share base/actual.
- Ganadores/perdedores.
- Ranking.
- HHI.
- Historia insuficiente.
- Regresión de crecimiento, caída acelerada, recuperación y volatilidad.
- Sintaxis de todos los JavaScript del proyecto.
