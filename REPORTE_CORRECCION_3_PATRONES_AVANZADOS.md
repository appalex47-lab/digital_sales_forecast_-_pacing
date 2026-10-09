# CORRECCIÓN 3 — Patrones avanzados: señales accionables y conteos completos

## Objetivo
Hacer que el panel **Patrones avanzados** sea interpretable y estadísticamente correcto.

## Hallazgos
Se detectaron dos problemas:

1. `normal` se agrupaba y mostraba como **“Sin señal avanzada”**, lo que generaba varias píldoras repetidas y ruido visual.
2. El panel hacía `slice(0, 12)` antes de calcular sus KPI. Por ello, métricas como “Señales avanzadas”, “Deterioros estructurales” y “Alertas tempranas” podían representar solamente las 12 filas visibles, no todas las entidades analizadas.

## Cambios implementados

### 1. Conteos sobre todo el universo
Los KPI ahora se calculan sobre `a.advanced` completo.

La tabla continúa mostrando las 12 señales con mayor score para mantener la interfaz manejable.

### 2. Separación entre señal y ausencia de señal
El estado `normal` ya no se presenta como una categoría de patrón avanzada en las píldoras.

Ahora el resumen comunica:
- Entidades con señal.
- Entidades sin señal.
- Concentración de señales accionables.

“Sin señal” no se interpreta como “bueno” ni “malo”; significa que no existe una señal avanzada que priorizar.

### 3. Priorización visible
Se agregó una lectura por nivel:
- Crítico
- Alto
- Medio
- Bajo

La tabla muestra las 12 entidades con mayor score y especifica cuántas señales existen en total.

### 4. Texto analítico
Se reforzó la explicación para dejar claro que:
- el motor detecta patrones;
- el score sirve para priorización;
- no representa probabilidad;
- no demuestra causalidad.

## Validación con el dataset real
Archivo: `Venta Productos 2026.csv`.

Aplicando el motor actual a 4,535 SKUs con la historia disponible:

- Entidades analizadas: **4,535**
- Entidades con señal avanzada: **380**
- Sin señal avanzada: **4,155**
- Ruptura de tendencia: **291**
- Deterioro estructural: **45**
- Anomalía: **42**
- Recuperación: **2**

Estos conteos se obtuvieron ejecutando `trendEngine` + `patternEngine` sobre el dataset real y filtrando las entidades con al menos 3 períodos válidos.

## Pruebas
- `node --check js/ui/trend-view.js`: OK
- Validación estática de los contadores: OK
- Validación de que la tabla continúa limitada a 12 filas: OK
- Ejecución del motor sobre los 4,535 SKUs del CSV: OK
- Verificación de que `normal` no se presenta como grupo de señal accionable: OK
- Regresión de Corrección 1: conservada
- Regresión de Corrección 2: conservada

## Archivos modificados
- `js/ui/trend-view.js`
- `css/design-system.css`

## No incluido
No se modifica todavía:
- lógica de cohortes;
- causalidad;
- APIs;
- narrativa con IA;
- reglas base del `trendEngine`.

## Criterio de aceptación
El usuario debe poder responder desde el panel:
1. ¿Cuántas entidades tienen una señal que requiere atención?
2. ¿Qué tipo de señal predomina?
3. ¿Qué nivel de prioridad tiene?
4. ¿Cuántas entidades simplemente no tienen una señal avanzada?
5. ¿La tabla muestra las señales más importantes sin intentar mostrar miles de filas?
