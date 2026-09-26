# UX_GUIDE.md — Cómo usar Digital Sales Forecast & Pacing

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
