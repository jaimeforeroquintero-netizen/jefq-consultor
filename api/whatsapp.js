// Redirección privada a WhatsApp.
// El número vive SOLO en la variable de entorno WHATSAPP_NUMBER de Vercel
// (nunca en el HTML, el JS ni el repositorio). El visitante pulsa el botón
// y WhatsApp se abre directamente, como con un enlace wa.me clásico.
import { withSentry } from './_sentry.js';
import { contar, ipCliente } from './lib/redis.js';

// Límite anti-abuso: 30 peticiones por minuto por IP (Upstash Redis).
// Sin Redis o si falla, el límite se desactiva (fail-open).
async function handler(req, res) {
  const ip = ipCliente(req).replace(/[^0-9a-fA-F.:]/g, '').slice(0, 40) || 'desconocida';
  const ventana = Math.floor(Date.now() / 60000);
  const c = await contar(`jefq:rl:whatsapp:${ip}:${ventana}`, 120);
  if (c.ok && c.count > 30) {
    return res.status(429).send("Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.");
  }
  if (!c.ok) console.error('[jefq] Redis no disponible (whatsapp), limite desactivado:', c.motivo);

  const number = process.env.WHATSAPP_NUMBER;
  if (!number) {
    return res.status(500).send("WhatsApp no configurado");
  }
  const q = req.query || {};
  const text = typeof q.text === "string" ? q.text.slice(0, 600) : "";
  const url =
    "https://wa.me/" +
    number +
    (text ? "?text=" + encodeURIComponent(text) : "");
  res.writeHead(302, { Location: url, "Cache-Control": "no-store" });
  res.end();
}

export default withSentry(handler, 'api-whatsapp');
