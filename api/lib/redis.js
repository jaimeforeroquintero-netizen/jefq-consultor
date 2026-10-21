// api/lib/redis.js — Cliente mínimo para Upstash Redis vía REST API, con fail-open.
//
// DISEÑO DEFENSIVO (pre-mortem 2026-10-20):
// - Si faltan las credenciales o Redis falla/no responde, TODAS las funciones
//   devuelven { ok: false } y el llamador DEBE permitir la petición
//   (límite desactivado, con console.error). La web jamás se bloquea por Redis.
// - Las credenciales viven SOLO en variables de entorno de Vercel
//   (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN). Nunca en código.
// - Ningún log imprime el token.

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

export function redisConfigurado() {
  return REDIS_URL.startsWith('https://') && REDIS_TOKEN.length > 10;
}

async function redisCmd(args, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + REDIS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { ok: false };
    const data = await r.json().catch(() => null);
    if (!data || !('result' in data)) return { ok: false };
    return { ok: true, result: data.result };
  } catch {
    clearTimeout(t);
    return { ok: false };
  }
}

// Incrementa un contador con TTL (el TTL se fija al crear la clave).
// Devuelve { ok: true, count } o { ok: false, motivo }.
// Uso: const c = await contar('clave', 86400); si c.ok y c.count > LIMITE → 429.
export async function contar(key, ttlSegundos) {
  if (!redisConfigurado()) return { ok: false, motivo: 'sin-config' };
  const k = String(key).slice(0, 200);
  const ttl = Math.max(60, Math.min(86400 * 7, Number(ttlSegundos) || 86400));
  // SET NX con TTL primero: evita claves huérfanas sin expiración.
  await redisCmd(['SET', k, '0', 'EX', String(ttl), 'NX']);
  const r = await redisCmd(['INCR', k]);
  if (!r.ok) return { ok: false, motivo: 'redis-error' };
  const n = Number(r.result);
  if (!Number.isFinite(n) || n < 0) return { ok: false, motivo: 'valor-invalido' };
  return { ok: true, count: n };
}

export async function leer(key) {
  if (!redisConfigurado()) return { ok: false };
  return redisCmd(['GET', String(key).slice(0, 200)]);
}

export async function guardar(key, valor, ttlSegundos) {
  if (!redisConfigurado()) return { ok: false };
  const ttl = Math.max(60, Math.min(86400 * 7, Number(ttlSegundos) || 3600));
  return redisCmd(['SET', String(key).slice(0, 200), String(valor), 'EX', String(ttl)]);
}

// IP real del visitante tras el proxy de Vercel.
export function ipCliente(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim().slice(0, 45);
  }
  const ra = req.socket && req.socket.remoteAddress;
  return (typeof ra === 'string' && ra ? ra : 'desconocida').slice(0, 45);
}

// Sanitiza un identificador para usarlo en claves Redis (evita inyección).
export function idSeguro(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}
