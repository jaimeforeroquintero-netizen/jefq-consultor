// api/pagos/crear.js — Crea la intención de pago para el widget de Wompi.
// El monto SIEMPRE sale del catálogo del servidor, nunca del navegador.
import { createHash, randomBytes } from 'crypto';

const CATALOGO = {
  esencial: { nombre: 'Diagnóstico Esencial · JEFQ Consultor', centavos: 39000000 },
  pyme: { nombre: 'Evaluación Pyme · JEFQ Consultor', centavos: 89000000 },
  integral: { nombre: 'Seguridad Integral · JEFQ Consultor', centavos: 179000000 },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }
  const { producto } = req.body || {};
  const item = CATALOGO[producto];
  if (!item) {
    return res.status(400).json({ error: 'Producto inválido' });
  }
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!publicKey || !integritySecret) {
    return res.status(503).json({ error: 'Pagos no configurados' });
  }
  const reference =
    'JEFQ-' +
    Date.now().toString(36).toUpperCase() +
    randomBytes(3).toString('hex').toUpperCase();
  const signature = createHash('sha256')
    .update(`${reference}${item.centavos}COP${integritySecret}`)
    .digest('hex');
  return res.status(200).json({
    publicKey,
    currency: 'COP',
    amountInCents: item.centavos,
    reference,
    signature,
    nombre: item.nombre,
  });
}
