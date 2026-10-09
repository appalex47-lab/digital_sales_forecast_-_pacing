# Corrección 12 — Temporalidad global, período focal y comparaciones

## Objetivo

Separar el **período focal que el usuario quiere leer** del histórico disponible y convertir la temporalidad en una capa reutilizable para Evolución, Patrones, Mix, Contribución, Riesgos, Forecast y Cohortes.

## Cambios implementados

### 1. Nuevo motor temporal

Se agregó `js/analytics/temporalEngine.js`.

Responsabilidades:

- definir rangos de año, mes, semana ISO y día;
- detectar si un período es completo o parcial;
- mantener la misma duración cuando se compara un período parcial;
- generar períodos disponibles;
- generar comparaciones equivalentes;
- calcular variaciones porcentuales sin inferir causalidad.

### 2. Período focal real

En Evolución ahora existe:

- Granularidad: Año / Mes / Semana / Día.
- Período focal.
- Historia utilizada.
- Comparación principal.

El período focal sí mueve el punto final del análisis; no es solo una etiqueta visual.

### 3. Regla de período completo

Con el dataset actual:

- última fecha disponible: `2026-10-04`;
- septiembre 2026: completo;
- octubre 2026: parcial.

Por defecto se utiliza **septiembre 2026**, porque es el último mes completo.

Si el usuario selecciona octubre, se muestra explícitamente como:

> Octubre 2026 · parcial · hasta 2026-10-04

### 4. Año acumulado

Si se selecciona `2026` y el año todavía no está completo, el sistema utiliza el acumulado disponible y no lo presenta como un año completo.

Ejemplo actual:

> 2026 · acumulado disponible hasta 2026-10-04

Las comparaciones equivalentes conservan el mismo corte temporal cuando corresponde.

### 5. Comparaciones automáticas

Se incorporó la capa de comparaciones:

- YoY — año contra año;
- MoM — mes contra mes;
- WoW — semana contra semana;
- DoD — día contra día.

No todas se muestran para todas las granularidades: se presentan las que tienen sentido para el período focal seleccionado.

### 6. Períodos parciales

Ejemplo:

`1–4 octubre 2026` contra `1–4 septiembre 2026`.

No se compara un parcial contra un mes completo.

Para un año acumulado también se conserva el corte equivalente:

`1 enero–4 octubre 2026` contra `1 enero–4 octubre 2025`.

### 7. Estacionalidad

Para el análisis mensual se calcula una primera señal determinística utilizando períodos históricos comparables del mismo mes.

Se informa:

- cantidad de períodos comparables;
- promedio histórico;
- índice respecto al promedio;
- insuficiencia de histórico cuando todavía no hay base suficiente.

No se presenta estacionalidad como causalidad ni como certeza predictiva.

### 8. Actualización con nuevos meses

El análisis sigue leyendo el histórico desde IndexedDB. Al incorporar nuevos meses, los períodos disponibles y las comparaciones se recalculan.

No se requiere configurar manualmente cada nuevo mes.

## UX/UI

Se añadió una capa compacta de contexto temporal en la primera vista del análisis:

- período focal visible;
- selector de período;
- estado completo/parcial;
- chips YoY/MoM/WoW/DoD cuando corresponden;
- estado de estacionalidad;
- explicación breve de cómo se está usando el histórico.

La tabla principal mantiene paginación y seis entidades visibles por página.

## Pruebas

### Motor completo

**224/224 pruebas correctas.**

### Regresión existente

`test-patterns-correction-3.js`:

**PASS — Corrección 3 — conteos completos y tabla limitada a 12**

### Sintaxis

Todos los archivos JavaScript pasan `node --check`.

### Pruebas temporales

Verificadas:

- septiembre 2026 se identifica como completo;
- octubre 2026 se identifica como parcial;
- MoM de un parcial conserva la misma cantidad de días;
- WoW de día usa siete días hacia atrás;
- DoD usa el día anterior;
- YoY de un año acumulado conserva el corte equivalente;
- el último período completo por defecto es septiembre 2026.

### Contrato UX/UI

Verificado:

- motor temporal incluido en `index.html`;
- selector `an-focus` presente;
- handler `an-focus` presente;
- resumen temporal presente;
- etiquetas de parcial presentes;
- estilos de resumen temporal presentes.

## Limitaciones conocidas

El dataset actual solo contiene 2026, por lo que YoY real no puede demostrarse con datos observados de 2025 todavía. El motor sí queda preparado para utilizarlo automáticamente cuando se incorpore 2025.

La estacionalidad gana confiabilidad a medida que aumenta el número de años históricos disponibles.

## Resultado

La temporalidad queda preparada para trabajar de forma incremental: cargar más meses o años amplía automáticamente la base de comparación, estacionalidad y patrones sin convertir períodos parciales en períodos completos.
