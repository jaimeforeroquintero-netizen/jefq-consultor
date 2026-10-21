// api/pagos/estado.js — Fuente de verdad del pago.
// Consulta DIRECTAMENTE a Wompi con la llave privada (solo servidor).
import { withSentry } from '../_sentry.js';
async function handler(req, res) {
  const reference = String((req.query || {}).reference || '').slice(0, 80);
  if (!reference) {
    return res.status(400).json({ error: 'Falta reference' });
  }
  const privateKey = process.env.WOMPI_PRIVATE_KEY;
  if (!privateKey) {
    return res.status(503).json({ error: 'Pagos no configurados' });
  }
  const base =
    process.env.WOMPI_ENV === 'production'
      ? 'https://production.wompi.co'
      : 'https://sandbox.wompi.co';
  let r;
  try {
    r = await fetch(`${base}/v1/transactions?reference=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${privateKey}` },
    });
  } catch {
    return res.status(502).json({ error: 'No se pudo consultar el pago' });
  }
  if (!r.ok) {
    return res.status(502).json({ error: 'No se pudo consultar el pago' });
  }
  const data = await r.json().catch(() => ({}));
  const tx = (data.data || [])[0];
  if (!tx) {
    return res.status(404).json({ error: 'Pago no encontrado' });
  }
  return res.status(200).json({
    status: tx.status,
    amountInCents: tx.amount_in_cents,
    reference: tx.reference,
  });
}

export default withSentry(handler, 'api-pagos-estado');
