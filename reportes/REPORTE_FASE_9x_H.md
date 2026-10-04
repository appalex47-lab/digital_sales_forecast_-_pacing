# Reporte — Fase 9.x · Etapa H (Módulos analíticos)

## Estado
```
IMPLEMENTADA:        SÍ (etapa H: 8 vistas analíticas). Faltan G-pendiente, I-final y J.
TESTS OK:            SÍ (batería T1–T10, pruebas por lote, lint_design, contraste) — ver "No verificado"
VALIDACIÓN OK:       PARCIAL (revisión visual a 1280/768/390 de las vistas de H; no todas las combinaciones)
REGRESIÓN OK:        SÍ contra la línea base congelada de cada lote (exports, tablas, controles y texto)
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md H-1…H-9, ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación (y quedan I-final y J)
```
La puerta final se corrió sobre una copia de los archivos idéntica a la entregada (solo difiere `__pycache__`).

## Vistas migradas (capturas en `capturas/`, 1280 / 768 / 390)
| Lote | Vista | Qué cambió |
|---|---|---|
| H-1 | Pacing & Forecast | 6 métricas `.metric-card` con etiqueta de estado y banda con patrón; encabezados Plan/Actual/Forecast por estado; métodos de forecast sin destacar ninguno |
| H-2 | Reforecast | 7 métricas con estado; «Presión de recuperación» sin etiqueta ni semáforo; barras de cierre por token; escenario en magenta punteado |
| H-3 | Diagnóstico | Cadena Hecho → Driver → Señal → Hipótesis con badges de evidencia; contribuciones con signo y texto |
| H-4 | Categoría → Producto | 9 métricas `.metric-card` conservando el estado del dato; geografía como bloque propio; arquitectura intacta |
| H-5 | Recovery Center | Escenario (magenta punteado) ≠ Observado (verde) ≠ Baseline; cadena de trazabilidad con badges |
| H-6 | Seguimiento y aprendizaje | Baseline / Escenario / Observado con estado propio; lectura «consistente / no consistente» |
| H-7 | Narrativa | Hecho → Cálculo → Driver → Señal → Hipótesis → Siguiente paso con chips de cadena |
| H-8/9 | Transversal | «Aprender más» = `ds-accordion--plain` real; espera/error de IA con `.ds-loading` / `.ds-alert--danger`; correcciones CSS |

«Recovery & Reforecast» en esta app es la vista de Reforecast; «Recovery Center» es `#view-recovery` (simulador, escenarios, plan de acción, seguimiento y cadena): un solo lote cubre lo que el prompt lista como «Recovery» y «Recovery Center».

## Pruebas (línea base = proyecto antes de cada lote; determinista)
| Prueba | Resultado |
|---|---|
| T1 Motor `FP.selfTest.run()` | ✔ 205/205 |
| T2 17 vistas con datos de prueba | ✔ |
| T3 Errores de consola / pageerror | ✔ 0 |
| T4 Paridad de exports (Forecast, Reforecast, Diagnóstico, Narrativa, Plan, Recovery, **Producto**) | ✔ idénticos (sin campos de fecha/hora ni IDs de lote aleatorios) |
| T5 Persistencia IndexedDB tras recargar | ✔ |
| T6 Modos Aprendiz / Analista / Ejecutivo | ✔ |
| T7 Sin scroll horizontal a 1280 / 768 / 390 (17 vistas) | ✔ |
| T8 Navegación, un solo `aria-current` | ✔ |
| T9 Controles sin nombre accesible | ✔ sin nuevos |
| T10 Foco visible por teclado | ✔ |
| Tablas / controles / texto idénticos (o solo palabras nuevas de etiquetas de estado, ninguna eliminada) | ✔ |
| `batch_h.py`: estados únicos con texto y patrón; métricas; encabezados por estado; métodos sin destacar; «Forecast no es reforecast»; cadena Diagnóstico; acordeón (incl. móvil); estados de IA de Narrativa; chips suaves | ✔ |
| Producto con datos reales (`products_snapshot.py` + `compare_products.py`, 3 estados: raíz, drill, trazabilidad; P1–P6) | ✔ |
| Recovery Center con escenario + acción + medición (`compare_recovery.py`, R1–R13, export `action_plan_export`) | ✔ |
| Medir (`compare_medir.py`, M1–M7) | ✔ |
| Narrativa (`compare_narrativa.py`, N1–N6, export `narrative_export`) | ✔ |
| `geom.py`: barras del waterfall con geometría idéntica | ✔ |
| `lint_design.py` (hex, `style=`, `!important`, `ds-table`) sobre las vistas migradas de G y H | ✔ |
| Contraste WCAG AA de tokens (`contrast.py`) | ✔ |

## Defectos encontrados y corregidos (varios ya existían antes de esta etapa)
- «Simulado» usaba un violeta casi igual al de Reforecast; el panel del simulador perdía su borde punteado por orden de carga de CSS.
- Medir con acciones y mediciones cargadas desbordaba 52 px a 390 px (JSON sin espacios en la cadena trazable). No lo veía la batería porque recorre vistas vacías.
- `.chip--soft` dibujaba un borde de 3 px (afectaba también a «Recomendado» en Negocio, etapa G).
- El acordeón plano quedaba en 36 px de ancho a ≤ 860 px (una palabra por línea), en «Aprender más» y en las FAQ de Ayuda.
- Errores propios detectados por las pruebas y corregidos: borde del chip neutro pisado por `--neutral`; un corte mal hecho en `product-view.js` restaurado desde la base.

## No verificado
- `FP.storageTests.run()`: no se ejecutó en ningún lote (se cuelga en Chromium headless). **Ejecútalo a mano** desde Categoría → Producto → «Pruebas de almacenamiento».
- Revisión visual: no revisé las capturas de 768 px de todas las vistas de H con el mismo detalle que las de 1280 y 390; las pruebas automáticas sí cubren overflow, texto y controles a los tres anchos.
- Con los datos de prueba el diagnóstico no genera hipótesis: el escenario de las pruebas de Recovery/Medir se guarda con `FP.scenarioEngine.saveScenario` y una hipótesis de prueba (el resto, con los botones reales). No cambia la lógica de la app.
- La comparación de Cohere real (respuesta generada) no se probó contra la API; se forzaron los tres estados de la vista.

## Pendiente / requiere decisión
1. **Colores de la cadena de evidencia:** `fact/driver/signal/hyp` comparten hex con `observed/actual/reforecast/forecast`. Los separé por forma (chip rectangular vs. píldora), sin tocar tokens aprobados. ¿Se separan por token?
2. **Tarjeta «Actual» de Recovery Center** lleva la etiqueta «Observado» (venía así). ¿Prefieres «Actual» (teal) como en Pacing?
3. **Baseline** no tiene badge propio (banda gris y encabezado neutro), y en la cadena de Medir los nodos con estado repiten la palabra («Plan · Plan»). Unificarlo eliminaría palabras y rompería la paridad de texto.
4. «simulado» en minúscula en las celdas de tabla (por paridad de texto); en el resto de la app dice «Simulado».
5. Pendientes ya declarados en el reporte G: arrastrar-y-soltar/progreso de carga, separar «Configuración de RevNavigator» de «Business Setup», y las etapas I-final y J.

**No cierro la fase automáticamente. Espero tu confirmación.**
