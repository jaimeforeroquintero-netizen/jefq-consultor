// api/_sentry.js — Wrapper defensivo de Sentry para las funciones serverless.
// Pre-mortem:
//  1. Si Sentry falla o no hay DSN, el handler original corre igual (no-op).
//  2. El DSN se lee solo en runtime (process.env.SENTRY_DSN); el build no depende de Sentry.
//  3. NUNCA se adjunta req.body: los /api/chat reciben mensajes personales.
//     Solo viaja qué endpoint falló y el tipo de error, jamás el contenido.
import * as Sentry from "@sentry/node";

let iniciado = false;

function initSentry() {
  if (iniciado) return true;
  iniciado = true;
  try {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) return false;
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      beforeSend(event) {
        // Quitar cualquier dato de la petición (body, query, headers con secretos).
        if (event.request) {
          delete event.request.data;
          delete event.request.query_string;
          delete event.request.cookies;
          delete event.request.headers;
        }
        return event;
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Envuelve un handler de Vercel. Uso:
 *   import { withSentry } from './_sentry.js';
 *   async function handler(req, res) { ... }
 *   export default withSentry(handler, 'api-chat');
 *
 * Hook de prueba (solo si SENTRY_TEST=1 en Vercel): un request con el header
 * x-sentry-test: 1 lanza un error controlado para verificar que el evento
 * llega al dashboard de Sentry. En producción normal el hook está inerte.
 */
export function withSentry(handler, nombre) {
  return async function (req, res) {
    const activo = initSentry();
    if (!activo) return handler(req, res);
    try {
      if (
        process.env.SENTRY_TEST === "1" &&
        req.headers &&
        req.headers["x-sentry-test"] === "1"
      ) {
        throw new Error("sentry-test:" + (nombre || "api"));
      }
      return await handler(req, res);
    } catch (err) {
      try {
        Sentry.withScope((scope) => {
          scope.setTag("endpoint", nombre || "api");
          Sentry.captureException(err);
        });
        await Sentry.flush(2000);
      } catch {
        // Reportar jamás puede tumbar la respuesta.
      }
      throw err;
    }
  };
}
