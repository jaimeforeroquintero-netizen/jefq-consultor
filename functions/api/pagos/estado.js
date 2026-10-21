// functions/api/pagos/estado.js — Fuente de verdad del pago (Cloudflare).
// Consulta DIRECTAMENTE a Wompi con la llave privada (solo servidor).
import { withSentry } from '../../_sentry.js';

async function handler(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const reference = String(url.searchParams.get('reference') || '').slice(0, 80);
  if (!reference) {
    return new Response(JSON.stringify({ error: 'Falta reference' }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  const privateKey = env.WOMPI_PRIVATE_KEY;
  if (!privateKey) {
    return new Response(JSON.stringify({ error: 'Pagos no configurados' }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }
  const base =
    env.WOMPI_ENV === 'production'
      ? 'https://production.wompi.co'
      : 'https://sandbox.wompi.co';
  let r;
  try {
    r = await fetch(`${base}/v1/transactions?reference=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${privateKey}` },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'No se pudo consultar el pago' }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
  if (!r.ok) {
    return new Response(JSON.stringify({ error: 'No se pudo consultar el pago' }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }
  const data = await r.json().catch(() => ({}));
  const tx = (data.data || [])[0];
  if (!tx) {
    return new Response(JSON.stringify({ error: 'Pago no encontrado' }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({
    status: tx.status,
    amountInCents: tx.amount_in_cents,
    reference: tx.reference,
  }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

export const onRequest = withSentry(handler, 'api-pagos-estado');
