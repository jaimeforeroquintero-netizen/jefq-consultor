// api/pagos/webhook.js — Recibe los eventos transaction.updated de Wompi.
// Verifica la firma del evento (checksum SHA-256 con el secreto de eventos)
// antes de creerle nada. v1 sin base de datos: el evento válido se registra
// en los logs; la confirmación al cliente la autoriza /api/pagos/estado.
import { withSentry } from '../_sentry.js';
import { createHash, timingSafeEqual } from 'crypto';

function valorEn(obj, ruta) {
  return String(ruta)
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  const secret = process.env.WOMPI_EVENTS_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Pagos no configurados' });
  }
  const evt = req.body || {};
  const props = (evt.signature && evt.signature.properties) || [];
  const checksum = (evt.signature && evt.signature.checksum) || '';
  const timestamp = evt.timestamp != null ? String(evt.timestamp) : '';
  const data = evt.data || {};
  const concatenated = props.map((p) => valorEn(data, p) ?? '').join('') + timestamp + secret;
  const esperado = createHash('sha256').update(concatenated).digest('hex');
  const a = Buffer.from(checksum);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Firma inválida' });
  }
  const ref = valorEn(data, 'transaction.reference');
  const estado = valorEn(data, 'transaction.status');
  console.log(`[wompi] evento ${evt.event} ref=${ref} estado=${estado}`);
  return res.status(200).json({ ok: true });
}

export default withSentry(handler, 'api-pagos-webhook');
