# PROCEDIMIENTO ACOPLADO DE ACTUALIZACIÓN DE PRECIOS — JEFQ Consultor

Fecha: 2026-11-24. Estado: documentado (cierra C-U5 en la V2.2). Entra al repositorio del sitio en `docs/procedimiento-cambio-precio.md` en el momento de construir.

## Regla de fondo

Un precio cambia solo si cambian juntos `src/data/precios.ts` y el registro (D1, tabla `registro_versiones`). Nunca se edita el registro a mano sin pasar por `precios.ts`. Sin cambio de precios hasta después de los primeros 3 clientes (decisión de Jaime vigente).

## Pasos

1. **Jaime aprueba el cambio de precio.** Sin su aprobación no se toca nada.
2. **Editar `src/data/precios.ts`** (única fuente de precios publicados).
3. **Regenerar el registro en D1:** nueva versión + SHA-256 del contenido.
4. **Correr `scripts/verificar-precios.mjs`:** 34/34 PASS obligatorio. Si falla, se para aquí.
5. **Comprobar que el hash de `precios.ts` coincide con el hash del registro.** Si difiere, la ruta de precio queda desactivada (regla de §6 de la V2.1) y se para.
6. **Desplegar en prueba y correr la batería de precios.**
7. **Desplegar en producción y comprobar en vivo** (precio de cada servicio en la página y en el asistente).
8. **Registrar el cambio:** versión del registro, hash, fecha, quién lo aprobó.

## Si algo falla

Si cualquier paso falla, no se despliega y la ruta de precio queda desactivada hasta resolverlo. El asistente sigue respondiendo preguntas generales y la respuesta fija para precios, con derivación a WhatsApp.
