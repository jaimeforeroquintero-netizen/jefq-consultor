# Construcción del asistente V2.10 — decisiones de implementación

Estado: construcción autorizada por Jaime el 2026-11-26. Este documento cierra los puntos que el re-voto dejó como condición antes de construir la ruta de precio y servicio. No autoriza despliegue: la batería integral, la medición de carga, la verificación de telemetría y la confirmación del mapeo producto→servicio siguen siendo portones de despliegue.

## Quién produce la afirmación comercial

El productor es un selector determinista en código (`functions/lib/asistente/registro.js`), no el modelo.

- El clasificador solo enruta: devuelve etiqueta, fragmentos y confianza. No elige `id_registro`, `campo` ni `valor`.
- Si la etiqueta es 1 y la intención es precio o servicio, el selector lee el mensaje actual, resuelve la entidad contra el registro y detecta el campo pedido con reglas cerradas.
- El selector produce como máximo una afirmación `{id_registro, tipo_hecho, campo, valor}`. El valor siempre sale del registro activo.
- La plantilla determinista es la única autora del texto comercial. El modelo no redacta precios, coberturas ni condiciones.
- Si el selector no resuelve exactamente una entidad y un campo, no adivina: responde con aclaración sin precio o con la respuesta cerrada, según el caso.

## Resolución de alias e ids

La resolución usa coincidencia de frase completa sobre texto normalizado (minúsculas, sin tildes, ñ→n, puntuación convertida a espacios y espacios colapsados).

1. Se recogen todas las coincidencias de alias del registro.
2. Se ordenan por posición y, a igual posición, por longitud descendente.
3. Se aceptan coincidencias no solapadas. Así, «Diagnóstico Esencial» gana sobre el alias anidado «Diagnóstico».
4. Si quedan dos entidades distintas, la respuesta no entrega un precio: pide precisar o cierra.
5. Si el mismo alias apunta a servicio y producto («Hardening»), decide el campo pedido: precio y cobertura de producto usan `prod-hardening`; existencia y descripción general del servicio usan `svc-hardening`. Si el campo no decide, no se entrega precio.
6. «Diagnóstico» sin apellido no tiene un único precio: se pide precisar entre Diagnóstico Esencial, Evaluación Pyme y Seguridad Integral, sin entregar cifras en esa aclaración.

## Una sola afirmación y cobertura

Una afirmación es un campo de un id. La cobertura es un campo cuyo valor es una lista de ítems atómicos del registro.

- Cada ítem de cobertura se valida al cargar el registro: debe ser texto breve y no puede introducir un segundo dato comercial fuera del campo.
- La plantilla puede nombrar el campo («incluye») sin que esa palabra cuente como dato adicional; la guarda secundaria revisa el resto del texto y cualquier número no autorizado.
- Precio y cobertura en el mismo mensaje son dos campos: no se responden en una sola respuesta de precio/servicio.
- Dos productos en el mismo mensaje son dos ids: no se responden con dos precios en una sola respuesta.

## Ruta mixta

El esquema del clasificador V2.10 admite dos fragmentos solo para la etiqueta 4: uno `legitima` y uno `falsa`. Para las demás etiquetas admite un fragmento `sostiene`.

- Cada fragmento debe ser subcadena del mensaje actual normalizado. El historial no valida fragmentos.
- La parte legítima se resuelve desde su fragmento, no desde todo el mensaje.
- La parte falsa recibe la respuesta fija.
- El juez confirma la separación con los criterios de la ruta mixta. Si algo falla, sale la respuesta cerrada completa.

## Publicación y época

La época vive en `registro_estado`, no en la fila de la versión.

- La lectura de linealización es una sola sentencia que trae versión activa, contenido, hash, época y `ruta_precio_activa`.
- Publicar inserta primero la versión con `activo = 0`, valida con esa versión inactiva y solo después activa en una transacción que incrementa `epoch`.
- Revertir reactiva la versión anterior en una transacción que también incrementa `epoch`.
- El despliegue de prueba lee una versión inactiva solo por un parámetro interno de prueba; el endpoint público nunca acepta versión desde el visitante.
- La comprobación de hash contra `precios.ts` se hace contra la versión candidata durante la validación, no contra la activa vieja, para que un despliegue nuevo no se bloquee a sí mismo.

## Sin modelo

Sin modelo rige una lista blanca, no una lista negra.

Solo se responde un precio si el mensaje es corto, contiene una palabra de precio de la lista blanca, resuelve exactamente una entidad con precio y no contiene dígitos, `$`, `%`, comparaciones, autoridad inventada ni palabras de condición o presuposición. En cualquier otro caso sale la respuesta cerrada.

## Portones que siguen abiertos

- Confirmación de Jaime del mapeo producto→servicio antes de cargar el registro en producción.
- Batería integral con cantidades y criterio de aprobado; la asimetría de casos tramposos sigue siendo decisión de Jaime antes de declarar resultados.
- Medición de carga y neuronas en despliegue de prueba.
- Verificación documental de telemetría y retención.
- Pruebas de carrera y reversión en despliegue de prueba.
