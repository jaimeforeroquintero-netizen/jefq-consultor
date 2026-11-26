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
import { PROMPT_CLASIFICADOR, clasificadorSinModelo, rutaDesdeClasificacion, validarClasificacion } from '../lib/asistente/clasificador.js';
import { PROMPT_GENERADOR, PROMPT_JUEZ, ensamblarRespuesta, validarInventario, validarVeredictoJuez } from '../lib/asistente/juez.js';
import { crearPresupuestoLlamadas, llamarModeloJSON } from '../lib/asistente/modelo.js';
import { buscarEvidencia } from '../lib/asistente/rag.js';
import {
  RESPUESTA_CERRADA,
  RESPUESTA_FIJA_CONDICION,
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
  });
  if (!gen.ok) return { reply: RESPUESTA_CERRADA, ruta: 'general', puerta_ok: false, juez_ok: false, motivo: gen.motivo };
  const inv = validarInventario(gen.json);
  if (!inv.ok) return { reply: RESPUESTA_CERRADA, ruta: 'general', puerta_ok: false, juez_ok: false, motivo: inv.motivo };
  const juez = await llamarModeloJSON(env, {
    modelo,
    sistema: PROMPT_JUEZ,
    usuario: `Inventario:\n${JSON.stringify(inv.afirmaciones)}\n\nEvidencia:\n${evidenciaTexto}\n\nRegistro comercial resumido:\n${JSON.stringify({ version: snapshot.version, descuentos: snapshot.registro.descuentos, acuerdos: snapshot.registro.acuerdos, entradas: snapshot.registro.entradas.map((e) => ({ id: e.id, nombre: e.nombre, precio: e.precio, tipo_precio: e.tipo_precio, unidad: e.unidad })) })}\n${contextoExtra}`,
    presupuesto,
    maxTokens: 1024,
  });
  if (!juez.ok) return { reply: RESPUESTA_CERRADA, ruta: 'general', puerta_ok: false, juez_ok: false, motivo: juez.motivo };
  const veredicto = validarVeredictoJuez(juez.json, inv.afirmaciones, evidencia, snapshot.registro);
  if (!veredicto.ok || !veredicto.aprobado) {
    return { reply: RESPUESTA_CERRADA, ruta: 'general', puerta_ok: veredicto.motivo !== 'guarda-o-puerta', juez_ok: false, motivo: veredicto.motivo };
  }
  return { reply: ensamblarRespuesta(inv.afirmaciones, evidencia), ruta: 'general', puerta_ok: true, juez_ok: true, motivo: 'aprobado' };
}

async function rutaPrecioServicio(snapshot, mensaje) {
  const seleccion = seleccionarAfirmacion(mensaje, snapshot.registro);
  if (!snapshot.rutaPrecioActiva) {
    if (seleccion.ok || seleccion.motivo === 'diagnostico-ambiguo' || seleccion.campo === 'precio') {
      return { reply: RESPUESTA_CERRADA, ruta: 'precio-desactivada', puerta_ok: true, juez_ok: false, motivo: snapshot.motivo || 'ruta-precio-desactivada' };
    }
    return null;
  }
  if (seleccion.ok) {
    const respuesta = respuestaDesdeAfirmacion(seleccion.afirmacion, snapshot.registro);
    if (respuesta.ok) return { reply: respuesta.texto, ruta: 'precio-servicio', puerta_ok: true, juez_ok: false, motivo: seleccion.motivo };
    return { reply: RESPUESTA_CERRADA, ruta: 'precio-servicio', puerta_ok: false, juez_ok: false, motivo: respuesta.motivo };
  }
  if (seleccion.motivo === 'diagnostico-ambiguo') {
    return { reply: aclaracionDiagnostico(), ruta: 'aclaracion', puerta_ok: true, juez_ok: false, motivo: seleccion.motivo };
  }
  return null;
}

async function rutaMixta(env, modelo, presupuesto, snapshot, clasificacion, mensajeActual) {
  const legitima = clasificacion.fragmentos.find((f) => f.tipo === 'legitima')?.texto || '';
  const falsa = clasificacion.fragmentos.find((f) => f.tipo === 'falsa')?.texto || '';
  const contexto = `Ruta mixta. Fragmento legítimo: ${JSON.stringify(legitima)}. Fragmento falso: ${JSON.stringify(falsa)}. La respuesta legítima no puede depender de la premisa falsa.`;
  const precio = await rutaPrecioServicio(snapshot, legitima);
  if (precio && precio.ruta === 'precio-servicio') {
    const inventario = [{ id: 'c1', texto: precio.reply, referencia: 'registro' }];
    const juez = await llamarModeloJSON(env, {
      modelo,
      sistema: PROMPT_JUEZ,
      usuario: `Inventario:\n${JSON.stringify(inventario)}\n\n${contexto}\nConfirme la separación: la afirmación debe sostenerse sin usar la premisa falsa.`,
      presupuesto,
      maxTokens: 512,
    });
    if (!juez.ok) return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: false, juez_ok: false, motivo: juez.motivo };
    const veredicto = validarVeredictoJuez(juez.json, inventario, [], snapshot.registro, { permitirPrecioRegistro: true });
    if (!veredicto.ok || !veredicto.aprobado) return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: true, juez_ok: false, motivo: veredicto.motivo };
    return { reply: `${precio.reply} ${RESPUESTA_FIJA_CONDICION}`, ruta: 'mixta', puerta_ok: true, juez_ok: true, motivo: 'separacion-confirmada' };
  }
  const general = await rutaGeneral(env, modelo, presupuesto, snapshot, legitima, contexto);
  if (general.ruta !== 'general' || !general.juez_ok) return { reply: RESPUESTA_CERRADA, ruta: 'mixta', puerta_ok: general.puerta_ok, juez_ok: false, motivo: general.motivo };
  return { reply: `${general.reply} ${RESPUESTA_FIJA_CONDICION}`, ruta: 'mixta', puerta_ok: true, juez_ok: true, motivo: 'separacion-confirmada' };
}

async function procesarIntento(env, modelo, presupuesto, snapshot, history, mensajeActual) {
  if (!env.AI) {
    if (!snapshot.rutaPrecioActiva) return { reply: RESPUESTA_CERRADA, ruta: 'sin-modelo', etiqueta: null, confianza: null, puerta_ok: true, juez_ok: false, motivo: 'ruta-precio-desactivada' };
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
  });
  if (!clas.ok) {
    if (clas.motivo === 'error-modelo' || clas.motivo === 'sin-modelo') {
      const sinModelo = clasificadorSinModelo(mensajeActual, snapshot.registro);
      if (sinModelo.ok && snapshot.rutaPrecioActiva) {
        const respuesta = respuestaDesdeAfirmacion(sinModelo.afirmacion, snapshot.registro);
        if (respuesta.ok) return { reply: respuesta.texto, ruta: 'sin-modelo', etiqueta: 1, confianza: 1, puerta_ok: true, juez_ok: false, motivo: 'lista-blanca-tras-error' };
      }
    }
    return { reply: RESPUESTA_CERRADA, ruta: 'clasificacion', etiqueta: null, confianza: null, puerta_ok: false, juez_ok: false, motivo: clas.motivo };
  }
  const validada = validarClasificacion(clas.json, mensajeActual);
  if (!validada.ok) return { reply: RESPUESTA_CERRADA, ruta: 'clasificacion', etiqueta: null, confianza: null, puerta_ok: false, juez_ok: false, motivo: validada.motivo };
  const clasificacion = validada.clasificacion;
  const ruta = rutaDesdeClasificacion(clasificacion);
  const base = { etiqueta: clasificacion.etiqueta, confianza: clasificacion.confianza };
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
    resultado = { reply: RESPUESTA_CERRADA, ruta: 'frescura', etiqueta: resultado.etiqueta ?? null, confianza: resultado.confianza ?? null, puerta_ok: false, juez_ok: false, motivo: 'epoch-no-disponible' };
  }

  const lecturaDespues = await leerEpochConReintento(env, snapshot);
  const epochDespues = lecturaDespues.ok ? lecturaDespues.epoch : null;
  const publicacionDuranteVentana = lecturaDespues.ok ? (epochDespues > epochAntes ? 1 : 0) : 'desconocido';
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

  return respuestaJSON(resultado.reply);
}

export const onRequest = withSentry(handler, 'api-chat');
