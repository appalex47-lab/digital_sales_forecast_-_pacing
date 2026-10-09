# Reporte — Fase H · Cohere avanzado (transparencia y control de la IA)

Ejecuta el plan `PLAN_FASE_H_cohere_avanzado.md` (H1 a H6). Cohere sigue siendo un asistente semántico: nunca decide calidad de datos ni calcula; el mapeo estático y las equivalencias siempre van primero.

## Qué se encontró (inspección) y qué se hizo
| Parte | Estado antes | Cambio |
|---|---|---|
| H1 Registro de transparencia | No existía | `js/ai/cohereAudit.js`: cada consulta que sale del navegador deja una línea (para qué, modelo, columnas, ejemplos enviados, columnas protegidas con su motivo, tamaño y resultado). Solo en la sesión y en memoria; **nunca guarda valores de ejemplo ni respuestas**; máximo 100. Una consulta que no salió (sin API key) no se registra. `chatJson` registra todo; Diagnóstico, Acciones y Narrativa llevan su propósito. Panel «Qué se envió a Cohere en esta sesión» en Ajustes, con «Borrar el registro». |
| H2 Lo aprendido | Se guardaba pero no se podía ver | Panel «Lo que la IA ya aprendió» en Ajustes: cambiar el campo de cada columna, olvidarla u olvidar todo; se guarda con las preferencias y sobrevive a recargar. Al olvidar una, la IA vuelve a preguntar. |
| H3 Protección ampliada | Solo correo, teléfono, RFC, CURP y encabezados básicos | Por **nombre** (paciente, receta, diagnóstico, domicilio, código postal, ID de cliente, usuario, titular…), por **contenido** (nombres de persona, domicilios, identificadores numéricos largos, UUID, IP, además de correo, teléfono, RFC y CURP) y **columnas marcadas a mano** en Ajustes. La columna viaja solo con su encabezado, sin ejemplos; la revisión muestra qué columnas se protegieron y por qué. Ante la duda se protege: los falsos positivos cuestan ejemplos, no datos. |
| H4 Tipo de archivo ambiguo | Solo reglas | `js/ai/cohereDataset.js`: si `detectDataset` duda entre dos tipos, consulta a Cohere **solo con encabezados** y los tipos candidatos; acepta únicamente un candidato con confianza ≥ 0.70; si no, conserva las reglas y avisa. La revisión dice «Resuelto con ayuda de la IA» y por qué. No bloquea y se corrige con «Cargar como». |
| H5 Ambigüedades del mapeo | No se registraban | El esquema pide alternativas; `suggestHeaderMappingWithAI` devuelve `doubtful` (confianza baja, campo ya asignado, dos candidatos cercanos con su alternativa) y `protectedColumns`; la revisión muestra «Columnas dudosas» con el motivo y lo que no se asignó. |
| H6 Pruebas | — | `batch_aj.py` (49 comprobaciones, con Cohere simulado) |

Salidas estructuradas: ya existían (`response_format` con `json_schema`) y las usan el mapeo, el tipo de archivo, Diagnóstico, Acciones y Narrativa.

## Decisiones de diseño
- Las columnas dudosas con dos candidatos cercanos **sí se asignan** al más probable y se señalan para revisión; las de confianza baja o con campo ya usado no se asignan.
- Los motivos de protección se anotan por columna (nombre, contenido o marcada por ti) para poder auditar por qué una columna viajó sin ejemplos.
- El registro de transparencia vive solo en memoria a propósito (no es un historial persistente de datos del usuario).

## Pruebas ejecutadas
- `batch_aj.py` (nuevo, 49; falla en la versión anterior): 19 casos de protección (13 que sí son personales y 6 que no) y columna marcada a mano; registro con propósito, columnas, ejemplos y protegidas, consulta que falla por la red, consulta que no salió y tope de 100; de punta a punta en el flujo normal **y** en el Worker (6 columnas personales sin ejemplos, solo los de «Monto vendido» sí viajan; el registro no contiene ningún valor; mismos resultados en los dos flujos); columnas dudosas; lo aprendido (aparece, se cambia y persiste tras recargar, se olvida y la IA vuelve a preguntar, «olvidar todo»); columnas marcadas a mano (sin vacías ni repetidas, persisten); el registro en Ajustes y «Borrar»; tipo de archivo con ayuda de la IA (respuesta válida, tipo que no era candidato, confianza baja, respuesta vacía, IA desactivada, sin API key, archivo no ambiguo, y que no viaja ningún valor).
- Regresión: motor 206/206; lint; contraste; batería del mismo día contra la última entrega (7 exports idénticos, sin errores de consola; solo cambian los controles y textos nuevos de Ajustes); Worker `batch_ac` 23/23; IA en archivos grandes `batch_ag`; carga, importación grande, guardado incremental; fases A y B; GA4; Segmentos; Tráfico y conversión; Productos; calidad; periodo y canal; clasificación; Inicio; diseño; modos; accesibilidad (3,166 controles con foco visible, 0 sin contorno, 0 contraste bajo AA, 0 objetivos táctiles < 44 px).

## Hallazgos durante la construcción
- Un encabezado como «Observaciones» ya es un campo conocido de Venta real: no es una columna desconocida y nunca se envía; mi primera prueba lo daba por enviado.
- Una columna de solo dígitos y largo (12) se etiquetaba «teléfono»; ahora se etiqueta «identificador numérico largo» (el motivo es solo informativo: ambas se protegen).

## Limitaciones
- La protección por contenido es heurística: puede proteger de más (por ejemplo, valores de dos palabras con mayúscula como «Ciudad de México») y puede no detectar datos personales sin patrón reconocible. Para eso existe el marcado a mano.
- Las consultas de Diagnóstico, Acciones y Narrativa se registran con su propósito y tamaño, pero no con columnas (envían resultados ya calculados, no columnas del archivo).
- El registro y las columnas dudosas viven en la sesión; las columnas protegidas a mano y lo aprendido sí se guardan.
- Se probó con respuestas simuladas de Cohere, no con la API real.
