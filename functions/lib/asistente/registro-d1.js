// Lectura coherente del registro en D1, época, auditoría y publicación.

import { REGISTRO_V210, validarRegistro } from './registro.js';

export const SQL_SNAPSHOT = `SELECT v.version AS version, v.hash AS hash, v.contenido AS contenido, e.epoch AS epoch, e.ruta_precio_activa AS ruta_precio_activa, e.motivo AS motivo FROM registro_versiones v JOIN registro_estado e ON e.id = 1 WHERE v.activo = 1 LIMIT 1;`;
export const SQL_EPOCH = `SELECT epoch FROM registro_estado WHERE id = 1 LIMIT 1;`;

export async function leerSnapshot(env) {
  if (env?.DB) {
    const fila = await env.DB.prepare(SQL_SNAPSHOT).first();
    if (!fila) throw new Error('registro-sin-version-activa');
    const registro = JSON.parse(fila.contenido);
    const validacion = validarRegistro(registro);
    if (!validacion.ok) throw new Error('registro-invalido:' + validacion.motivos.join(','));
    return {
      registro,
      version: fila.version,
      hash: fila.hash,
      epoch: fila.epoch,
      rutaPrecioActiva: fila.ruta_precio_activa === 1,
      motivo: fila.motivo || null,
      fuente: 'd1',
    };
  }
  if (env?.ASSISTANT_ALLOW_BUNDLED_REGISTER === '1') {
    return { registro: REGISTRO_V210, version: REGISTRO_V210.version, hash: 'bundled', epoch: 0, rutaPrecioActiva: true, motivo: null, fuente: 'bundled' };
  }
  throw new Error('registro-no-disponible');
}

export async function leerEpoch(env, snapshot = null) {
  if (env?.DB) {
    const fila = await env.DB.prepare(SQL_EPOCH).first();
    if (!fila || !Number.isInteger(fila.epoch)) throw new Error('epoch-no-disponible');
    return fila.epoch;
  }
  if (snapshot) return snapshot.epoch;
  throw new Error('epoch-no-disponible');
}

export async function leerEpochConReintento(env, snapshot = null) {
  try {
    return { ok: true, epoch: await leerEpoch(env, snapshot) };
  } catch {
    try {
      return { ok: true, epoch: await leerEpoch(env, snapshot) };
    } catch {
      return { ok: false, epoch: null };
    }
  }
}

export async function hashMensaje(mensaje, env) {
  const fecha = new Date().toISOString().slice(0, 10);
  const sal = env?.AUDIT_SALT_SECRET || 'sin-sal-configurada';
  const datos = new TextEncoder().encode(fecha + '|' + sal + '|' + String(mensaje || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function registrarAuditoria(env, evento) {
  if (!env?.DB) return { ok: false, motivo: 'sin-d1' };
  try {
    await env.DB.prepare(`INSERT INTO auditoria_asistente (creado_en, version_linealizacion, epoch_antes, epoch_despues, publicacion_durante_ventana, ruta, etiqueta, confianza, puerta_ok, juez_ok, motivo, hash_mensaje) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`)
      .bind(
        evento.creado_en,
        evento.version_linealizacion,
        evento.epoch_antes,
        evento.epoch_despues,
        evento.publicacion_durante_ventana,
        evento.ruta,
        evento.etiqueta,
        evento.confianza,
        evento.puerta_ok ? 1 : 0,
        evento.juez_ok ? 1 : 0,
        evento.motivo || null,
        evento.hash_mensaje,
      ).run();
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: String(e?.message || e) };
  }
}

export async function insertarVersionInactiva(db, registro, hash) {
  const validacion = validarRegistro(registro);
  if (!validacion.ok) throw new Error('registro-invalido:' + validacion.motivos.join(','));
  await db.prepare(`INSERT INTO registro_versiones (version, hash, contenido, publicado_en, activo) VALUES (?, ?, ?, ?, 0);`)
    .bind(registro.version, hash, JSON.stringify(registro), new Date().toISOString()).run();
}

export async function activarVersion(db, version) {
  const existente = await db.prepare(`SELECT version FROM registro_versiones WHERE version = ?;`).bind(version).first();
  if (!existente) return { ok: false, motivo: 'version-inexistente' };
  const ahora = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE registro_versiones SET activo = 0 WHERE activo = 1;`),
    db.prepare(`UPDATE registro_versiones SET activo = 1 WHERE version = ?;`).bind(version),
    db.prepare(`UPDATE registro_estado SET epoch = epoch + 1, actualizado_en = ? WHERE id = 1;`).bind(ahora),
  ]);
  return { ok: true };
}

export async function revertirVersion(db, version) {
  return activarVersion(db, version);
}

export async function desactivarRutaPrecio(db, motivo) {
  await db.prepare(`UPDATE registro_estado SET ruta_precio_activa = 0, motivo = ?, actualizado_en = ? WHERE id = 1;`)
    .bind(motivo, new Date().toISOString()).run();
}
