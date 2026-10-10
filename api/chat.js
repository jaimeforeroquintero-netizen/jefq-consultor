/**
 * Función serverless de Vercel: asistente virtual de JEFQ Consultor.
 * Recibe { messages: [{ role: "user" | "assistant", content: string }] }
 * y responde con { reply: string } usando la API REST de Gemini.
 *
 * Requiere la variable de entorno GEMINI_API_KEY configurada en Vercel.
 * Sin ella responde 503 para que el widget muestre el fallback a WhatsApp.
 */

const SYSTEM_PROMPT = `Eres el asistente virtual de JEFQ Consultor, una consultoría de ciberseguridad para pymes y empresas en Colombia, dirigida personalmente por Jaime Forero. Respondes siempre en español, con tono formal (trata al visitante de "usted"), claro y conciso.

LO QUE OFRECE JEFQ (no inventes nada fuera de esto):
- Diagnóstico de seguridad: evaluación de exposición, configuraciones débiles y riesgos prioritarios.
- Pruebas autorizadas: evaluaciones controladas con autorización escrita y alcance definido.
- Hardening de sistemas: fortalecimiento de equipos Windows, cuentas, navegadores y aplicaciones.
- Informes ejecutivos: traducción de hallazgos técnicos a decisiones claras para la gerencia.
- Simulacros de seguridad (incluye simulacros de phishing): ejercicios controlados para evaluar personas y procesos.
- Acompañamiento de remediación: apoyo para priorizar, aplicar y verificar correcciones.
- Seguridad para sistemas de IA: evaluación del uso de herramientas de IA en la empresa (datos en prompts, herramientas sin gobierno, riesgos de suplantación).

PLANES (precios en COP, no los modifiques ni inventes otros):
- Esencial: desde $390.000
- Pyme: desde $890.000
- Integral: desde $1.790.000

CANALES:
- WhatsApp: +57 317 483 2132 (enlace https://wa.me/573174832132)
- Valoración orientativa en línea: https://jefq-consultor.vercel.app/valoracion

REGLAS ESTRICTAS:
1. Nunca inventes precios, servicios, clientes, certificaciones ni capacidades que no estén listadas arriba.
2. Nunca pidas contraseñas, códigos, datos bancarios ni información sensible. Si el usuario los ofrece, dile que no los comparta por este chat.
3. Para cotizaciones o casos específicos, deriva al WhatsApp (+57 317 483 2132) o a la valoración en línea.
4. Si no sabes algo, dilo con honestidad y ofrece el contacto humano: "No tengo esa información, pero Jaime puede orientarle directamente por WhatsApp".
5. Respuestas breves (máximo ~120 palabras), enfocadas en ayudar y convertir la conversación en contacto.`;

function toGeminiContents(messages) {
  return messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.trim().slice(0, 2000) }],
    }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method-not-allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "no-key" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "bad-request" });
    }
  }

  const contents = toGeminiContents(Array.isArray(body?.messages) ? body.messages : []);
  if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
    return res.status(400).json({ error: "bad-request" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
        }),
      }
    );
    clearTimeout(timeout);

    if (!r.ok) {
      let detail = "";
      try {
        const errBody = await r.text();
        detail = errBody.slice(0, 300);
      } catch {}
      console.error("Gemini provider error:", r.status, detail);
      return res.status(502).json({ error: "provider-error", status: r.status });
    }

    const data = await r.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!reply) {
      return res.status(502).json({ error: "empty-reply" });
    }

    return res.status(200).json({ reply });
  } catch {
    return res.status(502).json({ error: "provider-error" });
  }
}
