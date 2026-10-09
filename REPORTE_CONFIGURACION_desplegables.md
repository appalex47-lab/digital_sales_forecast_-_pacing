# Reporte — Configuración ordenada en desplegables

## Qué se pidió
La pantalla de Configuración estaba muy revuelta: una lista larga de paneles abiertos y, al final, el formulario de Negocio suelto. Pedido: que cada sección sea un desplegable para que todo esté acomodado.

## Qué se hizo (`js/ui/settings-view.js`, `index.html`, `css/design-system.css`)
- **11 secciones, todas desplegables y cerradas al entrar**, cada una con su título (h3) y un **resumen de una línea visible aunque esté cerrada**: Estado (año y motor), Modo de uso (Aprendiz/Analista), Otras preferencias (cuántas), Fuentes de datos («1 de 2 fuentes con datos»), Equivalencias (cuántas), Almacenamiento, Conexión con Cohere («Sin API key · IA activada»), Qué se envió a Cohere (consultas de la sesión), Lo que la IA aprendió (columnas), Datos personales (marcadas a mano) y Negocio (nombre y moneda, o «Sin configurar»).
- **Tres grupos con rótulo:** Herramienta, Datos, Inteligencia artificial, más Negocio. Un índice arriba lleva a cada sección y **la abre** si estaba cerrada.
- **Botones «Expandir todo» y «Contraer todo».**
- **Recuerdan su estado**: lo que abres sigue abierto cuando la pantalla se repinta (por ejemplo, al cambiar el modo de uso) y al salir y volver; todo vuelve a cerrado al recargar la página (el estado vive en la sesión).
- Los enlaces que llevan a una sección desde otras pantallas (la píldora de estado, el enlace de Negocio) abren su desplegable y le dan el foco.
- **Negocio** ya no es un bloque largo suelto: es un desplegable más (su contenido y su formulario no cambian; el subtítulo interno pasó de «Negocio» a «Contexto del negocio»).
- La página de Configuración con todo cerrado mide ~1,900 px en escritorio (antes ~5,700).
- Accesibilidad: el encabezado de cada sección es el botón que la abre (Enter y Espacio), mide al menos 48 px de alto, tiene foco visible y los encabezados no saltan de nivel.

## Pruebas ejecutadas
- `batch_al.py` (nuevo, 18; falla en la versión anterior): 11 desplegables y su orden, todos cerrados con título y resumen, rótulos de grupo, encabezados sin saltos, resúmenes que reflejan el estado real y se actualizan, expandir y contraer todo (incluido Negocio, que vive en el HTML), estado conservado al repintar y al volver, enlaces que abren y enfocan, teclado, objetivo táctil de 44 px en celular y sin desborde de 320 a 1920 px con todo cerrado y con todo abierto.
- Ajustadas por la nueva estructura (los controles de Configuración están dentro de desplegables): `batch_aj`, `batch_ak`, `batch_i` y `batch_j` expanden todo antes de usar sus controles; la batería y la auditoría de accesibilidad miden los desplegables abiertos y la ficha de estado por `textContent`.
- Regresión: motor 206/206; lint; contraste; batería del mismo día contra la última entrega (7 exports idénticos, sin errores de consola; Configuración conserva las mismas 4 tablas con las mismas celdas, en otro orden, y solo se agregan dos botones y textos); resto de lotes (ver el mensaje de entrega).

## Defectos encontrados y corregidos durante la construcción
- Negocio quedaba fuera de los desplegables (es HTML estático, no lo pinta la pantalla de Configuración).
- Los enlaces a una sección (la píldora de estado y el enlace de Negocio) dejaron de enfocarla: ahora el desplegable se abre y recibe el foco.
- El resumen del modo de uso mostraba vacío (el catálogo son pares id y etiqueta).

- Al medir con todos los desplegables abiertos, la auditoría táctil encontró un defecto que ya existía y estaba escondido: dos botones «?» de un encabezado de tabla de Resumen (dentro de «Calcular metas desde el histórico») tenían su área de toque tapada por la columna vecina. Se corrigió con relleno en los encabezados que terminan en «?» (solo en pantallas táctiles o angostas).

## Limitaciones
- El estado abierto/cerrado no se guarda entre sesiones: al recargar, todo vuelve a cerrado.
- Las ayudas «?» de algunas tablas siguen donde estaban; no se rediseñó el contenido de cada sección, solo su acomodo.
