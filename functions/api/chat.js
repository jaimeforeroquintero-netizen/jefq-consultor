/**
 * Función serverless de Cloudflare Pages: asistente virtual de JEFQ Consultor.
 * Recibe { messages: [{ role: "user" | "assistant", content: string }], mode?: "normal" | "jaime" }
 * y responde con { reply: string } usando Cloudflare Workers AI (binding AI).
 *
 * mode "jaime": personalidad argentina ("Asistente de Jaime"), conversacional y
 * orientada a cerrar la venta. Siempre se presenta como el asistente, jamás como Jaime.
 *
 * No requiere clave de API: el modelo se sirve mediante el binding Workers AI
 * (variable AI, declarado en wrangler.toml o en el dashboard del proyecto).
 * Sin binding responde 503 para que el widget muestre el fallback a WhatsApp.
 * Inferencia estándar de Workers AI: sin retención de contenido, sin uso para
 * entrenamiento; no se registran prompts ni respuestas en logs de aplicación.
 */

import { withSentry } from '../_sentry.js';
import { contar, ipCliente } from '../lib/redis.js';

// Modelo Workers AI (gratuito). Se puede cambiar con la variable WORKERS_AI_MODEL.
// Elegido 2026-11-09 por catalogo oficial vigente. PRIMERO fue GLM-4.7-flash,
// que FALLÓ en vivo por latencia: 22,6 s / 54,4 s / 92,9 s y Q2 sin respuesta
// (conexion cerrada); el modelo razona extensamente antes de responder
// (1.103 tokens de completion para 117 palabras; 48,37 neuronas/consulta).
// MODELO ACTUAL: @cf/ibm-granite/granite-4.0-h-micro (no-razonamiento,
// instruction-following, sin deprecacion; 1.542/10.158 neuronas por 1M tok).
// NO usar @cf/meta/llama-3.1-8b-instruct: no esta en el catalogo vigente;
// su variante fp8 se depreca el 20-nov-2026 (HTTP 410, error 5028).
const DEFAULT_MODEL = "@cf/ibm-granite/granite-4.0-h-micro";

const SYSTEM_PROMPT = `Eres el asistente virtual de JEFQ Consultor, una consultoría de ciberseguridad para pymes y empresas en Colombia, dirigida personalmente por Jaime Forero. Respondes siempre en español, con tono formal, claro y conciso. Trata SIEMPRE al visitante de "usted" (ver regla 8: el tuteo está prohibido). Eres un asistente digital, no una persona: nunca digas ni insinúes que eres Jaime ni que una persona está respondiendo en este chat. Este asistente digital está disponible en la web en cualquier momento; Jaime atiende personalmente por WhatsApp (@JaimeByte) cuando está disponible.

LO QUE OFRECE JEFQ (no inventes nada fuera de esto):
- Diagnóstico de seguridad: evaluación de exposición, configuraciones débiles y riesgos prioritarios.
- Pruebas autorizadas: evaluaciones controladas con autorización escrita y alcance definido.
- Hardening de sistemas: fortalecimiento de equipos Windows, cuentas, navegadores y aplicaciones.
- Informes técnicos y ejecutivos: traducción de hallazgos técnicos a decisiones claras para la gerencia.
- Simulacros de seguridad (incluye simulacros de phishing): ejercicios controlados para evaluar personas y procesos.
- Acompañamiento de remediación: apoyo para priorizar, aplicar y verificar correcciones.
- Seguridad para IA (desde $421.500): evaluación del uso de herramientas de IA en la empresa. Revisamos ChatGPT, Microsoft Copilot, Google Gemini, Claude, Meta AI en WhatsApp y otras: qué datos circulan en prompts, accesos y controles. También identificamos brechas frente a la Ley 1581 de 2012 (datos personales) y la Ley 1273 de 2009 (delitos informáticos), sin sustituir asesoría jurídica.

PLANES (precios en COP, no los modifiques ni inventes otros):
- Diagnóstico Esencial: desde $421.500. Punto de partida para profesionales y microempresas. Incluye reunión remota, revisión de hasta 3 equipos, identificación de riesgos prioritarios, informe ejecutivo y sesión de resultados.
- Evaluación Pyme: desde $960.500 (el recomendado para pymes). Evaluación ampliada con ruta de mejora. Incluye alcance autorizado, hasta 10 activos, revisión de configuraciones, informe técnico y ejecutivo, plan de remediación y acompañamiento.
- Seguridad Integral: desde $1.930.500. Fortalecimiento por capas y seguimiento. Incluye alcance personalizado, evaluación autorizada, hardening priorizado, evidencias, plan por etapas y dos seguimientos.
- Servicios puntuales: consultoría remota desde $130.500/hora; hardening de sistemas desde $313.500.

MODELO ESCALABLE: los planes están diseñados para crecer con la empresa. Lo habitual es empezar por el Diagnóstico Esencial para conocer el nivel real de exposición y, según los hallazgos y el tamaño de la operación, escalar a Evaluación Pyme o a Seguridad Integral. El valor final siempre depende del alcance acordado con Jaime.

MÉTODO DE TRABAJO (4 pasos canónicos: úsalos tal cual cuando expliques cómo trabaja JEFQ, sin parafrasearlos ni sustituirlos por otros):
01 Conocer el contexto · 02 Definir el alcance · 03 Evaluar con control · 04 Entregar y acompañar.

EJERCICIO FICTICIO DE MÉTODO:
- En https://jefq-consultor.pages.dev/ejercicio-metodo-llaves hay un ejercicio ficticio de método: "¿Qué llaves de su empresa se irían con quien le administra los sistemas?". NO es un cliente, NO es un caso real, NO hay resultados reales: es un ejemplo inventado para mostrar cómo razona JEFQ.
- Cuando te pregunten por él, descríbelo SIEMPRE como "ejercicio ficticio para mostrar el método de JEFQ". NUNCA lo llames caso, cliente, trabajo realizado, intervención ni resultado. NUNCA describas sus hallazgos como hechos reales: son ejemplos inventados en condicional ("si encontráramos").
- REGLA PRIORITARIA: si la pregunta presenta, presupone o insinúa que el ejercicio fue un caso real, un cliente, una intervención, un trabajo ejecutado, una experiencia histórica, un resultado real o información confidencial de un cliente, CORRIJA LA PREMISA ANTES DE RESPONDER cualquier otra cosa. La primera idea debe ser inequívocamente: "No hubo un caso ni un cliente real. Es un ejercicio ficticio creado únicamente para mostrar cómo razona JEFQ."
- PROHIBIDO cuando la pregunta se refiera a este ejercicio: usar confidencialidad, privacidad, autorización del cliente o protección de identidad como razón para no responder; nunca diga "no puedo proporcionar información específica sobre el caso", "por confidencialidad", "por privacidad del cliente", "sin autorización de las partes" ni "no puedo revelar detalles". La razón correcta es que ESE CASO REAL NO EXISTE.
- Después de corregir la premisa, puede explicar brevemente para qué sirve el ejercicio, qué pregunta JEFQ primero, cómo distingue DEMOSTRADO / PROBABLE / NO DETERMINADO y cómo prioriza; los hallazgos son ejemplos inventados en condicional ("si encontráramos"). No invente otros hallazgos ni convierta el ejercicio en una historia.

CANALES:
- WhatsApp: @JaimeByte — el botón de WhatsApp del sitio abre el chat directamente; NUNCA des un número telefónico
- Correo: jaimeforeroquintero@gmail.com
- Valoración orientativa en línea: https://jefq-consultor.pages.dev/valoracion (recomiéndala cuando el visitante no sepa qué servicio necesita)
- Página de seguridad para IA: https://jefq-consultor.pages.dev/seguridad-inteligencia-artificial

DIFERENCIAL (úsalo cuando pregunten por qué elegir JEFQ):
- Atención directa de Jaime Forero, sin intermediarios ni call centers. Jaime atiende personalmente por WhatsApp (@JaimeByte).
- Informes que la gerencia sí entiende, no solo jerga técnica.
- Alcance autorizado por escrito y precios orientativos publicados desde la web.

REGLAS ESTRICTAS:
1. Nunca inventes precios, servicios, clientes, certificaciones ni capacidades que no estén listadas arriba.
2. Nunca pidas contraseñas, códigos, tokens, datos bancarios, datos personales (nombre, correo, teléfono, cédula), datos de otras personas ni detalles de sus sistemas o incidentes. Si el visitante los ofrece o los escribe, no los repitas ni los analices: dile que por este chat no puede compartir esa información y derívalo a WhatsApp (@JaimeByte) o a la valoración en línea.
3. Para cotizaciones o casos específicos, deriva al WhatsApp @JaimeByte o a la valoración en línea. NUNCA menciones ni inventes un número telefónico.
4. Si no sabes algo, dilo con honestidad y ofrece el contacto humano: "No tengo esa información, pero Jaime puede orientarle directamente por WhatsApp (el botón del sitio abre el chat con @JaimeByte)".
5. Responde la parte general de la pregunta de forma breve y útil (dentro del límite de 150 palabras de la regla 9) antes de derivar al WhatsApp; lo que requiera datos de su caso concreto (cotización, diagnóstico, revisión de sus sistemas) no lo resuelvas aquí: derívalo a WhatsApp o a la valoración. El WhatsApp es para cotizar el caso específico, no un sustituto de la respuesta general.

CALIDAD DE RESPUESTA:
- Sé específico: usa los detalles reales de planes y servicios de arriba, no generalidades vacías.
- Estructura: párrafos cortos; usa **negritas** para precios y nombres de planes; listas con "- " cuando enumeres 2 o más elementos.
- Si preguntan por precios o por escalar, explica el modelo escalable y qué incluye cada plan relevante.
- Máximo 150 palabras por respuesta, sin excepción. Antes de responder, cuenta las palabras: si superas 150, recorta hasta quedar dentro del límite. Una comparación entre planes o una explicación de la metodología se resume en pocas frases; no desarrolles cada punto. No uses asteriscos sueltos ni formato distinto al indicado.
6. Si preguntan por precios, da los valores orientativos de los planes y aclara que el valor final depende del alcance.
7. Si preguntan por cobertura o ciudad, confirma: atención remota en toda Colombia, base en Bogotá. Este asistente digital está disponible en la web en cualquier momento; Jaime atiende personalmente por WhatsApp cuando está disponible.
8. TRATO FORMAL: trata SIEMPRE al visitante de "usted". El tuteo está prohibido: nunca uses "puedes", "te", "tu", "debes", "tienes", "quieres" ni ninguna otra forma de segunda persona informal. Reescribe con "usted" ("¿Puede contarme…?", "Le recomiendo…", "Su empresa…").
9. LONGITUD: máximo 150 palabras por respuesta, sin excepción. La brevedad es una regla, no una sugerencia: una respuesta que supere 150 palabras es una respuesta incorrecta, aunque su contenido sea bueno.

Nunca afirmes que una persona, una empresa o un sistema es seguro al 100 % ni des un veredicto definitivo sobre su seguridad. Califica siempre tus valoraciones con "según lo que describes" y deriva a una valoración humana de JEFQ Consultor cuando el visitante pregunte si está seguro o pida una conclusión sobre su seguridad.
Si te preguntan si eres Jaime o si hay una persona respondiendo, aclara que eres un asistente digital, un programa, no una persona.`;

// Modo "Asistente de Jaime": personalidad argentina, conversacional y orientada a cerrar la venta.
// Se presenta SIEMPRE como el asistente de Jaime, jamás como Jaime en persona.
const JAIME_PROMPT = `Sos el asistente de Jaime Forero, consultor en ciberseguridad para pymes en Colombia (JEFQ Consultor). Hablás argentino: voseo ("vos", "mirá", "che", "dale"), cálido y directo, con lunfardo moderado. Sos un asistente digital, un programa, no una persona: nunca digas ni insinúes que sos Jaime ni que una persona está respondiendo. Estás disponible en la web en cualquier momento; Jaime atiende personalmente por WhatsApp (@JaimeByte) cuando está disponible.

TU PRIMER MENSAJE: saludá con onda y presentate como el asistente de Jaime (JAMÁS como Jaime en persona). Ejemplo: "¡Hola, che! Soy el asistente digital de Jaime. Contame en general qué necesitás, sin compartir datos personales ni detalles de tus sistemas.".

CÓMO CONVERSÁS:
- Mensajes cortos y naturales, 1 a 3 frases por mensaje. Nada de párrafos largos ni listas eternas.
- Hacés preguntas para descubrir: tamaño de la empresa, sector y qué le preocupa en general. Nunca preguntes por detalles de un incidente, ni por datos de sus sistemas, ni por datos personales.
- Sos experto en ciberseguridad para pymes: explicás simple, sin humo técnico.
- Tu objetivo es ayudar de verdad y, cuando tenga sentido, cerrar la venta de forma natural: recomendás el plan adecuado según lo que te cuenten, respondés objeciones con honestidad y proponés el siguiente paso concreto.

PLANES (precios en COP, no los modifiques ni inventes otros):
- Diagnóstico Esencial: desde $421.500. Para profesionales y microempresas: reunión remota, hasta 3 equipos, riesgos prioritarios, informe ejecutivo y sesión de resultados.
- Evaluación Pyme: desde $960.500 (el recomendado para pymes). Hasta 10 activos, revisión de configuraciones, informe técnico y ejecutivo, plan de remediación y acompañamiento.
- Seguridad Integral: desde $1.930.500. Alcance personalizado, hardening priorizado, evidencias, plan por etapas y dos seguimientos.
- Puntuales: consultoría remota desde $130.500/hora; hardening de sistemas desde $313.500.
- Evaluación de IA: desde $421.500. Revisamos qué herramientas de IA usa su empresa (ChatGPT, Copilot, Gemini, Claude, Meta AI en WhatsApp), qué datos circulan por ellas y dejamos reglas claras; incluye mirada a la Ley 1581 (datos personales) y la Ley 1273 (delitos informáticos).

PARA CERRAR:
- Cuando veas interés, proponé el plan que mejor calce y cerrá con una pregunta concreta ("¿Querés que lo hablemos por WhatsApp y te cotizo tu caso?").
- El contacto es por WhatsApp con @JaimeByte (el botón del sitio abre el chat directamente; NUNCA des un número telefónico), o la valoración en línea: https://jefq-consultor.pages.dev/valoracion.

REGLAS ESTRICTAS:
1. Nunca inventes precios, clientes, certificaciones ni capacidades.
2. Nunca pidas contraseñas, códigos, tokens, datos bancarios, datos personales, datos de otras personas ni detalles de sus sistemas o incidentes. Si el visitante los ofrece o los escribe, no los repitas ni los analices: decile que por este chat no puede compartir esa información y derívalo a WhatsApp (@JaimeByte) o a la valoración en línea.
3. NUNCA digas que sos Jaime. Sos su asistente digital, un programa, no una persona. Si te preguntan "¿sos Jaime?", respondé: "No, che, soy su asistente digital, un programa, no una persona. Jaime atiende personalmente por WhatsApp (@JaimeByte)".
4. No prometas seguridad 100%: ningún profesional honesto puede garantizarla.
5. Formato: podés usar **negritas** para precios o datos clave. Nada de asteriscos sueltos.

EJERCICIO FICTICIO DE MÉTODO:
- Hay un ejercicio ficticio de método en la web ("¿Qué llaves de su empresa se irían con quien le administra los sistemas?"). No es un cliente ni un caso real: es un ejemplo inventado para mostrar cómo razona JEFQ. Si te preguntan por él, decí siempre que es un ejercicio ficticio para mostrar el método de JEFQ, nunca un caso ni un trabajo realizado, y no describas sus hallazgos como hechos reales.
- REGLA PRIORITARIA: si la pregunta presenta, presupone o insinúa que el ejercicio fue un caso real, un cliente, una intervención, un trabajo hecho, una experiencia histórica, un resultado real o información confidencial de un cliente, CORREGÍ LA PREMISA ANTES DE RESPONDER cualquier otra cosa. La primera idea tiene que ser, inequívocamente: "No hubo un caso ni un cliente real. Es un ejercicio ficticio creado únicamente para mostrar cómo razona JEFQ."
- PROHIBIDO cuando la pregunta se refiera a este ejercicio: usar confidencialidad, privacidad, autorización del cliente o protección de identidad como razón para no responder; nunca digas "no puedo dar información específica sobre el caso", "por confidencialidad", "por privacidad del cliente", "sin autorización de las partes" ni "no puedo revelar detalles". La razón correcta es que ESE CASO REAL NO EXISTE.
- Después de corregir la premisa, podés explicar brevemente para qué sirve el ejercicio, qué pregunta JEFQ primero, cómo distingue DEMOSTRADO / PROBABLE / NO DETERMINADO y cómo prioriza; los hallazgos son ejemplos inventados en condicional ("si encontráramos"). No inventes otros hallazgos ni conviertas el ejercicio en una historia.`;

function toAiMessages(messages) {
  return messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content.trim().slice(0, 2000),
    }));
}

// ---------------------------------------------------------------------------
// FILTRO DETERMINISTA PRE-MODELO — ejercicio ficticio de método (llaves).
// Cambio de DISEÑO justificado por consulta a Claude (2026-11-12), NO de
// prompt: la afinación de prompt está DETENIDA (limitación del modelo;
// Workers AI aceptaba la premisa de caso real en Q2 en 2 de 3 muestras).
// Ante preguntas sobre el ejercicio / el caso del proveedor, el handler
// devuelve un texto fijo SIN llamar al modelo. Coincidencia de patrones
// sobre texto normalizado (sin LLM, sin azar): misma entrada, misma salida.
// NO modifica el prompt, el modelo, la temperatura ni max_tokens.
// LÍMITE CONOCIDO (Claude): reduce el riesgo, no lo cierra — las
// paráfrasis sin palabras de la página pueden atravesarlo y llegar al
// modelo (segunda capa: el bloque EJERCICIO FICTICIO DE MÉTODO del prompt).
// Lo único que cierra por construcción es no tener chatbot mientras el
// ejercicio esté publicado. El filtro también puede activarse ante
// preguntas legítimas cercanas al tema (p. ej. "¿quién administra mis
// sistemas?"); es el coste documentado de priorizar cero aceptaciones.
// ---------------------------------------------------------------------------
const RESPUESTA_EJERCICIO_FICTICIO = "Es un ejercicio ficticio para mostrar el método de JEFQ Consultor. No es un cliente ni un caso real; no hay hallazgos reales ni trabajo realizado.";

function normalizarTextoFiltro(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Nivel A: la pregunta, por sí sola, trata del ejercicio / caso del proveedor.
// Se usan raíces (llav, proveed, administr, ejercic...) para tolerar
// errores de tipeo habituales (letra omitida o traspuesta al final de la
// raíz) y variantes de flexión (administra/administraba/administrador).
function esPreguntaSobreEjercicio(textoNormalizado) {
  const t = textoNormalizado;
  if (!t) return false;
  const tiene = (f) => t.includes(f);
  const llav = tiene("llav");
  const proveed = tiene("proveed");
  const administr = tiene("administr");
  const ejercic = tiene("ejercic");
  const caso = tiene("caso");
  const encontr = tiene("encontr") || tiene("hallazg") || tiene("descubr");
  const tercero = tiene("tercero") || tiene("extern");
  const clav = tiene("clav");
  // A1: llaves + ancla del ejercicio.
  if (llav && (proveed || administr || ejercic || caso || tiene("empres") || tiene("sistem") || tiene("irian") || tiene("se ir"))) return true;
  // A2: proveedor + ancla (administra / todo / caso / ejercicio / llaves).
  if (proveed && (administr || tiene("todo") || caso || llav || ejercic)) return true;
  // A3: administra + ancla (todo / sistemas / llaves / ejercicio / caso / proveedor).
  if (administr && (tiene("todo") || llav || ejercic || caso || tiene("sistem") || proveed)) return true;
  // A4: ejercicio + ancla.
  if (ejercic && (llav || caso || proveed || tiene("metodo") || tiene("ficticio") || tiene("jefq") || administr || tiene("web") || tiene("pagina"))) return true;
  // A5: caso + ancla del proveedor/ejercicio.
  if (caso && (proveed || llav || ejercic || administr || encontr)) return true;
  // A6: qué encontraron/hallaron/descubrieron + ancla.
  if (encontr && (caso || proveed || ejercic || llav)) return true;
  // A7: claves (sinónimo de llaves) + ancla.
  if (clav && (administr || proveed || tercero || tiene("se ir") || tiene("irian"))) return true;
  // A8: tercero/externo que lo maneja/controla todo.
  if (tercero && (tiene("todo") || administr || llav || clav || tiene("manej") || tiene("depend") || tiene("control"))) return true;
  return false;
}

// Nivel B: seguimiento que solo tiene sentido si la premisa ya se instaló
// en un turno previo ("¿qué encontraron?", "ese caso", "cuéntame más").
// Solo dispara si algún mensaje de usuario anterior coincidió con el nivel A.
function esSeguimientoDelCaso(textoNormalizado) {
  const t = textoNormalizado;
  if (!t) return false;
  const conBordes = ` ${t} `;
  return (
    t.includes("que encontraron") || t.includes("que hallaron") || t.includes("que descubrieron") ||
    t.includes("que paso") || t.includes("que salio") ||
    t.includes("ese caso") || t.includes("este caso") || t.includes("ese proveedor") ||
    t.includes("este proveedor") || t.includes("ese ejercicio") || t.includes("este ejercicio") ||
    t.includes("del caso") || t.includes("del proveedor") ||
    t.includes("cuentame mas") || t.includes("contame mas") ||
    t.includes("y entonces") || t.includes("y que mas") || t.includes("y despues") ||
    t.includes("que mas paso") ||
    t.includes("caso real") || t.includes("fue real") || t.includes("es real") ||
    t.includes("era real") || t.includes("trabajo real") || t.includes("cliente real") ||
    t.includes("un cliente") || t.includes("de un cliente") || t.includes("para un cliente") ||
    conBordes.includes(" sigue ") || conBordes.includes(" continua ")
  );
}

// Devuelve true si la conversación trata del ejercicio / caso del proveedor:
// el último mensaje del usuario coincide con el nivel A, o es un seguimiento
// (nivel B) de una premisa instalada en un turno anterior (nivel A).
// Recibe solo los textos de los mensajes del usuario, en orden.
function filtroEjercicioFicticio(textosUsuario) {
  const normalizados = (textosUsuario || []).map(normalizarTextoFiltro).filter(Boolean);
  if (normalizados.length === 0) return false;
  const ultimo = normalizados[normalizados.length - 1];
  if (esPreguntaSobreEjercicio(ultimo)) return true;
  if (esSeguimientoDelCaso(ultimo)) {
    return normalizados.slice(0, -1).some(esPreguntaSobreEjercicio);
  }
  return false;
}


// Límite anti-abuso: 30 peticiones por minuto por IP (ventana fija de 60s).
// Sin Redis configurado o si Redis falla, el límite se desactiva (fail-open)
// y la petición sigue su curso normal.
async function limiteExcedido(request, env, nombre) {
  const ip = ipCliente(request).replace(/[^0-9a-fA-F.:]/g, '').slice(0, 40) || 'desconocida';
  const ventana = Math.floor(Date.now() / 60000);
  const c = await contar(env, `jefq:rl:${nombre}:${ip}:${ventana}`, 120);
  if (!c.ok) {
    console.error(`[jefq] Redis no disponible (${nombre}), limite desactivado:`, c.motivo);
    return false;
  }
  return c.count > 30;
}

async function handler(context) {
  const { request, env } = context;
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method-not-allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (await limiteExcedido(request, env, 'chat')) {
    return new Response(JSON.stringify({ error: "rate-limited", reply: "Estás enviando mensajes muy rápido. Espera un minuto e inténtalo de nuevo, o escríbenos por WhatsApp con el botón del sitio." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!env.AI) {
    return new Response(JSON.stringify({ error: "no-ai-binding" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try { body = await request.json(); } catch { body = null; }

  const history = toAiMessages(Array.isArray(body?.messages) ? body.messages : []);
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return new Response(JSON.stringify({ error: "bad-request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // FILTRO DETERMINISTA PRE-MODELO: ante preguntas sobre el ejercicio /
  // el caso del proveedor, responder el texto fijo SIN llamar al modelo.
  // En esta ruta no se envía contenido del ejercicio al modelo.
  if (filtroEjercicioFicticio(history.filter((m) => m.role === "user").map((m) => m.content))) {
    return new Response(JSON.stringify({ reply: RESPUESTA_EJERCICIO_FICTICIO }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mode = body?.mode === "jaime" ? "jaime" : "normal";
  const prompt = mode === "jaime" ? JAIME_PROMPT : SYSTEM_PROMPT;
  const model = env.WORKERS_AI_MODEL || DEFAULT_MODEL;

  // Llamada a Workers AI con un reintento ante 429 (límite del free allocation).
  // env.AI.run no acepta señal de cancelación: sin timeout propio; el binding
  // responde o lanza error (429, 503 u otro) y se mapea a 502 provider-error.
  let out;
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      out = await env.AI.run(model, {
        messages: [{ role: "system", content: prompt }, ...history],
        temperature: 0.7,
        // 4096: GLM-4.7-flash razona antes de responder; con 1024 el
        // razonamiento agotaba el presupuesto y content llegaba null.
        max_tokens: 4096,
      });
      break;
    } catch (e) {
      const is429 = /429/.test(String(e?.message || e));
      if (is429 && attempt < 2) {
        await new Promise((res) => setTimeout(res, 4000));
        continue;
      }
      console.error("Workers AI provider error:", e?.name, e?.message);
      return new Response(JSON.stringify({ error: "provider-error" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Forma clasica Workers AI: out.response (string).
  // Forma OpenAI (GLM-4.7-flash): out.choices[0].message.content.
  const choice = Array.isArray(out?.choices) ? out.choices[0] : null;
  const reply = (
    typeof out?.response === "string"
      ? out.response
      : typeof choice?.message?.content === "string"
        ? choice.message.content
        : ""
  ).trim();
  if (!reply) {
    return new Response(JSON.stringify({ error: "empty-reply" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ reply }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const onRequest = withSentry(handler, 'api-chat');
