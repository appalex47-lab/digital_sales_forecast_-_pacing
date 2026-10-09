# Reporte — Fase 9.x · Calidad de datos: huecos por canal (sexta tanda de revisiones)

## Estado
```
IMPLEMENTADA:        SÍ (A banner con la causa, B mensaje de problemas coherente, C Total sin colecciones vacías, D fechas faltantes por canal). E queda pendiente de tu decisión.
TESTS OK:            SÍ (batería T1–T10, batch_h/i/j/k/l/m, a11y_audit, responsive_scan, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "Pendiente de tu validación" y "No verificado")
REGRESIÓN OK:        SÍ contra la base entregada, mismo día: 7 exports idénticos; el único cambio en Calidad con el estado de prueba es la celda Total de «Canales sin datos» (8 → 0)
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md «Calidad de datos · huecos por canal», ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación
```
Las pruebas se corrieron sobre una copia idéntica al código entregado; después de esa copia solo se editaron los `.md`.

## Procedencia (importante)
Al empezar, la copia de trabajo ya contenía las correcciones A–D en `quality-view.js` y dos scripts nuevos (`batch_m.py`, `quality_gaps_state.py`), con fechas de las 22:04 y 22:05, antes de que yo ejecutara nada en esta tanda. **No los había verificado.** Los revisé (diff completo) y los volví a probar; además corregí un defecto del generador de datos de prueba (usaba `hash()` de Python, distinto en cada ejecución; ahora usa `zlib.crc32`).

## Por qué marcaba advertencia (causa confirmada con tu caso replicado)
Replicado por la vía real (archivos CSV en «Carga de datos»): histórico 2024-01-01 → 2025-12-31 con App desde 2024-02-29 y un día sin WhatsApp ni Llamadas (**2,863 filas, 60 fechas con algún canal faltante**); venta real 2026-01-01 → 2026-09-28 con Llamadas sin fila del 10 al 14 de marzo (**1,079 filas, 5 fechas**); todas las celdas válidas = 3,942 filas, igual que tu captura.

En la **versión anterior**, con ese caso: el estado era «Datos con advertencias» en Histórico, Venta real y Total; el **banner quedaba con el texto vacío**; «Problemas por tipo» decía «No hay errores ni advertencias registrados»; y el Total de «Canales sin datos» marcaba **8** (los 4 canales de Plan/Meta + los 4 de Segmentos, sin cargar). La regla del código: si en algún día al menos un canal no tiene fila, el estado pasa a «advertencias».

## Qué cambió
| | Antes | Ahora |
|---|---|---|
| **A** Banner | Vacío | «Histórico: 60 fechas con algún canal faltante (App 59 días, WhatsApp 1 día, Llamadas 1 día). Venta real / Actual: 5 fechas con algún canal faltante (Llamadas 5 días).» |
| **B** Problemas por tipo | «No hay errores ni advertencias registrados» | «Las filas no tienen errores ni advertencias. El estado marca advertencias por huecos de cobertura…» (con datos limpios sigue igual que antes) |
| **C** Total «Canales sin datos» | 8 | 0 (solo suma colecciones con datos) |
| **D** Fechas faltantes por canal | No existía | Bloque plegable en Cobertura: canal, días que faltan y fechas en rangos (App: 2024-01-01 a 2024-02-28 (59 días); WhatsApp y Llamadas: 2024-06-15) |

Sin cambios: el estado y su regla; el resumen exportado `data_quality` (idéntico).

## E · «Información aparte»: cómo sería y qué cambia en la regla
**Hoy:** cualquier día sin fila de un canal, dentro del rango de la colección, cuenta como advertencia, sin distinguir la causa.

**Propuesta:** separar dos clases de hueco.
1. **Arranque tardío** (el canal empieza después del primer día de la colección; en tu caso App: 59 días): se muestra como **información**, en una fila aparte, por ejemplo «App empieza el 2024-02-29 (59 días antes del primer registro)». No degrada el estado.
2. **Hueco dentro de la vida del canal** (faltan días entre su primer y su último registro, o el canal deja de reportar antes del final): sigue siendo **advertencia**.

**Con tus datos (estimación, no medida):** el Histórico dejaría de sumar los 59 días de App y quedarían solo los huecos reales de WhatsApp y Llamadas (1 o 2 fechas según coincidan); la Venta real sigue con sus 5 días de Llamadas. El estado seguiría en «Datos con advertencias», pero con cifras que señalan lo que sí hay que revisar. Si no hubiera huecos reales, pasaría a «Datos listos» con la nota informativa.

**Qué cambia en la regla de negocio:**
- La definición de «Fechas con algún canal faltante» excluye los arranques tardíos, y con ella el estado.
- Aparece un contador nuevo (canales que empiezan después) como información.
- El export `data_quality` cambia (campo nuevo y valor distinto de `datesWithMissingChannels`): hay que versionarlo porque lo consumirá el paquete de la Fase 10.
- La cobertura por canal (App 91.9 %) puede quedarse como está o calcularse desde que el canal empezó: decisión tuya.

**Riesgo:** una regla automática no distingue «App empezó después» de «a mi archivo le faltan los primeros 59 días por error»; podría callar una omisión real.

**Opciones:**
- (i) **Automática:** simple, con ese riesgo.
- (ii) **Fecha de inicio declarada por canal** (en Configuración/Negocio): los huecos antes de esa fecha son información y un archivo que empieza después de lo declarado sigue siendo advertencia. Es más correcta y requiere un ajuste nuevo.
- (iii) **Dejarlo como está:** A–D ya explican la causa y muestran las fechas.

**Mi recomendación:** (iii) por ahora; si confirmas que App empezó el 2024-02-29, pasar a (ii).

## Pruebas
| Prueba | Resultado |
|---|---|
| `batch_m.py` (réplica fiel: 3,942 filas, 60 y 5 fechas; A, B, C, D; bloque por colección; colección sin datos sin bloque) | ✔ en la versión nueva; **falla A, B, C y D en la versión anterior** |
| Motor `FP.selfTest.run()` | ✔ 205/205 |
| T1–T10 batería (17 vistas), exports (7) | ✔ idénticos (con `--allow-text/--allow-tables calidad`: solo cambia la celda Total 8 → 0) |
| Producto, Recovery Center, Medir, Narrativa con datos | ✔ |
| `batch_h/i/j/k/l`, `tables_fit.py` (216 tablas), `lint_design.py`, `contrast.py` | ✔ |
| `a11y_audit.py`: 0 combinaciones bajo AA, 0 controles sin foco (2,884), 0 objetivos táctiles < 44 px | ✔ |
| `responsive_scan.py` (16 vistas × 12 anchos) | ✔ 0 hallazgos |
| Calidad con el caso replicado y el bloque abierto, a 320, 390, 768, 1100, 1280 y 1920 px | ✔ sin desborde de la página; a 320 px la tabla del bloque se desplaza por dentro (permitido en móvil) |

## Pendiente de tu validación
1. **E:** ¿(i), (ii) o (iii)? ¿Y calculo la cobertura por canal desde que el canal empezó?
2. **Tus huecos:** ¿los 59 días de App y los 5 de Llamadas son esperados? ¿App empezó el 2024-02-29?
3. **Revisión visual** de Calidad de datos en `capturas/calidad_*`.
4. **App 1:** ¿de dónde sacarías tráfico y conversión por dimensión, qué dimensiones importan más, y prefieres una app aparte o que RevNavigator reciba el archivo?
5. **Fase 10:** ¿empezamos por el paquete de análisis? (incluirá el estado de calidad en el índice)
6. **Roadmap:** ¿lo pongo al día? Hoy son 7 exports, App 1 no existe y el modo Ejecutivo ya no existe.
7. **Fase 12 (PowerPoint):** ¿quién recibe la presentación, cada cuánto, y tienes plantilla corporativa?
8. **Etapa 9.x abierta:** dime qué falta por revisar o qué no te convence de G, H, I final, J y las revisiones de uso.
9. **Inicio:** ¿«4 primeros pasos» = histórico, venta real, meta y plan? ¿«Recorrido del sistema» marca «Monitorear» «Hecho» con solo plan? ¿Mismo criterio para Pacing y Reforecast con plan y sin venta real? ¿La vista Plan sigue pidiendo el histórico? ¿Con solo la meta, Inicio muestra la meta anual? ¿Basta la nota del histórico o quieres «continuar sin histórico»?
10. **Prueba de volumen que te falló (pausa 1,090 ms):** córrela de nuevo con la pestaña a la vista y sin tocar nada, y pásame el número. No apliqué el ajuste de la prueba ni el aviso.
11. **CR de App** (real 3.6 veces el del plan): compáralo con tu histórico 2025; los 59 días sin App pueden afectar esa comparación.
12. **Decisiones de diseño abiertas:** píldora del año en móvil (44 px), barra de contexto en Aprendiz (+16 px), miga final repetida.
13. **Modo Ejecutivo:** ya no existe; hay que definir cómo se arma la vista del PowerPoint.

## No verificado
- **Tus archivos reales:** no los he visto. La réplica reproduce tus cifras (2,863 + 1,079, 60 y 5) pero con datos sintéticos; que en tu caso WhatsApp y Llamadas fallen el mismo día lo supuse (60 = 59 + 1).
- **Estimación de E:** el efecto sobre tus datos es una estimación, no una medición; E no está implementada.
- **Datos ajenos al caso:** casos como un canal que deja de reportar antes del final, o muchos rangos (más de 20), los cubre el código pero no los probé con archivos.
- **Lectores de pantalla y dispositivos:** no probé NVDA, VoiceOver ni TalkBack, ni un dispositivo táctil real. Firefox y Safari tampoco.
- **Con histórico real:** el modo «solo plan» de Inicio lo probé con un plan sin histórico; con histórico, y con un plan importado, no.
- **Segmentos:** no probé la carga con un archivo real.
- **Coherencia visual:** no hice una pasada de las 17 vistas a los tres anchos. Un icono táctil del Plan lo inferí por posición.
- **Roadmap, App 1, Fase 10 y librería de PowerPoint:** sin hacer, sin probar o sin elegir.
- **Prueba de volumen:** en mi entorno pasa; solo tú la corriste en un navegador real, y falló.

**No cierro la fase automáticamente. Espero tu confirmación.**
