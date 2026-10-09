# Reporte — Fase 9.x · Revisiones de uso, segunda tanda (Configuración y menú)

Complementa `REPORTE_FASE_9x_H.md` y `REPORTE_FASE_9x_H_revisiones.md`.

## Estado
```
IMPLEMENTADA:        SÍ (Configuración de RevNavigator con controles reales + menú de una sola sección abierta)
TESTS OK:            SÍ (batería T1–T10, batch_h, batch_i, spacing, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "No verificado")
REGRESIÓN OK:        SÍ contra la puerta anterior, con excepciones declaradas (ver "Comparaciones relajadas")
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md «segunda tanda», ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación; después empieza I-final
```
La puerta final se corrió sobre una copia idéntica al código entregado; después de esa copia solo se editaron los `.md`.

## Qué cambió
**Configuración de RevNavigator** reúne lo que se configura una vez, con las mismas acciones de siempre y sin lógica nueva:
| Qué | Antes | Ahora |
|---|---|---|
| Modo de uso | Interruptor del menú y selector de cada vista | Además, selector en Configuración (los rápidos **se conservan**) |
| API key, modelo y «recordar» de Cohere | Diagnóstico | Configuración. Diagnóstico muestra «API key configurada / Sin API key» con enlace y conserva «Generar hipótesis». Recovery Center, Narrativa y los avisos apuntan a Configuración |
| Almacenamiento (modo, migración, espacio usado, pruebas) | Categoría → Producto | Configuración. Producto enlaza a ella |
| Negocio (Business Setup) | Vista del grupo Planear | Sección al final de Configuración. `#negocio` sigue funcionando (abre Configuración en esa sección y ajusta la dirección a `#ajustes`) |
| Configuración de planeación | Planear | **Sin cambio** (decisión tuya) |

Siguen en su vista, con enlace desde Configuración (no se movieron porque no los aprobaste expresamente): opciones de lectura de archivos (Carga de datos), parámetros del forecast (Pacing) y recorrido guiado / glosario (¿Cómo funciona?).

**Menú, una sola sección abierta:** elegir una sección distinta de la actual abre su **primera página** (Planear → Carga de datos; Monitorear → Pacing & Forecast; Diagnosticar → ¿Por qué? Diagnóstico; Recuperar → Recovery & Reforecast; Medir y aprender → Seguimiento y aprendizaje) y cierra las demás. Tocar la sección actual la pliega o despliega sin cambiar de página. En Inicio, Configuración y Ayuda todas quedan cerradas. En móvil el panel se queda abierto tras elegir una sección y se cierra al elegir una página. Reemplaza el comportamiento «apilable» anterior.

## Pruebas
| Prueba | Resultado |
|---|---|
| Motor `FP.selfTest.run()` | ✔ 205/205 (una versión intermedia bajó a 204: un comentario mío se tragó el `purpose` de Negocio; corregido) |
| T1–T10 batería, 17 vistas | ✔ (Negocio ya no es vista) |
| Exports (7) | ✔ idénticos |
| Producto, Recovery Center, Medir, Narrativa con datos | ✔ |
| `batch_h.py` (etapa H) | ✔ |
| `batch_i.py` reescrito (R-1…R-5): menú con una sola sección, primera página, plegado de la actual, teclado, enlaces no enfocables en secciones cerradas, 14 páginas alcanzables, móvil; Configuración con las 4 secciones y sus controles, `#negocio`, Negocio guarda y persiste tras recargar, modo, key/modelo/recordar, Diagnóstico sin la key, Producto sin almacenamiento | ✔ |
| `spacing.py` (ahora también detecta paneles pegados) | ✔ 0 pares |
| `tables_fit.py` (216 tablas, 1100–1920 px) | ✔ |
| `lint_design.py`, `contrast.py` | ✔ |

## Comparaciones relajadas (para que sepas qué se dejó de exigir)
Para que pasaran, declaré cambios esperados: `--allow-controls ajustes,diagnostico,producto`, `--allow-tables ajustes`, `--allow-removed` en Recovery y Narrativa, `--storage-moved` en Producto. Verifiqué palabra por palabra que el texto solo cambia en Diagnóstico (sale el bloque de la key), Producto (sale el bloque de almacenamiento), Recovery y Narrativa (el aviso de la key apunta a Configuración) y Configuración (vista nueva). Carga, Resumen, Pacing, Reforecast, Medir, Plan, Configuración de planeación, Inicio y Ayuda: texto idéntico.

## Defectos míos que las pruebas o la revisión visual detectaron
- Un comentario mío se tragó el `purpose` de Negocio (motor 204/205).
- Dejé `negocio` en la lista de vistas de `app.js`: rompía Recovery.
- Las secciones de Configuración salían pegadas (0 px): lo vi en una captura; amplié `spacing.py` para paneles (sobre la versión anterior detecta 24 pares).
- Título «Almacenamiento» duplicado y casilla «Recordar la key» debajo de su texto.

## No verificado
- **API key con Cohere real:** solo probé que se guarda, que «recordar» la persiste y que Diagnóstico la reconoce; no hice una llamada a la API.
- **`FP.storageTests.run()`:** sigue sin ejecutarse (se cuelga en Chromium headless). Ejecútalo a mano desde Configuración → Almacenamiento → «Pruebas de almacenamiento».
- **Navegadores y toque real:** solo Chromium headless; Firefox, Safari y un dispositivo táctil sin probar.
- **Espacio usado** se pide una vez al abrir Configuración; con datos de prueba muestra 0 MB.
- **Entradas de ayuda** ligadas a Negocio (`guidanceConfig`) no se revisaron una por una tras la mudanza; se pierde la tarjeta «Cómo leer esta vista» de Negocio.
- Rango 1025–1099 px: tablas de 9–11 columnas aún se desplazan por dentro (límite ya declarado).

## Decisiones tomadas (revierte lo que no te sirva)
1. Se conservan los interruptores rápidos de modo (menú y encabezado) además del selector de Configuración.
2. Opciones de lectura y parámetros del forecast **no se movieron**.
3. Sin memoria del estado del menú entre sesiones.

## Pendiente
- Tu confirmación de estos cambios y de los de la tanda anterior.
- Etapas I-final (barra de contexto y responsive fino) y J.
- Fase 10 (paquete de análisis) sigue sin hacerse, por diseño.

**No cierro la fase automáticamente. Espero tu confirmación.**
