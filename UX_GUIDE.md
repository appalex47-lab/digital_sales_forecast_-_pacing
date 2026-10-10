# UX_GUIDE.md — Cómo usar RevNavigator

La app ya calcula; esta guía explica cómo recorrerla. Todo funciona sin IA y sin backend.

## 1. El flujo

**Planea → Compara → Proyecta → Diagnostica → Simula → Actúa → Mide.**

Cadena analítica: meta → plan → actual → brecha → driver → señal → hipótesis → escenario → acción → impacto observado → aprendizaje.

## 2. Navegación

| Grupo | Para qué | Vistas |
|---|---|---|
| Inicio | ¿Qué está pasando? | Centro de control |
| Planear | Datos y meta distribuida | Carga, Calidad, Datos, Metas y motor, Estacionalidad, Plan, Configuración |
| Monitorear | ¿Cómo vamos y dónde terminaríamos? | Pacing & Forecast |
| Diagnosticar | ¿Por qué hay brecha? | ¿Por qué? Diagnóstico |
| Recuperar | ¿Qué tendría que pasar y qué podemos hacer? | Recovery & Reforecast, Recovery Center |
| Medir y aprender | ¿Qué pasó con lo que hicimos? | Medir y aprender |

Debajo del menú, la **barra de contexto** siempre dice dónde estás (migas), qué ves, qué significa, el contexto activo
(canal · periodo · comparación), avisos de calidad de datos y el **siguiente paso** con botón "Ir".

## 3. Estados: no son lo mismo

| Etiqueta | Significa |
|---|---|
| Plan | Lo que originalmente se esperaba alcanzar (congelado). |
| Actual | Lo que realmente ocurrió. |
| Forecast | Proyección de cierre con la información disponible. No es la meta. |
| Reforecast | Lo que tendría que ocurrir en los días restantes para conservar la meta. No es un pronóstico. |
| Escenario | Simulación hipotética si cambian variables. No es predicción ni garantía. |
| Observado | Resultado registrado después de una acción. |

## 4. Cómo leer un diagnóstico

1. ¿Qué tan grande es la brecha? (hecho)
2. ¿Qué variable matemática explica parte de ella? (driver: volumen, CR, AOV)
3. ¿Qué señales aparecen? (dónde ocurre; merece investigación, no demuestra causa)
4. ¿Qué hipótesis vale investigar? (posible explicación, requiere validación)
5. ¿Qué escenario puedo simular?
6. ¿Qué acción voy a medir?

## 5. Ayuda

- **?** junto a métricas y títulos: qué es, cómo se calcula, cómo leerla, qué NO significa.
- **Glosario** (desde cualquier vista, con búsqueda): venta, pedidos, volumen, CR, AOV, plan, actual, forecast,
  reforecast, gap, pacing, driver, señal, hipótesis, escenario, acción, impacto esperado, impacto observado, baseline,
  presión de recuperación y más.
- **Ayuda de esta sección** y **¿Cómo funciona?** para el panorama.

## 6. Recorrido guiado

Botón "Recorrido guiado": 10 pasos (meta → medición). Puedes avanzar, retroceder, salir y retomar donde lo dejaste.
El progreso es de navegación, no del negocio.

## 7. Modos

- **Analista** (default): todo el detalle.
- **Ejecutivo**: oculta métodos, parámetros, auditoría y detalle técnico, y avisa cuántos bloques ocultó. Nada se borra.

## 8. Filtros

Canal, periodo y comparación se conservan al moverte entre Inicio, Pacing, Reforecast, Diagnóstico y Recovery Center.
Si una vista no admite tu selección, se ajusta y te lo dice.

## Metas desde el histórico

Planear › Metas y motor › "Calcular metas desde el histórico": elige el año base, un crecimiento % (o una meta total
fija) y, si quieres, otra mezcla por canal. La propuesta llena el formulario; revisa y pulsa "Guardar metas".

## Categoría → Producto (Diagnosticar)

Dos archivos, porque la vista de ficha ocurre antes de elegir sucursal:

1. En Carga de datos, la tarjeta "Productos" tiene dos plantillas:
   - **Venta** (tu sistema de ventas): fecha, canal, SKU, estado, sucursal y tipo de entrega son obligatorios, más
     al menos una de venta, pedidos o unidades.
   - **Funnel** (GA4 por artículo): fecha, canal, SKU y al menos una de vistas de ficha, agregados al carrito,
     inicio de checkout o compras GA4. Sin estado, sucursal ni entrega: en el checkout es cuando se define.
   El tipo de archivo se detecta solo por sus columnas; puedes corregirlo. Revisa el mapeo, la vista previa, y el
   resumen (rechazadas, duplicados exactos, conflictos, multiplicidad). Si ya había datos de esos días, elige
   conservar lo guardado o reemplazar.
2. En Diagnosticar › Categoría → Producto elige periodo, referencia (periodo anterior o año anterior) y canal.
   "Ver por" alterna entre Categoría (categoría → subcategoría → producto → SKU) y Estado y sucursal
   (estado → sucursal); un filtro aparte deja ver solo domicilio o solo recolección. En SKU usa "Trazabilidad" para
   ver venta y funnel por separado, con su archivo y fila de origen.
3. Lee participación (cuánto pesa) y contribución (cuánto explica del cambio) por separado. Las tasas del embudo
   (vista → carrito → checkout → compra) y la cobertura de tracking (compras GA4 ÷ unidades reales) muestran en qué
   paso se pierde la conversión y si GA4 está registrando todo. Los patrones son señales, no causas.
4. Al ver por estado, sucursal o tipo de entrega, el CR y el funnel se muestran "No disponible": esas dimensiones se
   definen después de la vista de ficha, así que no hay pregunta que responder ahí, no un dato faltante.
5. "Pruebas de almacenamiento" verifica IndexedDB, la migración (incluida la de versión del esquema) y el volumen en
   tu navegador y tu dominio.

## Negocio (Business Setup)

Planear › **Negocio**. Describe qué tipo de negocio analizas y cómo funciona: identidad, modelo, qué vende, cómo
vende, cómo compra el cliente, si la geografía y el catálogo importan (y sus niveles), factores relevantes,
terminología y notas. Solo el nombre es obligatorio; lo recomendado se marca sin bloquear.

1. "Proponer desde la configuración actual" arma un borrador con lo que la app ya sabe. Revísalo.
2. "Guardar contexto del negocio". Los cambios se aplican al **recargar** ("Recargar y aplicar"): moneda de las
   cifras, nombre en el encabezado y terminología disponible para fases futuras.
3. El panel "Qué alimenta y qué no" muestra exactamente qué usa la app. **No cambia** canales, métricas, fórmula,
   forecast, diagnóstico, datos cargados, plan congelado ni exports.
4. "Exportar business_context.json" guarda un respaldo portable; "Importar" lo carga como borrador en otro equipo.
5. "Quitar contexto" vuelve a los valores por defecto al recargar; tus datos no se tocan.

## Geografía de productos (Diagnosticar › Categoría → Producto)

**Qué es:** ver cómo se comportan los productos según dónde se atendió el pedido: región, estado, ciudad, sucursal y
tipo de entrega. **Para qué:** detectar diferencias entre zonas o sucursales y dónde se concentra una caída o un
crecimiento. **Qué no significa:** una diferencia geográfica no demuestra por sí misma una causa.

- **Empezar por:** Categoría, Región, Estado, Ciudad, Sucursal o Tipo de entrega (solo aparecen los que tienen datos).
- **Ver ›** baja al siguiente nivel natural (región → estado → ciudad → sucursal → categoría…); **Desglosar por** permite
  elegir otro, p. ej. de un producto a sus ciudades. Las migas permiten volver a cualquier punto.
- **Filtros de geografía** (solo en esta vista): respetan la jerarquía; al elegir un estado solo aparecen sus ciudades y
  sucursales. "Quitar filtros de geografía" los limpia.
- **Dónde se concentra la variación:** señales del tipo "Producto X cayó 25 %; el 80 % se concentra en Jalisco". Son
  señales para investigar.
- **Calidad de la geografía:** avisos como sucursal en varios estados o estado en varias regiones; la app usa el valor
  más frecuente y lo dice.
- Faltante se ve "No disponible", no cero; un estado no reconocido se ve "Inválido". CR y funnel no aplican a niveles
  geográficos porque el funnel ocurre antes del checkout.
- La geografía no cambia metas, forecast, pacing ni diagnóstico general: vive solo en el análisis de productos.

## Aprender mientras usas la herramienta (Fase 9.1)

**Modo Aprendiz** (selector de modo, junto a Analista y Ejecutivo). Agrega, sin cambiar ningún cálculo:
- Una barra que muestra dónde estás dentro de la metodología (Meta → Plan → Real → Pacing → Forecast → Diagnóstico →
  Señales → Hipótesis → Recovery → Escenarios → Acción → Observado → Narrativa), qué pregunta responde la vista, para
  qué sirve, qué decisión ayuda a tomar y **¿qué hago ahora?** (el mismo siguiente paso de siempre).
- Lecciones breves ("Lo que acabas de aprender") cuando ocurre algo real: guardar el plan, cargar datos, ver el
  forecast, cambiar de método, ver señales, simular un escenario, medir una acción. Aparecen una vez y se cierran con
  "Entendido".

Cambiar de modo conserva filtros, contexto y resultados.

**Tres niveles de explicación:**
1. Siempre visible: el título del explicador y la descripción corta.
2. "¿Cómo funciona?": el flujo de la vista y, en el ícono "?", la ayuda completa con **¿qué es?, ¿para qué sirve?,
   ¿cómo funciona?, ¿cómo se calcula?, ¿qué significa?, ¿cuándo usarlo?, ¿qué NO significa? y ¿qué decisión ayuda a
   tomar?**, más conceptos relacionados.
3. "Aprender más": método, supuestos, un ejemplo ilustrativo y los límites.

**¿Por qué este número?** Junto a forecast, gap, cumplimiento, gap forecast, venta y recuperación requerida. Muestra
los pasos con las cifras reales del motor, confirma que suman la cifra mostrada y separa qué significa de qué no.

**Métodos de forecast.** En la comparación de métodos, cada uno explica qué usa, qué supone, cuándo diverge de los
demás y su límite. Ninguno se presenta como el mejor.

**Estados vacíos** dicen qué falta, por qué hace falta y a dónde ir.

## Preparación de datos (Inicio)

Barra y checklist junto a "Siguiente paso": qué porcentaje de lo necesario para que plan, pacing y forecast
funcionen ya está listo, con semáforo verde/ámbar/rojo. Mide preparación de datos, no el desempeño del negocio.
Sin venta real cargada, queda topado en 45 % aunque el resto esté completo. Cada requisito faltante tiene un
enlace directo a dónde resolverlo.

El recorrido guiado siempre empieza en Meta (enseña la metodología completa en orden, no tu estado actual); su
primer paso aclara que tu siguiente paso real, según tus propios datos, está en Inicio. La misma barra de
preparación viaja con el recorrido, arriba a la derecha en cada paso, y se actualiza en vivo si cargas datos o
guardas el plan sin cerrar el recorrido.

## Narrativa ejecutiva (Medir y aprender › Narrativa ejecutiva)

Convierte lo que ya calculó la app en una explicación: qué pasó, por qué importa, qué lo explica
matemáticamente, dónde investigar, qué hipótesis hay y qué sigue. No es un cálculo nuevo — cada frase cita el
mismo forecast, diagnóstico, producto y recuperación que ya viste en sus propias vistas, y trae su fuente
("¿Por qué dices eso?" debajo de cada afirmación).

Se narra el mismo canal, periodo y comparación que tengas elegidos en Diagnóstico; para cambiarlos, ve ahí.

Seis tipos de afirmación, nunca mezclados: **Hecho** y **Cálculo** se afirman tal cual; **Driver** es una
atribución matemática (no una causa); **Señal** indica dónde investigar (no demuestra nada); **Hipótesis**
siempre lleva lenguaje de posibilidad; **Siguiente paso** nunca es una promesa de resultado.

- **Modo Ejecutivo**: solo el resumen, el driver principal, la señal más relevante y el siguiente paso.
- **Modo Analista**: todo el detalle — el desglose completo de drivers, todas las señales e hipótesis, producto
  y recuperación.
- Si falta información para una sección (por ejemplo, no has cargado datos de producto), lo dice de forma
  explícita en vez de omitirla en silencio o inventar contenido.
- **Redactar con Cohere** (opcional) usa la misma API key de Diagnóstico y solo redacta en prosa lo que ya está
  calculado; se verifica que no agregue ninguna cifra nueva ni lenguaje de causa no soportado. Si Cohere falla o
  no está configurado, la narrativa de arriba sigue completa.
- **Exportar narrative_export.json**: la narrativa completa, con la fuente de cada afirmación, para llevarla a
  otro lado o para una futura fase de paquete de análisis.

### Producto y Recuperación ya no requieren visitarlos primero

Antes, si no habías entrado a Categoría → Producto o a Recovery Center en la misma sesión, esas dos secciones
de la narrativa decían "no disponible" aunque los datos existieran. Ya no: al entrar a Narrativa, si hay datos
de producto cargados, se calcula automáticamente (con el mismo canal y periodo que Diagnóstico como punto de
partida); si ya lo habías calculado antes con otro canal, periodo o nivel, se respeta tal cual — nunca se
fuerza a que coincida.

Por eso cada una de las dos trae, arriba de sus afirmaciones, un aviso compacto con su propio alcance —
por ejemplo *"Ecommerce · 2026-09-01 a 2026-09-30 · vs periodo anterior · Nivel: Categoría"* o
*"Total digital · Septiembre 2026 · Horizonte: Anual"* — para que nunca se confunda con el canal/periodo
principal de Diagnóstico que ancla el resto de la narrativa.

Si no hay señales geográficas que mostrar, el texto distingue si es porque no hay datos geográficos cargados,
o porque los hay pero el nivel que se está viendo no genera ese tipo de señal (por ejemplo, ya estás viendo
por Estado) — nunca dice "sin información" cuando sí existe, solo que no aplica en ese caso.

## "¿Qué hago aquí?" — presente en todas las vistas

Debajo del propósito de cada vista (ya existía) hay ahora una segunda línea corta: qué se hace en esa
pantalla en concreto. Aparece siempre, en los tres modos, sin ocupar más espacio del necesario — una frase,
no un párrafo.

En **modo Aprendiz**, la barra de aprendizaje profundiza: agrega "¿Qué hago aquí?" y, justo después, o "¿Qué
necesito?" con el primer pendiente real (con su botón "Ir") o, si ya tienes todo lo necesario, "¿Qué
obtengo?" con el resultado de esa vista — el mismo checklist que ya usa el semáforo de "Preparación de
datos", no uno nuevo. En **modo Analista** y **Ejecutivo** esa profundidad queda disponible bajo demanda, en
"Ayuda de esta sección".

"¿Qué hago aquí?" (qué se hace en esta pantalla), "¿Qué me falta?" (qué falta para poder continuar) y "¿Qué
hago ahora?" (el siguiente paso recomendado) son tres preguntas distintas y siguen viviendo en tres lugares
distintos — no se combinaron en una sola.

## RevNavigator

La herramienta se llama **RevNavigator**. El nombre del negocio que configuras en Negocio (Business Setup)
es independiente: RevNavigator es la plataforma; el nombre de tu negocio es la información que analizas
con ella. Cambiar de negocio en Business Setup nunca cambia el nombre de la herramienta, y viceversa.

---

## Fase 9.x — Sistema visual (avance: etapas A–E)

- `css/design-system.css` (se carga después de `styles.css`): tokens `--ds-*` (color, tipografía, espaciado, forma), puente que re-mapea los `--c-*` antiguos, shell (header oscuro + sidebar) y componentes `.ds-card`, `.ds-badge--*`, `.ds-accordion`, `.ds-alert`, `.ds-empty`, `.ds-loading`, `.ds-metric`.
- Header: logo/nombre, buscador **placeholder deshabilitado**, campana **placeholder deshabilitada**, avatar **placeholder** (sin lógica).
- Navegación: `renderNav` ahora pinta una sidebar con los mismos grupos/vistas de `GUIDANCE.GROUPS/VIEWS`; en móvil es un menú (`nav-toggle`). Interruptor «Modo Aprendiz» reutiliza la acción `ux-mode`.
- `help-view.js`: Centro de aprendizaje (recorrido guiado, 5 tutoriales, conceptos y referencia). Solo reorganiza contenido existente de `guidanceConfig`; «Recursos adicionales» queda «Próximamente».
- Sin cambios en cálculos, motores, IndexedDB ni exports. La ecuación Venta = Volumen × CR × AOV salió del header y vive en el tutorial 03.
- Pendiente: etapas F–J (Home, módulos analíticos, responsive fino, accesibilidad, tablas/formularios).
- Etapa F (Home): orden estado → siguiente paso → preparación → resumen → avance (stepper) → convenciones (acordeón secundario). Misma lógica de `home-view.js`; solo cambia el markup y el CSS. El «Siguiente paso» de la barra de contexto se oculta en Inicio porque ahora tiene su propia card.
- Regresión Fase 9.x (etapas A–F): `tools/regression/` (Playwright/Python; compara la app original contra la nueva). Resultado: 205/205 pruebas del motor, 17/17 vistas cargan sin errores de consola, exports de Forecast, Reforecast, Diagnóstico y Narrativa idénticos (salvo marcas de tiempo), modos Aprendiz/Analista/Ejecutivo y persistencia en IndexedDB iguales. `FP.storageTests.run()` se cuelga en headless también en la app original, por lo que no pudo verificarse ahí.

---

## Ajustes posteriores (Reforecast, Pacing e Inicio)

- **Reforecast · explicación del surplus** (`js/ui/reforecast-view.js`, `js/ui/guidance/explain.js`): cuando hay surplus, la nota explica por qué la recuperación requerida (suma de lo pendiente por canal) es mayor que la brecha neta (meta − actual): requerido = brecha neta + surplus. «¿Por qué este requerimiento?» muestra el mismo desglose y su verificación lo considera. Sin cambios en el motor.
- **Pacing & Forecast · versiones por canal** (`js/ui/forecast-view.js`): «Versiones del forecast» (forecast actual, versión anterior, cambio, tabla y accuracy) sigue el canal elegido en el selector del gráfico. Cada versión sigue guardándose completa (total + canales) para que el total cuadre con la suma de sus canales.
- **Inicio · orden según estado** (`js/ui/guidance/home-view.js`, `css/design-system.css`): sin plan ni forecast → Siguiente paso y Preparación de datos, Recorrido del sistema, ¿Qué está pasando?. Con datos → Recorrido del sistema, ¿Qué está pasando?, Preparación de datos y Siguiente paso.
- **Contexto sincronizado con el selector de canal** (`js/app.js`, `render`): el resumen superior y la barra «Contexto» ahora se actualizan al cambiar el canal dentro de la vista, sin tener que cambiar de página.

---

## Fase 9.x — Etapa I-base y Etapa G (avance)

- **I-base** (`css/design-system.css`, bloque «ETAPA I-base»): foco visible global con `outline` (no lo recorta un contenedor con `overflow`), tabla común `.ds-table` (los `.table` legacy comparten reglas), botones primario/secundario/terciario/destructivo/icono (`.ds-btn*`, alias `.btn*`), campo común `.ds-field` con estados focus/disabled/error/loading, estados de carga de archivo (`data-state`: empty/dragging/loading/error/ready) y origen del dato como badge con texto (`.src`, `.src--calc`, `.src--invalid`). `app.js` agrega `scope` a los `<th>` (solo atributos).
- **Contraste (tokens, no vistas):** `tools/regression/contrast.py` encontró 6 pares bajo AA. Se corrigieron los tokens `--ds-text-muted`, `--ds-actual`, `--ds-driver`, `--ds-forecast`, `--ds-hyp` y se agregó `--ds-control-border` (≥3:1) para el borde de controles.
- **G · migrado:** Carga de datos (tarjetas con `data-state` vacío/listo/error), Calidad de datos, Datos normalizados, Estacionalidad, Plan, Configuración de planeación y Negocio (grupos como cards) usan `.ds-table` y el sistema común. Metas y motor (`resumen`) hereda botones/campos/foco.
- **Pruebas:** `tools/regression/battery.py` (T1–T10 + capturas a 1280/768/390) + `compare.py` contra la línea base (tablas, controles y texto idénticos) + `lint_design.py` + `contrast.py`.
- **Pendiente / requiere decisión:** estados «arrastrando» y «cargando» de la carga de archivos (no existe arrastrar-y-soltar ni progreso; implicaría comportamiento nuevo); separar «Configuración de RevNavigator» de «Business Setup» (no hay preferencias propias de la app más allá de las que ya viven en Negocio y Configuración de planeación); encabezado `.ds-page-title` + `.ds-lede` por vista (depende de compactar la barra de contexto, Etapa I-final).

---

## Fase 9.x — Etapa H (avance)

- **H-1 · Pacing & Forecast** (`js/ui/pacing-view.js`, `js/ui/forecast-view.js`, bloque «ETAPA H» de `css/design-system.css`): las 6 métricas del total pasan de `dl.kpis` a `.metric-card` (valor, variación, referencia) con etiqueta de estado con texto — Plan, Actual, Forecast — y banda superior con patrón propio (continua / punteada). Los encabezados de columna Plan / Actual / Forecast llevan `data-state` (banda con el mismo patrón). El botón «?» de cada métrica se conserva porque la etiqueta sigue siendo un `dt`.
  - Transversal (afecta a todas las vistas): `.state-tag` usa ahora la paleta de `.ds-badge` (antes «Escenario» usaba un lila casi igual a Reforecast); las líneas y leyendas de gráfica leen los tokens de estado (antes «Actual» era el azul de acción y «Reforecast» un hex propio); «Aprender más» dejó de ser un `<details>` propio con CSS emulado y pasó al componente real `ds-accordion ds-accordion--plain` (ver H-8).
  - Comparación de métodos: ninguna fila se destaca; «en uso» se indica solo con el texto.
  - Pruebas: `tools/regression/batch_h.py` (estados únicos y con patrón, métricas, encabezados, métodos sin destacar), batería T1–T10 + `compare.py --allow-add pacing` (solo aparecen las palabras de las etiquetas de estado; ninguna se elimina), `lint_design.py` (ahora incluye `pacing-view` y `forecast-view`) y `contrast.py`.
- **H-2 · Reforecast** (`js/ui/reforecast-view.js`; `PV().card` compartido desde `pacing-view.js`): las 7 métricas del resumen, las de «Qué tendría que cambiar» y las de «Evolución del reforecast» pasan a `.metric-card` con etiqueta de estado (Plan · Actual · Forecast · Reforecast). «Presión de recuperación» queda **sin etiqueta de estado ni color**: es descriptiva. Encabezados Plan/Meta/Actual/Forecast/Reforecast con `data-state` (banda continua, punteada o doble). Las barras de cierre leen los tokens de estado; la barra de «escenario» ya no usa el violeta de reforecast (rayado magenta). Se conservan los textos «el plan nunca cambia» y «lo esperado es el forecast».
  - También en este lote: las métricas de «Versiones del forecast» (Pacing) pasan a `.metric-card` (Forecast) y todas las tablas de `pacing-view`, `forecast-view` y `reforecast-view` usan `ds-table`. Modificadores de rejilla por columnas: `metric-grid--3` y `metric-grid--4`.
  - Pruebas: `batch_h.py pacing,reforecast`; batería T1–T10 + `compare.py --allow-add pacing,reforecast` (solo palabras de etiquetas de estado); `lint_design.py` (incluye `reforecast-view`); `contrast.py`.
- **H-3 · Diagnóstico** (`js/ui/diagnostic-view.js`, `js/ui/guidance/diagnostic-guide.js`): la cadena **Hecho → Driver → Señal → Hipótesis** usa `.ds-badge--chain` + `ds-badge--{fact,driver,signal,hyp}` (chip rectangular con borde izquierdo grueso, distinto de la píldora de los estados) en la cadena de controles, en los títulos de cada sección (`stage()`) y en los pasos 1–4 de «¿Por qué estamos…?» (`why-steps__n--*`). El resultado usa `.metric-card` con la etiqueta de estado de lo que se compara (Actual/Plan/Forecast/Reforecast según la comparación). Las contribuciones siguen mostrando signo **y** texto («Contribución negativa» / «Offset positivo»). Las barras del waterfall pasan de `style="left|right…;width…"` a clase de lado + solo el ancho dinámico; su geometría es idéntica (`geom.py`).
  - Pruebas: `batch_h.py diagnostico`, `geom.py` (barras idénticas), batería T1–T10 + `compare.py --allow-add diagnostico` (solo aparecen «Actual» y «Plan»), `lint_design.py` (incluye `diagnostic-view`), `contrast.py`.
- **H-4 · Categoría → Producto** (`js/ui/product-view.js`; `PV().card` admite un 5.º parámetro `extra` para el badge de estado del dato): las 9 métricas (6 + 3 del funnel) pasan a `.metric-card` conservando su estado de dato (Disponible / Parcial / Faltante…) como badge con texto; todas las tablas, incluida la revisión previa en Carga de datos, usan `ds-table`. La **geografía y operación** queda como un bloque propio (`fieldset.geo-filters`, fondo `surface-2`, borde y radio de tokens, `min-width: 0`): antes solo tenía el borde por defecto del navegador. La arquitectura Negocio → canal → categoría → … → SKU, la ruta de migas y «Empezar por» no cambian.
  - Pruebas: nuevo `tools/regression/products_snapshot.py` + `compare_products.py` cargan los archivos de producto generados (venta y funnel, esperando el guardado real) y comparan la vista con datos en 3 estados (raíz, drill, trazabilidad): tablas idénticas, controles idénticos, texto sin palabras eliminadas, export idéntico, sin scroll horizontal a 1280/768/390, sin controles sin nombre. Sondas P1–P6 (métricas, `ds-table`, bloque de geografía con tokens, geografía solo dentro de Producto, estado de cada grupo con texto, arquitectura).
  - Se normaliza en las instantáneas el ruido no funcional: marcas de tiempo, IDs de lote aleatorios (`pbat-…`) y milisegundos de cálculo. Se verificó campo por campo que el export de Producto es idéntico salvo eso, también entre dos corridas de la misma base.
  - Cierra la laguna anotada en el reporte de la etapa G («Producto: sin botón de export en el estado de prueba»): ahora sí hay paridad de export de Producto con datos.
- **H-5 · Recovery Center** (`js/ui/recovery-center.js`, `js/ui/scenario-view.js`, `js/ui/action-plan-view.js`). En esta app «Recovery & Reforecast» es la vista de Reforecast (H-2) y «Recovery Center» es `#view-recovery`, que reúne simulador, escenarios, plan de acción, seguimiento y cadena de trazabilidad; por eso el prompt lo cubre en un solo lote.
  - **Escenario ≠ Observado ≠ Baseline.** «Simulado» pasa de `tag tag--sim` (violeta casi idéntico al de Reforecast) a `ds-badge--scenario` (magenta, borde punteado, con texto). «Observado» usa `ds-badge--observed` / `state-tag--observed` (verde continuo). Baseline es neutro (`ds-badge--baseline`, banda gris en el encabezado). Los encabezados Baseline / Escenario / Observado del seguimiento llevan `data-state` con su banda.
  - El panel del simulador (`.panel--sim`) pierde el borde punteado por el orden de carga de los CSS; se restablece con `.panel.panel--sim` (punteado, token de escenario). Cierra el estilo que solo existía en `styles.css`.
  - Brecha (6), simulador (6) y escenarios guardados (3) pasan a `.metric-card` con etiqueta de estado; se conserva el `title` de cada cifra («pasa el cursor…») con un 6.º parámetro de `PV().card`. «Presión de recuperación» sigue sin etiqueta ni semáforo. Todas las tablas usan `ds-table`; el único `style=""` que queda es el ancho dinámico de las barras.
  - **Cadena de trazabilidad:** Brecha → Driver → Señal → Hipótesis usan los badges de evidencia; Escenario e Impacto simulado, el badge de escenario; Resultado observado, el de observado; Acción, neutro. Se conservan «simulación matemática, no predicción» y «consistente / no consistente», nunca «causó».
  - Pruebas: `recovery_state.py` (lleva la vista a un estado con escenario, acción y medición usando los botones reales; el escenario se guarda con `FP.scenarioEngine.saveScenario` porque los datos de prueba no generan hipótesis), `recovery_snapshot.py` + `compare_recovery.py` (paridad de tablas, controles, texto y export `action_plan_export.json` con datos + sondas R1–R13), batería T1–T10, `lint_design.py` (incluye las 3 vistas) y `contrast.py`.
- **H-6 · Seguimiento y aprendizaje (Medir)** (`js/ui/guidance/measure-view.js`, `js/ui/action-plan-view.js`; `FP.recoveryCenter.NODE_BADGE` se comparte con la cadena de Recovery Center): la cadena trazable de 10 nodos usa un mismo lenguaje que Recovery Center — Brecha / Driver / Señal / Hipótesis con los badges de evidencia, Acción neutro, y los nodos con estado (Plan, Forecast, Escenario, Impacto simulado, Resultado observado) conservan su etiqueta de estado con texto (Escenario: magenta punteado; Observado: verde continuo). «Impacto simulado» lleva encabezado `data-state="scenario"` y el valor va acompañado del badge «simulado» (texto en minúscula para conservar la paridad de celdas). Tablas con `ds-table`. La lectura sigue siendo «consistente / no consistente» y «no establece causalidad».
  - **Desborde corregido (existía desde la Fase 7):** con acciones y mediciones cargadas el documento se desbordaba 52 px a 390 px porque el detalle del escenario (JSON sin espacios) impedía que la columna de la cadena se encogiera. `.tree-node` usa `minmax(0, 1fr)` y `overflow-wrap: anywhere`; en móvil apila etiqueta y contenido. Afecta también a la cadena de Recovery Center.
  - Pruebas: `recovery_snapshot.py <raiz> <salida> <capturas|-> medir` + `compare_medir.py` (M1–M7: 10 nodos, badges de evidencia, estados Escenario/Observado/Plan/Forecast, escenario ≠ observado ≠ reforecast, encabezado y celdas de «Impacto simulado», `ds-table` sin `style=""`, lectura sin causalidad), batería T1–T10 + `compare.py --allow-add medir` (0 palabras nuevas), `lint_design.py` (ahora también busca en `js/ui/guidance/`) y `contrast.py`.
  - Observación abierta (no cambia datos): en los nodos con estado, la etiqueta de texto y la etiqueta de estado repiten la palabra («Plan · Plan», «Forecast · Forecast»). Ya era así; unificarlo eliminaría palabras y rompería la paridad de texto, por eso queda como decisión de diseño pendiente.
- **H-7 · Narrativa ejecutiva** (`js/ui/narrative-view.js`): la jerarquía **Hecho → Cálculo → Driver → Señal → Hipótesis → Siguiente paso** deja de usar la píldora de estado (`pill--ok/na/warning`, donde Hecho, Cálculo y Siguiente paso eran el mismo verde de «correcto») y pasa a la cadena de evidencia: chip rectangular `ds-badge--chain` con `fact` / `driver` / `signal` / `hyp` para los cuatro eslabones de evidencia, y `neutral` para **Cálculo** y **Siguiente paso** (no son evidencia ni estado). Se conservan «¿Por qué dices eso?» en cada afirmación, el resumen ejecutivo, los avisos «no es causa / hipótesis requieren validación» y que la narrativa determinística no dependa de Cohere.
  - Defecto propio hallado por la prueba N4 y corregido: `.ds-badge--neutral` (borde 1 px, definido después) pisaba el borde izquierdo de 4 px del chip de cadena; `.ds-badge.ds-badge--chain.ds-badge--neutral` lo restablece. Aplica a todos los chips neutros de cadena.
  - Pruebas: `recovery_snapshot.py <raiz> <out> <caps|-> narrativa` + `compare_narrativa.py` (N1–N6 y paridad de `narrative_export.json`, tablas, controles y texto), batería T1–T10 + `compare.py --allow-add narrativa` (0 palabras nuevas), `lint_design.py` (incluye `narrative-view`) y `contrast.py`.
- **H-8 · Transversal de la etapa H** (`js/ui/guidance/help.js`, `js/ui/narrative-view.js`, `css/design-system.css`):
  - **«Aprender más» = `ds-accordion--plain` real** en el explicador de las 17 vistas (chevron, cuerpo `ds-accordion__body`, `aria` nativo de `<details>`). En H-1 solo lo había emulado con CSS sobre `.explainer__learn`; el prompt pide el componente, así que se corrigió aquí. `.explainer__learn` queda como gancho de la separación y del borde, no como estilo propio.
  - **Estados de IA de Narrativa:** espera → `<p class="ds-loading" role="status">` (mismo texto «Redactando con Cohere…»); error → `ds-alert ds-alert--danger` con `role="alert"` (antes `note--warning`, ámbar); generado → se conserva «Redacción de Cohere» validada. La narrativa determinística sigue sin depender de Cohere.
  - Pruebas: `batch_h.py` (`H-X` acordeón; `H-narr` espera / error / generado y rojo de peligro del sistema, forzando cada estado con `FP.narrativeView.render`).
- **H-9 · Cierre de la etapa H** (`css/design-system.css`, `tools/regression/batch_h.py`):
  - **Chip suave sin borde definido:** `.chip--soft` (styles.css) solo declaraba `border-style: solid`, sin ancho ni color, y el navegador dibujaba un borde de 3 px del color del texto. En Narrativa hacía que «— Hipótesis» y «— Producto» (no disponible) destacaran más que los «✓»; el mismo chip se usa en Negocio («Recomendado»), vista de la etapa G, que también queda corregida. `.chip.chip--soft` usa 1 px `--ds-border-strong`.
  - **«Forecast no es reforecast»** ya era visible como título del explicador de Reforecast en los tres modos, junto al badge violeta «Reforecast». No se añadió texto; se agregó la prueba `H-reforecast` que lo protege (título exacto + color del badge = token `--ds-reforecast`).
  - **Acordeón plano en móvil:** ver H-8 (`.ds-accordion.ds-accordion--plain > summary`); también corrige las FAQ de Ayuda a ≤ 860 px.

---

## Revisiones de uso (post-etapa H)

Siete ajustes pedidos tras revisar la etapa H con datos reales. Pruebas nuevas: `batch_i.py` (R-1 a R-5), `spacing.py` (R-6), `tables_fit.py` (R-7) y la sonda P7 de `products_snapshot.py`.

- **R-1 · «Actual» en Recovery Center** (`recovery-center.js`): la tarjeta del real lleva la etiqueta «Actual» (teal, token `--ds-actual`) como en Pacing, no «Observado». «Observado» queda reservado al resultado medido de una acción (Medir y la cadena de trazabilidad).
- **R-2 · Arrastrar y soltar en Carga de datos** (`app.js`, `import-view.js`): cada tarjeta de carga acepta soltar un CSV. La línea de estado de la propia tarjeta (`.upload-card__state`, que ya tenía estilo) muestra «arrastrando» («Suelta el archivo aquí para revisarlo») y «cargando» («Leyendo N archivos…») y luego regresa a su texto anterior. El flujo no cambia: el archivo entra a «en revisión» y nada se importa hasta confirmar. Fuera de una tarjeta el arrastre se rechaza (`dropEffect: none`) para que el navegador no abra el archivo y salga de la app. El botón «Seleccionar CSV» se conserva (es la vía con teclado) y cada tarjeta anuncia que admite arrastrar.
- **R-3 · Configuración de RevNavigator** (`settings-view.js`, `guidanceConfig.js`, `index.html`): vista especial (como «¿Cómo funciona?», fuera de los 5 grupos y siempre visible en el pie del menú) que separa tres cosas: negocio (Negocio), plan (Configuración de planeación) y herramienta. **Solo orienta**: una tabla de cinco filas con enlaces a donde vive hoy cada cosa (negocio, plan, modo de uso, API key de Cohere, almacenamiento), sin controles ni lógica nueva, y el aviso de que las preferencias de la herramienta se reunirán ahí. No se movió ningún control existente; qué preferencias viven en esa pantalla queda por definir con el usuario.
- **R-4 · Tarjeta «Cómo leer esta vista» cerrada** (`help.js`): arranca cerrada en los tres modos. Si el usuario la abre se queda abierta mientras siga en esa vista (un filtro vuelve a pintar la vista y no debe cerrársela); al cambiar de vista vuelve a estar cerrada. Las pruebas leen el texto con todos los `<details>` abiertos para no contar como «texto eliminado» lo que solo está plegado.
- **R-5 · Menú lateral con grupos plegables** (`navigation.js`, `design-system.css`): cada grupo (Planear, Monitorear, Diagnosticar, Recuperar, Medir y aprender) es un botón con `aria-expanded` y `aria-controls`; «Inicio» queda suelto. Al cambiar de vista queda abierto el grupo de la vista actual y los que el usuario abrió a mano; los demás se cierran. Se pueden tener varios abiertos. El estado vive solo en la sesión (no se guarda). Los enlaces de un grupo cerrado no reciben foco. En móvil el objetivo táctil es ≥ 44 px y el panel se desplaza por dentro.
- **R-6 · Ritmo vertical** (`design-system.css`): regla común de 16 px entre bloques (cabecera con botones, tarjetas de métricas, tablas, barras, filtros, desplegables) y 8 px entre un bloque y su nota o ayuda. Antes, al migrar `dl.kpis` a `.metric-grid`, se perdió el margen que tenía y varios botones, notas y tablas quedaban a 0–4 px. `spacing.py` falla si algún bloque queda a menos de 8 px de su vecino en las 17 vistas a 3 anchos (excluye cabecera de panel → cuerpo, que es intencional).
- **R-7 · Tablas sin scroll horizontal en escritorio** (`design-system.css`, `product-view.js`): (1) el contenido usa el ancho disponible en pantallas grandes (tope 1160 → 1400 px; a 1920 sobraba espacio a la derecha), (2) menos relleno horizontal en escritorio, (3) los encabezados pueden partirse en dos líneas, (4) los textos secundarios largos y los controles de las celdas se ajustan; los números no se parten. Categoría → Producto (13 columnas) usa `table--dense` (12 px, relleno 5 px, el chip «calc.» pasa debajo del valor). En móvil y tableta se mantiene el scroll interno. `tables_fit.py` mide las tablas a 1100 / 1200 / 1280 / 1440 / 1536 / 1920 px y la sonda P7 mide Producto en sus tres estados. **Límite conocido:** entre 1025 y 1099 px (contenido de ~740–810 px junto al menú fijo) las tablas de 9–11 columnas todavía se desplazan por dentro (a 1025 px: 5 tablas, la peor por 68 px); ahí no hay ancho suficiente sin quitar columnas, y se prefirió conservar todos los datos. Antes de este cambio a 1280 px se desbordaban 20 de las tablas medidas, la peor por 906 px (plan de acción de Recovery Center).

---

## Revisiones de uso · segunda tanda (Configuración y menú)

- **R-3b · Configuración de RevNavigator con controles reales** (`settings-view.js`, `product-view.js`, `diagnostic-view.js`, `index.html`, `app.js`, `guidanceConfig.js`): la pantalla que solo orientaba ahora **reúne** lo que se configura una vez y vale para toda la app. Se mudaron con las mismas acciones (`ux-mode`, `dx-key`, `dx-remember`, `dx-model`, `storage-tests`, `storage-retry`, `bc-*`) y sin lógica nueva:
  - **Modo de uso:** selector Aprendiz / Analista / Ejecutivo. Los interruptores rápidos del menú y del encabezado de cada vista se **conservan** (mudarlos habría quitado el cambio rápido de modo mientras se aprende).
  - **Análisis con IA (Cohere):** API key, modelo y «recordar en este navegador» salen de Diagnóstico. Diagnóstico muestra «API key configurada / Sin API key» con enlace a Configuración y conserva su botón «Generar hipótesis»; Recovery Center, Narrativa y los avisos de la app apuntan a Configuración. `dx-ai` solo lee el campo de la key si está a la vista (si no, manda el estado), para no pisarlo con un campo oculto.
  - **Almacenamiento:** modo, migración, espacio usado y «Pruebas de almacenamiento» salen de Categoría → Producto (que enlaza a Configuración). El espacio usado se pide una vez al abrir Configuración (`ensureStorageEstimate`).
  - **Negocio (Business Setup):** deja de ser una página del menú y una vista aparte; sus contenedores (`bc-status`, `bc-form`, `bc-actions`) viven ahora al final de Configuración. El enlace `#negocio` sigue funcionando: abre Configuración, ajusta la dirección a `#ajustes` y lleva a la sección Negocio. Planear queda con 7 páginas.
  - **Configuración de planeación NO se movió** (decisión del usuario): sigue en Planear porque afecta al plan, no a la herramienta.
  - **Siguen en su vista, con enlace desde Configuración:** opciones de lectura de archivos (Carga de datos), parámetros del forecast (Pacing) y recorrido guiado / glosario (¿Cómo funciona?). No se movieron porque no se aprobaron expresamente.
  - Se pierde la tarjeta «Cómo leer esta vista» de Negocio (`EXPLAINERS.negocio`): la pantalla de Configuración no tiene tarjeta propia.
- **R-5b · Menú: una sola sección abierta** (`navigation.js`): elegir una sección **distinta** de la actual abre su **primera página** (Planear → Carga de datos; Monitorear → Pacing & Forecast; Diagnosticar → ¿Por qué? Diagnóstico; Recuperar → Recovery & Reforecast; Medir y aprender → Seguimiento y aprendizaje) y cierra las demás; queda desplegada solo la sección de la página actual (en Inicio, Configuración y Ayuda, ninguna). Tocar la sección en la que ya estás la pliega o despliega sin cambiar de página. Reemplaza el comportamiento «apilable» de R-5 (ya no se pueden dejar varias abiertas). En móvil el panel se queda abierto tras elegir una sección para ver sus opciones, y se cierra al elegir una página.
- Pruebas: `batch_i.py` reescrito para R-3 y R-5 (menú una sola sección, primera página, plegado de la actual, teclado, móvil; Configuración con modo, IA, almacenamiento y Negocio, alias `#negocio`, guardado de Negocio que persiste al recargar, key/modelo/recordar, Diagnóstico sin la key, Producto sin almacenamiento). `compare.py --allow-controls`, `compare_products.py --storage-moved`, `--allow-removed` en los comparadores de Recovery y Narrativa.

---

## Revisiones de uso · tercera tanda (estado en el encabezado y orden de Planear)

- **R-8 · Estado de la herramienta: píldoras arriba, ficha completa solo en Configuración** (`index.html`, `ui.js`, `settings-view.js`, `app.js`, `design-system.css`): la ficha de cinco cifras (año, meta anual, canales, estado de datos, estado del motor) ya no aparece en todas las vistas. Vive únicamente en Configuración de RevNavigator, en la sección «Estado de la herramienta». En el encabezado, entre el buscador y las notificaciones, quedan tres píldoras:
  - **Año:** selector con nombre accesible «Año seleccionado». **Sí cambia el año desde ahí** (misma acción `set-year`); el selector de la ficha de Configuración y el del encabezado quedan sincronizados.
  - **Estado de datos** («Datos con advertencias», «Sin datos», «Datos listos», «Datos no válidos») y **Estado del motor** («Motor: Operativo», «Motor: Con fallas», «Motor: Sin ejecutar»): enlaces a `#ajustes` con `data-section="estado"`. Cada una lleva texto además de color (las mismas clases `pill--*` que el detalle) y un nombre accesible que dice a dónde lleva. Si ya se está en Configuración, el clic vuelve a pintar la vista para bajar a la sección aunque la dirección no cambie.
  - **Meta anual y Canales configurados** ya no aparecen en el encabezado: solo en la ficha de Configuración.
  - Layout: la cuadrícula del encabezado pasa a marca · buscador · estado · notificaciones. Debajo de 1180 px se oculta la etiqueta de fase y debajo de 1024 px el buscador (es un marcador deshabilitado). Con el menú en cajón (≤ 860 px) las píldoras van en una segunda fila del encabezado y `--ds-header-h` sube a 90 px para que el cajón empiece bajo el encabezado; en ≤ 340 px pasan a dos filas (120 px). Objetivo de toque ≥ 26 px; foco visible con contorno claro sobre el fondo oscuro. Colores por token (`--ds-on-nav`).
  - El estado del motor y de los datos siguen calculándose igual; solo cambió dónde se muestran. La prueba de persistencia de la batería lee la ficha desde Configuración.
- **R-9 · Orden de Planear:** Carga de datos → Calidad de datos → Metas y motor → Plan → Estacionalidad → Datos normalizados → Configuración de planeación (antes: Carga, Calidad, Datos normalizados, Metas y motor, Estacionalidad, Plan, Configuración). La primera página de la sección sigue siendo Carga de datos, así que elegir Planear en el menú abre lo mismo.
- Pruebas: `batch_i.py` (R-8: orden y posición del encabezado, tres píldoras con texto y color, enlaces con nombre accesible y objetivo ≥ 24 px, ficha ausente del encabezado y de las demás vistas, píldoras coherentes con el detalle, clic → sección «Estado», año sincronizado en ambos sentidos, foco con Tab, 6 anchos de escritorio y 4 de móvil sin solapes ni desborde y con el cajón alineado; R-9: orden de Planear).

---

## Revisiones de uso · cuarta tanda (modos y datos primero)

- **R-10 · Solo Aprendiz y Analista; fuera los botones de arriba** (`guidanceConfig.js`, `navigation.js`, `app.js`, `settings-view.js`, `styles.css`): el modo **Ejecutivo desaparece** (`MODES` = Aprendiz, Analista; sin `mode-exec`, sin su nota ni su regla CSS). Los **tres botones de modo del encabezado de cada vista** ya no existen; se conservan «Ayuda de esta sección», «Glosario» y «Recorrido guiado». El modo se cambia con el interruptor «Modo Aprendiz» del menú y con el selector de Configuración (ahora de dos opciones). Quien tenía guardado «Ejecutivo» pasa a Analista al abrir la app (`loadUx`). Se actualizó una prueba del motor (`Fase 9.1: modos`) que fijaba los tres modos. `ANALYST_ONLY` / `data-analyst` quedan sin efecto visible (solo servían para colapsar bloques en modo Ejecutivo).
- **R-11 · Los datos primero** (`contextEngine.js`, `guidanceConfig.js`, `tour.js`, `planning-view.js`):
  - **Siguiente paso:** nueva regla `load_historical` («Cargar el histórico»), después de «Cargar datos» y de «Revisar la calidad» y **antes** de «Capturar la meta». Solo aplica mientras no hay meta ni plan: con meta ya capturada o con un plan guardado, no estorba aunque falte histórico.
  - **Recorrido guiado:** ahora tiene 15 pasos y **empieza por Datos (histórico primero)** en Carga de datos; después Meta, Plan, Real… (los 14 pasos anteriores, en el mismo orden). Explica por qué: con el histórico, al capturar la meta el plan proyecta volumen, AOV y CR. Se conserva todo lo demás del recorrido.
  - **Aviso del plan sin histórico:** en la vista previa del plan, si no hay histórico y aún no existe el plan original, aparece un aviso: el plan original se congela sin volumen, AOV ni CR proyectados y ya no se puede rehacer (después solo se guardan revisiones), con enlace a Carga de datos. No cambia ningún cálculo.
  - **Sin cambios:** «Preparación de datos» y las tarjetas de «Recorrido del sistema» (decisión del usuario).
  - Por qué importa el orden (comprobado en el código): el plan original se congela al guardarse y `planningEngine` deriva pedidos = venta ÷ AOV y volumen = pedidos ÷ CR **de los supuestos disponibles en ese momento**; sin histórico quedan «sin datos suficientes».
- Pruebas: `batch_j.py` (R-10: modos, 17 vistas sin los botones, botones que se conservan, interruptor, selector de dos opciones, migración del modo «exec»; R-11: reglas de siguiente paso con 6 estados, tarjeta de Inicio, recorrido de 15 pasos, paso 1 y paso 2, aviso del plan con y sin histórico); T6 de la batería y R-3/R-4 de `batch_i.py` adaptados a dos modos.

---

## Etapa I-final · Barra de contexto compacta y responsive fino

- **R-12 · Barra de contexto (`.ux-context`)** (`navigation.js` → `renderContextBar`, bloque «I-final» de `design-system.css`): misma información y **los mismos controles** (verificado palabra por palabra y control por control en 17 vistas × 4 anchos × 2 modos), en el **orden en que se leen**:
  1. **Fila 1:** migas · acciones (Ayuda de esta sección, Glosario, Recorrido guiado), ahora en una sola línea y compactas (28 px en escritorio).
  2. **Fila 2:** «qué veo» y «qué hago aquí» · **Siguiente paso** como franja (etiqueta y título en la misma línea, razón debajo, botón «Ir» a la derecha).
  3. **Fila 3:** «Contexto:» y el aviso de calidad de datos, en una línea.
  - El orden del DOM coincide con el visual (antes las acciones iban al final del DOM aunque se veían junto al texto), así que el orden de tabulación no salta.
  - En ≤ 1100 px todo se apila (migas y acciones → texto → siguiente paso → contexto); en ≤ 600 px las acciones van en tres columnas de 44 px de alto y «Ir» mide 44 × 44 px.
  - **Barra de aprendizaje (modo Aprendiz):** las seis preguntas van en dos columnas desde 900 px; mismo contenido.
  - En Inicio el siguiente paso sigue viviendo en su propia tarjeta (la barra no lo repite).
  - Se eliminaron los contenedores `.ux-context__main` y `.ux-context__side` (ya no existen en el marcado).
- **Responsive fino** (`tools/regression/responsive_scan.py`): barrido de 16 vistas × 12 anchos (320, 360, 390, 480, 600, 768, 860, 1024, 1100, 1280, 1440, 1920 px) con datos de prueba: scroll horizontal del documento, elementos fuera de pantalla fuera de un contenedor con scroll propio, botones o chips con texto recortado y menú fijo bajo el encabezado.
- Pruebas: `context_snapshot.py` + `compare_context.py` (R-12: contenido idéntico, mismos controles, sin desborde ni solapes, orden de tabulación = visual, migas con un solo `aria-current`, ninguna barra más alta que antes, alturas medianas por ancho y modo, objetivos táctiles en 390 px); `responsive_scan.py`.
- **Verificación de I-final (esta pasada)** — la implementación de la barra de contexto y los tres scripts (`context_snapshot.py`, `compare_context.py`, `responsive_scan.py`) ya estaban en la copia de trabajo al empezar, sin que yo los hubiera verificado; se revisaron (diff de `navigation.js`, bloque CSS) y se volvieron a ejecutar antes de darlos por buenos. Resultados medidos: contenido idéntico (0 palabras quitadas ni agregadas, 17 vistas × 4 anchos × 2 modos), mismos controles y destinos, alto mediano de la barra 16 % menor en escritorio (149 → 125 px), 35 % en tableta (252 → 164 px) y 24 % en móvil (352 → 269 px) en modo Analista; `responsive_scan.py`: 0 hallazgos en la versión actual (16 vistas × 12 anchos) y **2 hallazgos a 320 px en la versión anterior** (Ayuda +16 px y Configuración +17 px), lo que confirma que la prueba sí detecta desbordes.
- **Decisiones de I-final:** (1) el «selector de modo» que el prompt lista dentro de la barra ya no existe porque el usuario pidió retirar los botones de modo de arriba (ver R-10); (2) la última miga repite el nombre del panel que está debajo; se conserva porque es la ruta y lleva `aria-current="location"` (quitarla sería quitar información).
- **Lección de las pruebas:** la app toma la fecha del dispositivo como fecha de corte, así que **la línea base debe capturarse el mismo día** que la nueva. Con la base de ayer (29) y la nueva de hoy (30) cambiaban exports y tablas de Pacing, Reforecast, Recovery y Narrativa; con la base recapturada hoy todo coincide.

---

## Etapa J · Accesibilidad y refinamiento

Medida primero, corregida después: `tools/regression/a11y_audit.py` + `a11y_report.py` recorren las 17 vistas con datos de prueba (1280 px en modo Analista y Aprendiz, y 390 px) y miden contraste **real** de todo el texto visible, foco con teclado, objetivos táctiles, estructura, dependencia del color y coherencia de tipografía y radios.

**Punto de partida (versión anterior a la etapa J):** 4 combinaciones de texto bajo AA, 0 controles sin foco visible (2,832 probados), 249 casos de objetivos táctiles < 44 px en 390 px (114 tipos de control; medido de nuevo sobre la versión anterior), sin skip-link, un solo título de pestaña para las 17 vistas y 2 saltos de nivel de encabezado.

- **Contraste AA (tokens, no vistas sueltas):** `--c-na` `#7A8494` → `#5B6678` (píldoras «Sin datos» y valores faltantes: 3.31 / 3.78 → ≥ 5:1); `--c-ok` alineado con `--ds-success`; los colores de los pasos numerados del recorrido salían de hex en JS (`STEP_COLORS`) y uno daba 4.47:1 con texto blanco: ahora son clases `tour-step__n--0…6` con tokens (`--ds-actual`, `--ds-reforecast`, `--ds-accent`, `--ds-forecast`, `--ds-scenario`, `--ds-observed`, `--ds-success`). `contrast.py` ahora cubre también los tokens antiguos `--c-*`, el encabezado oscuro y el texto blanco sobre cada color de estado (60 pares); el barrido real de `a11y_audit.py` da **0** combinaciones bajo el mínimo.
- **Skip-link «Saltar al contenido»:** primer elemento enfocable; invisible hasta recibir foco; al activarlo lleva el foco a la vista visible sin cambiar de página (`#contenido` no es una ruta, se intercepta). Orden de tabulación verificado: salto → encabezado → menú → contexto → contenido.
- **Título y anuncio por vista:** la pestaña dice «Vista · RevNavigator» y una región `role="status" aria-live="polite"` anuncia «Vista: …» solo cuando cambia la vista (no en cada filtro). No mueve el foco: quien navega el menú con teclado conserva su lugar.
- **Regiones vivas:** el error de la IA en Diagnóstico y Recovery Center usa `ds-alert--danger` con `role="alert"` (como Narrativa); los estados «Calculando…» (Estacionalidad, Producto) y «Consultando a Cohere…» usan `role="status"` / `.ds-loading`; los avisos de validación de la meta llevan `role`.
- **Encabezados:** el contexto de negocio (dentro de Configuración) y «Datos de productos» bajan a `h3` (`.ds-h4` conserva la apariencia): ya no hay saltos de nivel en las 17 vistas y hay un solo `h1`.
- **Objetivos táctiles ≥ 44 × 44 px** (≤ 760 px y pantallas táctiles): botones, campos, selects, botones segmentados, `summary`, iconos y las píldoras del encabezado miden 44 px. Los controles diminutos («?», «¿Por qué?», interruptor) conservan su caja visible y amplían el área tocable con un pseudo-elemento transparente de 44 × 44 px (verificado con `elementFromPoint`: el toque cae en el propio control). El encabezado móvil pasa de 90 a 108 px (marca + fila de píldoras de 44 px); a ≤ 340 px, 152 px.
- **No depender solo del color:** 0 hallazgos (todas las píldoras, etiquetas de estado y chips llevan texto; los puntos de canal van junto al nombre). Los elementos dentro de `<details>` cerrados no cuentan (el barrido los excluye).
- **Coherencia (tipografía y radios):** los tamaños y radios que se usaban sin token se registran: `--ds-fs-micro` (11 px, glifo del «?» y número de paso), `--ds-fs-title` (18 px, título de panel), `--ds-fs-lead` (24 px, título de aviso) y `--ds-r-xs` (4 px, barras de progreso); el logo usa `--ds-r-sm`. Sin cambio visual notable; ya no hay valores sueltos.
- Pruebas: `batch_k.py` (skip-link, orden de tabulación, título y anuncio por vista, error de IA con `role="alert"`, encabezados, objetivos del encabezado móvil), `a11y_audit.py` + `a11y_report.py`, `contrast.py` ampliado.
- **Verificación de la etapa J (esta pasada)** — los cambios de J (skip-link, anuncio de vista, roles, tokens de contraste, objetivos de 44 px, escala tipográfica) y sus scripts (`a11y_audit.py`, `a11y_report.py`, `batch_k.py`, `contrast.py` ampliado) ya estaban en la copia de trabajo al empezar, sin que yo los hubiera verificado. Se revisaron (diffs completos) y se volvieron a ejecutar. **Números de partida confirmados** sobre la versión anterior con el mismo script: 4 combinaciones de texto bajo AA, 0 controles sin foco (2,832), 249 casos táctiles < 44 px (114 tipos), sin skip-link, 1 título distinto de 17 y 2 saltos de encabezado. **Después:** 0 combinaciones bajo AA, 0 controles sin foco (2,883), 0 casos táctiles, skip-link presente, 17 títulos distintos y 0 saltos.
- **Defecto propio de J encontrado y corregido:** al subir `--ds-header-h` a 108 px en ≤ 860 px el encabezado medía 90 px entre 761 y 860 px con ratón (las píldoras de 44 px solo aplican en ≤ 760 px o con pantalla táctil): quedaba un hueco de 18 px sobre el menú; y a ≤ 340 px el encabezado medía 156 px con `--ds-header-h` en 152 (solape de 4 px). Ahora el token depende del mismo criterio que las píldoras (90 px en 761–860 px con ratón, 108 px en ≤ 760 px o táctil, 156 px en ≤ 340 px). `batch_k.py` lo prueba a 10 anchos con ratón y con pantalla táctil emulada (falla sobre la versión sin el arreglo).
- **Costo de los 44 px en la barra de contexto:** frente a I-final, en 390 px modo Aprendiz la barra mide hasta 16 px más (por botones de 44 px); frente a la barra original sigue siendo más baja (−14 % en mediana). Es el precio de cumplir el objetivo táctil.
- **Verificación propia de las áreas táctiles ampliadas** (`«?»`, `«¿Por qué?»`, interruptor; solo en 390 px con pantalla táctil emulada, 9 vistas × 4 posiciones de scroll): 60 controles visibles con caja < 44 px; en 58 el toque cae en el propio control dentro de un cuadro de 44 × 44 px (`elementFromPoint` y un toque real en uno de ellos). Los otros 2 eran falsos positivos: iconos dentro de un `<details>` cerrado (comprobado con `checkVisibility()` en el de Metas y motor; en el de Plan lo infiero por posición, no lo observé directamente). Los iconos que quedan tapados por el encabezado fijo al hacer scroll no cuentan (el contenido pasa por debajo, como en cualquier página con encabezado fijo).

---

## Inicio · datos primero (quinta tanda de revisiones)

- **R-13 · «Preparación de datos» en el orden del recorrido** (`guidanceConfig.READINESS`, `contextEngine.dataReadiness`, `home-view.js`): 1 Histórico cargado (mejora la estacionalidad) · 2 Venta real cargada · 3 Cobertura reciente de venta real · 4 Meta anual definida · 5 Plan distribuido · 6 Sin errores de calidad (antes: meta, plan, real, cobertura, histórico, calidad). Solo cambia el orden: pesos, porcentaje y semáforo son idénticos (comprobado en las 64 combinaciones posibles), y se conservan textos, etiquetas «recomendado» y enlaces «Ir». El histórico lleva la nota «Opcional: si tu empresa no tiene histórico, puedes continuar sin él.» en su propio renglón mientras falta.
- **R-14 · Estado vacío de «¿Qué está pasando?» alineado** (`contextEngine.NEEDS.inicio`, `help.enhanceEmpty`): la lista «Para usar esta vista necesitas» sigue el mismo orden: histórico (con la etiqueta «opcional» y la nota de que se puede continuar sin él) → venta real → meta → plan, con ✓ en los hechos. El botón «Ir a…» lleva al primer paso **obligatorio** que falta (los opcionales solo se listan). Antes usaba la lista de Pacing (meta, plan, real). Las listas de las demás vistas no cambian.
- **R-15 · Inicio muestra algo aunque no haya venta real** (`home-view.js`, `contextEngine.WHAT_IT_MEANS.inicio`): con plan pero sin ni un día de venta real, Inicio pasa a modo «solo plan»: cinco tarjetas con etiqueta «Plan» (meta del periodo, pedidos, volumen, CR y AOV del plan; sin histórico las cuatro últimas muestran «—» y «Sin histórico: el plan no lo proyecta») y un mensaje que dice que aún no hay venta real y qué falta. Antes mostraba «el forecast proyecta cerrar 0.0 % por encima de la meta» y «el reforecast requiere 296.7 % más», cifras sin sentido sin venta real; la frase de la barra de contexto también se corrigió. Los pasos que faltan (siguiente paso y preparación) siguen arriba. Con venta real, Inicio es el de siempre.
- **Nota del histórico opcional también en:** el «Siguiente paso» «Cargar el histórico» (ahora dice que es opcional y que sin histórico se sigue con la meta) y el primer paso del recorrido guiado.
- **Interpretación a validar:** «alinear a los 4 primeros pasos» se entendió como los cuatro pasos de acción en el orden de la lista: histórico, venta real, meta y plan (se omitió «cobertura reciente» porque es una condición de la venta real, no un paso).
- **No cambiado a propósito (observaciones):** «Recorrido del sistema» marca «Monitorear» como «Hecho» con solo plan (sin venta real), porque se calcula con «hay plan»; las vistas Pacing y Reforecast siguen mostrando su frase de forecast con plan y sin venta real; la vista Plan sigue pidiendo el histórico como requisito.
- Pruebas: `batch_l.py` (orden y notas de la preparación, 64 combinaciones de porcentaje, lista alineada del estado vacío, botón al primer obligatorio, modo «solo plan», barra de contexto, modo completo con venta real, requisitos de otras vistas sin cambios); `compare.py --allow-add inicio` (solo se agrega la nota del histórico).

---

## Calidad de datos · huecos por canal (sexta tanda de revisiones)

Origen: el usuario cargó un histórico y una venta real sin ningún problema de celdas y la app marcaba «Datos con advertencias» sin decir por qué. Se reprodujo su caso por la vía real (archivos CSV en «Carga de datos»): histórico 2024-01-01 → 2025-12-31 con App desde 2024-02-29 y un día sin WhatsApp ni Llamadas (2,863 filas, 60 fechas con algún canal faltante) y venta real 2026-01-01 → 2026-09-28 con Llamadas sin fila del 10 al 14 de marzo (1,079 filas, 5 fechas), todas las celdas válidas. **Causa confirmada en la versión anterior:** el estado pasa a «advertencias» si en algún día un canal no tiene fila (`datesWithMissingChannels > 0`), y la pantalla no lo decía: el banner quedaba con el texto vacío, «Problemas por tipo» decía «No hay errores ni advertencias registrados» y el Total de «Canales sin datos» marcaba 8.

- **A · El banner dice la causa** (`quality-view.js`, `gapSentences`): «Histórico: 60 fechas con algún canal faltante (App 59 días, WhatsApp 1 día, Llamadas 1 día). Venta real / Actual: 5 fechas con algún canal faltante (Llamadas 5 días).», más «sin datos de …» cuando un canal no tiene ninguna fila. Los segmentos no cuentan (su estado ya los excluía).
- **B · «Problemas por tipo» deja de contradecir al estado:** sin problemas de filas pero con advertencia por cobertura, dice «Las filas no tienen errores ni advertencias. El estado marca advertencias por huecos de cobertura…» (aviso amarillo). Con datos limpios sigue diciendo «No hay errores ni advertencias registrados».
- **C · «Canales sin datos» del Total** suma solo las colecciones con datos (antes sumaba los 4 canales de Plan / Meta y los 4 de Segmentos, que no se cargaron: 8). Es un cambio de presentación; `data_quality` del export no cambia.
- **D · «Fechas faltantes por canal»** (bloque plegable en Cobertura de cada colección): una fila por canal con huecos, cuántos días faltan y **qué fechas** en rangos («2024-01-01 a 2024-02-28 (59 días)»; hasta 20 rangos y «y N rangos más»). Un canal «falta» un día cuando no tiene ninguna fila ese día. Se calcula desde los registros, no modifica el resumen exportado.
- **Sin cambios de regla:** el estado sigue siendo el mismo (cualquier hueco por canal = advertencia). Queda **pendiente de decisión (E)** si los huecos de arranque (un canal que empieza después del inicio del rango) deben mostrarse como información aparte; ver el reporte.
- Pruebas: `batch_m.py` + `quality_gaps_state.py` (réplica fiel: 2,863 + 1,079 = 3,942 filas, 60 y 5 fechas, datos deterministas). Sobre la versión anterior fallan A, B, C y D; sobre la nueva pasan. `compare.py --allow-text calidad --allow-tables calidad`: con el estado de prueba de la batería el único cambio es la celda Total de «Canales sin datos» (8 → 0).

---

## Renombre a RevNavigator y árbol de drivers (séptima tanda de revisiones)

- **Renombre:** la herramienta pasa de «Sales Navigator» a **RevNavigator**. Se cambió en todo el texto de la app (encabezado, título de la pestaña, buscador y su etiqueta accesible, menú, «Configuración de RevNavigator», ayuda «¿Cómo funciona RevNavigator?», avisos, pie de página), en `config.app.name` (de donde salen `source.app` y `metadata.app` de los **7 exports**, que ahora dicen «RevNavigator»; la versión sigue en 0.14.0), en la prueba del motor de branding, en las pruebas de regresión, en los documentos (UX_GUIDE, ARCHITECTURE, DATA_DICTIONARY y reportes anteriores) y en `tools/idb-proof.html`. Las iniciales del marcador de usuario pasan de «SN» a «RN». **No se cambió** el namespace de almacenamiento (`fp.v1`) ni la base IndexedDB (`fp-data`): ninguna clave lleva el nombre, así que los datos guardados siguen ahí. Ninguna importación valida el nombre de la app dentro del archivo, así que un export hecho antes (con «Sales Navigator») se sigue aceptando. Los archivos exportados antes conservan el nombre antiguo.
- **Árbol de drivers (Nivel 2) de Diagnóstico:** los títulos de las tarjetas (Volumen, CR, AOV) se veían partidos letra por letra («V ol u m en»). Causa: la tarjeta usaba la clase `.tree-node`, que es también la de la cadena trazable de Recovery y Medir (rejilla de 150 px + 1fr, y desde la etapa H `overflow-wrap: anywhere`): el título caía en una columna diminuta. Ahora el árbol tiene clase propia (`.driver-tree` / `.driver-node`): fila de resumen (título · contribución · variación, una sola línea) arriba y las ramas debajo, a todo el ancho. La cadena trazable no cambia. Medido antes/después a 1600–768 px: «Volumen» ocupaba 4 líneas y «AOV» 2; ahora 1 línea en todos los anchos de 320 a 1920 px. **Ese defecto lo agravé yo en la etapa H** al añadir `overflow-wrap: anywhere` a `.tree-node` sin revisar que otra vista compartía la clase; la batería no lo detectaba porque compara texto y no la posición de los títulos.
- Pruebas: `batch_n.py` (N-1 nombre visible en 17 vistas, etiquetas accesibles, título, pie, `config.app` y exports reales capturados; N-2 almacenamiento intacto e importaciones sin validar el nombre; N-3 títulos del árbol en una línea a 8 anchos y clases separadas). Sobre la versión anterior fallan 7 comprobaciones; sobre la nueva pasan. Los comparadores de texto y de exports de la regresión tratan «Sales Navigator» y «RevNavigator» como el mismo texto (la base se recapturó con el mismo arnés, el mismo día).

---

## Fase 10 · Paquete de análisis

- **Qué es:** página «Paquete de análisis» (tercera de «Medir y aprender») que descarga un .zip con los 7 exports (Pacing y forecast, Reforecast, Diagnóstico, Categoría → Producto, Recovery Center, Narrativa y Plan), `indice.json` y `LEEME.txt`. No calcula nada nuevo.
- **Decisiones del usuario aplicadas:** siempre los 7 archivos (el que no tiene datos viaja como `<export>_vacio.json` con `status: "empty"`, motivo, qué falta y la vista donde llenarlo); índice con sello de generación, fecha de corte, año, plan, método de forecast y calidad de datos, y por archivo nombre, registros, estado y qué falta; **sin API key, sin preferencias y sin datos de Negocio** (la narrativa viaja con `businessContext` en blanco y el índice lo declara en `redacted`).
- **Mismo contenido que cada vista:** las 7 acciones «Exportar …» pasaron a usar constructores compartidos (`EXPORT_BUILDERS` en `app.js`); el paquete usa los mismos, así que cada archivo es idéntico al que se descarga desde su vista (comprobado salvo sellos de tiempo). Antes de armar el paquete se calculan forecast, reforecast, diagnóstico y productos, porque el export de Producto incluye el diagnóstico y el de Diagnóstico incluye los productos: así el paquete sale de un solo estado, aunque no se hayan abierto esas vistas en la sesión.
- **Registros:** elementos de la lista más larga del archivo (su tabla principal).
- **Zip sin dependencias** (`js/export/zip.js`): método «stored» (sin compresión), nombres en UTF-8 y CRC32 propio. Nombre: `revnavigator_paquete_<año>_<fecha>.zip`.
- **Cada export usa la configuración actual de su vista** (periodo, canal, comparación); la página lo advierte.
- **Pruebas:** `batch_o.py` (vista; paquete vacío con 7 avisos; paquete completo descargado de verdad y abierto con `zipfile`, CRC válido, 9 archivos, cada export idéntico al individual, narrativa sin contexto de negocio, índice y LEEME; sin API key, nombre del negocio ni preferencias aunque estén guardados; una sesión nueva sin abrir Producto también trae productos). Regresión contra la versión anterior el mismo día: exports idénticos y ninguna vista existente con texto distinto. `spacing.py` ahora revisa también las secciones de esta página (detectó que iban pegadas; corregido).
- **Pruebas independientes de la fecha:** al cambiar el día a 1 de octubre, la preparación de Recovery y las pruebas de Diagnóstico y Narrativa fallaban igual en la versión anterior y en la nueva, porque abren por defecto el mes en curso (sin días con venta real). Las pruebas fijan ahora el último mes con venta real. **Observación de producto pendiente de decisión:** la app, el día 1 de cada mes, abre esas vistas en un mes sin datos.

---

## Revisión posterior a la Fase 10 · mes por defecto y selección de periodo y canal

- **Mes por defecto** (`app.js`, `defaultMonth`): Diagnóstico, Recovery Center y Narrativa abren en el mes de la fecha de corte, salvo que ese mes aún no tenga ningún día con venta real (p. ej. el día 1): entonces abren en el **último mes con venta real**. Solo aplica cuando no hay un mes elegido; un mes elegido a mano se respeta. A mitad de un mes con venta real el comportamiento no cambia.
- **Narrativa** (`narrative-view.js`, `contextControls`): periodo (mes, semana o año), «Cuál» y canal se cambian ahí mismo; es la misma selección que Diagnóstico (la comparación se sigue cambiando en Diagnóstico).
- **Paquete** (`package-view.js`, acción `pkg-context`): «Periodo y canal» en la misma página; mueven a la vez Diagnóstico, Recovery Center (y con ellos la Narrativa) y Categoría → Producto (mismo rango de fechas). Pacing, Reforecast y Plan son del año completo.
- **Contexto compartido** (`navigation.js`): Narrativa y Paquete guardan y aplican el canal y el periodo como Diagnóstico al cambiar de vista; al entrar a una de esas vistas el diagnóstico solo se recalcula si la selección cambió (antes se rehacía siempre, y la narrativa cambiaba los identificadores de sus afirmaciones sin cambiar su contenido).
- Pruebas: `batch_p.py` con el **reloj fijado** (1 de octubre y 25 de septiembre): día 1 → septiembre en las tres vistas; mes elegido a mano respetado; controles de la Narrativa; controles del paquete y zip con esa selección. Con la fecha real del 1 de octubre, la batería muestra la diferencia buscada: la versión anterior abría Diagnóstico, Recovery y Narrativa en octubre vacío y la nueva en septiembre con datos; con el mismo mes en ambas (Recovery, Narrativa, `batch_h`) no hay más diferencias que los controles nuevos.

---

## Fase 11 · Tráfico, conversión y producto como módulos de RevNavigator

Decisiones del usuario: la «App 1» del roadmap no existe y se hace como módulo dentro de RevNavigator, en dos piezas; pieza 1 con la **opción A**; pieza 2 con todas las dimensiones (dispositivo, fuente y medio, campaña, landing, tipo de cliente) y, mientras llega un ejemplo del export de GA4, con el formato de Segmentos que la app ya acepta.

- **Procedencia:** la implementación de las dos piezas y sus pruebas (`batch_q.py`, `batch_r.py`, `segments-view.js`) ya estaban en la copia de trabajo al empezar esta tanda (06:55–07:01), sin documentación y sin que yo las hubiera verificado. Se revisaron (diff completo) y se probaron antes de darlas por buenas.
- **Pieza 1 · Producto en el Diagnóstico (opción A)** (`app.js`, `ensureDiagnosticProducts`; `diagnostic-view.js`, `renderProducts`; `index.html`, `#dx-products`): sección «Nivel 2 · Categoría, producto y región (venta)» bajo el árbol de drivers. Con el mismo periodo y canal del diagnóstico, y el mismo motor de Categoría → Producto (`FP.productAnalysis.run` + `fromDiagnosis`), muestra las 6 categorías, productos y regiones que más explican el cambio de la venta: venta, referencia, Δ venta, contribución, CR del embudo (pedidos ÷ vistas de ficha) y AOV. **No** parte la brecha en volumen × CR × AOV (no hay sesiones por categoría) y lo dice; si la comparación es contra plan, aclara que productos se compara contra el periodo anterior (no hay plan por producto). Con datos de Producto, «no disponible» deja de listar Categoría, Producto y Geografía. Corre aparte de la selección de la vista Producto (no la cambia). El export de Diagnóstico no cambia.
- **Pieza 2 · «Tráfico y conversión»** (`segments-view.js`, vista `segmentos`, tercera página de «Diagnosticar»): con el archivo de Segmentos, para el periodo y canal elegidos (la misma selección de Diagnóstico, con sus controles) y una dimensión: tráfico, % del tráfico, Δ tráfico, pedidos, CR, Δ CR (pp), AOV, venta y Δ venta por segmento, contra el periodo anterior de la misma duración (los segmentos no tienen plan). CR y AOV de sumas, nunca de promedios. Sin archivo: estado vacío con las columnas y enlace a Carga de datos. El traductor directo del export de GA4 queda pendiente de un ejemplo del archivo.
- **Pruebas:** `batch_q.py` (sin productos invita a cargarlos y «no disponible» sigue listando las tres; con productos, tres tablas y la nota; la fila principal coincide con el motor de Producto; no toca la selección de Producto ni el árbol; se recalcula al cambiar de canal) y `batch_r.py` (estado vacío; 6 dimensiones; septiembre contra los 30 días anteriores con cifras iguales a las sumas del archivo generado por la prueba; filtro de canal; misma selección que Diagnóstico; en «Diagnosticar»). Regresión contra la versión entregada, mismo día: exports idénticos; el texto solo cambia en Diagnóstico (la invitación de la sección nueva); con un archivo de Segmentos cargado, la tabla nueva no tiene scroll horizontal de 1100 a 1920 px ni desborda la página en 768 y 390 px.
- **Traductor del CSV de GA4** (`js/import/ga4Segments.js`; enganche en `stageFilesInner`): la tarjeta de Segmentos acepta el CSV exportado de GA4 tal cual y lo convierte al formato de Segmentos antes de la revisión normal. Decisiones del usuario: web y app en la misma propiedad (`web` → Ecommerce; `Android` + `iOS` → App); «(not set)» se muestra como «Sin dato (not set)»; los usuarios no se usan (no se pueden sumar entre filas), solo Sesiones, Compras e Ingresos; formato CSV. Detalles: ignora las líneas de comentario «#» de GA4; acepta encabezados en español (los del ejemplo del usuario) y en inglés; fecha `AAAAMMDD` o `AAAA-MM-DD`; números con comas de miles y «$»; «Fuente/medio de la sesión» se separa en Fuente y Medio; cada fila de GA4 genera una fila por dimensión y se suman las que caen en el mismo día, canal y segmento; se omiten filas sin fecha (totales) o con otra plataforma y el aviso lo dice. WhatsApp y Llamadas no vienen de GA4: «Tráfico y conversión» lo explica. **Ojo:** contra plan, el Diagnóstico compara los segmentos con el mismo periodo del año anterior (no hay plan por segmento); para verlos ahí hace falta exportar también el año anterior, o usar «Actual vs periodo anterior».
- Pruebas: `batch_s.py` (CSV de GA4 sintético con comentarios, encabezados en español, fechas AAAAMMDD, números con comas, fila de totales y plataforma «(not set)»; aviso de conversión; solo Ecommerce y App; 9 segmentos de 6 dimensiones con sesiones, compras, ingresos y CR iguales a sumas calculadas aparte; «Sin dato (not set)»; App = Android + iOS; sin usuarios; Diagnóstico con las dimensiones disponibles contra el periodo anterior). Falla en la versión anterior.

---

## Tráfico y conversión · parte 1 de descubrimiento (sobre la versión del usuario `fase11-ga4-fix`)

Pedido del usuario: la vista solo comparaba y consolidaba; faltaban hallazgos. Se aplicaron, en orden de valor, las ideas 1 a 4 propuestas (`js/ui/segmentInsights.js` + `segments-view.js`), con las recomendaciones para los puntos abiertos:
- **Hallazgos en frases** (sin IA, deterministas): mayor oportunidad de conversión (con el monto), oportunidad de escalar, mayor caída y mayor alza contra el periodo anterior, concentración de la venta y cuántos segmentos tienen poco volumen. Aviso: diferencias matemáticas, no causas.
- **Mapa tráfico × CR** (SVG accesible, con título y descripción): x = % del tráfico, y = CR; líneas en la participación promedio y en el CR del total; tamaño = venta; cuadrantes Estrellas, Escalar tráfico, Convertir mejor y Revisar. La tabla principal suma la columna **Cuadrante** (el mismo dato en texto).
- **Oportunidad estimada en pesos:** sesiones × (CR del total − CR del segmento) × AOV del segmento, solo con volumen suficiente y diferencia de CR concluyente. «Escenario matemático, no promesa».
- **Rankings con umbral:** Más venta, Mejor CR, Menor CR (bajo el total) y Menor AOV (bajo el total).
- **Reglas para no engañar:** CR y AOV por razón de sumas; **volumen mínimo = el mayor entre 500 sesiones y el 1 % del tráfico del periodo**; una diferencia de CR es **no concluyente** si el CR del total cae dentro del intervalo de Wilson al 95 % del segmento (no genera oportunidad y se marca en la tabla).
- También: el cuadro de texto de equivalencias de Configuración (versión del usuario) usaba estilo en línea; pasa a la clase `.alias-text` (el lint lo marcaba).
- Pruebas: `batch_t.py` (datos con resultado conocido calculado aparte: hallazgos y montos, cuadrantes, oportunidad, rankings que excluyen el segmento con poco volumen aunque tenga el mejor CR, mapa, «no concluyente», sin desborde de 390 a 1920 px). `batch_r.py` y `batch_s.py` leen ahora la tabla principal por su nombre y omiten la columna Cuadrante. Regresión contra la versión del usuario, mismo día: verde (solo cambia el control de equivalencias).

## Tráfico y conversión · parte 2 de descubrimiento

- **Qué explica el cambio** (idea 5): cambio total de la venta contra el periodo anterior y los 3 mayores ganadores y perdedores, cada uno con su Δ venta, «peso en los movimientos» (su parte de la suma de todos los cambios, con o sin signo; evita porcentajes absurdos cuando el cambio total es chico) y su descomposición secuencial tráfico → CR → AOV, que suma exactamente el Δ. Segmentos nuevos o que dejaron de aparecer se marcan.
- **AOV bajo con buen volumen** (idea 6): segmentos con volumen suficiente, al menos 30 pedidos y AOV más de 15 % bajo el total; muestra cuánto sumaría con el AOV del total. Lenguaje de hipótesis (venta cruzada, umbral de envío).
- **Calidad de la medición** (idea 7): si «Sin dato (not set)», «(not set)» u «(other)» pasan del 5 % del tráfico de la dimensión, la primera frase de «Lo que destaca» lo avisa (posible etiquetado en GA4).
- **Nuevos y recurrentes** (idea 8): si el archivo trae «tipo de cliente», tabla con % del tráfico, cambio de peso (pp), CR y AOV de cada uno, y cuántas veces convierte un recurrente lo que un nuevo; se muestra con cualquier dimensión elegida.
- Pruebas: `batch_u.py` (resultados calculados aparte: cambio total, ganador y perdedor con efectos, AOV bajo con su monto, alerta de calidad solo donde corresponde, nuevos y recurrentes, sin desborde de 390 a 1920 px). Falla en la versión anterior. Regresión del mismo día: verde.

---

## Integración de la versión del usuario «integrado-cohere-import-calidad-productos»

Mezcla de tres vías: base = versión de la parte 1 de descubrimiento (de la que partió el usuario); de su lado se tomaron sus 12 archivos de código (lector XLSX nativo, mapeo de encabezados con la misma conexión de Cohere, parser CSV ampliado, cuarentena de valores inválidos en productos, ajustes de carga, Configuración y prueba nueva del motor) y sus documentos; del mío, la parte 2 de «Tráfico y conversión» (`segmentInsights.js`, `segments-view.js`, `batch_u.py`). Los cambios no se cruzaban; solo `ARCHITECTURE.md` tuvo un conflicto (las dos secciones nuevas al final) y se conservaron ambas.

- Verificado: motor 207 → **206/206** (la prueba nueva del usuario pasa); lint y contraste; pruebas de Segmentos, GA4, descubrimiento (partes 1 y 2), calidad de datos, periodo y canal e Inicio; Producto idéntico con datos de prueba; batería del mismo día contra mi versión: 7 exports idénticos y sin errores de consola (las diferencias son las del usuario: prueba nueva del motor, opción de mapeo con IA en Carga, textos de Configuración).
- Sin API key de Cohere, un encabezado desconocido muestra «Mapeo de columnas IA no disponible… El mapeo estático se conserva» y la asignación manual; no rompe.
- **Hallazgo:** un export de GA4 guardado como **.xlsx** no pasa por el traductor de GA4 (el traductor solo se aplica a CSV), así que en Segmentos queda para asignación manual. Con CSV funciona.

---

## Tráfico y conversión · parte 3 de descubrimiento y dos arreglos

- **Cruce Dispositivo × Fuente/medio** (idea de cruces): el traductor de GA4 ya no pierde la combinación; además de las 6 dimensiones genera «Dispositivo × Fuente/medio» («Móvil · google / cpc»), con las mismas sumas por día, canal y segmento. Es la última opción de la lista. Al ser un cruce (`derived`), el Diagnóstico no lo anuncia como «no disponible» cuando no existe.
- **Tendencia semanal del CR:** 8 bloques de 7 días que terminan el último día del periodo, para los 5 segmentos con más tráfico y volumen suficiente; minigráfica del CR, CR de las 6 semanas anteriores contra las 2 últimas y etiqueta «A la baja», «Al alza» o «Sin cambio claro» (solo cambia si sale del intervalo de Wilson al 95 %).
- **«Simular» en Recovery Center** (en cada fila de «Oportunidad estimada»): abre Recovery con el mismo canal y periodo y un escenario precargado. Como los escenarios trabajan con el canal completo, el segmento se traduce a su equivalente: pedidos extra de llevarlo al CR del total ÷ pedidos totales = % de CR relativo del canal. En un periodo ya cerrado se aplica a todo el periodo (retrospectivo). Un aviso explica la equivalencia; el usuario revisa y guarda.
- **Arreglo · avisos que se salían de la pantalla:** el aviso (toast) no tenía ancho máximo; un mensaje largo (p. ej. la conversión de GA4) medía casi toda la pantalla, tapaba el menú lateral (1024 y 1280 px) y se salía por la izquierda en móvil (390 y 320 px). Ahora: ancho máximo de 520 px, varias líneas, de borde a borde con margen en móvil, por encima de todo y con duración según el largo del texto (hasta 10 s).
- **Arreglo · Narrativa con Cohere «Cifras que no vienen de los datos calculados: 38.1»:** el filtro anti-alucinación funcionaba bien: Cohere escribió una cifra que no está en los datos (muy probablemente un cálculo propio, como un complemento o una diferencia) y el texto completo se rechazó. Ahora: (1) la instrucción prohíbe explícitamente calcular diferencias, complementos, sumas o porcentajes nuevos; (2) si el único problema son cifras inventadas, se reintenta **una vez** diciéndole cuáles quitar; (3) el segundo texto pasa por el mismo filtro (no se relaja) y, si vuelve a fallar, el aviso explica que fue un cálculo propio y que se reintentó.
- Pruebas: `batch_v.py` (aviso largo dentro de la pantalla y sin tapar el menú a 6 anchos; reintento de Cohere con respuestas simuladas; cruce con sumas calculadas aparte; tendencias con resultado conocido; «Simular» con su equivalencia; sin desborde con las columnas nuevas). Falla en la versión anterior. `batch_s.py` y `batch_t.py` ajustados a la dimensión y la columna nuevas. Regresión del mismo día: verde.

---

## Fase A (Prompt 0) · calidad, cuarentena, auditoría y Data Health
Ver `REPORTE_FASE_A_calidad_cuarentena_health.md`. Resumen: catálogo de reglas con acción (`quality/rules.js`), cuarentena por celda que conserva valor original, interpretado y regla (negativos y no numéricos ya no tumban la fila ni se suman), Data Health desglosado (`quality/health.js`), registro de importaciones con fuente y duración, pantallas nuevas en Calidad de datos, privacidad en el mapeo con Cohere y dos errores corregidos (fechas de Excel; cuarentena que se perdía al recargar).

---

## Fase B (Prompt B) · modelo canónico, detección, derivaciones y disponibilidad
Ver `REPORTE_FASE_B_modelo_disponibilidad.md`. Visible para el usuario: «Tipo detectado» en la revisión de carga (y aviso si el archivo parece de otra sección), tabla «Por qué cada dimensión está o no disponible» en el Diagnóstico (con periodo actual y de comparación explícitos) y panel «Qué puedes analizar con tus datos» en Calidad.
- **Corregir la clasificación (decisión del usuario: sí al botón):** en la revisión de carga, junto a «Tipo detectado», el selector «Cargar como» y, si el archivo parece de otra sección, el botón «Mover a …». El archivo se revisa en la sección nueva sin volver a subirlo (hacia Productos se reconstruye el CSV desde las filas leídas); el lote guarda `detection.correctedFrom`. Prueba: `batch_y.py`.

---

## Rendimiento con volumen
Ver `REPORTE_RENDIMIENTO_volumen.md`. Índice de Segmentos por dimensión y fecha, resultados recordados con tope, cobertura en pasadas únicas, guardado por bloques incremental, validación de archivos grandes por bloques con aviso de avance y copia directa de registros. Herramientas: `perf_bench.py`, `perf_import.py`, `batch_z.py`, `batch_aa.py`, `batch_ab.py`.

---

## Pasada de diseño (Calidad de datos y Tráfico y conversión)
Ver `REPORTE_PASADA_DE_DISENO.md`. Salud compacta y nunca 100 con incidencias, Cobertura abre en la primera colección con datos, «En cuarentena» en Problemas por tipo, plurales, resumen de «Qué puedes analizar», navegación por secciones y rótulos en el mapa de Tráfico y conversión. Prueba: `batch_ac.py`.

---

## Worker de importación (archivos grandes)
Ver `REPORTE_WORKER_importacion.md`. Los CSV de 4 MB o más (Histórico, Plan, Venta real y Segmentos, incluidos los exports de GA4) se leen, traducen y validan en un Worker (`js/workers/import-worker.js`): la página no se congela, muestra el avance y solo guarda un resumen y una vista previa hasta confirmar. Pruebas: `batch_ac.py`; medición: `perf_ga4_file.py`.

---

## Carga de Segmentos que no pierde filas
Ver `REPORTE_CARGA_segmentos.md`. En Segmentos, pedidos > volumen, volumen 0 con pedidos y venta con 0 pedidos son **advertencias** (no rechazan la fila); la revisión explica por qué quedan filas fuera y alerta si ninguna entra; el guardado por bloques se verifica y un fallo deja un banner persistente. Prueba: `batch_ad.py`.

---

## Cuarentena de Productos, IA en archivos grandes y rediseño de Tráfico y conversión
Ver `REPORTE_PRODUCTOS_IA_Y_TRAFICO.md`. Calidad de datos incluye los negativos y no numéricos de Productos (conteo exacto por regla, hasta 25 ejemplos), su salud y su registro de importaciones. Los archivos grandes también pasan por la IA para columnas desconocidas. «Tráfico y conversión» usa tarjetas con encabezado y cifras del periodo como Diagnóstico y Pacing. Pruebas: `batch_af`, `batch_ag`, `batch_ah`.

---

## Proyección del año siguiente (Planear)
Ver `REPORTE_PROYECCION_siguiente_ano.md`. Base = cierre estimado (meses reales + meses faltantes del año anterior), meta propuesta = base total × (1 + g) repartida por canal, proyección = ritmo de los últimos 2 meses cerrados, brecha y «qué tendría que pasar», reparto mensual de referencia, sensibilidad, descargas y guardado de las metas del año siguiente. Prueba: `batch_ai.py`. Plan de la Fase H: `PLAN_FASE_H_cohere_avanzado.md`.

---

## Fase H · transparencia y control de la IA
Ver `REPORTE_FASE_H_cohere.md`. Ajustes → tres paneles nuevos (qué se envió a Cohere en esta sesión, lo que la IA aprendió, columnas protegidas como datos personales). En la revisión de carga: columnas protegidas, columnas dudosas y tipo de archivo resuelto con ayuda de la IA. Prueba: `batch_aj.py`.

---

## Fase I · fuentes de datos, cuarentena y salud
Ver `REPORTE_FASE_I_fuentes_cuarentena.md`. Configuración → «Fuentes de datos» (6 fuentes, estado, última sincronización, periodo, frescura y calidad); Calidad de datos → Cuarentena con resumen arriba y consolidado línea por línea abajo (filtros, paginación y CSV); Salud con resumen por tipo de dato arriba. Prueba: `batch_ak.py`.

---

## Configuración en desplegables
Ver `REPORTE_CONFIGURACION_desplegables.md`. Cada sección de Configuración es un `<details class="stacc">` cerrado al entrar, con título y resumen a la vista; grupos Herramienta, Datos e Inteligencia artificial, y Negocio; «Expandir todo / Contraer todo»; el estado se recuerda mientras dure la sesión. Prueba: `batch_al.py`.

## Análisis · canal, contexto y detalle
- Selector **Canal** (Total digital, Ecommerce, App, WhatsApp, Llamadas) junto a Granularidad/Período/Comparación. Cambiarlo recalcula todo el módulo y descarta el contexto anterior.
- Barra de contexto siempre visible: Canal · Período · Comparación («Oct 1–5 vs Sep 1–5») · Nivel · Métrica.
- Sin datos comparables se muestra **N/A** (nunca 0 % ni −100 % por falta de dato).
- Los cuatro KPI, las filas de Patrones, Mix, Contribución, Prioridades y Forecast abren **Detalle y trazabilidad**: por canal, siguiente nivel (categoría → subcategoría → producto → SKU), detalle temporal y registros fuente (archivo y fila), con conciliación «✓ = total».
- Cohortes = cohortes de producto/entidad (continuidad), no retención de clientes.


### Análisis · métrica, volumen/precio/mezcla y puente al plan
- El selector **Métrica** (Venta · Pedidos · Unidades) vive junto a Canal; la barra de contexto la muestra siempre.
- **Volumen · Precio · Mezcla** y **Puente al plan** aparecen bajo Contribución. Cada panel trae una frase de lectura, la conciliación («✓ Conciliado») y, si no se puede calcular, el motivo (sin unidades, sin meta, plan de otro año, comparación sin datos, métrica distinta de Venta). Nunca se muestran ceros o −100 % inventados.
- «Precio» es venta ÷ unidades realizadas: incluye descuentos; a nivel categoría incluye mezcla interna (el panel lo advierte).
- El aporte por producto a la brecha asume que la meta pedía crecer parejo sobre la base; el supuesto se muestra bajo la tabla.

- **Lectura de la entidad**: la primera línea es «La historia» (fases en palabras + cómo está ahora); debajo, línea de tiempo de fases, estabilidad, contra su contexto y la línea de venta con bandas. Si dice «Lectura poco confiable», úsala como orientación.

## Análisis: línea de tendencia y página corta (2026-10-08)
La línea de tendencia siempre va acompañada de su rango, su nivel de confianza y la leyenda «no es un pronóstico». Si no hay base (menos de 4 períodos seguidos, sin ventas ahora) se explica por qué no hay línea; nunca se dibuja una proyección vacía. Los nombres de entidad son enlaces al detalle; los filtros secundarios, el Forecast anterior, el detalle temporal y los registros fuente viven en bloques plegados.

## Borrar en Recovery y avisos de llave duplicada (2026-10-08)
Borrar siempre pide confirmación y dice qué más se va (mediciones, vínculos). Sólo se borra lo que el usuario creó o eligió; el catálogo base y las propuestas no tienen botón de borrar. Un aviso de conflicto debe nombrar la llave completa, la métrica que difiere y qué hacer.


- **Cuadre entre módulos (2026-10-08).** Diagnóstico › Categoría/Producto/Región, la vista Producto y Análisis comparan un mes contra el mes anterior de calendario (y un mes en curso contra los mismos días del anterior); un rango libre, contra los N días previos. Bajo «Nivel 2» aparece una nota de cuadre contra el titular: si el titular excluye días sin dato en uno de los periodos, la nota muestra ambas cifras y la diferencia. Prueba: `batch_xmod.py`.


- **Tráfico y conversión · «Qué explica el cambio de la venta» (2026-10-08).** Primera tarjeta de la página: titular con el cambio de venta, cascada tráfico → conversión → ticket, «Qué mirar primero» (frases por monto), mezcla del CR, tabla de efectos por segmento (barras, efecto dominante, «distinguible del azar» / «no concluyente») y, debajo, «Todas las dimensiones». Son diferencias matemáticas, no causas. Pruebas: `test-traffic-conversion.js`, `batch_decomp.py`.

### Análisis y Tráfico y conversión (2026-10-08)
- «Diagnosticar esto» (Lectura de la entidad) y «Diagnosticar este periodo» (Contribución) llevan el mismo canal, comparación y periodo al Diagnóstico; si el periodo es semana o día se abre su mes y se avisa.
- «Descargar CSV» / «Descargar lectura» son descargas puntuales; el CSV respeta la materialidad elegida.
- El aviso «Revisa la calidad de este tráfico» señala patrones (sesiones sin pedidos, pico con CR a la baja, tráfico nuevo de baja conversión); nunca afirma que sea tráfico no humano.
- Si «Otros» reúne el 25 % o más del tráfico, la tarjeta de efectos lo dice con el porcentaje; sus efectos se leen como bloque.
- Contribución respeta la materialidad elegida y avisa cuántas entidades oculta; el cambio neto incluye todas.

## Añadido 2026-10-09 · Inicio con resumen general
- Debajo de «¿Qué está pasando?» (que no cambia) hay cuatro bloques: **Por qué cambió la venta** (cascada tráfico → conversión → ticket, mismos días en ambos periodos), **Dónde mirar hoy** (segmento que más pesó por dimensión de GA4 y aviso de calidad del tráfico, con «Diagnosticar»), **Cómo va cada canal** (venta acumulada, cumplimiento, forecast vs meta y estado de pacing; elegir un canal cambia el Canal de Inicio) y **Confianza de los datos** (venta real hasta, días comparados, calidad y fechas de segmentos/productos).
- Cada bloque trae «De dónde sale y qué pasa sin datos» (desplegable). Sin periodo anterior (por ejemplo, el año completo sin año anterior) el bloque 1 lo dice; con «Total digital» y un canal sin sesiones (WhatsApp, Llamadas) muestra solo el cambio de venta y explica por qué no separa tráfico y conversión.
- Los estados de canal usan las etiquetas de pacing existentes (Arriba del plan, En plan, Debajo del plan); no hay umbrales nuevos.

## Añadido 2026-10-09 · Inicio simplificado (Fase 1 del plan de simplificación)
- Con venta real, Inicio abre con **«Lo esencial»**: ¿Cómo voy? (cumplimiento, gap, forecast de cierre, forecast vs meta), ¿Por qué? (tráfico, conversión y ticket) y ¿Qué hago hoy? (siguiente paso, dónde mirar y aviso de calidad), más el estado de cada canal y el respaldo (venta real hasta, días comparados, calidad).
- Todo lo demás sigue en la página, plegado en **«Ver más»** (todas las cifras, cascada, segmentos, canales, confianza) y **«Metodología y ayuda»** (recorrido, preparación de datos, siguiente paso y convenciones). Lo que la persona abre se mantiene abierto al cambiar de canal o periodo.
- Regla del proyecto: no se omite ningún dato; si algo no es clave, va en «Ver más» con los mismos números. Sin datos o solo con plan, Inicio sigue como antes.

## Añadido 2026-10-09 · Marco global limpio (Fase 2 del plan de simplificación)
- El distintivo «Fase 9.1.x · Propósito y acción por vista» salió del encabezado y pasó al pie de la página (el dato sigue ahí).
- «Siguiente paso» cuando la cadena está completa ya no se llama «Monitorear» (llevaba a Medir y aprender): ahora dice «Medir y aprender».
- La advertencia de datos se muestra una sola vez como ficha (encabezado); la barra de contexto solo explica («Algunos cálculos pueden estar incompletos») y enlaza a Calidad de datos.

## Añadido 2026-10-09 · Pacing & Forecast (Fase 3 del plan de simplificación)
- Arriba va la respuesta: cumplimiento, gap y forecast del total y por canal, y las alertas. Fecha de referencia, método y métrica quedan compactos debajo (se ven siempre, porque cambian la respuesta).
- El detalle va en **«Ver más»** con los mismos números: pacing por periodo, índices, métodos, eventos, versiones y parámetros. No se omite ningún dato.
- Inicio: «¿Cómo voy?» incluye la **venta real en $** y el plan a la fecha.
