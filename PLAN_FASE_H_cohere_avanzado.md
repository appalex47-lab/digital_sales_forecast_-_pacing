# Plan — Fase H (Cohere avanzado) · borrador para aprobar

## Qué encontré en el código (inspección)
- **Salidas estructuradas: ya existen.** `cohereClient.chatJson` envía `response_format: { type: 'json_object', json_schema }` y lo usan Diagnóstico, Acciones, Narrativa y el mapeo de columnas (con esquema propio).
- **Protección de datos personales: ya existe en el mapeo.** `normalize.looksPersonal` detecta por nombre de columna y por contenido (correo, teléfono de 10 dígitos o más, RFC, CURP); esas columnas viajan sin ejemplos. No cubre nombres de personas ni direcciones por contenido, ni identificadores numéricos de cliente.
- **Aprendizaje de mapeos: ya existe** (`aiHeaderAliases` en Ajustes, `learnHeaderMappings`, también en el Worker). **No hay pantalla** para ver, corregir o borrar lo aprendido.
- **Clasificación del tipo de archivo: solo determinística.** `canonical.detectDataset` marca ambigüedad y alternativas, pero no consulta a Cohere y la revisión no explica qué columnas dejaron dudas.
- **Registro de lo enviado a Cohere: no existe.**
- **Validación del mapeo:** campo existente, confianza mínima 0.78, sin destinos duplicados (ya en `suggestHeaderMappingWithAI`); las ambigüedades no se registran.

## Propuesta por partes (en orden de valor)
1. **H1 · Registro de transparencia:** lista de cada consulta a Cohere (para qué, cuántas columnas, cuántos ejemplos enviados, cuántas columnas protegidas), solo en la sesión y sin los valores. Esfuerzo S.
2. **H2 · Lo aprendido:** pantalla en Ajustes para ver, corregir y borrar los mapeos que la IA guardó. Esfuerzo S.
3. **H3 · Protección más amplia:** detectar por contenido nombres de personas y direcciones y números tipo identificador de cliente; marcar columnas como «datos personales» a mano; mostrar en la revisión cuáles se protegieron. Esfuerzo M.
4. **H4 · Ambigüedad del tipo de archivo:** cuando `detectDataset` dude entre dos tipos, consultar a Cohere solo con encabezados y aceptar únicamente una de las alternativas; la revisión muestra el motivo y se puede corregir con «Cargar como». Esfuerzo M.
5. **H5 · Registro de ambigüedades del mapeo:** qué columnas quedaron dudosas (baja confianza, dos candidatos) y por qué. Esfuerzo S.
6. **H6 · Evaluación:** pruebas con respuestas simuladas para cada caso (respuesta inválida, campo inventado, confianza baja, columna con datos personales). Esfuerzo S.

No cambia: Cohere nunca decide calidad de datos ni calcula; el mapeo estático y las equivalencias siempre van primero.
