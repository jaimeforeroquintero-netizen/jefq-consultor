// functions/api/whatsapp.js — Redirección privada a WhatsApp (Cloudflare Pages).
// Destino: el nombre de usuario público @JaimeByte (wa.me/JaimeByte).
// No se usa ningún número telefónico: el visitante nunca lo ve.
import { withSentry } from '../_sentry.js';
import { contar, ipCliente } from '../lib/redis.js';

// Límite anti-abuso: 30 peticiones por minuto por IP (Upstash Redis).
// Sin Redis o si falla, el límite se desactiva (fail-open).
async function handler(context) {
  const { request, env } = context;
  const ip = ipCliente(request).replace(/[^0-9a-fA-F.:]/g, '').slice(0, 40) || 'desconocida';
  const ventana = Math.floor(Date.now() / 60000);
  const c = await contar(env, `jefq:rl:whatsapp:${ip}:${ventana}`, 120);
  if (c.ok && c.count > 30) {
    return new Response("Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.", { status: 429 });
  }
  if (!c.ok) console.error('[jefq] Redis no disponible (whatsapp), limite desactivado:', c.motivo);

  const url = new URL(request.url);
  const text = (url.searchParams.get("text") || "").slice(0, 600);
  const waUrl =
    "https://wa.me/JaimeByte" +
    (text ? "?text=" + encodeURIComponent(text) : "");
  return Response.redirect(waUrl, 302);
}

export const onRequest = withSentry(handler, 'api-whatsapp');
