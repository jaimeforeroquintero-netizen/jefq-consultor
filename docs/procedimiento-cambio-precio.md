# Procedimiento de cambio de precio — asistente V2.10

Este procedimiento reemplaza la secuencia anterior para el registro del asistente. Ningún precio cambia sin aprobación expresa de Jaime. La regla vigente sigue siendo: sin cambio de precios hasta después de los primeros 3 clientes.

1. Jaime aprueba el cambio de precio.
2. Editar `src/data/precios.ts`, única fuente de precios publicados.
3. Regenerar el registro candidato desde el código del asistente y calcular su hash.
4. Insertar la versión candidata en D1 con `activo = 0`. Nunca sirve tráfico sin validar.
5. Validar con la versión inactiva:
   - `node scripts/verificar-precios.mjs` con 34/34 PASS.
   - Hash de `src/data/precios.ts` igual al `fuente_hash` del registro candidato.
   - Pruebas del asistente y batería de precios en despliegue de prueba.
   - El despliegue de prueba lee la versión inactiva solo por el mecanismo interno de prueba; el endpoint público no acepta versión desde el visitante.
6. Si cualquier validación falla, se para. La versión activa anterior sigue sirviendo o la ruta de precio se desactiva en `registro_estado` con motivo registrado.
7. Activar en una sola transacción: desactivar la anterior, activar la candidata e incrementar `epoch` en `registro_estado`.
8. Comprobar en vivo la página y el asistente.
9. Si producción falla tras desplegar, revertir reactivando la versión anterior en una transacción que incremente `epoch`, desactivar la ruta de precio con motivo y registrar el incidente.
10. Registrar versión, hash, fecha y aprobación.

La comprobación de hash se hace contra la versión candidata durante la validación. No se compara el código nuevo contra el registro activo viejo para bloquear el propio despliegue.
