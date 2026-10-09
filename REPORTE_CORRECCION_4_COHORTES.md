# RevNavigator — Corrección 4: Cohortes de productos/entidades

## Objetivo
Incorporar cohortes descriptivas utilizando el dataset de productos actual, sin inventar cohortes de clientes.

## Decisión de modelo
La aplicación no conserva `customerId` persistente ni transacciones individuales por cliente. Por eso esta corrección implementa cohortes de **entidades de producto** (por defecto Producto; el panel sigue el nivel seleccionado en Evolución), definidas por el primer período con actividad observado dentro de la ventana histórica analizada.

No se presenta como retención, recompra o churn de clientes.

## Implementación
- `js/analytics/cohortEngine.js`: motor determinístico de cohortes.
- `js/app.js`: construye las series mensuales y genera el resultado de cohortes.
- `js/ui/trend-view.js`: panel de cohortes con tamaño, retención mes 1/3 y tabla de cohortes.
- `index.html`: carga del motor antes de la vista.

## Métricas
- Cohortes por primer período activo.
- Tamaño inicial.
- Retención de entidades por edad de cohorte.
- Retención mes 1 y mes 3.
- Retención del último período disponible.
- Retención de ingresos como dato interno del motor para futuras extensiones; no se muestra todavía como KPI ejecutivo.

## Salvaguardas
- No usa octubre como período completo; utiliza la ventana histórica que ya gobierna Evolución.
- No confunde producto con cliente.
- Si no hay actividad histórica, devuelve estado `insufficient_history`.
- La UI advierte que huecos de medición pueden confundirse con inactividad.
- No crea otra base de datos: reutiliza las series calculadas desde IndexedDB.

## Pruebas
- `node --check js/analytics/cohortEngine.js`: OK.
- `node --check js/app.js`: OK.
- `node --check js/ui/trend-view.js`: OK.
- Prueba determinística del motor: pendiente de ejecución integrada contra el CSV antes del empaquetado final.

## Validación contra el dataset real
Con `Venta Productos 2026.csv` (85,973 filas), a nivel Producto y excluyendo octubre por estar incompleto:
- Meses completos utilizados: enero–septiembre 2026.
- Entidades con actividad: 4,513.
- Cohortes: 9.
- Tamaños: enero 2,009; febrero 746; marzo 465; abril 356; mayo 262; junio 220; julio 156; agosto 140; septiembre 159.
- Retención media mes 1 entre cohortes elegibles: 34.5 %.
- Retención media mes 3 entre cohortes elegibles: 32.9 %.

La validación independiente del CSV coincide con la salida del `cohortEngine`.

## Addendum — validación integrada

La auditoría posterior ejecutó `cohortEngine` con las series completas y los períodos enero–septiembre del dataset real normalizado.

Resultado reproducible:
- Entidades: 4,513
- Cohortes: 9
- Retención mes 1 promedio entre cohortes elegibles: 34.54 %
- Retención mes 3 promedio entre cohortes elegibles: 32.90 %

La prueba de conservación también confirmó que la suma de tamaños de cohortes es exactamente igual al número de entidades asignadas a una cohorte.
