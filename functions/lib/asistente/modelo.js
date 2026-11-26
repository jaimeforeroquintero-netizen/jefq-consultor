// Acceso al modelo con presupuesto de llamadas V2.10.

export function crearPresupuestoLlamadas() {
  return {
    intento: 1,
    llamadasIntento: 0,
    llamadasTotal: 0,
    maxPorIntento: 3,
    maxIntentos: 2,
    nuevoIntento() {
      this.intento++;
      this.llamadasIntento = 0;
    },
    consumir() {
      if (this.intento > this.maxIntentos) return false;
      if (this.llamadasIntento >= this.maxPorIntento) return false;
      if (this.llamadasTotal >= this.maxPorIntento * this.maxIntentos) return false;
      this.llamadasIntento++;
      this.llamadasTotal++;
      return true;
    },
  };
}

export function extraerTextoModelo(out) {
  if (typeof out?.response === 'string') return out.response;
  const choice = Array.isArray(out?.choices) ? out.choices[0] : null;
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  if (typeof out?.result?.response === 'string') return out.result.response;
  return '';
}

export function parsearJSONModelo(texto) {
  const t = String(texto || '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const inicio = t.indexOf('{');
    const fin = t.lastIndexOf('}');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(t.slice(inicio, fin + 1)); } catch { return null; }
    }
    return null;
  }
}

export async function llamarModeloJSON(env, { modelo, sistema, usuario, presupuesto, maxTokens = 1024, esquema = null }) {
  if (!env?.AI) return { ok: false, motivo: 'sin-modelo' };
  if (presupuesto && !presupuesto.consumir()) return { ok: false, motivo: 'presupuesto-agotado' };
  try {
    const out = await env.AI.run(modelo, {
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
      temperature: 0,
      max_tokens: maxTokens,
      ...(esquema ? { response_format: { type: 'json_schema', json_schema: esquema } } : {}),
    });
    const texto = extraerTextoModelo(out).trim();
    const json = parsearJSONModelo(texto);
    if (!json) return { ok: false, motivo: 'json-invalido', texto };
    return { ok: true, json, texto };
  } catch (e) {
    return { ok: false, motivo: 'error-modelo', error: String(e?.message || e) };
  }
}
