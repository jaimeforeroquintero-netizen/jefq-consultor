// Genera el SQL de publicación del registro V2.10 sin tocar D1.
// Uso: node scripts/generar-registro-asistente.mjs

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { REGISTRO_V210, validarRegistro } from '../functions/lib/asistente/registro.js';

const precios = readFileSync(new URL('../src/data/precios.ts', import.meta.url));
const hashPrecios = createHash('sha256').update(precios).digest('hex');
const validacion = validarRegistro(REGISTRO_V210);
if (!validacion.ok) {
  console.error('Registro inválido:', validacion.motivos.join(', '));
  process.exit(1);
}
if (REGISTRO_V210.fuente_hash !== hashPrecios) {
  console.error(`Hash de precios.ts no coincide: registro=${REGISTRO_V210.fuente_hash} archivo=${hashPrecios}`);
  process.exit(1);
}
const contenido = JSON.stringify(REGISTRO_V210);
const hashRegistro = createHash('sha256').update(contenido).digest('hex');
const esc = (s) => s.replace(/'/g, "''");
console.log(`-- Registro V2.10 v${REGISTRO_V210.version}; hash=${hashRegistro}; fuente_hash=${hashPrecios}`);
console.log(`INSERT INTO registro_versiones (version, hash, contenido, publicado_en, activo) VALUES (${REGISTRO_V210.version}, '${hashRegistro}', '${esc(contenido)}', '${new Date().toISOString()}', 0);`);
console.log('-- Tras validar 34/34, hash y batería en prueba, activar con:');
console.log('UPDATE registro_versiones SET activo = 0 WHERE activo = 1;');
console.log(`UPDATE registro_versiones SET activo = 1 WHERE version = ${REGISTRO_V210.version};`);
console.log("UPDATE registro_estado SET epoch = epoch + 1, actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = 1;");
