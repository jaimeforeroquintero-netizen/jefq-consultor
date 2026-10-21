// functions/api/pagos/crear.js — Crea la intención de pago para el widget de Wompi (Cloudflare).
// El monto SIEMPRE sale del catálogo del servidor, nunca del navegador.
// Usa Web Crypto API (no Node.js crypto).
import { withSentry } from '../../_sentry.js';

const CATALOGO = {
  esencial: { nombre: 'Diagnóstico Esencial · JEFQ Consultor', centavos: 39000000 },
  pyme: { nombre: 'Evaluación Pyme · JEFQ Consultor', centavos: 89000000 },
  integral: { nombre: 'Seguridad Integral · JEFQ Consultor', centavos: 179000000 },
};

async function sha256Hex(texto) {
  const data = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(n) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function handler(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const { producto } = body;
  const item = CATALOGO[producto];
  if (!item) {
    return new Response(JSON.stringify({ error: 'Producto inválido' }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  const publicKey = env.WOMPI_PUBLIC_KEY;
  const integritySecret = env.WOMPI_INTEGRITY_SECRET;
  if (!publicKey || !integritySecret) {
    return new Response(JSON.stringify({ error: 'Pagos no configurados' }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }
  const reference =
    'JEFQ-' +
    Date.now().toString(36).toUpperCase() +
    randomHex(3);
  const signature = await sha256Hex(`${reference}${item.centavos}COP${integritySecret}`);
  return new Response(JSON.stringify({
    publicKey,
    currency: 'COP',
    amountInCents: item.centavos,
    reference,
    signature,
    nombre: item.nombre,
  }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

export const onRequest = withSentry(handler, 'api-pagos-crear');
