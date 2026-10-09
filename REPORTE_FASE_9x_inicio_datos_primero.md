# Reporte — Fase 9.x · Inicio: datos primero (quinta tanda de revisiones)

## Estado
```
IMPLEMENTADA:        SÍ (orden de «Preparación de datos», estado vacío alineado, nota del histórico opcional, Inicio con plan sin venta real)
TESTS OK:            SÍ (batería T1–T10, batch_h/i/j/k/l, a11y_audit, responsive_scan, spacing, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "Pendiente de tu validación")
REGRESIÓN OK:        SÍ contra la base del mismo día (7 exports idénticos; el texto solo cambia en Inicio: 11 palabras nuevas, ninguna quitada)
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md «Inicio · datos primero», ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación
```
Las pruebas se corrieron sobre una copia idéntica al código entregado; después de esa copia solo se editaron los `.md`.

## Qué cambió
| Cambio | Detalle |
|---|---|
| Preparación de datos | Orden: 1 Histórico cargado (mejora la estacionalidad) · 2 Venta real cargada · 3 Cobertura reciente de venta real · 4 Meta anual definida · 5 Plan distribuido · 6 Sin errores de calidad. Pesos, porcentaje y semáforo idénticos (probado en las 64 combinaciones). Se conservan textos, «recomendado» y «Ir» |
| Nota del histórico | «Opcional: si tu empresa no tiene histórico, puedes continuar sin él.» en su propio renglón mientras falta; también en el «Siguiente paso» «Cargar el histórico», en el estado vacío y en el primer paso del recorrido guiado |
| Estado vacío de «¿Qué está pasando?» | La lista «Para usar esta vista necesitas» sigue el mismo orden: histórico (etiqueta «opcional» y nota) → venta real → meta → plan, con ✓ en los hechos. El botón «Ir a…» lleva al primer paso **obligatorio** que falta |
| Inicio sin venta real | Con plan y sin ni un día de venta real, Inicio ya muestra algo: 5 tarjetas del plan (meta del periodo, pedidos, volumen, CR y AOV; sin histórico las cuatro últimas muestran «—» y «Sin histórico: el plan no lo proyecta») y un mensaje de qué falta. Antes decía «el forecast proyecta cerrar 0.0 % por encima de la meta» y «el reforecast requiere 296.7 % más», sin sentido sin venta real; la frase de la barra de contexto también se corrigió |

## Pruebas
| Prueba | Resultado |
|---|---|
| Motor `FP.selfTest.run()` | ✔ 205/205 |
| T1–T10 batería (17 vistas), exports (7) | ✔ idénticos |
| Producto, Recovery Center, Medir, Narrativa con datos | ✔ |
| `batch_l.py` (nuevo): orden y notas de la preparación; 64 combinaciones de porcentaje; lista alineada del estado vacío; botón al primer obligatorio; modo «solo plan» (5 tarjetas, mensaje, barra de contexto, orden de bloques, 35 %); modo completo con venta real; requisitos de otras vistas sin cambios | ✔ (13 comprobaciones fallan sobre la versión anterior, como debe ser) |
| `batch_h/i/j/k`, `spacing.py`, `tables_fit.py` (216 tablas) | ✔ |
| `a11y_audit.py`: 0 combinaciones bajo AA, 0 controles sin foco (2,884), 0 objetivos táctiles < 44 px | ✔ |
| `responsive_scan.py` (16 vistas × 12 anchos) | ✔ 0 hallazgos |
| `lint_design.py`, `contrast.py` | ✔ |

## Defectos míos encontrados y corregidos
- La nota del histórico quedaba apretada entre la etiqueta «recomendado» y «Ir»: la vi en una captura; ahora va en su propio renglón.
- Con plan y sin venta real, la **barra de contexto** seguía diciendo «el forecast proyecta cerrar 0.0 %…»: la vi en una captura y la corregí (con prueba).
- La comparación de la batería marcó 1 palabra distinta en Configuración: era la cuota de almacenamiento que estima el navegador («0.2 GB» vs «0.3 GB»); ruido del entorno, ahora se normaliza en la comparación (como ya se hacía en Producto).

## Pendiente de tu validación
1. **Interpretación de «los 4 primeros pasos»:** entendí histórico, venta real, meta y plan (omití «cobertura reciente» porque es una condición de la venta real, no un paso). Si querías cobertura en lugar de plan, dímelo.
2. **Revisión visual** de Inicio en sus tres estados (`capturas/inicio_*`, a 1280 y 390 px).
3. **«Recorrido del sistema»** marca «Monitorear» como «Hecho» con solo plan (sin venta real), porque se calcula con «hay plan». No lo toqué porque pediste dejarlo igual. ¿Lo dejo?
4. **Pacing y Reforecast** siguen mostrando su frase de forecast con plan y sin venta real («0.0 %»). ¿Aplico el mismo criterio que a Inicio?
5. **Vista Plan** sigue pidiendo el histórico como requisito. ¿La marco opcional?
6. **Con solo la meta** (sin plan) Inicio sigue mostrando el estado vacío (con ✓ en la meta). ¿Quieres que muestre la meta anual?
7. **Sin histórico:** no agregué un botón «continuar sin histórico»; solo la nota y el enlace «Ir» de la meta. ¿Basta?
8. **Tandas anteriores sin confirmar:** menú de una sola sección, Configuración (modo, IA, almacenamiento, Negocio), píldoras del encabezado, orden de Planear, dos modos, datos primero, I final y J.
9. **Prueba de volumen que te falló (pausa 1,090 ms):** córrela de nuevo con la pestaña a la vista y sin tocar nada, y pásame el número. No apliqué el ajuste de la prueba ni el aviso.
10. **«Datos con advertencias»:** dime qué conteos aparecen en Calidad de datos. No agregué la línea con el motivo.
11. **CR de App** (real 3.6 veces el del plan): compáralo con tu histórico 2025.
12. **Decisiones abiertas:** píldora del año en móvil (44 px), barra de contexto en Aprendiz (+16 px), miga final repetida.
13. **Fase 10** (paquete de análisis): sigue sin hacerse, por diseño.

## No verificado
- **Datos reales tuyos:** todo con datos de prueba; el modo «solo plan» lo probé con un plan sin histórico y sin venta real, no con un histórico real (con histórico las tarjetas de pedidos, volumen, CR y AOV deberían mostrar cifras; no lo observé).
- **Un plan importado** (en vez de generado) en modo «solo plan»: no probado.
- **Lectores de pantalla y dispositivos:** no probé NVDA, VoiceOver ni TalkBack, ni un dispositivo táctil real; Firefox y Safari sin probar.
- **Pasada visual de coherencia** de las 17 vistas a los 3 anchos: no hecha.
- **`FP.storageTests.run()`:** yo lo reproduje en Chromium headless (pasa); solo tú lo corriste en un navegador real (✗ en volumen).

**No cierro la fase automáticamente. Espero tu confirmación.**
