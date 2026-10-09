# Guía de pruebas para el usuario · Tráfico y conversión (partes 1, 2 y 3) y arreglos

Prepara antes: un CSV exportado de GA4 (Fecha, Plataforma, Categoría de dispositivo, Fuente/medio de la sesión, Campaña de la sesión, Página de destino y cadena de consulta, Nuevo/Recurrente, Sesiones, Compras en comercio electrónico, Ingresos derivados de las compras) de **al menos dos meses** (por ejemplo agosto y septiembre), para que haya periodo anterior y tendencia.

## Parte 0 · Carga
1. Carga de datos → Segmentos → sube el CSV de GA4. Debe aparecer un aviso «export de GA4 convertido (N filas de GA4 → M filas de segmentos…)». **Verifica:** el aviso se lee completo, no tapa el menú y no se sale de la pantalla (también en el celular).
2. Confirma la importación. Ve a Diagnosticar → Tráfico y conversión, elige **Mes = septiembre** y **Canal = Total digital**.
3. **Compara contra GA4:** en Dimensión = Dispositivo, la suma de Tráfico debe ser igual a las Sesiones de GA4 para septiembre en web + Android + iOS; Pedidos = Compras; Venta = Ingresos. Canal = App debe sumar Android + iOS.

## Parte 1 · Hallazgos, mapa, oportunidad y rankings
4. «Lo que destaca»: ¿las frases mencionan segmentos que tú reconoces como relevantes? Revisa que «Mayor oportunidad de conversión» sea un segmento con mucho tráfico y CR bajo.
5. Mapa: cada círculo debe estar en el cuadrante que dice la columna «Cuadrante» de la tabla. Pasa el cursor por un círculo: muestra nombre, % del tráfico y CR.
6. Oportunidad estimada: comprueba una fila a mano: Tráfico × (CR del total − CR del segmento) × AOV = monto.
7. Rankings: un segmento con muy pocas sesiones (por ejemplo una campaña pequeña) **no** debe aparecer en «Mejor CR» aunque su CR sea alto; debe decir «Poco volumen» en la tabla.
8. Cambia a Dimensión = Campaña y a Landing: si hay muchas campañas, revisa si las etiquetas del mapa se enciman (dímelo).

## Parte 2 · Qué explica el cambio, AOV bajo, calidad, nuevos y recurrentes
9. «Qué explica el cambio»: el cambio total debe ser la venta de septiembre menos la de agosto (total de la dimensión). En cada ganador o perdedor, Efecto tráfico + Efecto CR + Efecto AOV = Δ venta.
10. «AOV bajo con buen volumen»: los segmentos listados tienen ticket más de 15 % debajo del total y al menos 30 pedidos.
11. Calidad: en Dimensión = Campaña, si «Sin dato (not set)» pasa del 5 % del tráfico, la primera frase de «Lo que destaca» lo avisa.
12. «Nuevos y recurrentes»: los % de tráfico suman 100 %; los CR coinciden con GA4 (compras ÷ sesiones por tipo de usuario).

## Parte 3 · Cruce, tendencia y «Simular»
13. Dimensión = «Dispositivo × Fuente/medio»: busca «Móvil · google / cpc» (o la combinación que más te importe) y compárala con GA4 filtrando esa combinación.
14. «Tendencia semanal del CR»: las minigráficas deben subir o bajar como el CR semanal en GA4; «A la baja» o «Al alza» solo cuando el cambio es claro.
15. En «Oportunidad estimada», pulsa **Simular** en un segmento: debe abrir Recovery Center con el mismo canal y periodo, un escenario precargado con nombre «Llevar «segmento» al CR del total» y un aviso con la equivalencia. Revisa el resultado y guarda solo si te sirve.

## Arreglos
16. Avisos: en el celular y en la computadora, sube un archivo con nombre largo; el aviso no debe salirse ni tapar el menú, y debe durar lo suficiente para leerlo.
17. Narrativa ejecutiva → «Redactar con Cohere» varias veces. Si Cohere inventa una cifra, ahora se reintenta una vez sola; si aun así falla, el aviso dice que fue un cálculo propio y que se reintentó. Anota cuántas veces sale bien y cuántas no.

Si algo no cuadra, mándame captura del valor en RevNavigator y el mismo valor en GA4.

## Añadido 2026-10-08 · prueba con tus datos
1. **Calidad del tráfico.** En Tráfico y conversión, abre Fuente/medio y Dispositivo × Fuente/medio. Si aparece «Revisa la calidad de este tráfico», comprueba en GA4 que ese segmento realmente tenga ese salto de sesiones y ese CR. Dime si los avisos te parecen demasiados o muy pocos (umbrales: tráfico ×2 y CR a menos de la mitad).
2. **Diagnosticar esto.** En Análisis, selecciona una entidad y pulsa «Diagnosticar esto»: el Diagnóstico debe abrir el mismo canal, periodo y comparación.
3. **Descargas.** «Descargar CSV» en Contribución: la suma de la columna «cambio» debe ser el cambio total del periodo.
