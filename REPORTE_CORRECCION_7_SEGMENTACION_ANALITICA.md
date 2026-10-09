# Corrección 7 — Segmentación analítica, dinero y anomalías interpretables

## Objetivo
Corregir la vista de análisis para que las señales puedan investigarse por contexto y para que el dinero y la variación sean visibles junto con los porcentajes.

## Cambios implementados

### 1. Período comparable
- Evolución ya no usa automáticamente el mes actual incompleto.
- Se toma como último período el último mes completo disponible.
- Esto evita falsas caídas/crecimientos y reduce anomalías provocadas por comparar un mes parcial contra meses completos.
- Mix ya utilizaba esta lógica; ahora Evolución queda alineada.

### 2. Anomalías interpretables
Una anomalía conserva su señal estadística, pero ahora identifica:
- subida inusual;
- caída inusual;
- movimiento inusual;
- cambio reciente en dinero;
- cambio reciente en porcentaje;
- z-score y umbral utilizado.

La interfaz explica «qué pasó» sin afirmar una causa operativa.

La detección requiere más historia previa para evitar sobre-reaccionar ante series demasiado cortas.

### 3. Filtros de análisis
Se agregaron filtros en Evolución:
- dimensión: producto, categoría, subcategoría, SKU y dimensiones disponibles;
- historia: 6/12/18/24 meses;
- patrón;
- señal avanzada;
- dirección de anomalía: todas / subida inusual / caída inusual;
- búsqueda de entidad;
- cambio reciente mínimo en $.

La paginación respeta todos los filtros.

### 4. Resumen monetario
El encabezado de Evolución ahora muestra:
- venta actual;
- venta comparable;
- cambio $;
- cambio %;
- entidades visibles;
- crecimiento vs deterioro;
- anomalías visibles;
- cantidad de patrones.

### 5. Mix Intelligence
Se reemplazó el nombre incorrecto «Sangre & Mix Inteligente» por **Mix Intelligence**.

Las tablas de mix ahora muestran:
- venta base $;
- venta actual $;
- cambio $;
- cambio %;
- share base;
- share actual;
- cambio en puntos porcentuales;
- ranking.

El contenido se limita al contexto de entidades visible cuando existen filtros.

### 6. Contribución y origen
El panel respeta las entidades filtradas y mantiene la distinción entre:
- cambio monetario;
- contribución matemática;
- participación del movimiento;
- compensación positiva/negativa.

### 7. Riesgos y oportunidades
El panel respeta el contexto filtrado y agrega cambio $ y cambio % junto al score de prioridad.

### 8. Forecast de tendencias
El forecast presentado en la vista respeta las entidades filtradas y recalcula los conteos visibles de crecimiento/deterioro.

## Qué no se hizo
- No se convirtió una anomalía en una causa.
- No se inventaron métricas que no existan en el dataset.
- No se modificó el Forecast operativo PLAN → ACTUAL.
- No se cambió la lógica de cohortes/ciclo de vida implementada en la corrección anterior.

## Pruebas
- `node --check` sobre todos los JS de la aplicación: OK.
- `test-patterns-correction-3.js`: PASS.
- CSV real: 85,973 registros, 18 columnas.
- Fecha máxima observada del CSV: 2026-10-04.
- El último período completo utilizado para análisis mensual es septiembre de 2026.

## Hallazgo importante
La prueba sobre el CSV confirmó que incluir octubre parcial producía señales excesivas. Por ejemplo, al usar octubre parcial se obtenían muchas anomalías en productos; al limitar Evolución a septiembre completo se elimina esa fuente de distorsión. Aun así existen anomalías legítimas en productos y categorías, por lo que la segmentación y el impacto monetario son necesarios en lugar de simplemente ocultarlas.
