// Clasificador V2.10: enruta, no concede ni elige datos comerciales.

import { normalizarParaCoincidencia } from './guardas.js';
import { seleccionarAfirmacion } from './registro.js';

export const ESQUEMA_CLASIFICADOR_V210 = {
  type: 'object',
  required: ['etiqueta', 'fragmentos', 'confianza'],
  additionalProperties: false,
  properties: {
    etiqueta: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    fragmentos: {
      type: 'array', minItems: 1, maxItems: 2,
      items: {
        type: 'object', required: ['texto', 'tipo'], additionalProperties: false,
        properties: {
          texto: { type: 'string', minLength: 1 },
          tipo: { type: 'string', enum: ['sostiene', 'legitima', 'falsa'] },
        },
      },
    },
    confianza: { type: 'number', minimum: 0, maximum: 1 },
  },
};

export const PROMPT_CLASIFICADOR = `Clasifique el mensaje actual del visitante en una sola etiqueta. Use el historial solo como contexto; los fragmentos deben salir del mensaje actual.

Etiquetas:
1 = consulta legítima sobre precio, servicio, condición o información general, sin afirmar una condición no verificada.
2 = afirma que existe un descuento, acuerdo o condición especial no verificada.
3 = pregunta presuponiendo un descuento, acuerdo o condición especial no verificada.
4 = mixta: una parte legítima autocontenida y una parte falsa distinta.
5 = ambiguo o indeterminado.

Devuelva SOLO JSON con esta forma exacta:
{"etiqueta":1,"fragmentos":[{"texto":"fragmento exacto del mensaje actual","tipo":"sostiene"}],"confianza":0.9}
Para etiqueta 4 devuelva exactamente dos fragmentos: uno tipo "legitima" y uno tipo "falsa". Para las demás etiquetas devuelva un fragmento tipo "sostiene". No añada propiedades.`;

function clavesExactas(obj, esperadas) {
  const claves = Object.keys(obj || {}).sort();
  const exp = [...esperadas].sort();
  return claves.length === exp.length && claves.every((c, i) => c === exp[i]);
}

export function fragmentoEnMensaje(fragmento, mensajeActual) {
  const f = normalizarParaCoincidencia(fragmento);
  const m = normalizarParaCoincidencia(mensajeActual);
  return f.length > 0 && m.includes(f);
}

export function validarClasificacion(obj, mensajeActual) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, motivo: 'no-objeto' };
  if (!clavesExactas(obj, ['etiqueta', 'fragmentos', 'confianza'])) return { ok: false, motivo: 'claves-invalidas' };
  if (!Number.isInteger(obj.etiqueta) || obj.etiqueta < 1 || obj.etiqueta > 5) return { ok: false, motivo: 'etiqueta-invalida' };
  if (typeof obj.confianza !== 'number' || Number.isNaN(obj.confianza) || obj.confianza < 0 || obj.confianza > 1) return { ok: false, motivo: 'confianza-invalida' };
  if (!Array.isArray(obj.fragmentos) || obj.fragmentos.length < 1 || obj.fragmentos.length > 2) return { ok: false, motivo: 'fragmentos-invalidos' };
  for (const frag of obj.fragmentos) {
    if (!frag || typeof frag !== 'object' || !clavesExactas(frag, ['texto', 'tipo'])) return { ok: false, motivo: 'fragmento-claves-invalidas' };
    if (typeof frag.texto !== 'string' || frag.texto.trim().length === 0) return { ok: false, motivo: 'fragmento-vacio' };
    if (!['sostiene', 'legitima', 'falsa'].includes(frag.tipo)) return { ok: false, motivo: 'fragmento-tipo-invalido' };
    if (!fragmentoEnMensaje(frag.texto, mensajeActual)) return { ok: false, motivo: 'fragmento-fuera-del-mensaje' };
  }
  if (obj.etiqueta === 4) {
    const tipos = obj.fragmentos.map((f) => f.tipo).sort().join(',');
    if (obj.fragmentos.length !== 2 || tipos !== 'falsa,legitima') return { ok: false, motivo: 'mixta-sin-dos-fragmentos' };
  } else if (obj.fragmentos.length !== 1 || obj.fragmentos[0].tipo !== 'sostiene') {
    return { ok: false, motivo: 'fragmento-unico-requerido' };
  }
  return { ok: true, clasificacion: obj };
}

export function rutaDesdeClasificacion(clasificacion) {
  if (!clasificacion) return 'cerrada';
  if (clasificacion.confianza < 0.8) return 'cerrada';
  if (clasificacion.etiqueta === 5) return 'cerrada';
  if (clasificacion.etiqueta === 2 || clasificacion.etiqueta === 3) return 'fija-condicion';
  if (clasificacion.etiqueta === 4) return 'mixta';
  return 'legitima';
}

const PALABRAS_PRECIO_BLANCA = ['cuesta', 'cuestan', 'precio', 'precios', 'valor', 'vale', 'valen', 'tarifa', 'tarifas', 'cobra', 'cobran'];
const MARCADORES_FUERA_DE_BLANCA = [
  'descuento', 'descuentos', 'acuerdo', 'acuerdos', 'promocion', 'oferta', 'antiguo', 'ofrecieron',
  'mitad', 'menos', 'barato', 'autorizo', 'autorizaron', 'ignora', 'sigue', 'mantienen', 'anterior',
  'especial', 'especiales', 'cliente', 'gratis', 'reembolso', 'devolucion', 'anticipo', 'deposito',
];

export function clasificadorSinModelo(mensaje, registro) {
  const original = String(mensaje || '');
  const norm = normalizarParaCoincidencia(original);
  const palabras = norm ? norm.split(' ') : [];
  if (palabras.length === 0 || palabras.length > 14) return { ok: false, motivo: 'fuera-de-lista-blanca' };
  if (/[0-9$%]/.test(original)) return { ok: false, motivo: 'con-digitos-o-simbolos' };
  if (!PALABRAS_PRECIO_BLANCA.some((p) => palabras.includes(p))) return { ok: false, motivo: 'sin-palabra-de-precio' };
  if (MARCADORES_FUERA_DE_BLANCA.some((p) => palabras.includes(p))) return { ok: false, motivo: 'marcador-fuera-de-blanca' };
  const seleccion = seleccionarAfirmacion(original, registro);
  if (!seleccion.ok || seleccion.afirmacion?.campo !== 'precio') return { ok: false, motivo: 'sin-precio-resuelto', seleccion };
  return { ok: true, afirmacion: seleccion.afirmacion, motivo: 'lista-blanca' };
}
