// Generador por inventario, juez y validación determinista de la ruta general.

import { aliasDelRegistro, entradaPorId } from './registro.js';
import { extraerMontos, validarTextoComercial } from './guardas.js';
import { evidenciaPorId } from './rag.js';

export const ESQUEMA_GENERADOR_V210 = {
  type: 'object',
  required: ['afirmaciones'],
  additionalProperties: false,
  properties: {
    afirmaciones: {
      type: 'array', minItems: 0, maxItems: 6,
      items: {
        type: 'object', required: ['id', 'texto', 'referencia'], additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^c[1-9][0-9]*$' },
          texto: { type: 'string', minLength: 1 },
          referencia: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

export const ESQUEMA_JUEZ_V210 = {
  type: 'object',
  required: ['aprobado', 'afirmaciones'],
  additionalProperties: false,
  properties: {
    aprobado: { type: 'boolean' },
    afirmaciones: {
      type: 'array', minItems: 1, maxItems: 6,
      items: {
        type: 'object', required: ['id', 'texto', 'respaldo', 'referencia'], additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^c[1-9][0-9]*$' },
          texto: { type: 'string', minLength: 1 },
          respaldo: { type: 'string', enum: ['lista', 'cita', 'ninguno'] },
          referencia: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

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

function normalizarTexto(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function validarInventario(obj, evidencia = []) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, motivo: 'no-objeto' };
  // C3(a): cualquier texto_final del modelo se ignora; no forma parte de la respuesta.
  const { texto_final: _ignorado, ...resto } = obj;
  if (!clavesExactas(resto, ['afirmaciones'])) return { ok: false, motivo: 'claves-invalidas' };
  if (!Array.isArray(resto.afirmaciones) || resto.afirmaciones.length === 0) return { ok: false, motivo: 'sin-afirmaciones' };
  if (resto.afirmaciones.length > 6) return { ok: false, motivo: 'demasiadas-afirmaciones' };
  const ids = new Set();
  const afirmaciones = [];
  for (const a of resto.afirmaciones) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return { ok: false, motivo: 'afirmacion-claves-invalidas' };
    // Normalización: se conservan solo las claves del contrato; las claves
    // extra del modelo no invalidan el inventario.
    const norm = { id: a.id, texto: a.texto, referencia: a.referencia };
    // Reparación determinista: los id son etiquetas internas; si el modelo
    // usa otro formato, se reasignan en orden c1..cn antes del juez.
    if (!/^c[1-9][0-9]*$/.test(norm.id) || ids.has(norm.id)) norm.id = `c${afirmaciones.length + 1}`;
    ids.add(norm.id);
    if (typeof norm.texto !== 'string' || norm.texto.trim().length === 0) return { ok: false, motivo: 'texto-vacio' };
    if (typeof norm.referencia !== 'string' || norm.referencia.trim().length === 0) {
      // Reparación determinista: la referencia se asigna solo si el texto de
      // la afirmación aparece en exactamente una evidencia.
      const textoNorm = normalizarTexto(norm.texto);
      const tokens = new Set(textoNorm.split(' ').filter((t) => t.length > 2));
      const puntuadas = (evidencia || []).map((e) => {
        const evNorm = normalizarTexto(e.texto);
        if (textoNorm.length > 0 && evNorm.includes(textoNorm)) return { id: e.id, score: 1 };
        if (tokens.size === 0) return { id: e.id, score: 0 };
        const evTokens = new Set(evNorm.split(' '));
        let hits = 0;
        for (const t of tokens) if (evTokens.has(t)) hits++;
        return { id: e.id, score: hits / tokens.size };
      }).sort((a, b) => b.score - a.score);
      if (!puntuadas[0] || puntuadas[0].score < 0.4 || (puntuadas[1] && puntuadas[0].score - puntuadas[1].score < 0.15)) return { ok: false, motivo: 'referencia-vacia' };
      norm.referencia = puntuadas[0].id;
    }
    afirmaciones.push(norm);
  }
  return { ok: true, afirmaciones };
}

export function validarVeredictoJuez(obj, inventario, evidencia, registro, opciones = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, aprobado: false, motivo: 'no-objeto' };
  if (!clavesExactas(obj, ['aprobado', 'afirmaciones'])) return { ok: false, aprobado: false, motivo: 'claves-invalidas' };
  if (typeof obj.aprobado !== 'boolean') return { ok: false, aprobado: false, motivo: 'aprobado-no-booleano' };
  if (!Array.isArray(obj.afirmaciones) || obj.afirmaciones.length === 0) return { ok: false, aprobado: false, motivo: 'sin-afirmaciones' };
  const invPorId = new Map(inventario.map((a) => [a.id, a]));
  if (obj.afirmaciones.length !== inventario.length) return { ok: false, aprobado: false, motivo: 'conteo-distinto' };
  const vistos = new Set();
  for (const v0 of obj.afirmaciones) {
    if (!v0 || typeof v0 !== 'object' || Array.isArray(v0)) return { ok: false, aprobado: false, motivo: 'veredicto-claves-invalidas' };
    // Normalización: solo las claves del contrato; las extra no invalidan.
    const v = { id: v0.id, texto: v0.texto, respaldo: v0.respaldo, referencia: v0.referencia };
    if (vistos.has(v.id) || !invPorId.has(v.id)) return { ok: false, aprobado: false, motivo: 'id-fuera-del-inventario' };
    vistos.add(v.id);
    const inv = invPorId.get(v.id);
    if (v.texto !== inv.texto) return { ok: false, aprobado: false, motivo: 'texto-distinto' };
    // Reparación determinista: si el juez puso el id de la evidencia en
    // «respaldo» y omitió «referencia», se reubica sin cambiar su decisión.
    if (!['lista', 'cita', 'ninguno'].includes(v.respaldo) && typeof v.respaldo === 'string' && (typeof v.referencia !== 'string' || v.referencia.trim().length === 0)) {
      const esEvidencia = Boolean(evidenciaPorId(evidencia, v.respaldo));
      const esRegistro = Boolean(entradaPorId(registro, v.respaldo)) || v.respaldo === 'registro';
      if (esEvidencia || esRegistro) {
        v.referencia = v.respaldo;
        v.respaldo = esEvidencia ? 'cita' : 'lista';
      }
    }
    if (!['lista', 'cita', 'ninguno'].includes(v.respaldo)) return { ok: false, aprobado: false, motivo: 'respaldo-invalido' };
    // Reparación determinista: respaldo «cita» sin referencia usable toma la
    // referencia del inventario (la decisión de respaldo sigue siendo del juez).
    if (v.respaldo === 'cita' && (typeof v.referencia !== 'string' || v.referencia.trim().length === 0)) v.referencia = inv.referencia;
    if (typeof v.referencia !== 'string') return { ok: false, aprobado: false, motivo: 'referencia-invalida' };
    if (v.respaldo === 'ninguno') return { ok: false, aprobado: false, motivo: 'sin-respaldo' };
    // Reparación determinista: «lista» con referencia de evidencia es «cita».
    if (v.respaldo === 'lista' && evidenciaPorId(evidencia, v.referencia)) v.respaldo = 'cita';
    if (v.referencia !== inv.referencia) {
      // El juez puede citar otra evidencia válida que respalde el texto.
      const evJuez = evidenciaPorId(evidencia, v.referencia);
      const tokens = new Set(normalizarTexto(inv.texto).split(' ').filter((t) => t.length > 2));
      const evTokens = new Set(normalizarTexto(evJuez?.texto || '').split(' '));
      let hits = 0;
      for (const t of tokens) if (evTokens.has(t)) hits++;
      if (!evJuez || tokens.size === 0 || hits / tokens.size < 0.4) return { ok: false, aprobado: false, motivo: 'referencia-distinta' };
      inv.referencia = v.referencia;
    }
    if (!opciones.permitirPrecioRegistro && extraerMontos(inv.texto).length > 0) return { ok: false, aprobado: false, motivo: 'precio-en-ruta-general' };
    if (v.respaldo === 'cita' && extraerMontos(inv.texto).length > 0) return { ok: false, aprobado: false, motivo: 'precio-con-cita' };
    if (v.respaldo === 'cita' && !evidenciaPorId(evidencia, v.referencia)) return { ok: false, aprobado: false, motivo: 'cita-inexistente' };
    if (v.respaldo === 'lista' && !entradaPorId(registro, v.referencia) && v.referencia !== 'registro') return { ok: false, aprobado: false, motivo: 'lista-inexistente' };
    const validacion = validarTextoComercial(inv.texto, registro, { aliasServicio: aliasDelRegistro(registro), permitirNoAtomica: v.respaldo === 'cita' });
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
