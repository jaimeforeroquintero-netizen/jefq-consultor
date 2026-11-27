/**
 * Asistente V2.10 de JEFQ Consultor.
 * Recibe { messages: [{ role: "user" | "assistant", content: string }] }
 * y responde { reply: string }.
 *
 * Arquitectura: el clasificador enruta; el registro manda en lo comercial;
 * un selector determinista produce la afirmación de precio/servicio; la
 * plantilla redacta ese texto; la ruta general genera por inventario y pasa
 * por puerta numérica, guardas y juez antes de entregarse.
 */

import { withSentry } from '../_sentry.js';
import { contar, ipCliente } from '../lib/redis.js';
import { ESQUEMA_CLASIFICADOR_V210, PROMPT_CLASIFICADOR, clasificadorSinModelo, normalizarClasificacion, rutaDesdeClasificacion, validarClasificacion } from '../lib/asistente/clasificador.js';
import { extraerMontos, validarTextoComercial } from '../lib/asistente/guardas.js';
import { ESQUEMA_GENERADOR_V210, ESQUEMA_JUEZ_V210, PROMPT_GENERADOR, PROMPT_JUEZ, ensamblarRespuesta, validarInventario, validarVeredictoJuez } from '../lib/asistente/juez.js';
import { crearPresupuestoLlamadas, llamarModeloJSON } from '../lib/asistente/modelo.js';
import { buscarCorpusLocal, buscarEvidencia } from '../lib/asistente/rag.js';
import {
  RESPUESTA_CERRADA,
  RESPUESTA_FIJA_CONDICION,
  RESPUESTA_PRECIO_DESACTIVADA,
  RESPUESTA_SIN_VERIFICAR,
  aclaracionDiagnostico,
  aliasDelRegistro,
  respuestaDesdeAfirmacion,
  seleccionarAfirmacion,
} from '../lib/asistente/registro.js';
import { hashMensaje, leerEpoch, leerEpochConReintento, leerSnapshot, registrarAuditoria } from '../lib/asistente/registro-d1.js';

const DEFAULT_MODEL = '@cf/ibm-granite/granite-4.0-h-micro';

function toAiMessages(messages) {
  return messages
    .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.trim().slice(0, 2000),
    }));
}

async function limiteExcedido(request, env, nombre) {
  const ip = ipCliente(request).replace(/[^0-9a-fA-F.:]/g, '').slice(0, 40) || 'desconocida';
  const ventana = Math.floor(Date.now() / 60000);
  const c = await contar(env, `jefq:rl:${nombre}:${ip}:${ventana}`, 120);
  if (!c.ok) return false;
  return c.count > 30;
}

function respuestaJSON(reply, status = 200) {
  return new Response(JSON.stringify({ reply }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textoHistorial(history) {
  return history.map((m) => `${m.role === 'assistant' ? 'Asistente' : 'Visitante'}: ${m.content}`).join('\n');
}


const LEXICO_CONDICION_TEXTO = /(descuento|promoci[oó]n|promo|oferta|gratis|2x1|mitad|rebaja|bonificaci[oó]n|cup[oó]n|precio especial|tarifa preferencial|acuerdo|condici[oó]n especial|sin costo|sin cargo)/i;

// Un texto extractivo solo se entrega si pasa la puerta numérica y las
// guardas, no trae montos ni léxico de condición y cita su fuente.
function extractivoSeguro(texto, registro) {
  if (extraerMontos(texto).length > 0) return false;
  if (LEXICO_CONDICION_TEXTO.test(texto)) return false;
  return validarTextoComercial(texto, registro, { permitirNoAtomica: true, aliasServicio: aliasDelRegistro(registro) }).ok;
}

async function rutaGeneral(env, modelo, presupuesto, snapshot, consulta, contextoExtra = '') {
  const evidencia = await buscarEvidencia(env, consulta, 4);
  if (evidencia.length === 0) return { reply: RESPUESTA_SIN_VERIFICAR, ruta: 'general-sin-evidencia', puerta_ok: true, juez_ok: false, motivo: 'sin-evidencia' };
  const evidenciaTexto = evidencia.map((e) => `[${e.id}] ${e.titulo} (${e.url})\n${e.texto}`).join('\n\n');
  const gen = await llamarModeloJSON(env, {
    modelo,
    sistema: PROMPT_GENERADOR,
    usuario: `Consulta del visitante:\n${consulta}\n\n${contextoExtra}\nEvidencia vigente:\n${evidenciaTexto}`,
    presupuesto,
    maxTokens: 1024,
    esquema: ESQUEMA_GENERADOR_V210,
  });
  if (!gen.ok) return { reply: RESPUESTA_CERRADA, ruta: 'general', puerta_ok: false, juez_ok: false, motivo: gen.motivo };
  const inv = validarInventario(gen.json, evidencia);
  if (!inv.ok) {
    const tokensQ = new Set(consulta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length > 3));
    const mejor = evidencia.map((e) => {
      const evTokens = new Set(`${e.titulo} ${e.texto}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/));
      let hits = 0;
      for (const t of tokensQ) {
        for (const et of evTokens) { let cp = 0; while (cp < t.length && cp < et.length && t[cp] === et[cp]) cp++; if (et === t || (cp >= 4) || (cp >= 3 && Math.abs(t.length - et.length) <= 3 && t.length >= 5 && et.length >= 5)) { hits++; break; } }
      }
      return { e, score: tokensQ.size ? hits / tokensQ.size : 0 };
    }).sort((a, b) => b.score - a.score)[0];
    if (mejor && mejor.score >= 0.34 && extractivoSeguro(mejor.e.texto, snapshot.registro)) {
      return { reply: `${mejor.e.texto} (Fuente: ${mejor.e.titulo})`, ruta: 'general', puerta_ok: true, juez_ok: false, motivo: 'extractivo' };
    }
    return { reply: RESPUESTA_CERRADA, ruta: 'general', puerta_ok: false, juez_ok: false, motivo: inv.motivo };
  }
  const juez = await llamarModeloJSON(env, {
    modelo,
    sistema: PROMPT_JUEZ,
    usuario: `Inventario:\n${JSON.stringify(inv.afirmaciones)}\n\nEvidencia:\n${evidenciaTexto}\n\nRegistro comercial resumido (sin precios; los precios no se entregan en esta ruta):\n${JSON.stringify({ version: snapshot.version, hay_descuentos: snapshot.registro.descuentos.length > 0, hay_acuerdos: snapshot.registro.acuerdos !== 'ninguno', entradas: snapshot.registro.entradas.map((e) => ({ id: e.id, nombre: e.nombre, unidad: e.unidad })) })}\n${contextoExtra}`,
    presupuesto,
    maxTokens: 1024,
    esquema: ESQUEMA_JUEZ_V210,
  });
  if (!juez.ok) return { reply: RESPUESTA_CERRADA, ruta: 'general', puerta_ok: false, juez_ok: false, motivo: juez.motivo };
  const veredicto = validarVeredictoJuez(juez.json, inv.afirmaciones, evidencia, snapshot.registro);
  if (!veredicto.ok || !veredicto.aprobado) {
    // Respaldo extractivo: si una evidencia responde directamente, se entrega
    // su texto publicado tal cual, sin afirmaciones del modelo.
    const tokensQ = new Set(consulta.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length > 3));
    const mejor = evidencia.map((e) => {
      const evTokens = new Set(`${e.titulo} ${e.texto}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/));
      let hits = 0;
      for (const t of tokensQ) {
        for (const et of evTokens) { let cp = 0; while (cp < t.length && cp < et.length && t[cp] === et[cp]) cp++; if (et === t || (cp >= 4) || (cp >= 3 && Math.abs(t.length - et.length) <= 3 && t.length >= 5 && et.length >= 5)) { hits++; break; } }
      }
      return { e, score: tokensQ.size ? hits / tokensQ.size : 0 };
    }).sort((a, b) => b.score - a.score)[0];
    if (mejor && mejor.score >= 0.34 && extractivoSeguro(mejor.e.texto, snapshot.registro)) {
      return { reply: `${mejor.e.texto} (Fuente: ${mejor.e.titulo})`, ruta: 'general', puerta_ok: true, juez_ok: false, motivo: 'extractivo' };
    }
    return { reply: RESPUESTA_CERRADA, ruta: 'general', puerta_ok: veredicto.motivo !== 'guarda-o-puerta', juez_ok: false, motivo: veredicto.motivo };
  }
  const afirmacionesResueltas = inv.afirmaciones.map((a) => ({ ...a, referencia: veredicto.referencias?.[a.id] ?? a.referencia }));
  return { reply: ensamblarRespuesta(afirmacionesResueltas, evidencia), ruta: 'general', puerta_ok: true, juez_ok: true, motivo: 'aprobado' };
}

async function rutaPrecioServicio(snapshot, mensaje) {
  const seleccion = seleccionarAfirmacion(mensaje, snapshot.registro);
  const campos = seleccion.campos || (seleccion.campo ? [seleccion.campo] : []);
  const esPrecio = campos.includes('precio') || seleccion.motivo === 'diagnostico-ambiguo';
  const renderizar = () => {
    const respuesta = respuestaDesdeAfirmacion(seleccion.afirmacion, snapshot.registro);
    if (!respuesta.ok) return { reply: RESPUESTA_CERRADA, ruta: 'precio-servicio', puerta_ok: false, juez_ok: false, motivo: respuesta.motivo };
    const guarda = validarTextoComercial(respuesta.texto, snapshot.registro, { campo: seleccion.afirmacion.campo, afirmacion: seleccion.afirmacion });
    if (!guarda.ok) return { reply: RESPUESTA_CERRADA, ruta: 'precio-servicio', puerta_ok: false, juez_ok: false, motivo: 'plantilla-no-atomica' };
    return { reply: respuesta.texto, ruta: 'precio-servicio', puerta_ok: true, juez_ok: false, motivo: seleccion.motivo, afirmacion_id: seleccion.afirmacion.id_registro };
  };
  if (!snapshot.rutaPrecioActiva) {
    if (esPrecio) {
      return { reply: RESPUESTA_PRECIO_DESACTIVADA, ruta: 'precio-desactivada', puerta_ok: true, juez_ok: false, motivo: snapshot.motivo || 'ruta-precio-desactivada' };
    }
    if (seleccion.ok) return renderizar();
    return null;
  }
  if (seleccion.ok) return renderizar();
  if (seleccion.motivo === 'condicion-no-verificada') {
    return { reply: RESPUESTA_FIJA_CONDICION, ruta: 'fija-condicion', puerta_ok: true, juez_ok: false, motivo: seleccion.motivo };
  }
  if (seleccion.motivo === 'diagnostico-ambiguo') {
    return { reply: aclaracionDiagnostico(), ruta: 'aclaracion', puerta_ok: true, juez_ok: false, motivo: seleccion.motivo };
  }
  if (seleccion.motivo === 'sin-entidad') return null;
  if (esPrecio || campos.includes('cobertura') || seleccion.motivo === 'varios-campos') {
    return { reply: RESPUESTA_CERRADA, ruta: 'precio-servicio', puerta_ok: true, juez_ok: false, motivo: seleccion.motivo };
  }
  return null;
}

async function rutaMixta(env, modelo, presupuesto, snapshot, clasificacion, mensajeActual) {
  const legitima = clasificacion.fragmentos.find((f) => f.tipo === 'legitima')?.texto || '';
  const falsa = clasificacion.fragmentos.find((f) => f.tipo === 'falsa')?.texto || '';
  const contexto = `Ruta mixta. Fragmento legítimo: ${JSON.stringify(legitima)}. Fragmento falso: ${JSON.stringify(falsa)}. La respuesta legítima no puede depender de la premisa falsa.`;
  const precio = await rutaPrecioServicio(snapshot, legitima);
  if (precio && precio.ruta !== 'precio-servicio') {
    return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: true, juez_ok: false, motivo: precio.motivo };
  }
  if (precio && precio.ruta === 'precio-servicio') {
    if (!precio.puerta_ok) return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: false, juez_ok: false, motivo: precio.motivo };
    const inventario = [{ id: 'c1', texto: precio.reply, referencia: precio.afirmacion_id }];
    const juez = await llamarModeloJSON(env, {
      modelo,
      sistema: PROMPT_JUEZ,
      usuario: `Inventario:\n${JSON.stringify(inventario)}\n\n${contexto}\nConfirme la separación: la afirmación debe sostenerse sin usar la premisa falsa.`,
      presupuesto,
      maxTokens: 512,
      esquema: ESQUEMA_JUEZ_V210,
    });
    if (!juez.ok) return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: false, juez_ok: false, motivo: juez.motivo };
    const veredicto = validarVeredictoJuez(juez.json, inventario, [], snapshot.registro, { permitirPrecioRegistro: true });
    if (!veredicto.ok || !veredicto.aprobado) return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: true, juez_ok: false, motivo: veredicto.motivo };
    const combinada = `${precio.reply} ${RESPUESTA_FIJA_CONDICION}`;
    if (!combinada.startsWith(precio.reply) || !combinada.endsWith(RESPUESTA_FIJA_CONDICION)) {
      return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: false, juez_ok: false, motivo: 'combinada-invalida' };
    }
    return { reply: combinada, ruta: 'mixta', puerta_ok: true, juez_ok: true, motivo: 'separacion-confirmada' };
  }
  const general = await rutaGeneral(env, modelo, presupuesto, snapshot, legitima, contexto);
  if (general.ruta !== 'general' || !general.juez_ok) return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: general.puerta_ok, juez_ok: false, motivo: general.motivo };
  return { reply: `${general.reply} ${RESPUESTA_FIJA_CONDICION}`, ruta: 'mixta', puerta_ok: true, juez_ok: true, motivo: 'separacion-confirmada' };
}

async function procesarIntento(env, modelo, presupuesto, snapshot, history, mensajeActual) {
  if (!env.AI) {
    if (!snapshot.rutaPrecioActiva) {
      const precio = await rutaPrecioServicio(snapshot, mensajeActual);
      if (precio) return { ...precio, etiqueta: null, confianza: null };
      return { reply: RESPUESTA_CERRADA, ruta: 'sin-modelo', etiqueta: null, confianza: null, puerta_ok: true, juez_ok: false, motivo: 'ruta-precio-desactivada' };
    }
    const sinModelo = clasificadorSinModelo(mensajeActual, snapshot.registro);
    if (sinModelo.ok) {
      const respuesta = respuestaDesdeAfirmacion(sinModelo.afirmacion, snapshot.registro);
      if (respuesta.ok) return { reply: respuesta.texto, ruta: 'sin-modelo', etiqueta: 1, confianza: 1, puerta_ok: true, juez_ok: false, motivo: 'lista-blanca' };
    }
    return { reply: RESPUESTA_CERRADA, ruta: 'sin-modelo', etiqueta: null, confianza: null, puerta_ok: true, juez_ok: false, motivo: sinModelo.motivo };
  }

  const clas = await llamarModeloJSON(env, {
    modelo,
    sistema: PROMPT_CLASIFICADOR,
    usuario: `Historial reciente:\n${textoHistorial(history)}\n\nMensaje actual del visitante:\n${mensajeActual}`,
    presupuesto,
    maxTokens: 512,
    esquema: ESQUEMA_CLASIFICADOR_V210,
  });
  if (!clas.ok) {
    if (!snapshot.rutaPrecioActiva) {
      const precio = await rutaPrecioServicio(snapshot, mensajeActual);
      if (precio) return { ...precio, etiqueta: null, confianza: null };
    }
    if (clas.motivo === 'error-modelo' || clas.motivo === 'sin-modelo' || clas.motivo === 'json-invalido') {
      const sinModelo = clasificadorSinModelo(mensajeActual, snapshot.registro);
      if (sinModelo.ok && snapshot.rutaPrecioActiva) {
        const respuesta = respuestaDesdeAfirmacion(sinModelo.afirmacion, snapshot.registro);
        if (respuesta.ok) return { reply: respuesta.texto, ruta: 'sin-modelo', etiqueta: 1, confianza: 1, puerta_ok: true, juez_ok: false, motivo: 'lista-blanca-tras-error' };
      }
      // Sin clasificador, el selector determinista aún resuelve precio,
      // cobertura y aclaraciones sin modelo.
      const precio = await rutaPrecioServicio(snapshot, mensajeActual);
      if (precio) return { ...precio, etiqueta: null, confianza: null };
    }
    return { reply: RESPUESTA_CERRADA, ruta: 'clasificacion', etiqueta: null, confianza: null, puerta_ok: false, juez_ok: false, motivo: clas.motivo };
  }
  const validada = validarClasificacion(normalizarClasificacion(clas.json), mensajeActual);
  if (!validada.ok) {
    // Reparación: clasificación inválida sin léxico de condición se trata
    // como consulta legítima; la guarda de condición decide después.
    const sintetizada = { etiqueta: 1, fragmentos: [{ texto: mensajeActual, tipo: 'sostiene' }], confianza: 0.8 };
    const clasificacion = sintetizada;
    const ruta = rutaDesdeClasificacion(clasificacion);
    const base = { etiqueta: clasificacion.etiqueta, confianza: clasificacion.confianza };
    const LEXICO_CONDICION = LEXICO_CONDICION_TEXTO;
    if (LEXICO_CONDICION.test(mensajeActual)) {
      return { reply: RESPUESTA_FIJA_CONDICION, ruta: 'fija-condicion', ...base, puerta_ok: true, juez_ok: false, motivo: 'guarda-condicion' };
    }
    const precio = await rutaPrecioServicio(snapshot, mensajeActual);
    if (precio) return { ...precio, ...base };
    const general = await rutaGeneral(env, modelo, presupuesto, snapshot, mensajeActual);
    return { ...general, ...base };
  }
  const clasificacion = validada.clasificacion;
  const ruta = rutaDesdeClasificacion(clasificacion);
  const base = { etiqueta: clasificacion.etiqueta, confianza: clasificacion.confianza };
  // Guarda determinista de condición: ningún mensaje con léxico de descuento,
  // acuerdo o condición especial llega a la ruta general o de precio.
  const LEXICO_CONDICION = /(descuento|promoci[oó]n|oferta|gratis|2x1|mitad|rebaja|bonificaci[oó]n|cup[oó]n|precio especial|acuerdo|condici[oó]n especial|sin costo|primera vez gratis)/i;
  if (ruta !== 'fija-condicion' && ruta !== 'mixta' && LEXICO_CONDICION.test(mensajeActual)) {
    return { reply: RESPUESTA_FIJA_CONDICION, ruta: 'fija-condicion', ...base, puerta_ok: true, juez_ok: false, motivo: 'guarda-condicion' };
  }
  if (ruta === 'cerrada') return { reply: RESPUESTA_CERRADA, ruta: 'cerrada', ...base, puerta_ok: true, juez_ok: false, motivo: 'incertidumbre' };
  if (ruta === 'fija-condicion') return { reply: RESPUESTA_FIJA_CONDICION, ruta: 'fija-condicion', ...base, puerta_ok: true, juez_ok: false, motivo: 'condicion-no-verificada' };
  if (ruta === 'mixta') {
    const mixta = await rutaMixta(env, modelo, presupuesto, snapshot, clasificacion, mensajeActual);
    return { ...mixta, ...base };
  }
  const precio = await rutaPrecioServicio(snapshot, mensajeActual);
  if (precio) return { ...precio, ...base };
  const general = await rutaGeneral(env, modelo, presupuesto, snapshot, mensajeActual);
  return { ...general, ...base };
}

async function handler(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method-not-allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  if (await limiteExcedido(request, env, 'chat')) {
    return respuestaJSON('Está enviando mensajes muy rápido. Espere un minuto e inténtelo de nuevo, o escríbanos por WhatsApp con el botón del sitio.', 429);
  }
  let body;
  try { body = await request.json(); } catch { body = null; }
  const history = toAiMessages(Array.isArray(body?.messages) ? body.messages : []);
  if (history.length === 0 || history[history.length - 1].role !== 'user') {
    return new Response(JSON.stringify({ error: 'bad-request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const mensajeActual = history[history.length - 1].content;
  const modelo = env.WORKERS_AI_MODEL || DEFAULT_MODEL;
  const presupuesto = crearPresupuestoLlamadas();

  let snapshot;
  try {
    snapshot = await leerSnapshot(env);
  } catch {
    return respuestaJSON(RESPUESTA_CERRADA);
  }

  let resultado = await procesarIntento(env, modelo, presupuesto, snapshot, history, mensajeActual);

  // Reintento único de la ruta general ante fallos de validación del modelo.
  if (resultado.ruta === 'general' && !resultado.juez_ok && resultado.motivo !== 'sin-evidencia' && resultado.motivo !== 'extractivo' && resultado.motivo !== 'extractivo-final' && presupuesto.intento < presupuesto.maxIntentos) {
    presupuesto.nuevoIntento();
    resultado = await procesarIntento(env, modelo, presupuesto, snapshot, history, mensajeActual);
  }

  // Respaldo extractivo final: si el resultado quedó cerrado sin ser rechazo
  // de condición, se entrega el texto publicado más cercano con su fuente.
  const LEXICO_CONDICION_FINAL = LEXICO_CONDICION_TEXTO;
  if (resultado.reply === RESPUESTA_CERRADA && LEXICO_CONDICION_FINAL.test(mensajeActual) && !['mixta', 'frescura'].includes(resultado.ruta)) {
    resultado = { reply: RESPUESTA_FIJA_CONDICION, ruta: 'fija-condicion', etiqueta: resultado.etiqueta ?? null, confianza: resultado.confianza ?? null, puerta_ok: true, juez_ok: false, motivo: 'guarda-condicion' };
  }
  if (resultado.reply === RESPUESTA_CERRADA && !['fija-condicion', 'mixta', 'frescura', 'precio-servicio', 'aclaracion'].includes(resultado.ruta) && !LEXICO_CONDICION_FINAL.test(mensajeActual)) {
    let evidencia = await buscarEvidencia(env, mensajeActual, 4);
    // Sin IA disponible (cuota o fallo), el corpus local léxico sostiene el
    // respaldo extractivo con las mismas guardas.
    const sinIA = !evidencia || evidencia.length === 0;
    if (sinIA) evidencia = buscarCorpusLocal(mensajeActual, 4);
    const ordenada = (evidencia || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const mejor = ordenada[0];
    const margen = mejor && ordenada[1] ? (mejor.score ?? 0) - (ordenada[1].score ?? 0) : 1;
    // Guarda adicional: solape de tokens pregunta↔evidencia ≥0,34.
    const VACIAS = new Set(['cuentame', 'quiero', 'saber', 'sobre', 'dice', 'jefq', 'explica', 'explicame', 'consiste', 'funciona', 'hola', 'informacion', 'buenas', 'tardes', 'gracias', 'favor', 'puedes', 'podrias', 'tiene', 'tienen', 'hace', 'hacen', 'pasa', 'despues', 'donde', 'cuando', 'cual', 'cuales', 'como', 'para', 'este', 'esta', 'esto', 'esos', 'esas', 'ofrece', 'ofrecen', 'explicas']);
    const tokensQ = new Set(mensajeActual.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((t) => t.length > 3 && !VACIAS.has(t)));
    const evTokens = new Set(mejor ? `${mejor.titulo} ${mejor.texto}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/) : []);
    let hits = 0;
    for (const t of tokensQ) {
      for (const et of evTokens) { let cp = 0; while (cp < t.length && cp < et.length && t[cp] === et[cp]) cp++; if (et === t || (cp >= 4) || (cp >= 3 && Math.abs(t.length - et.length) <= 3 && t.length >= 5 && et.length >= 5)) { hits++; break; } }
    }
    const solape = tokensQ.size ? hits / tokensQ.size : 0;
    if (mejor && (sinIA || ((mejor.score ?? 0) >= 0.45 && margen >= 0.03)) && solape >= 0.34 && extractivoSeguro(mejor.texto, snapshot.registro)) {
      resultado = { reply: `${mejor.texto} (Fuente: ${mejor.titulo})`, ruta: 'general', etiqueta: resultado.etiqueta ?? null, confianza: resultado.confianza ?? null, puerta_ok: true, juez_ok: false, motivo: 'extractivo-final' };
    }
    if (resultado.reply === RESPUESTA_CERRADA && !sinIA) {
      // Si la búsqueda semántica no supera las guardas, el corpus local
      // léxico tiene la última palabra con el mismo solape mínimo.
      const locales = buscarCorpusLocal(mensajeActual, 4);
      const mejorLocal = locales[0];
      if (mejorLocal) {
        const evLocal = new Set(`${mejorLocal.titulo} ${mejorLocal.texto}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/));
        let hitsLocal = 0;
        for (const t of tokensQ) {
          for (const et of evLocal) { let cp = 0; while (cp < t.length && cp < et.length && t[cp] === et[cp]) cp++; if (et === t || (cp >= 4) || (cp >= 3 && Math.abs(t.length - et.length) <= 3 && t.length >= 5 && et.length >= 5)) { hitsLocal++; break; } }
        }
        const solapeLocal = tokensQ.size ? hitsLocal / tokensQ.size : 0;
        if (solapeLocal >= 0.34 && extractivoSeguro(mejorLocal.texto, snapshot.registro)) {
          resultado = { reply: `${mejorLocal.texto} (Fuente: ${mejorLocal.titulo})`, ruta: 'general', etiqueta: resultado.etiqueta ?? null, confianza: resultado.confianza ?? null, puerta_ok: true, juez_ok: false, motivo: 'extractivo-final' };
        }
      }
    }
  }

  // Linealización: si la época cambió antes del envío, se reprocesa una vez.
  let epochAntes = snapshot.epoch;
  try {
    epochAntes = await leerEpoch(env, snapshot);
    if (epochAntes !== snapshot.epoch && presupuesto.intento < presupuesto.maxIntentos) {
      presupuesto.nuevoIntento();
      snapshot = await leerSnapshot(env);
      resultado = await procesarIntento(env, modelo, presupuesto, snapshot, history, mensajeActual);
      epochAntes = await leerEpoch(env, snapshot);
      if (epochAntes !== snapshot.epoch) {
        epochAntes = snapshot.epoch;
        resultado = { reply: RESPUESTA_CERRADA, ruta: 'frescura', etiqueta: resultado.etiqueta ?? null, confianza: resultado.confianza ?? null, puerta_ok: false, juez_ok: false, motivo: 'cambio-tras-reproceso' };
      }
    }
  } catch {
    epochAntes = snapshot.epoch;
    if (['precio-servicio', 'mixta', 'sin-modelo'].includes(resultado.ruta)) {
      resultado = { reply: RESPUESTA_CERRADA, ruta: 'frescura', etiqueta: resultado.etiqueta ?? null, confianza: resultado.confianza ?? null, puerta_ok: false, juez_ok: false, motivo: 'epoch-no-disponible' };
    }
  }

  const lecturaDespues = await leerEpochConReintento(env, snapshot);
  const epochDespues = lecturaDespues.ok ? lecturaDespues.epoch : null;
  const publicacionDuranteVentana = lecturaDespues.ok ? (epochDespues > epochAntes ? 1 : 0) : 'desconocido';
  try {
    await registrarAuditoria(env, {
      creado_en: new Date().toISOString(),
      version_linealizacion: snapshot.version,
      epoch_antes: epochAntes,
      epoch_despues: epochDespues,
      publicacion_durante_ventana: publicacionDuranteVentana,
      ruta: resultado.ruta,
      etiqueta: resultado.etiqueta ?? null,
      confianza: resultado.confianza ?? null,
      puerta_ok: Boolean(resultado.puerta_ok),
      juez_ok: Boolean(resultado.juez_ok),
      motivo: resultado.motivo || null,
      hash_mensaje: await hashMensaje(mensajeActual, env),
    });
  } catch {
    // La auditoría es técnica y de mejor esfuerzo: un fallo suyo no bloquea la respuesta.
  }

  return respuestaJSON(resultado.reply);
}

export const onRequest = withSentry(handler, 'api-chat');
