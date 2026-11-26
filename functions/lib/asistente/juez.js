// Generador por inventario, juez y validación determinista de la ruta general.

import { aliasDelRegistro, entradaPorId } from './registro.js';
import { extraerMontos, validarTextoComercial } from './guardas.js';
import { evidenciaPorId } from './rag.js';

export const PROMPT_GENERADOR = `Redacte solo desde la evidencia entregada. No use conocimiento propio. No mencione precios salvo que la evidencia sea el registro y el dato esté en la afirmación.

Devuelva SOLO JSON:
{"afirmaciones":[{"id":"c1","texto":"una afirmación breve en español formal","referencia":"id de la evidencia o id del registro"}]}
Cada afirmación debe ser atómica: un solo dato comercial y un solo servicio. Si la evidencia no alcanza, devuelva {"afirmaciones":[]}. No incluya texto_final.`;

export const PROMPT_JUEZ = `Verifique cada afirmación del inventario contra la evidencia y el registro. No reformule textos. Devuelva SOLO JSON:
{"aprobado":true,"afirmaciones":[{"id":"c1","texto":"texto exacto del inventario","respaldo":"cita","referencia":"id de evidencia"}]}
respaldo solo puede ser "lista", "cita" o "ninguno". Si una afirmación no se puede mapear unívocamente a la lista o a una cita vigente, use "ninguno" y aprobado=false. En ruta mixta, si una afirmación depende de la premisa falsa, use "ninguno".`;

function clavesExactas(obj, esperadas) {
  const claves = Object.keys(obj || {}).sort();
  const exp = [...esperadas].sort();
  return claves.length === exp.length && claves.every((c, i) => c === exp[i]);
}

export function validarInventario(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, motivo: 'no-objeto' };
  // C3(a): cualquier texto_final del modelo se ignora; no forma parte de la respuesta.
  const { texto_final: _ignorado, ...resto } = obj;
  if (!clavesExactas(resto, ['afirmaciones'])) return { ok: false, motivo: 'claves-invalidas' };
  if (!Array.isArray(resto.afirmaciones) || resto.afirmaciones.length === 0) return { ok: false, motivo: 'sin-afirmaciones' };
  if (resto.afirmaciones.length > 6) return { ok: false, motivo: 'demasiadas-afirmaciones' };
  const ids = new Set();
  for (const a of resto.afirmaciones) {
    if (!a || typeof a !== 'object' || !clavesExactas(a, ['id', 'texto', 'referencia'])) return { ok: false, motivo: 'afirmacion-claves-invalidas' };
    if (!/^c[1-9][0-9]*$/.test(a.id) || ids.has(a.id)) return { ok: false, motivo: 'id-invalido' };
    ids.add(a.id);
    if (typeof a.texto !== 'string' || a.texto.trim().length === 0) return { ok: false, motivo: 'texto-vacio' };
    if (typeof a.referencia !== 'string' || a.referencia.trim().length === 0) return { ok: false, motivo: 'referencia-vacia' };
  }
  return { ok: true, afirmaciones: resto.afirmaciones };
}

export function validarVeredictoJuez(obj, inventario, evidencia, registro, opciones = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, aprobado: false, motivo: 'no-objeto' };
  if (!clavesExactas(obj, ['aprobado', 'afirmaciones'])) return { ok: false, aprobado: false, motivo: 'claves-invalidas' };
  if (typeof obj.aprobado !== 'boolean') return { ok: false, aprobado: false, motivo: 'aprobado-no-booleano' };
  if (!Array.isArray(obj.afirmaciones) || obj.afirmaciones.length === 0) return { ok: false, aprobado: false, motivo: 'sin-afirmaciones' };
  const invPorId = new Map(inventario.map((a) => [a.id, a]));
  if (obj.afirmaciones.length !== inventario.length) return { ok: false, aprobado: false, motivo: 'conteo-distinto' };
  const vistos = new Set();
  for (const v of obj.afirmaciones) {
    if (!v || typeof v !== 'object' || !clavesExactas(v, ['id', 'texto', 'respaldo', 'referencia'])) return { ok: false, aprobado: false, motivo: 'veredicto-claves-invalidas' };
    if (vistos.has(v.id) || !invPorId.has(v.id)) return { ok: false, aprobado: false, motivo: 'id-fuera-del-inventario' };
    vistos.add(v.id);
    const inv = invPorId.get(v.id);
    if (v.texto !== inv.texto) return { ok: false, aprobado: false, motivo: 'texto-distinto' };
    if (!['lista', 'cita', 'ninguno'].includes(v.respaldo)) return { ok: false, aprobado: false, motivo: 'respaldo-invalido' };
    if (typeof v.referencia !== 'string') return { ok: false, aprobado: false, motivo: 'referencia-invalida' };
    if (v.respaldo === 'ninguno') return { ok: false, aprobado: false, motivo: 'sin-respaldo' };
    if (v.referencia !== inv.referencia) return { ok: false, aprobado: false, motivo: 'referencia-distinta' };
    if (!opciones.permitirPrecioRegistro && extraerMontos(inv.texto).length > 0) return { ok: false, aprobado: false, motivo: 'precio-en-ruta-general' };
    if (v.respaldo === 'cita' && extraerMontos(inv.texto).length > 0) return { ok: false, aprobado: false, motivo: 'precio-con-cita' };
    if (v.respaldo === 'cita' && !evidenciaPorId(evidencia, v.referencia)) return { ok: false, aprobado: false, motivo: 'cita-inexistente' };
    if (v.respaldo === 'lista' && !entradaPorId(registro, v.referencia) && v.referencia !== 'registro') return { ok: false, aprobado: false, motivo: 'lista-inexistente' };
    const validacion = validarTextoComercial(inv.texto, registro, { aliasServicio: aliasDelRegistro(registro) });
    if (!validacion.ok) return { ok: false, aprobado: false, motivo: 'guarda-o-puerta', validacion };
  }
  if (vistos.size !== invPorId.size) return { ok: false, aprobado: false, motivo: 'conjunto-distinto' };
  return { ok: true, aprobado: obj.aprobado === true, motivo: obj.aprobado ? 'aprobado' : 'juez-rechazo' };
}

export function ensamblarRespuesta(inventario, evidencia) {
  return inventario.map((a) => {
    const ev = evidenciaPorId(evidencia, a.referencia);
    const fuente = ev ? ` (Fuente: ${ev.titulo})` : '';
    return a.texto.trim() + fuente;
  }).join(' ');
}
