# Corrección 14 — Prioridades de acción

## Objetivo
Fusionar **Patrones Avanzados** y **Riesgos y Oportunidades** en una única capa final de decisión: **Prioridades de acción**.

La capa responde: **“Después de analizar la venta, ¿qué debo revisar primero y qué puedo impulsar?”**

## Cambios funcionales

### 1. Nueva capa `actionPriorityEngine`
Se creó `js/analytics/actionPriorityEngine.js`.

Clasifica cada entidad en:
- **🔴 Arrastra la venta**: impacto monetario negativo.
- **🟢 Compensa / hace crecer**: impacto monetario positivo.
- Seguimiento: sin impacto suficiente para entrar en los dos grupos principales.

El orden principal es por **impacto monetario absoluto**, de mayor a menor. El score se conserva como apoyo para desempatar y priorizar investigación.

El score combina:
- impacto relativo,
- persistencia,
- patrón/señal,
- cambio de participación,
- confianza.

No representa probabilidad ni causalidad.

### 2. Fusión visual
Se eliminó de la vista de análisis la presentación independiente de:
- Patrones avanzados.
- Riesgos y oportunidades.

Ahora existe un solo módulo:
- **Prioridades de acción**.

Incluye:
- arrastre total,
- compensación total,
- balance,
- ranking negativo,
- ranking positivo,
- impacto $, cambio %, persistencia, patrón, evidencia y siguiente revisión.

### 3. Lectura de Entidad
**Lectura de Entidad queda inmediatamente debajo de Evolución y Patrones.**

La selección desde Evolución o Prioridades desplaza a esta sección.

La gráfica conserva el diseño de la corrección anterior:
- X = fecha/período,
- Y = crecimiento %,
- línea 0 %,
- puntos con período y crecimiento.

### 4. Evidencia
La priorización intenta localizar el movimiento en:
- sucursal,
- canal,
- estado.

Si la causa no puede demostrarse con el dataset, se identifica como información faltante, por ejemplo:
- stock,
- precio,
- promociones,
- costos/margen.

No se afirma causalidad sin evidencia.

## Compatibilidad
Se mantiene `an.risks` como alias de compatibilidad interna para narrativa y componentes existentes, pero ya no se renderiza un módulo independiente de Riesgos y Oportunidades.

`patternEngine.js` no fue modificado.

La lógica de Evolución y Patrones no fue modificada para esta corrección.

## Pruebas

### Motor nuevo
`tools/test-action-priority-14.js`

**7/7 PASS**

Valida:
- clasificación de arrastre,
- clasificación de compensación,
- orden por impacto monetario,
- balance,
- score/persistencia,
- no causalidad.

### UX/UI
`tools/test-priorities-ux-ui-14.js`

**12/12 PASS**

Valida:
- módulo único,
- separación arrastre/compensación,
- balance,
- Lectura de Entidad debajo de Evolución,
- gráfica de crecimiento por fecha/período,
- navegación y cierre,
- motor conectado,
- responsive,
- ausencia de módulos duplicados.

### Datos reales
`tools/test-action-priority-real-14.js`

Dataset: `Venta Productos 2026.csv`.

Comparación real: **agosto 2026 → septiembre 2026**.

- Agosto: **$18,016,165.78**
- Septiembre: **$27,980,973.65**
- Cambio: **+$9,964,807.87**
- Cambio porcentual: **+55.31 %**
- Productos comparables: **2,638**

**6/6 PASS**.

El cambio agregado por entidades reconcilia con el cambio total del período.

Ejemplos reales encontrados en producto:

### Principales compensadores
1. GARDASIL 9 0.5 mL SUS INY JPRELL CAJ C/1 — **+$1,421,601.92**
2. BEYFORTUS 100MG/1ML SOL INY MB JPR CAJ C/1 — **+$1,296,680.00**
3. MOUNJARO KWIKPEN MULTIDOSIS 5MG/0.6ML SOL INY PLUMA PRECARGADA C/1 — **+$565,914.41**

### Principales arrastres
1. VIDAZA 25MG/ML FAM CAJ C/1 — **−$58,057.65**
2. ADEMPAS 2.5MG COM CAJ C/42 — **−$51,435.40**
3. NGENLA 60MG/1.2ML SOL INY PLUMA PRECARGADA C/1 — **−$41,394.48**

Estos ejemplos son evidencia del CSV y no una afirmación causal.

### Regresión/sintaxis
- `test-patterns-correction-3.js`: PASS.
- Todos los archivos JavaScript: `node --check` PASS.

## Limitación de validación visual
Se intentó ejecutar el harness completo en Chromium headless, pero el proceso volvió a quedar bloqueado y no produjo DOM antes del timeout. Por ello **no se declara una validación visual completa en navegador**. La validación UX/UI reportada es estática/estructural y responsive mediante CSS.

## Criterio de aceptación
La corrección se considera funcionalmente implementada cuando:

- existe un único módulo de Prioridades de acción;
- arrastre y compensación están separados y ordenados por impacto monetario;
- el balance reconcilia;
- Lectura de Entidad está debajo de Evolución y Patrones;
- no se altera `patternEngine` ni la lógica analítica de Evolución;
- la evidencia disponible y los datos faltantes se distinguen;
- las pruebas del motor, UX/UI y dataset real pasan.
