// functions/_sentry.js — Wrapper defensivo de Sentry para Cloudflare Pages Functions.
// Pre-mortem:
//  1. Si Sentry falla o no hay DSN, el handler original corre igual (no-op).
//  2. El DSN se lee solo en runtime (env.SENTRY_DSN); el build no depende de Sentry.
//  3. NUNCA se envía el body: los /api/chat reciben mensajes personales.
//     Solo viaja qué endpoint falló y el tipo de error, jamás el contenido.
//
// Usa la API HTTP de Sentry directamente (sin @sentry/node que es solo Node.js).

function getDsn(env) {
  return env.SENTRY_DSN || null;
}

async function capturar(env, nombre, err) {
  try {
    const dsn = getDsn(env);
    if (!dsn) return;
    // Parsear el DSN: https://<key>@<host>/<projectId>
    const m = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
    if (!m) return;
    const [, key, host, projectId] = m;
    const envelope = JSON.stringify({
      event_id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      sent_at: new Date().toISOString(),
    }) + '\n' + JSON.stringify({
      type: 'event',
      content_type: 'application/json',
    }) + '\n' + JSON.stringify({
      platform: 'javascript',
      level: 'error',
      tags: { endpoint: nombre || 'api' },
      exception: {
        values: [{
          type: err.name || 'Error',
          value: String(err.message || err).slice(0, 500),
        }],
      },
    });
    await fetch(`https://${host}/api/${projectId}/envelope/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=cf-pages/1.0`,
      },
      body: envelope,
    }).catch(() => {});
  } catch {
    // Reportar jamás puede tumbar la respuesta.
  }
}

/**
 * Envuelve un handler de Cloudflare Pages Functions. Uso:
 *   import { withSentry } from '../_sentry.js';
 *   export const onRequest = withSentry(async (context) => { ... }, 'api-chat');
 */
export function withSentry(handler, nombre) {
  return async function (context) {
    const { request, env } = context;
    try {
      if (
        env.SENTRY_TEST === "1" &&
        request.headers.get("x-sentry-test") === "1"
      ) {
        throw new Error("sentry-test:" + (nombre || "api"));
      }
      return await handler(context);
    } catch (err) {
      await capturar(env, nombre, err);
      throw err;
    }
  };
}
