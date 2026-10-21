// functions/lib/redis.js — Cliente mínimo para Upstash Redis vía REST API, con fail-open.
// Versión Cloudflare Workers: recibe `env` como parámetro (no usa process.env).
//
// DISEÑO DEFENSIVO:
// - Si faltan las credenciales o Redis falla/no responde, TODAS las funciones
//   devuelven { ok: false } y el llamador DEBE permitir la petición
//   (límite desactivado, con console.error). La web jamás se bloquea por Redis.
// - Las credenciales viven SOLO en variables de entorno de Cloudflare
//   (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN). Nunca en código.
// - Ningún log imprime el token.

export function redisConfigurado(env) {
  const url = env.UPSTASH_REDIS_REST_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || '';
  return url.startsWith('https://') && token.length > 10;
}

async function redisCmd(env, args, timeoutMs = 4000) {
  const url = env.UPSTASH_REDIS_REST_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || '';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
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
export async function contar(env, key, ttlSegundos) {
  if (!redisConfigurado(env)) return { ok: false, motivo: 'sin-config' };
  const k = String(key).slice(0, 200);
  const ttl = Math.max(60, Math.min(86400 * 7, Number(ttlSegundos) || 86400));
  await redisCmd(env, ['SET', k, '0', 'EX', String(ttl), 'NX']);
  const r = await redisCmd(env, ['INCR', k]);
  if (!r.ok) return { ok: false, motivo: 'redis-error' };
  const n = Number(r.result);
  if (!Number.isFinite(n) || n < 0) return { ok: false, motivo: 'valor-invalido' };
  return { ok: true, count: n };
}

export async function leer(env, key) {
  if (!redisConfigurado(env)) return { ok: false };
  return redisCmd(env, ['GET', String(key).slice(0, 200)]);
}

export async function guardar(env, key, valor, ttlSegundos) {
  if (!redisConfigurado(env)) return { ok: false };
  const ttl = Math.max(60, Math.min(86400 * 7, Number(ttlSegundos) || 3600));
  return redisCmd(env, ['SET', String(key).slice(0, 200), String(valor), 'EX', String(ttl)]);
}

// IP real del visitante tras el proxy de Cloudflare.
export function ipCliente(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.slice(0, 45);
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim().slice(0, 45);
  return 'desconocida';
}

// Sanitiza un identificador para usarlo en claves Redis (evita inyección).
export function idSeguro(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}
