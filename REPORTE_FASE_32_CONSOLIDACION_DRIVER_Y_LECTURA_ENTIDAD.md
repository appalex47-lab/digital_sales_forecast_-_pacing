# Fase 32 — Consolidación DRIVER + Lectura de Entidad

## Objetivo
Partir del baseline funcional de Fase 31 y aplicar los cambios conceptuales acordados sin tocar el pipeline de carga de datos.

## Cambios

### 1. Contribución y origen deja de ser módulo visible
- Se elimina la tabla/panel visible `Contribución y origen` de Análisis.
- `contributionEngine.js` permanece cargado y disponible como capacidad interna.
- La contribución puede seguir alimentando reconciliación, narrativa y asistente.
- No se elimina el cálculo matemático; se elimina la duplicación visual.

### 2. DRIVER queda consolidado
El mapa de análisis muestra:
- DRIVER → Mix Intelligence

Mix responde a composición, participación y cambio de participación.
Contribución permanece como capacidad matemática interna, no como pantalla independiente.

### 3. Lectura de Entidad
La gráfica mantiene y refuerza:
- X = fecha / período
- Y = crecimiento %
- eje vertical visible
- eje horizontal visible
- ticks de ejes
- línea cero
- etiquetas de máximos, cero y mínimos
- etiquetas de períodos

### 4. Flujo de navegación
Las recomendaciones de Lectura de Entidad ya no envían al usuario a un módulo de Contribución inexistente; dirigen a Prioridades de acción cuando corresponde.

## Preservación
No se modificó:
- carga del CSV
- IndexedDB
- construcción de `an.rows`
- prioridades
- Mix
- Cohortes
- Forecast seguro del baseline
- cálculo interno de contribución

## Pruebas
- Consolidación Fase 32: 12/12 PASS
- Sintaxis JavaScript: 152/152 PASS
