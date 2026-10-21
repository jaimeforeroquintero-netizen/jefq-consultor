// functions/api/pagos/webhook.js — Recibe eventos transaction.updated de Wompi (Cloudflare).
// Verifica la firma del evento (checksum SHA-256 con el secreto de eventos)
// antes de creerle nada. Usa Web Crypto API (no Node.js crypto).
import { withSentry } from '../../_sentry.js';

function valorEn(obj, ruta) {
  return String(ruta)
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function sha256Hex(texto) {
  const data = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function handler(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }
  const secret = env.WOMPI_EVENTS_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'Pagos no configurados' }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }
  let evt = {};
  try { evt = await request.json(); } catch { evt = {}; }
  const props = (evt.signature && evt.signature.properties) || [];
  const checksum = (evt.signature && evt.signature.checksum) || '';
  const timestamp = evt.timestamp != null ? String(evt.timestamp) : '';
  const data = evt.data || {};
  const concatenated = props.map((p) => valorEn(data, p) ?? '').join('') + timestamp + secret;
  const esperado = await sha256Hex(concatenated);
  // Comparación en tiempo constante (evita timing attacks).
  if (checksum.length !== esperado.length) {
    return new Response(JSON.stringify({ error: 'Firma inválida' }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  let ok = true;
  for (let i = 0; i < checksum.length; i++) {
    if (checksum.charCodeAt(i) !== esperado.charCodeAt(i)) ok = false;
  }
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Firma inválida' }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  const ref = valorEn(data, 'transaction.reference');
  const estado = valorEn(data, 'transaction.status');
  console.log(`[wompi] evento ${evt.event} ref=${ref} estado=${estado}`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

export const onRequest = withSentry(handler, 'api-pagos-webhook');
