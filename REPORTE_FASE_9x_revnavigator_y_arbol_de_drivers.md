# Reporte — Fase 9.x · Renombre a RevNavigator y árbol de drivers (séptima tanda de revisiones)

## Estado
```
IMPLEMENTADA:        SÍ (renombre a RevNavigator en toda la app y corrección de los títulos del árbol de drivers)
TESTS OK:            SÍ (batería T1–T10, batch_h/i/j/k/l/m/n, a11y_audit, responsive_scan, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "Pendiente de tu validación" y "No verificado")
REGRESIÓN OK:        SÍ contra la versión anterior capturada el mismo día con el mismo arnés: 0 vistas con texto distinto, 0 exports distintos
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md y ARCHITECTURE.md; los reportes anteriores del paquete usan el nombre nuevo)
¿LISTA PARA CIERRE?  NO — espera tu confirmación
```
Las pruebas se corrieron sobre una copia idéntica al código entregado; después de esa copia solo se editaron los `.md`.

## 1. Renombre: Sales Navigator → RevNavigator
- **Texto de la app:** encabezado, título de pestaña («Vista · RevNavigator»), buscador y su etiqueta accesible, menú («Configuración de RevNavigator»), ayuda («¿Cómo funciona RevNavigator?»), avisos y pie de página. Las iniciales del marcador de usuario pasan de «SN» a «RN».
- **Exports:** salen de `config.app.name`; los 7 dicen ahora «RevNavigator» en `source.app` o `metadata.app`. Versión sin cambio (0.14.0). Los archivos exportados antes conservan el nombre antiguo.
- **Datos guardados:** intactos. El namespace de almacenamiento (`fp.v1`) y la base IndexedDB (`fp-data`) no llevan el nombre y no se tocaron (la prueba del motor de branding lo comprueba).
- **Importación:** ninguna valida el nombre de la app dentro del archivo, así que un export viejo se sigue aceptando.
- **Código, pruebas y documentos:** 72 apariciones en 23 archivos; no queda ninguna en el código.
- **Nombre de los paquetes:** `revnavigator-github-…`.

## 2. Árbol de drivers (Nivel 2): títulos partidos
- **Síntoma:** «V ol u m en», «C R», «AO V».
- **Causa:** la tarjeta compartía la clase `.tree-node` con la cadena trazable de Recovery y Medir (rejilla de 150 px + 1fr y, desde la etapa H, `overflow-wrap: anywhere`): el título caía en una columna diminuta y se partía por letra. **Lo agravé yo en la etapa H** sin revisar que otra vista compartía la clase; la batería no lo detectaba porque compara texto y no la posición de los títulos.
- **Medición en Chromium, con datos de prueba (antes → ahora):** «Volumen» 4 líneas → 1; «AOV» 2 → 1; «CR» 1 → 1; en todos los anchos de 768 a 1600 px; de 320 a 1920 px ahora 1 línea y sin desborde de la página.
- **Solución:** clase propia (`.driver-tree` / `.driver-node`): fila de resumen (título · contribución · variación) arriba y las ramas debajo, a todo el ancho; en ≤ 560 px la variación pasa a una segunda línea. La cadena trazable no cambia.

## Pruebas
| Prueba | Resultado |
|---|---|
| `batch_n.py` (nuevo): N-1 nombre en 17 vistas, etiquetas accesibles, título, pie, `config.app`, exports capturados; N-2 almacenamiento intacto e importación sin validar nombre; N-3 títulos en una línea a 8 anchos y clases separadas | ✔ en la nueva; **7 comprobaciones fallan en la versión anterior** |
| Motor `FP.selfTest.run()` | ✔ 205/205 |
| T1–T10 batería, exports (7), Producto, Recovery Center, Medir, Narrativa | ✔ (base capturada hoy con el mismo arnés) |
| `batch_h/i/j/k/l/m`, `spacing.py`, `tables_fit.py` (216 tablas), `lint_design.py`, `contrast.py` | ✔ |
| `a11y_audit.py`: 0 combinaciones bajo AA, 0 controles sin foco (2,884), 0 objetivos táctiles < 44 px | ✔ |
| `responsive_scan.py` (16 vistas × 12 anchos) | ✔ 0 hallazgos |

**Comparación relajada:** en esa regresión los comparadores de texto y de exports tratan «Sales Navigator» y «RevNavigator» como el mismo texto, para poder comparar contra la base anterior. Que los exports realmente dicen RevNavigator lo comprueba `batch_n.py`.

## Pendiente de tu validación
1. **Renombre:** ¿te sirve que los 7 exports digan «RevNavigator» (el paquete de la Fase 10 lo verá así)? ¿Las iniciales «RN»? ¿El prefijo `revnavigator-github-` para los zips?
2. **Fuera de mi alcance:** el nombre del repositorio de GitHub, la dirección de la página publicada y cualquier README del repositorio los cambias tú.
3. **Árbol de drivers:** revísalo con tus datos en tu pantalla. ¿Te gusta el orden título · contribución · variación, o prefieres otro?
4. **Estado de datos (E):** ¿(i) automática, (ii) fecha de inicio declarada por canal, o (iii) dejarlo como está? ¿La cobertura por canal se calcula desde que el canal empezó?
5. **Tus huecos:** ¿los 59 días de App y los 5 de Llamadas son esperados? ¿App empezó el 2024-02-29?
6. **App 1:** ¿de dónde sacarías tráfico y conversión por dimensión, qué dimensiones importan más, y prefieres una app aparte o que RevNavigator reciba el archivo?
7. **Fase 10:** ¿empezamos por el paquete de análisis?
8. **Roadmap:** ¿lo pongo al día? Hoy son 7 exports, App 1 no existe y el modo Ejecutivo ya no existe.
9. **Fase 12 (PowerPoint):** ¿quién recibe la presentación, cada cuánto y tienes plantilla corporativa?
10. **Etapa 9.x abierta:** dime qué falta por revisar o qué no te convence de G, H, I final, J y las revisiones de uso.
11. **Inicio:** ¿«4 primeros pasos» = histórico, venta real, meta y plan? ¿«Recorrido del sistema» marca «Monitorear» «Hecho» con solo plan? ¿Mismo criterio para Pacing y Reforecast con plan y sin venta real? ¿La vista Plan sigue pidiendo el histórico? ¿Con solo la meta, Inicio muestra la meta anual? ¿Basta la nota del histórico o quieres «continuar sin histórico»?
12. **Prueba de volumen que te falló (pausa 1,090 ms):** córrela de nuevo con la pestaña a la vista y sin tocar nada, y pásame el número. No apliqué el ajuste de la prueba ni el aviso.
13. **CR de App** (real 3.6 veces el del plan): compáralo con tu histórico 2025; los 59 días sin App pueden afectar esa comparación.
14. **Decisiones de diseño abiertas:** píldora del año en móvil (44 px), barra de contexto en Aprendiz (+16 px), miga final repetida.
15. **Modo Ejecutivo:** ya no existe; hay que definir cómo se arma la vista del PowerPoint.

## No verificado
- **Tu pantalla:** el árbol de drivers lo medí en Chromium con datos de prueba, no con los tuyos ni con tu navegador; con más ramas o textos más largos podría verse distinto.
- **Exports:** `batch_n.py` capturó al menos 4 de los 7 por sus botones; los demás toman el nombre de la misma configuración, pero no los abrí uno por uno.
- **Revisión visual:** miré a ojo el encabezado, el árbol de drivers y la ayuda con el nombre nuevo, no las 17 vistas.
- **Fuera de este código:** no sé dónde más aparece «Sales Navigator» (documentos o presentaciones tuyos).
- **Estimación de E:** el efecto sobre tus datos es una estimación y E no está implementada.
- **Datos y dispositivos:** todo con datos de prueba. No probé NVDA, VoiceOver ni TalkBack, ni un dispositivo táctil real. Firefox y Safari tampoco.
- **Con histórico real:** el modo «solo plan» de Inicio lo probé con un plan sin histórico; con histórico y con un plan importado, no.
- **Segmentos:** no probé la carga con un archivo real.
- **Coherencia visual:** no hice una pasada de las 17 vistas a los tres anchos. Un icono táctil del Plan lo inferí por posición.
- **Roadmap, App 1, Fase 10 y librería de PowerPoint:** sin hacer, sin probar o sin elegir.
- **Prueba de volumen:** en mi entorno pasa; solo tú la corriste en un navegador real, y falló.

**No cierro la fase automáticamente. Espero tu confirmación.**
