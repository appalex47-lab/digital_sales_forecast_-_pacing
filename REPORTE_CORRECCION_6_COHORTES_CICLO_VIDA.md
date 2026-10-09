# Corrección 6 — Calidad e interpretación de cohortes y ciclo de vida

## Objetivo

Convertir la sección de cohortes en una lectura operativa de ciclo de vida de entidades/productos, distinguiendo nuevos, retenidos, reactivados y perdidos sin presentarlos como churn de clientes.

## Cambios

- `js/analytics/cohortEngine.js`
  - schemaVersion 2.
  - conserva cohortes por primer período activo.
  - añade clasificación del último período completo comparable:
    - `new`: primera actividad en la ventana y actividad en el último período.
    - `retained`: actividad en período anterior y último período.
    - `reactivated`: actividad actual, sin actividad previa inmediata, pero con actividad anterior en la ventana.
    - `lost`: actividad en período anterior y ausencia en el último.
    - `inactive`: no activo en el último y no recién perdido.
  - añade conteos y tasas de retención, reactivación y pérdida.
  - mantiene caveat explícito: no es retención/churn de clientes.

- `js/ui/trend-view.js`
  - renombra panel a “Cohortes y ciclo de vida”.
  - muestra KPIs de nuevos, retenidos, reactivados y perdidos.
  - agrega ayuda contextual para interpretar cada término.
  - muestra explícitamente el par de períodos comparables.

- `css/design-system.css`
  - estilos mínimos para métricas y ayuda contextual.

## Validación real

Fuente: `Venta Productos 2026.csv`.

Nivel probado: Producto.

Períodos completos: enero–septiembre 2026. Octubre parcial queda fuera.

Resultados independientes:

- entidades con actividad: 4,513
- nuevos en septiembre: 159
- retenidos septiembre vs agosto: 1,250
- reactivados en septiembre: 673
- perdidos de agosto a septiembre: 556
- activos agosto: 1,806
- activos septiembre: 2,082
- tasa de retención sobre activos de agosto: 69.21 %
- tasa de reactivación sobre activos de agosto: 37.26 %
- tasa de pérdida sobre activos de agosto: 30.79 %

Conciliación de activos septiembre:

`159 nuevos + 1,250 retenidos + 673 reactivados = 2,082 activos septiembre` → PASS.

## Decisiones semánticas

“Nuevo” significa primera actividad observada dentro de la ventana, no necesariamente lanzamiento del producto.

“Perdido” significa pérdida de actividad observada respecto del período anterior completo; no implica baja definitiva ni churn.

“Reactivado” significa regreso después de al menos un período sin actividad; no se considera nuevo.

“Retenido” significa continuidad entre los dos últimos períodos completos.

## Criterios de aceptación

- [x] No utilizar octubre parcial como período comparable.
- [x] Distinguir nuevos, retenidos, reactivados y perdidos.
- [x] Evitar confundir ciclo de vida de producto con retención de cliente.
- [x] Validar resultados contra CSV real.
- [x] Conciliar activos actuales por estado.
- [x] Mantener cohortes existentes.
- [x] Mantener compatibilidad con las correcciones anteriores.
