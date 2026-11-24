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
- Evaluación Pyme: desde $960.500 (el recomendado para pymes). Evaluación ampliada con ruta de mejora. Incluye alcance autorizado, hasta 10 equipos, revisión de configuraciones, informe técnico y ejecutivo, plan de remediación y acompañamiento.
- Seguridad Integral: desde $1.930.500. Fortalecimiento por capas y seguimiento. Incluye alcance personalizado, evaluación autorizada, hardening priorizado, evidencias, plan por etapas y dos seguimientos.
- Servicios puntuales: consultoría remota desde $130.500/hora; hardening de sistemas desde $313.500.

MODELO ESCALABLE: los planes están diseñados para crecer con la empresa. Lo habitual es empezar por el Diagnóstico Esencial para conocer el nivel real de exposición y, según los hallazgos y el tamaño de la operación, escalar a Evaluación Pyme o a Seguridad Integral. El valor final siempre depende del alcance acordado con Jaime.

MÉTODO DE TRABAJO (4 pasos canónicos: úsalos tal cual cuando expliques cómo trabaja JEFQ, sin parafrasearlos ni sustituirlos por otros):
01 Conocer el contexto · 02 Definir el alcance · 03 Evaluar con control · 04 Entregar y acompañar.

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
- Evaluación Pyme: desde $960.500 (el recomendado para pymes). Hasta 10 equipos, revisión de configuraciones, informe técnico y ejecutivo, plan de remediación y acompañamiento.
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
5. Formato: podés usar **negritas** para precios o datos clave. Nada de asteriscos sueltos.`;

function toAiMessages(messages) {
  return messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content.trim().slice(0, 2000),
    }));
}

// FILTRO DETERMINISTA V-01 — INICIO
// FILTRO DETERMINISTA V-01 — CORRECCIÓN R21 (2026-11-23), ENMIENDA v1.2 (ciclo R22).
// Arquitectura universal según ESPECIFICACION_R21.md (ESP-R21 v1.2) y
// CONSOLIDADO_R21.md (19 condiciones C-01…C-19, decisiones D-a/D-b/D-c),
// firmados por Jaime el 2026-11-23 («Sí a todo») y revisados en orden mayor
// (Copilot, GPT y Claude: 3× APTO CON CONDICIONES). Regla OS-1 en el canon.
// Enmienda v1.2 (Ruta A, Jaime 2026-11-23 18:43): ancla G1 sobre el objeto,
// beneficiario G2, V4 solo de lo no afirmado, -ría = condicional (sin lista),
// registro propio M5 independiente de H1, G3 ampliada (contrato/póliza/oferta).
// Reemplaza el filtro enumerativo de v20 (reglas 1a–1p + 2x + 5, ~3.070 líneas)
// por una arquitectura generativa:
//   H1 (puerta de entrada, capa barata): construcción por ranuras — forma
//   verbal de pasado/perfectiva POR MORFOLOGÍA (cualquier verbo) × objeto
//   comercial × atribución, con guardas publicadas (G1–G4), negación,
//   modalidad y actos de habla. La entrada es tolerante: la ambigüedad sola
//   no bloquea; las premisas sin forma de pasado se registran, no se bloquean.
//   H2 (capa de salida, la garantía): registro propio de pretensiones
//   INDEPENDIENTE de H1 + validador de procedencia sobre el texto final
//   (lista blanca numérica V1, porcentajes V2, sustantivos V3) + chequeo
//   relacional pretensión–respuesta (§4.4). La salida falla cerrada.
// El criterio del diseño es «riesgo residual medido y acotado» (D-b/C-10);
// el §8 canónico queda intacto. NO cambia el texto del prompt, el modelo,
// la temperatura ni max_tokens. El registro es solo el evento técnico, sin
// el contenido de los mensajes ni datos personales (especificación §9.2).
// Referencias de sección en los comentarios: «ESP §x.y» = especificación;
// «C-xx» = condición del consolidado; «L-xx» = limitación del registro §10.
const V01_SAFE_REPLY = "No tengo un registro verificable de ese acuerdo, descuento o condición especial. Para confirmarlo, por favor comuníquese directamente con JEFQ Consultor.";
const V01_VERSION = "22";

// ── Configuración de modo (D-a / ESP §9) ──────────────────────────────────────
// Piezas: H1 (S2), S1 = V1+V2 (lista blanca numérica y porcentajes),
// S3 = V3 (sustantivos y afirmaciones), S4 = chequeo relacional (§4.4).
// Modos por pieza: "bloqueo" (intercepta/sustituye), "sombra" (solo registra
// el evento, la conversación sigue), "off" (pieza desactivada).
// Variables de entorno (Cloudflare Pages, ámbito del despliegue):
//   V01_MODO      = modo global para todas las piezas
//   V01_MODO_H1   = modo de H1 (S2)   V01_MODO_S1 / V01_MODO_S3 / V01_MODO_S4
// Por defecto: bloqueo en todas las piezas (comportamiento del arco; la
// sombra se habilita por pieza con la variable, por decisión de despliegue
// de Jaime — D-a: el primer despliegue va en sombra, empezando por S1).
function v01ConfigPorDefecto() {
  return { h1: "bloqueo", s1: "bloqueo", s3: "bloqueo", s4: "bloqueo" };
}
function v01ConfigDesdeEnv(env) {
  const cfg = v01ConfigPorDefecto();
  const norm = (v) => (v === "sombra" || v === "off" || v === "bloqueo" ? v : null);
  if (env) {
    const g = norm(env.V01_MODO);
    if (g) { cfg.h1 = g; cfg.s1 = g; cfg.s3 = g; cfg.s4 = g; }
    const h1 = norm(env.V01_MODO_H1); if (h1) cfg.h1 = h1;
    const s1 = norm(env.V01_MODO_S1); if (s1) cfg.s1 = s1;
    const s3 = norm(env.V01_MODO_S3); if (s3) cfg.s3 = s3;
    const s4 = norm(env.V01_MODO_S4); if (s4) cfg.s4 = s4;
  }
  return cfg;
}

// ── Registro canónico de hechos publicados, REG v1.0 (ESP §7) ────────────────
// Derivado de src/data/precios.ts (fuente única; hash asentado en el
// expediente de construcción, C-17). El dominio particular está VACÍO por
// construcción (ESP §7.2): toda afirmación de condición particular carece
// de procedencia por definición. F-13: ningún porcentaje publicado.
const V01_REG_VALORES = [421500, 960500, 1930500, 130500, 313500];
const V01_REG_NOMBRES = [
  "diagnostico esencial", "evaluacion pyme", "seguridad integral",
  "consultoria remota", "hardening", "seguridad para ia",
  "diagnostico", "evaluacion pyme", "seguridad integral",
];
// Formas cortas inscritas para el ancla G1 (§7.1 campo formasCortas y §2.7):
// «la consultoría» ancla a la Consultoría remota; «el esencial / el pyme /
// el integral» anclan a sus planes por nombre corto.
const V01_REG_FORMAS_CORTAS = ["esencial", "pyme", "integral", "consultoria"];
// Frases de inclusiones publicadas (anclan a lo publicado, G1(a)):
const V01_REG_INCLUSIONES = [
  "plan de remediacion", "informe ejecutivo", "informe tecnico",
  "alcance autorizado", "alcance personalizado", "sesion de resultados",
  "reunion remota", "dos seguimientos", "plan recomendado",
];
// Cantidades de las inclusiones (§7.3, procedencia V1(c)):
const V01_REG_CANTIDADES = { equiposEsencial: 3, equiposPyme: 10, seguimientosIntegral: 2, pasosMetodo: 4 };

// ── Utilidades ────────────────────────────────────────────────────────────────
// Normalización determinista: minúsculas, sin tildes, puntuación a espacios,
// espacios colapsados. Conserva los límites de palabra. (Igual que v20.)
function v01Normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// Minúsculas CON tildes (para distinguir -ó/-ió de -o/-io, §1.4).
function v01CrudoMin(texto) {
  return (texto || "").toLowerCase();
}
// Huella FNV-1a (32 bits) para deduplicar eventos sin conservar contenido
// (ESP §9.2). No es criptográfica; basta para dedupe de eventos técnicos.
function v01Huella(texto) {
  let h = 0x811c9dc5;
  const s = String(texto || "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}
// Segmenta el texto crudo en oraciones por puntuación fuerte o salto de
// línea; cada oración se normaliza por separado (la normalización borra la
// puntuación, así que la segmentación va ANTES).
function v01Oraciones(texto) {
  return String(texto || "")
    .split(/(?:[.!?…]+|\n)+/)
    .map((o) => ({ crudo: o.trim(), n: v01Normalizar(o), r: v01CrudoMin(o) }))
    .filter((o) => o.n.length > 0);
}
function v01Tokens(n) { return n ? n.split(" ") : []; }
function v01Tiene(tokens, palabra) { return tokens.indexOf(palabra) >= 0; }
function v01Alguno(tokens, lista) { return lista.some((w) => tokens.indexOf(w) >= 0); }

// ── INV-VERB v1.0 — Formas verbales de la ranura (ESP §1.4) ─────────────────
// La ranura R1 se llena POR MORFOLOGÍA, no por identidad del verbo: cualquier
// verbo en la forma adecuada llena la ranura, incluido uno jamás enumerado
// («bonificaron»). Las listas aquí son de FORMAS (desinencias y raíces
// irregulares), no de verbos de concesión: la semántica de concesión vive
// solo en V01_VERBOS_CONCESION, usada únicamente para completar la
// atribución por contexto (ATR-B, ESP §1.2), nunca como disparador.
// v01FormaVerbal(token, rawToken) → null | {kind, forma}.
// kind: "pasado" (pretérito/imperfecto/pluscuamperfecto), "haber" (auxiliar
// de perfecto compuesto), "participio", "gerundio", "continuidad" (perífrasis
// seguir/venir/estar + gerundio, en presente o pasado: ESP §1.4 + §3 E3).
const V01_IRREG_PARTICIPIOS = ["puesto", "hecho", "dicho", "visto", "escrito", "resuelto", "devuelto", "cubierto", "abierto", "impreso", "satisfecho"];
const V01_RAICES_FUERTES = /^(tuv|estuv|anduv|pud|pus|sup|quis|hic|dij|traj|vin|mantuv|retuv|detuv|contuv|obtuv|dier|vier|oyer|cayer|leyer|incluyer)(e|o|iste|imos|ieron|eron|a|as|amos|an)$/;
const V01_HABER = ["he", "has", "ha", "hemos", "han", "habia", "habias", "habia", "habiamos", "habian", "hube", "hubiste", "hubo", "hubimos", "hubieron"];
// Verbos de concesión/acuerdo (raíces, ESP §1.2 ATR-B y §2.2): SOLO completan
// la atribución en la construcción escueta (sin marca de 1.ª persona), nunca
// disparan por sí solos. Lista declarada; su crecimiento es inscripción §1.0.
const V01_VERBOS_CONCESION = ["garant", "asegur", "reserv", "otorg", "compromet", "manten", "mantuv", "conserv", "renov", "extend", "aplic", "respet", "reconoc", "ofrec", "conced", "bonific", "revalid", "valid", "confirm", "cerr", "firm", "fij", "dej", "pon", "pus", "promet", "asign", "aprob", "dij", "d"];
const V01_RAICES_VERBALES = [
  "absorb", "acept", "acolch", "acord", "acort", "adopt", "afect", "afirm", "agend", "alcanz", "ampli", "ancl",
  "aplic", "aprob", "asegur", "asign", "asum", "atraves", "atribu", "ausenc", "autoriz", "bonific", "camb", "cambi",
  "captur", "cas", "cerr", "coherenc", "colg", "combin", "compan", "compart", "compromet", "conced", "concert", "concordanc",
  "confirm", "conoc", "consecuenc", "consensu", "conserv", "const", "constanc", "cont", "contempl", "conten", "continu", "conven",
  "conveni", "convers", "convin", "cotiz", "decid", "declar", "dedic", "defin", "dej", "deliber", "delimit", "demasi",
  "demostr", "derrot", "dij", "dispar", "document", "ejecut", "elev", "emit", "entr", "enumer", "envi", "escap",
  "est", "establec", "estuv", "evalu", "exclu", "existenc", "extend", "falt", "famil", "fij", "firm", "formaliz",
  "garantiz", "gener", "generaliz", "gobern", "grac", "hab", "habl", "hered", "hic", "homolog", "inclu", "incrust",
  "indefin", "indic", "intercal", "invert", "iter", "justific", "juzg", "limpi", "llam", "manten", "mantub", "mantuv",
  "med", "mencion", "mir", "negoci", "nombr", "nominaliz", "normaliz", "oblig", "obligator", "observ", "ofrec", "omit",
  "otorg", "pact", "particip", "pas", "peg", "permanec", "pertinenc", "predic", "prev", "prolong", "promet", "prop",
  "prorrog", "public", "qued", "ratific", "reconoc", "redecid", "reduc", "referenc", "refut", "registr", "renov", "repet",
  "reserv", "respald", "respet", "result", "retir", "reval", "revalid", "revis", "romp", "sal", "secuenc", "segu",
  "separ", "señal", "sosten", "sostuv", "tarif", "todav", "toleranc", "trabaj", "val", "valid", "verific", "vigenc",
  "vincul", "vál",
];
// Núcleos que nombran una condición comercial (vs. prestación/documento).
// La pata de acuerdo de ATR-B solo se apoya en estos (ESP §1.2, L-02).
const V01_NUCLEOS_CONDICION = ["precio", "tarifa", "descuento", "rebaja", "bonificacion", "cuota", "mensualidad", "valor", "costo", "coste", "importe", "monto", "cobro", "honorario", "condicion", "beneficio", "ventaja", "oferta", "promocion", "contrato", "acuerdo", "convenio", "compromiso", "trato", "abono", "anticipo", "suscripcion", "saldo", "poliza", "comision", "deuda", "credito", "renta", "matricula", "licencia", "membresia", "bono", "cupon", "garantia"];
// Sustantivos y adjetivos que terminan en -o y NO son verbos: evitan que la
// lectura de 3.ª persona de pretérito los confunda con un verbo.
const V01_NO_VERBO_O = ["nuevo", "viejo", "bueno", "malo", "alto", "bajo", "unico", "mismo", "propio", "primero", "ultimo", "completo", "fijo", "directo", "indirecto", "seguro", "claro", "exacto", "correcto", "publico", "privado", "largo", "corto", "caro", "barato", "justo", "necesario", "posible", "importante", "interesante", "diferente", "precio", "tarifa", "descuento", "servicio", "contrato", "acuerdo", "convenio", "beneficio", "oferta", "promocion", "plan", "paquete", "cotizacion", "presupuesto", "factura", "propuesta", "monto", "costo", "coste", "valor", "cuota", "mensualidad", "importe", "honorario", "condicion", "contratacion", "renovacion", "vigencia", "plazo", "modalidad", "trato", "arreglo", "caso", "paso", "esto", "eso", "ello", "lo", "todo", "nada", "mucho", "poco", "otro"];
// Participios de acuerdo: junto a un núcleo lo particularizan (OBJ-B).
const V01_PARTICIPIOS_ACUERDO = ["acordado", "pactado", "convenido", "negociado", "garantizado", "asegurado", "prometido", "ofrecido", "concedido", "otorgado", "asignado", "aprobado", "respetado", "firmado", "ratificado", "formalizado", "prorrogado", "renovado", "extendido", "confirmado", "revalidado", "bonificado", "reconocido", "aplicado", "mantenido", "conservado"];
const V01_VERBOS_COMUNICACION = ["habl", "convers", "acord", "pact", "negoci", "coment", "trat", "discut", "qued", "expus", "plante", "defin", "establec", "mencion"];
function v01EsGerundio(t) { return /(ando|iendo|endo)$/.test(t) && t.length > 5; }
function v01EsParticipio(t) {
  if (V01_IRREG_PARTICIPIOS.indexOf(t) >= 0) return true;
  return /(ado|ada|ados|adas|ido|ida|idos|idas)$/.test(t) && t.length > 4;
}
// 1.ª persona del plural de un verbo (presente o pretérito: «hablamos» es
// ambas; en remisión y como sujeto cuenta como forma de 1.ª plural).
function v01EsPrimeraPlural(t) {
  return /(amos|emos|imos)$/.test(t) && t.length >= 5 && t !== "vamos" || t === "vamos";
}
// 1.ª plural en PRETÉRITO: -amos es pretérito para -ar («acordamos» es
// presente y pretérito) e -imos lo es para -er («comimos») y para -ir
// («vivimos» es ambas). -emos es SOLO presente de -er («tenemos»,
// «podemos», «hacemos»): su pretérito es -imos («tuvimos», «pudimos»).
// Irregulares cuya 1.ª plural no es pretérito: ir (vamos/fuimos), estar
// (estamos/estuvimos), dar (damos/dimos), decir (decimos/dijimos), venir
// (venimos/vinimos). ESP §1.4: la ranura R1 es de pasado, no de persona.
function v01EsPrimeraPluralPasada(t) {
  return /(amos|imos)$/.test(t) && t.length >= 5 && ["vamos", "estamos", "damos", "decimos", "venimos"].indexOf(t) < 0;
}
// Sustantivos en -ía con tilde que la desinencia de imperfecto no debe
// leer como verbos («garantía» es un sustantivo; el verbo es «garantizar»).
const V01_NO_VERBO_IA = ["garantia", "farmacia", "policia", "energia", "tecnologia", "compania", "familia", "historia", "memoria", "categoria", "mayoria", "minoria", "alegria", "melodia", "sinfonia", "ortografia", "fotografia", "geografia", "filosofia", "teoria", "democracia", "burocracia", "aristocracia", "monarquia", "anarquia", "jerarquia"];
// ¿El token es una forma verbal en modo condicional (-ría/-rías/-ríamos/
// -rían)? Regla morfológica (ESP §1.4, precisión v1.2): presencia de -r-
// ante -ía, no de lista — la lista cerrada de temas irregulares queda
// retirada. La desinencia -ía sin -r- («comía», «vivía») es imperfecto y
// NO es condicional. Se exige la tilde en el crudo, como el resto de las
// formas en -ía. Consecuencia declarada de la regla (§1.4 v1.2): «quería»,
// «prefería», «moría» (imperfecto de tema terminado en -r) se leen como
// condicional, porque la regla decide por la -r- ante -ía.
function v01EsCondicionalForma(t, r) {
  if (!t || t.length < 5) return false;
  if (!/r(ia|ias|iamos|ian)$/.test(t)) return false;
  return /ría/.test(r || "");
}
function v01FormaVerbal(t, r, sinRaiz, esAdjetivo) {
  if (!t) return null;
  if (t === "si" || t === "mi" || t === "ti" || t === "que" || t === "todavia") return null; // «qué» es pronombre; «todavía», adverbio.
  // Irregulares exactos de pretérito.
  if (["fue", "fueron", "fui", "hizo", "dio", "vio"].indexOf(t) >= 0) return { kind: "pasado", forma: t };
  if (V01_HABER.indexOf(t) >= 0) return { kind: "haber", forma: t };
  // Raíces fuertes de pretérito.
  if (V01_RAICES_FUERTES.test(t)) return { kind: "pasado", forma: t };
  // Pretérito 3.ª sg -ar/-er con tilde en el crudo («garantizó», «comió»).
  if (/ó$/.test(r) || /ió$/.test(r)) return { kind: "pasado", forma: t };
  // 3.ª sg sin tilde: «garantizo», «prometio» (el corpus heredado no tilda).
  // La -o es ambigua entre 3.ª de pretérito, 1.ª de presente («valido»),
  // sustantivo («precio») y adjetivo («nuevo»): se lee como pretérito solo
  // si la raíz es una raíz verbal conocida (V01_RAICES_VERBALES, que es
  // morfología — reconoce verbosidad, no concesión) y el token no es un
  // sustantivo o adjetivo conocido (V01_NO_VERBO_O). La ambigüedad se
  // resuelve hacia el pasado (fail-closed, ESP §8): el coste de dejar pasar
  // una premisa supera al de un falso positivo.
  if (!sinRaiz && !esAdjetivo && t.endsWith("o") && V01_NO_VERBO_O.indexOf(t) < 0) {
    const raiz = t.slice(0, -1);
    if (V01_RAICES_VERBALES.indexOf(raiz) >= 0) return { kind: "pasado", forma: t };
  }
  if (!sinRaiz && !esAdjetivo && t.endsWith("io") && V01_NO_VERBO_O.indexOf(t) < 0) {
    const raiz = t.slice(0, -2);
    if (V01_RAICES_VERBALES.indexOf(raiz) >= 0) return { kind: "pasado", forma: t };
  }
  // NOTA (ESP §1.4, §2.6): la continuidad en PRESENTE («se mantiene»,
  // «sigue vigente») NO llena R1: el presente solo llena la ranura con
  // remisión. Es una premisa en presente: se registra (§4.2) y la juzga H2.
  // Solo la perífrasis de continuidad en pasado llena R1 (§2.7).
  // Pretérito 1.ª sg con tilde («hablé», «pedí»).
  if (/é$/.test(r) || /í$/.test(r)) return { kind: "pasado", forma: t };
  // Desinencias distintivas (sin tilde, inconfundibles con sustantivos).
  if (/(aste|asteis|aron|ieron|eron|iste|isteis|aba|aban|abamos|ia|ias|iamos|ian)$/.test(t) && t.length >= 5) {
    // Imperfecto -ía con tilde en el crudo («tenía»); sin tilde («farmacia»)
    // no es imperfecto: se exige la tilde para las formas en -ia.
    if (/(ia|ias|iamos|ian)$/.test(t) && !/ía/.test(r)) return null;
    // Sustantivo en -ía con tilde («garantía»): no es imperfecto.
    if (/(ia|ias|iamos|ian)$/.test(t) && V01_NO_VERBO_IA.indexOf(t) >= 0) return null;
    // El modo condicional en -ría («sería», «podría», «tendría», «habría»,
    // «vería», «querría», «costaría», «incluiría», «darían») NO es pretérito:
    // es irrealis (ESP §1.4, precisión v1.2) y NO llena la ranura verbal de
    // pasado. La distinción es morfológica (v01EsCondicionalForma), no de
    // lista. La desinencia -ía sin -r- («comía», «vivía») sigue siendo
    // imperfecto y llena la ranura.
    if (/(ia|ias|iamos|ian)$/.test(t) && v01EsCondicionalForma(t, r)) return null;
    return { kind: "pasado", forma: t };
  }
  // 1.ª plural en pretérito (solo -amos/-imos; -emos es presente de -er).
  if (v01EsPrimeraPluralPasada(t)) return { kind: "pasado", forma: t };
  if (v01EsGerundio(t)) return { kind: "gerundio", forma: t };
  if (v01EsParticipio(t)) return { kind: "participio", forma: t };
  return null;
}
// ¿El token es forma de continuidad (seguir/venir/estar + gerundio)?
// El auxiliar puede estar en presente («sigue permaneciendo», ESP §3 E3) o
// en pasado («se siguió manteniendo», ESP §2.7).
function v01EsContinuidad(tokens, i) {
  const t = tokens[i];
  if (!t) return null;
  const aux = ["seguia", "seguian", "siguio", "siguieron", "venia", "venian", "vino", "vinieron", "estaba", "estaban", "estuvo", "estuvieron"]; // solo pasado (ESP §1.4): «sigue permaneciendo» en presente no llena R1.
  if (aux.indexOf(t) < 0) return null;
  for (let j = i + 1; j <= Math.min(i + 2, tokens.length - 1); j++) {
    if (v01EsGerundio(tokens[j])) return { kind: "continuidad", forma: t + " " + tokens[j], gerundio: tokens[j] };
  }
  return null;
}
// ¿La forma finita es verbo de mantenimiento en pasado (ESP §2.7)?
// Se decide por raíz + forma ya clasificada como pasada (la tilde ya se
// resolvió al clasificar la forma; aquí solo se exige la raíz).
function v01EsMantenimientoPasado(tokens, i, kind) {
  const t = tokens[i];
  if (!t || kind !== "pasado") return false;
  const raices = ["manten", "mantuv", "conserv", "permanec", "qued", "continu", "segu", "renov", "extend", "prorrog", "prolong", "sosten", "sostuv"];
  // «quedó + participio» es pasiva resultativa, no mantenimiento.
  if (t.indexOf("qued") === 0 && i + 1 < tokens.length && v01EsParticipio(tokens[i + 1])) return false;
  if (raices.some((r) => t.indexOf(r) === 0)) return true;
  // Perfecto compuesto: el participio es el verbo («había mantenido»).
  if (V01_HABER.indexOf(t) >= 0) {
    for (let j = i + 1; j <= Math.min(i + 3, tokens.length - 1); j++) {
      if (["me", "te", "se", "nos", "le", "les"].indexOf(tokens[j]) >= 0) continue;
      if (v01EsParticipio(tokens[j])) return raices.some((r) => tokens[j].indexOf(r) === 0);
      break;
    }
  }
  return false;
}

// ── INV-OBJ v1.1 (ESP §1.1) ──────────────────────────────────────────────────
// OBJ-A: núcleos del campo comercial (con morfología productiva: plural).
const V01_OBJ_A = ["precio", "tarifa", "cobro", "cuota", "mensualidad", "valor", "costo", "coste", "importe", "monto", "descuento", "rebaja", "bonificacion", "cotizacion", "presupuesto", "plan", "paquete", "servicio", "contratacion", "renovacion", "honorario", "condicion",
  // INSCRIPCIÓN v1.1 (acta en INSCRIPCION_OBJ_v1.1.md, procedimiento ESP §1.0):
  // los 26 núcleos comerciales que el corpus heredado usa como objeto de
  // la construcción (cats 72/88/93/105) y que la v1.0 omitió. No es una lista
  // de verbos ni una familia de remisión: es la clase semántica del objeto.
  "oferta", "contrato", "acuerdo", "convenio", "promocion", "beneficio", "ventaja", "pago", "prestamo", "compromiso", "trato", "abono", "anticipo", "suscripcion", "saldo", "poliza", "comision", "deuda", "credito", "renta", "matricula", "licencia", "membresia", "bono", "cupon", "garantia"];
// OBJ-B: adjetivos y marcas de particularidad (con flexión de género/número).
const V01_OBJ_B = ["especial", "acordado", "pactado", "preferencial", "preferente", "corporativo", "empresarial", "negociado", "convenido", "personalizado"];
// OBJ-C: referencias genéricas y anafóricas (ESP §1.1; «condiciones» vive aquí).
const V01_OBJ_C = ["eso", "ello", "lo mismo", "lo anterior", "lo acordado", "lo conversado", "lo hablado", "modalidad"]; // «beneficio»/«ventaja» son núcleos (OBJ-A) desde la inscripción v1.1.
function v01EsNucleo(t) {
  if (V01_OBJ_A.indexOf(t) >= 0) return t;
  // Plural productivo: -s / -es.
  if (t.length > 3) {
    const s1 = t.replace(/s$/, "");
    if (V01_OBJ_A.indexOf(s1) >= 0) return s1;
    const s2 = t.replace(/es$/, "");
    if (V01_OBJ_A.indexOf(s2) >= 0) return s2;
  }
  return null;
}
function v01EsMarcaParticular(t) {
  if (V01_OBJ_B.indexOf(t) >= 0) return t;
  const base = t.replace(/(a|o|as|os|es)$/, "");
  if (V01_OBJ_B.indexOf(base) >= 0) return base;
  // Participios de acuerdo con flexión de género/número («garantizada»,
  // «negociados»): particularizan el núcleo al que acompañan.
  for (const p of V01_PARTICIPIOS_ACUERDO) {
    if (t === p || t === p.slice(0, -1) + "a" || t === p + "s" || t === p.slice(0, -1) + "as") return p;
  }
  return null;
}
function v01EsAnafora(t) {
  if (V01_OBJ_C.indexOf(t) >= 0) return t;
  if (t === "esa" || t === "esta" || t === "aquella") return t; // + núcleo que sigue
  return null;
}
// ¿Hay una marca de particularidad OBJ-B cerca (ventana ±4) del índice?
function v01ParticularidadCerca(tokens, idx) {
  for (let j = Math.max(0, idx - 4); j <= Math.min(tokens.length - 1, idx + 4); j++) {
    if (j !== idx && v01EsMarcaParticular(tokens[j])) {
      const marca = tokens[j];
      const esPart = v01EsParticipio(marca) || V01_PARTICIPIOS_ACUERDO.some((p) => marca === p || marca === p.slice(0, -1) + "a" || marca === p + "s" || marca === p.slice(0, -1) + "as");
      if (esPart && j > 0) {
        const prev = tokens[j - 1];
        if (["fue", "fueron", "era", "eran", "es", "son", "fueran", "ser", "estar", "esta", "estan", "estaba", "estaban", "ha", "han", "habia", "habian", "habiamos", "hube", "hubo", "quedo", "quedan", "quedaron", "quedaba", "quedaban"].indexOf(prev) >= 0) continue;
      }
      return marca;
    }
  }
  return null;
}
// Escanea una oración y devuelve los objetos encontrados:
// {idx, nucleo, tipo: "A"|"C", particular: marca|null, inherente: bool}
function v01ObjetosEnOracion(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const nuc = v01EsNucleo(t);
    if (nuc) {
      const part = v01ParticularidadCerca(tokens, i);
      // «un trato especial» es trato (servicio), no una condición: el
      // adjetivo cambia el sentido del sustantivo. No es objeto.
      if (nuc === "trato" && part === "especial") continue;
      // «la garantía del equipo/producto/servicio» es garantía de producto
      // (prestación, R19 E1), no una condición acordada. No es objeto.
      if (nuc === "garantia" && tokens[i + 1] === "del" && ["equipo", "producto", "servicio"].indexOf(tokens[i + 2]) >= 0) continue;
      out.push({ idx: i, nucleo: nuc, tipo: "A", particular: part, inherente: ["descuento", "rebaja", "bonificacion"].indexOf(nuc) >= 0 });
      continue;
    }
    // OBJ-C: anáfora sola, «lo + participio» o demostrativo + núcleo.
    if (t === "lo" && i + 1 < tokens.length) {
      const sig = tokens[i + 1];
      if (["acordado", "pactado", "convenido", "negociado", "garantizado", "dicho", "prometido", "ofrecido", "conversado", "hablado", "mismo", "anterior"].indexOf(sig) >= 0) {
        out.push({ idx: i, nucleo: "lo " + sig, tipo: "C", particular: null, inherente: false });
        continue;
      }
    }
    if (v01EsAnafora(t)) {
      if (t === "esa" || t === "esta" || t === "aquella") {
        const sig = tokens[i + 1];
        if (sig && v01EsNucleo(sig)) {
          out.push({ idx: i, nucleo: sig, tipo: "C", particular: v01ParticularidadCerca(tokens, i + 1), inherente: false });
          continue;
        }
        continue; // demostrativo sin núcleo comercial: no es objeto.
      }
      out.push({ idx: i, nucleo: t, tipo: "C", particular: null, inherente: false });
    }
  }
  return out;
}

// ── INV-ATR v1.0 (ESP §1.2) e INV-REM v1.0 (ESP §1.3) ─────────────────────────
// ATR-A: posesivos/clíticos de 1.ª persona y marcos de complemento indirecto.
// ATR-B: atribución por contexto de sesión (regla general, no lista).
// REM-A: derivable por forma. REM-B: lista inscrita de verbos de comunicación.
function v01AtribucionEnOracion(tokens, n) {
  // Personas terceras: un posesivo o un clítico que las califica no atribuye
  // la condición al visitante («mi contador», «a su empresa»).
  const personasTercero = ["socio", "hermano", "contador", "colega", "abogado", "asesor", "jefe", "amigo", "familiar", "primo", "tio", "padre", "madre", "esposo", "esposa", "hijo", "hija", "cunado", "suegro", "vecino", "cliente"];
  const tieneTercero = tokens.some((t, i) => (t === "otra" && tokens[i + 1] === "empresa") || (t === "otro" && (tokens[i + 1] === "cliente" || tokens[i + 1] === "persona")) || (t === "empresa" && tokens[i + 1] === "de") || personasTercero.indexOf(t) >= 0 || (t === "a" && tokens[i + 1] === "su" && tokens[i + 2] === "empresa"));
  const tieneComunicacion = tokens.some((t) => ["cont", "dij", "escrib", "llam", "avis", "coment", "explic", "inform", "mencion", "pregunt", "respond", "confirm"].some((r) => t.indexOf(r) === 0));
  const out = { expresa: false, remision: false, primeraPlural: false, destinos: [], destinoEmpresa: false };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    // Posesivo sobre una persona tercera («mi contador») califica al
    // narrador, no al beneficiario de la condición: no atribuye. («mi
    // empresa», «mi descuento» sí atribuyen: el posesivo es de la condición.)
    if (["mi", "mis", "nuestro", "nuestra", "nuestros", "nuestras"].indexOf(t) >= 0) {
      if (personasTercero.indexOf(tokens[i + 1]) < 0) out.expresa = true;
    }
    // «me/nos» como objeto de un verbo de comunicación con destino tercero
    // («me contó que a su empresa…»): el visitante es el oyente, no el
    // beneficiario. Sin tercero, «me dijeron…» sí atribuye (dos partes).
    if (["me", "nos"].indexOf(t) >= 0) {
      if (!(tieneComunicacion && tieneTercero)) out.expresa = true;
    }
    if (["nosotros", "nosotras"].indexOf(t) >= 0) out.expresa = true;
    // «te» como dativo del visitante («¿Te mantuvieron el beneficio?»): el
    // visitante es el beneficiario aunque el verbo no sea de 1.ª persona.
    if (t === "te") {
      const tienePasado = tokens.some((x) => { const f = v01FormaVerbal(x, x); return f && (f.kind === "pasado" || f.kind === "participio"); });
      if (tienePasado) out.expresa = true;
    }
    // Destino «para/a la empresa» sin posesivo: solo atribuye dentro de la
    // construcción nominalizada (ESP §2.8); se marca y se decide en H1.
    if ((t === "para" || t === "a") && tokens[i + 1] === "la" && tokens[i + 2] === "empresa") out.destinoEmpresa = true;
    if (v01EsPrimeraPlural(t)) out.primeraPlural = true;
    // Marcos de complemento indirecto a la empresa del visitante.
    if ((t === "para" || t === "a" || t === "de") && tokens[i + 1] === "mi" && tokens[i + 2] === "empresa") out.expresa = true;
    if ((t === "para" || t === "a" || t === "de") && tokens[i + 1] === "nuestra" && tokens[i + 2] === "empresa") out.expresa = true;
    // Destinos a tercero (para la guarda G2): «otra empresa», «la empresa de».
    if (t === "otra" && tokens[i + 1] === "empresa") out.destinos.push("tercero");
    if (t === "otro" && (tokens[i + 1] === "cliente" || tokens[i + 1] === "persona")) out.destinos.push("tercero");
    if (t === "empresa" && tokens[i + 1] === "de") out.destinos.push("tercero");
    if (personasTercero.indexOf(t) >= 0) out.destinos.push("tercero");
    if (t === "a" && tokens[i + 1] === "su" && tokens[i + 2] === "empresa") out.destinos.push("tercero");
  }
  // REM-A: «según lo + participio» (cualquier participio), «como + 1.ª plural»,
  // «de acuerdo con lo + participio», «conforme a lo + participio».
  // Excluidos: participios de publicación («publicado», «anunciado» y
  // «indicado» con ancla de canal) — esos remiten a lo publicado (G1).
  if (/segun lo [a-z]+(ado|ada|ados|adas|ido|ida|idos|idas|uesto|echo|icho|isto|escrito|esuelto|evuelto|ubierto|abierto|impreso)\b/.test(" " + n + " ")) {
    const m = n.match(/segun lo ([a-z]+)/);
    if (m && ["publicado", "anunciado", "indicado"].indexOf(m[1]) < 0) out.remision = true;
  }
  if (/de acuerdo con lo [a-z]+(ado|ido|uesto|echo|icho|isto)\b/.test(" " + n + " ")) out.remision = true;
  if (/conforme a lo [a-z]+(ado|ido|uesto|echo|icho|isto)\b/.test(" " + n + " ")) out.remision = true;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "como" && i + 1 < tokens.length && v01EsPrimeraPlural(tokens[i + 1])) out.remision = true;
    // Relativa de remisión: «que + 1.ª plural en pasado» o «que + verbo de
    // comunicación en pasado» («que hablamos», «que acordamos», ESP §2.3).
    if (tokens[i] === "que" && i + 1 < tokens.length) {
      const sig = tokens[i + 1];
      if (v01EsPrimeraPlural(sig) || (V01_VERBOS_COMUNICACION.some((r) => sig.indexOf(r) === 0) && v01FormaVerbal(sig, sig))) out.remision = true;
    }
    // REM-B: verbos de comunicación en 1.ª plural en pasado como ancla de
    // acuerdo («Expusimos un precio menor…», ESP §1.3). Lista inscrita.
    if (v01EsPrimeraPlural(tokens[i]) && V01_VERBOS_COMUNICACION.some((r) => tokens[i].indexOf(r) === 0)) out.remision = true;
  }
  return out;
}
function v01TieneAtribucion(atr) { return atr.expresa || atr.remision || atr.primeraPlural; }
// ATR-B: con R1 y R2 presentes y particularidad (o verbo de concesión) y sin
// beneficiario tercero, la condición se atribuye al visitante (ESP §1.2).
function v01AtribucionPorContexto(objeto, tokens, atr, raws) {
  if (atr.destinos.indexOf("tercero") >= 0) return false;
  if (objeto && (objeto.particular || objeto.inherente)) return true;
  // Construcción de acuerdo: verbo de concesión en la oración, solo con
  // núcleo de condición. «¿Se mantiene el servicio?» es una pregunta
  // pública sobre una prestación, no una premisa sobre una condición.
  if (objeto && objeto.tipo === "A" && V01_NUCLEOS_CONDICION.indexOf(objeto.nucleo) >= 0 && !atr.destinoEmpresa) {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const f = v01FormaVerbal(t, raws && raws[i] ? raws[i] : t);
      if (f && (f.kind === "pasado" || f.kind === "continuidad") && V01_VERBOS_CONCESION.some((r) => t.indexOf(r) === 0)) return true;
      // Participio gobernado por haber («había otorgado»): el participio ES
      // el verbo del perfecto, no un adjetivo («precio comprometido» no
      // cuenta: ahí el participio modifica al sustantivo, R19 E1).
      if (v01EsParticipio(t) && i > 0 && V01_HABER.indexOf(tokens[i - 1]) >= 0) {
        const raizPart = t.replace(/(ado|ada|ados|adas|ido|ida|idos|idas|uesto|echo|icho|isto)$/, "");
        if (V01_VERBOS_CONCESION.some((r) => raizPart.indexOf(r) === 0)) return true;
      }
    }
  }
  return false;
}

// ── INV-GUARDA v1.1 (ESP §1.5) ───────────────────────────────────────────────
// G1: referencia a lo publicado (tres formas de ancla y solo estas tres).
// G2: narración de terceros (D-1). G3: uso documental (definición operativa).
// G4: vigencia de lo publicado sin marcador de acuerdo.
// Sustantivos en uso documental (G3, lista compartida por la guarda y por H1):
// contrato, póliza, oferta, cotización, presupuesto, factura, propuesta.
const V01_DOC_N = ["contrato", "poliza", "oferta", "cotizacion", "presupuesto", "factura", "propuesta"];
function v01GuardasEnOracion(tokens, n) {
  const g = { g1: false, g1Motivo: null, g2: false, g3: false, g4: false };
  const texto = " " + n + " ";
  // G1(a): nombre propio del registro o forma corta inscrita. La ancla se
  // busca por posición de token: una ancla dentro de una cláusula de
  // finalidad («para pagar el diagnóstico») no ancla el objeto — el
  // referente de la cláusula es el fin, no el objeto (ESP §1.5: el ancla
  // es del objeto, no de la oración).
  const propositoDesde = (() => {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i] === "para" && /(ar|er|ir)$/.test(tokens[i + 1]) && tokens[i + 1].length >= 4) return i;
    }
    return -1;
  })();
  const antesDeProposito = (idx) => propositoDesde < 0 || idx < propositoDesde;
  const secuenciaEn = (frase) => {
    const ws = frase.split(" ");
    for (let i = 0; i + ws.length <= tokens.length; i++) {
      let ok = true;
      for (let k = 0; k < ws.length; k++) if (tokens[i + k] !== ws[k]) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  };
  for (const nombre of V01_REG_NOMBRES) {
    const idx = secuenciaEn(nombre);
    if (idx >= 0 && antesDeProposito(idx)) { g.g1 = true; g.g1Motivo = "nombre:" + nombre; break; }
  }
  for (const corto of V01_REG_FORMAS_CORTAS) {
    if (g.g1) break;
    const idx = tokens.indexOf(corto);
    if (idx >= 0 && antesDeProposito(idx)) {
      // «mi pyme» / «nuestra pyme» es la empresa del visitante, no el plan.
      if (corto === "pyme" && /(mi|nuestra|nuestro|su) pyme\b/.test(n)) continue;
      g.g1 = true; g.g1Motivo = "forma-corta:" + corto;
    }
  }
  for (const inc of V01_REG_INCLUSIONES) {
    const idx = secuenciaEn(inc);
    if (idx >= 0 && antesDeProposito(idx)) { g.g1 = true; g.g1Motivo = "inclusion:" + inc; break; }
  }
  // G1(b): marca expresa de publicación + canal de la lista cerrada.
  const canales = ["pagina", "web", "sitio", "folleto", "redes", "anuncio", "portal"];
  if (!g.g1 && /\bpublicad[oa]s?\b/.test(n)) { g.g1 = true; g.g1Motivo = "publicado"; }
  if (!g.g1) {
    for (const c of canales) {
      if (new RegExp("\\b(en|de|del|su|la|el) " + c + "\\b").test(n) || new RegExp("\\b" + c + "\\b").test(n) && /\b(vi|vimos|viste|aparece|aparecen|figura|muestra|dice)\b/.test(n)) {
        g.g1 = true; g.g1Motivo = "canal:" + c; break;
      }
    }
  }
  // G1(c): percepción + canal («el que vi en su página», «el de la web»).
  if (!g.g1 && /(vi|vimos|viste|aparece|aparecen|figura|muestra|muestran|dice|lei|leimos)\b[^.]{0,40}\b(pagina|web|sitio|folleto)\b/.test(n)) { g.g1 = true; g.g1Motivo = "percepcion+canal"; }
  if (!g.g1 && /\b(el|la) de (la |su )?(pagina|web|sitio|folleto)\b/.test(n)) { g.g1 = true; g.g1Motivo = "de-canal"; }
  // G2: narración de terceros.
  if (/\botr[oa] (empresa|persona|cliente|negocio|consultora)\b/.test(n) || /\bempresa de (mi |su |un |una |la |el )?[a-z]+\b/.test(n) || /\ba su empresa\b/.test(n) || /\bde la empresa\b/.test(n) || /\b(mi socio|mi hermano|mi contador|un colega|un foro|algunas consultoras)\b/.test(n)) g.g2 = true;
  // G3: uso documental. Verbo de transferencia/comunicación documental +
  // sustantivo documental + ausencia de las tres marcas de condición (ii).
  const docN = V01_DOC_N;
  const tieneDoc = tokens.some((t) => docN.indexOf(t) >= 0);
  const verbosTransfer = ["enviar", "enviaron", "envio", "enviaste", "mandar", "mandaron", "remitir", "reenviar", "reenvian", "reenviaron", "recibir", "recibieron", "recibi", "pedir", "pedi", "pide", "pidieron", "solicitar", "solicite", "solicito", "solicitan", "pasar", "pasan", "adjuntar", "envian", "mandan", "piden", "envien", "manden", "reenvien", "reciban"];
  const tieneTransfer = tokens.some((t, i) => {
    if (verbosTransfer.indexOf(t) < 0) return false;
    // Dentro de una relativa («que me enviaron») no es el verbo principal.
    for (let k = Math.max(0, i - 3); k < i; k++) if (tokens[k] === "que") return false;
    return true;
  });
  if (tieneDoc && tieneTransfer) {
    const tieneMarcaCond = tokens.some((t) => v01EsMarcaParticular(t))
      || ["manten", "conserv", "respet", "aplic", "reconoc"].some((r) => tokens.some((t) => t.indexOf(r) === 0))
      || v01AtribucionEnOracion(tokens, n).remision;
    if (!tieneMarcaCond) g.g3 = true;
  }
  // G4: vigencia de lo publicado sin marcador de acuerdo (continuidad +
  // ancla publicada + sin OBJ-B).
  if (g.g1 && /(sigue|siguen|seguia|seguian|vigente|se mantuvo|se siguio|se sigue)/.test(n) && !tokens.some((t) => v01EsMarcaParticular(t))) g.g4 = true;
  return g;
}

// Núcleos que nombran el precio o la prestación publicada de un referente
// del registro (para el ancla de genitivo de G1, ESP §1.5 precisión v1.2).
const V01_NUCLEOS_PRECIO = ["precio", "tarifa", "costo", "coste", "valor", "monto", "importe", "cuota", "mensualidad"];
// ¿El objeto está anclado a lo publicado? El ancla debe recaer SOBRE EL
// OBJETO de la construcción, no sobre la oración (ESP §1.5, precisión v1.2):
// un nombre del registro que aparece como modificador de otro núcleo NO
// ancla ese núcleo («descuento especial del hardening»: «hardening» nombra
// el servicio, no el descuento; lo publicado es el precio del hardening).
// La vecindad en la oración no es ancla. Formas de ancla sobre el objeto
// (y solo estas):
//  (A) marca de publicación directamente sobre el núcleo: «publicado/a»
//      junto a él, percepción + canal en su relativa («el precio que vi en
//      su página») o canal con marca de procedencia («el precio de la página»);
//  (B) el objeto mismo nombra el referente publicado: el núcleo + su
//      complemento forman un nombre del registro o una inclusión
//      («el plan Integral», «el plan de remediación»);
//  (C) genitivo del núcleo: el núcleo nombra el precio o la prestación
//      publicada de un referente del registro («el precio del plan Esencial»,
//      «el precio de la consultoría», «el precio del hardening») y no lleva
//      marca de particularidad OBJ-B («precio especial» es una condición
//      particular, no lo publicado).
// Función pura de (tokens, objeto): no consume el veredicto de H1 ni sus
// guardas; la usan H1 (§2.2, §2.6, §2.7) y el registro propio de H2 (§4.2 M5).
function v01ObjetoAncladoAPublicado(tokens, obj) {
  const i = obj.idx;
  // (A) marca de publicación sobre el núcleo.
  for (let j = Math.max(0, i - 1); j <= Math.min(tokens.length - 1, i + 4); j++) {
    if (/^publicad[oa]s?$/.test(tokens[j])) return true;
  }
  const canales = ["pagina", "web", "sitio", "folleto", "portal", "anuncio", "redes"];
  const percepcion = ["vi", "vimos", "viste", "aparece", "aparecen", "figura", "muestra", "muestran", "dice", "lei", "leimos"];
  let hayPercepcion = false;
  for (let j = i; j <= Math.min(tokens.length - 1, i + 6); j++) if (percepcion.indexOf(tokens[j]) >= 0) { hayPercepcion = true; break; }
  let hayCanal = false;
  for (let j = i; j <= Math.min(tokens.length - 1, i + 8); j++) if (canales.indexOf(tokens[j]) >= 0) { hayCanal = true; break; }
  if (hayPercepcion && hayCanal) return true;
  // Canal con marca de procedencia («el precio de la página», «la tarifa
  // según lo expuesto en la página»): la marca G1(b) no tiene límite de
  // distancia en la especificación; la ventana llega a +8 para cubrir el
  // marco «según lo <participio> en <canal>», que caracteriza al objeto.
  // Sigue siendo ancla del objeto: el canal va en la misma oración y con
  // marca de procedencia (de/del/en/la/el/su), no en otra cláusula.
  for (let j = i; j <= Math.min(tokens.length - 1, i + 8); j++) {
    if (canales.indexOf(tokens[j]) >= 0 && j > 0 && ["de", "del", "en", "la", "el", "su"].indexOf(tokens[j - 1]) >= 0) return true;
  }
  // (B) el objeto mismo es un nombre del registro o una inclusión.
  const resto = tokens.slice(i).join(" ");
  for (const nombre of V01_REG_NOMBRES) if (resto === nombre || resto.indexOf(nombre + " ") === 0) return true;
  for (const inc of V01_REG_INCLUSIONES) if (resto === inc || resto.indexOf(inc + " ") === 0) return true;
  if (obj.nucleo === "plan" && V01_REG_FORMAS_CORTAS.indexOf(tokens[i + 1]) >= 0) return true;
  // (C) genitivo del núcleo sobre un referente del registro.
  if ((V01_NUCLEOS_PRECIO.indexOf(obj.nucleo) >= 0 || ["plan", "paquete", "servicio"].indexOf(obj.nucleo) >= 0) && !obj.particular) {
    for (let j = i + 1; j <= Math.min(tokens.length - 1, i + 4); j++) {
      if (tokens[j] !== "de" && tokens[j] !== "del") continue;
      for (let k = j + 1; k <= Math.min(tokens.length - 1, j + 2); k++) {
        const tk = tokens[k];
        if (V01_REG_FORMAS_CORTAS.indexOf(tk) >= 0) return true;
        if (V01_REG_NOMBRES.some((nm) => nm.split(" ")[0] === tk)) return true;
        if (tk === "plan") return true; // «el precio del plan»: el plan publicado.
        if (V01_REG_INCLUSIONES.some((inc) => inc.split(" ")[0] === tk)) return true;
      }
    }
  }
  return false;
}

// ¿El visitante es el beneficiario de la concesión? (ESP §1.5-G2, precisión
// v1.2). Un clítico de 1.ª persona («me»/«nos») inmediatamente antes de una
// forma verbal de pasado que NO es verbo de comunicación («me mantuvieron»)
// atribuye la concesión al visitante: el tercero solo informa o narra y G2
// no aplica. («Me contó que a su empresa…»: «me» va con «contó», verbo de
// comunicación, y la concesión («le mantuvieron») es del tercero: G2 sí aplica.)
function v01BeneficiarioVisitante(tokens, formas) {
  const COMUNICACION = ["cont", "dij", "escrib", "llam", "avis", "coment", "explic", "inform", "mencion", "pregunt", "respond", "habl", "convers", "trat", "discut"];
  for (const f of formas) {
    if (f.kind !== "pasado" && f.kind !== "continuidad") continue;
    const t = tokens[f.idx];
    if (!t) continue;
    if (COMUNICACION.some((r) => t.indexOf(r) === 0)) continue;
    if (f.idx > 0 && (tokens[f.idx - 1] === "me" || tokens[f.idx - 1] === "nos")) return true;
  }
  return false;
}

// ── H1 — PUERTA DE ENTRADA (ESP §2) ──────────────────────────────────────────
// v01EvaluarOracionH1(oracion) → {dispara, regla, pretensiones, suprimida}.
// La unidad de decisión es la oración; la composición entre oraciones del
// mismo turno usa ligadores (ESP §2.3) y se evalúa en v01EvaluarTurnoH1.
function v01FormasVerbalesEnOracion(tokens, raws) {
  // Los tokens crudos llevan la puntuación pegada («confirmé?», «¿la»): se
  // limpia para que las comprobaciones de tilde final (/é$/, /ó$/) vean el
  // verbo y no el signo. La longitud del arreglo se conserva (alineación).
  raws = (raws || []).map((x) => String(x || "").replace(/[^a-záéíóúüñ]/g, ""));
  const formas = [];
  // «¿Cómo garantizo…?» es una pregunta de procedimiento en presente: la
  // lectura de 3.ª de pretérito por raíz no aplica tras «cómo».
  const esComo = tokens.slice(0, 3).indexOf("como") >= 0;
  for (let i = 0; i < tokens.length; i++) {
    // Perfecto compuesto: haber + participio (con clíticos entre medias).
    if (V01_HABER.indexOf(tokens[i]) >= 0) {
      for (let j = i + 1; j <= Math.min(i + 3, tokens.length - 1); j++) {
        if (["me", "te", "se", "nos", "le", "les"].indexOf(tokens[j]) >= 0) continue;
        if (v01EsParticipio(tokens[j])) { formas.push({ idx: i, kind: "pasado", forma: tokens[i] + " " + tokens[j], pluscuamperfecto: ["habia", "habias", "habia", "habiamos", "habian", "hube", "hubiste", "hubo", "hubimos", "hubieron"].indexOf(tokens[i]) >= 0 }); break; }
        break;
      }
      continue;
    }
    const cont = v01EsContinuidad(tokens, i);
    if (cont) { formas.push({ idx: i, kind: "continuidad", forma: cont.forma, presente: ["sigue", "siguen", "viene", "vienen", "esta", "estan"].indexOf(tokens[i]) >= 0 }); continue; }
    // «valido» es adjetivo tras cópula («es válido») o tras el núcleo
    // («precio válido»); en el resto de posiciones es el verbo («¿Validó…?»).
    const esAdjValido = tokens[i] === "valido" && i > 0 && (["es", "son", "esta", "estan", "sea", "sean", "fue", "fueron"].indexOf(tokens[i - 1]) >= 0 || !!v01EsNucleo(tokens[i - 1]));
    const f = v01FormaVerbal(tokens[i], raws[i], esComo, esAdjValido);
    if (f && (f.kind === "pasado" || f.kind === "continuidad")) formas.push({ idx: i, kind: f.kind, forma: f.forma, pluscuamperfecto: false });
  }
  return formas;
}
// Negación con alcance sobre la construcción (ESP §2.5). Devuelve
// "suprime" (reclamación/verificación negativa), "buscada" (confirmación
// buscada: la negación no salva) o null (sin negación relevante).
function v01NegacionEnOracion(tokens, n) {
  const negIdx = [];
  for (let i = 0; i < tokens.length; i++) if (["no", "nunca", "jamas", "tampoco"].indexOf(tokens[i]) >= 0) negIdx.push(i);
  if (!negIdx.length) return null;
  // Confirmación buscada: pluscuamperfecto o remisión en la oración.
  const tienePlusc = tokens.some((t, i) => ["habia", "habias", "habia", "habiamos", "habian"].indexOf(t) >= 0 && i + 1 < tokens.length && v01EsParticipio(tokens[i + 1]));
  const atr = v01AtribucionEnOracion(tokens, n);
  if (tienePlusc || atr.remision) return "buscada";
  return "suprime";
}
// ¿La oración es una prótasis condicional que contiene la construcción?
// La prótasis va desde «si» / «en caso de que» hasta la primera coma.
function v01EsCondicional(tokens) {
  if (tokens[0] === "si") return true;
  const idx = tokens.indexOf("si");
  if (idx >= 0 && idx <= 3) return true;
  const j = tokens.join(" ").indexOf("en caso de que");
  return j === 0;
}
// Excepción de verificación (§2.5): el objeto lleva una relativa de
// solicitud propia («que solicité / pedí») sin remisión ni marca OBJ-B.
function v01EsVerificacionPropia(tokens, n) {
  const atr = v01AtribucionEnOracion(tokens, n);
  if (atr.remision) return false;
  if (tokens.some((t) => v01EsMarcaParticular(t))) return false;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === "que") {
      const sig = tokens[i + 1];
      if (["solicite", "solicito", "solicitaste", "pedi", "pido", "requeri", "requiero", "cotice", "cotizo"].indexOf(sig) >= 0) return true;
    }
  }
  return false;
}
// Evalúa una oración: devuelve la decisión de H1 para esa oración.
// «antecedente» = contexto de pretensión de oraciones anteriores del turno
// (para anáforas OBJ-C, ESP §2.3); «enNominalizada» = la oración contiene
// participio de acuerdo + objeto (entonces «para la empresa» atribuye, §2.8).
function v01EvaluarOracionH1(oracion, antecedente) {
  const tokens = v01Tokens(oracion.n);
  const raws = v01Tokens(oracion.r).map((x) => String(x || "").replace(/[^a-záéíóúüñ]/g, ""));
  const formas = v01FormasVerbalesEnOracion(tokens, raws);
  const objetos = v01ObjetosEnOracion(tokens);
  const atr = v01AtribucionEnOracion(tokens, oracion.n);
  const guardas = v01GuardasEnOracion(tokens, oracion.n);
  const neg = v01NegacionEnOracion(tokens, oracion.n);
  const cond = v01EsCondicional(tokens);
  const verif = v01EsVerificacionPropia(tokens, oracion.n);
  const res = { dispara: false, regla: null, pretensiones: [], suprimida: null };
  // Pretensiones que se registran aunque H1 no dispare (ESP §4.2, §2.6):
  // nominales, en presente, presuposiciones y comparativas se registran.
  const registrar = (modalidad, objeto) => { res.pretensiones.push({ objeto: objeto ? objeto.nucleo : null, modalidad, estado: "activa", beneficiario: "visitante" }); };
  // Construcción principal (ESP §2.2): R1 × R2 × R3 en la misma oración.
  for (const forma of formas) {
    for (const obj of objetos) {
      // El objeto anafórico solo vale con antecedente en el turno (ESP §1.1).
      if (obj.tipo === "C" && !antecedente && ["eso", "ello", "lo mismo", "lo anterior"].indexOf(obj.nucleo) >= 0) continue;
      const nominalizada = !!obj.particular && formas.some((f) => f.kind === "continuidad" || f.kind === "participio");
      const tieneAtr = v01TieneAtribucion(atr) || v01AtribucionPorContexto(obj, tokens, atr, raws) || (atr.destinoEmpresa && nominalizada) || v01BeneficiarioVisitante(tokens, formas);
      if (!tieneAtr) continue;
      // Guardas (ESP §1.5): la guarda cubre la CONSTRUCCIÓN, no la oración
      // ni el turno (precisión v1.2). G1 exige el ancla sobre el objeto de
      // esa construcción; G2 exige que el beneficiario de la concesión sea
      // el tercero; G4 exige el mismo ancla que G1 (vigencia de lo publicado).
      if (v01ObjetoAncladoAPublicado(tokens, obj)) { res.suprimida = "G1-publicado"; continue; }
      if (guardas.g2 && !atr.expresa && !atr.primeraPlural && !v01BeneficiarioVisitante(tokens, formas)) { res.suprimida = "G2-tercero"; continue; }
      if (guardas.g3 && V01_DOC_N.indexOf(obj.nucleo) >= 0) { res.suprimida = "G3-documental"; continue; }
      if (guardas.g4 && v01ObjetoAncladoAPublicado(tokens, obj)) { res.suprimida = "G4-vigencia"; continue; }
      if (neg === "suprime") { registrar("negada", obj); res.suprimida = "negacion"; continue; }
      if (cond) { registrar("hipotetica", obj); res.suprimida = "condicional"; continue; }
      if (verif) { registrar("verificacion", obj); res.suprimida = "verificacion"; continue; }
      res.dispara = true;
      res.regla = "H1-construccion";
      registrar("afirmacion", obj);
      return res;
    }
  }
  // Construcción de continuidad sin atribución (ESP §2.7): forma de
  // continuidad/mantenimiento en pasado + objeto que NO ancla a lo publicado.
  for (const forma of formas) {
    const esCont = forma.kind === "continuidad" || v01EsMantenimientoPasado(tokens, forma.idx, forma.kind);
    if (!esCont) continue;
    for (const obj of objetos) {
      if (v01ObjetoAncladoAPublicado(tokens, obj)) { res.suprimida = guardas.g4 ? "G4-vigencia" : "G1-publicado"; continue; }
      if (guardas.g2 && !atr.expresa && !atr.primeraPlural && !v01BeneficiarioVisitante(tokens, formas)) { res.suprimida = "G2-tercero"; continue; }
      if (neg === "suprime") { registrar("negada", obj); res.suprimida = "negacion"; continue; }
      if (cond) { registrar("hipotetica", obj); res.suprimida = "condicional"; continue; }
      if (verif) { registrar("verificacion", obj); res.suprimida = "verificacion"; continue; }
      res.dispara = true;
      res.regla = "H1-continuidad-2.7";
      registrar("afirmacion", obj);
      return res;
    }
  }
  // Sin disparo: registrar pretensiones de §2.6 (nominales, presente,
  // presuposición, comparativa) para que las juzgue H2 (ESP §4.2 M1–M4).
  for (const obj of objetos) {
    const nominalizada = !!obj.particular && formas.some((f) => f.kind === "continuidad" || f.kind === "participio");
    const tieneAtr = v01TieneAtribucion(atr) || v01AtribucionPorContexto(obj, tokens, atr, raws) || (atr.destinoEmpresa && nominalizada) || v01BeneficiarioVisitante(tokens, formas);
    const esCondicion = obj.tipo === "A" && V01_NUCLEOS_CONDICION.indexOf(obj.nucleo) >= 0;
    const esAnaforaAcuerdo = obj.tipo === "C" && /acordado|pactado|convenido|negociado|garantizado/.test(obj.nucleo);
    const registraSinAtr = esCondicion && !guardas.g2;
    if (!tieneAtr && !registraSinAtr) continue;
    if (v01ObjetoAncladoAPublicado(tokens, obj)) continue; // referente publicado: no hay pretensión particular.
    if (obj.particular || obj.inherente || esCondicion || esAnaforaAcuerdo) registrar("presuposicion", obj);
  }
  // Comparativa contra lo publicado con atribución (ESP §4.2 M4).
  if (/pago|pagar|cuesta|sale|valen|vale/.test(oracion.n) && /menos|menor/.test(oracion.n) && /que/.test(oracion.n) && v01TieneAtribucion(atr)) {
    registrar("comparativa", objetos[0] || null);
  }
  // Anáfora sin antecedente: pretensión vacía (ESP §4.2 M7) si la oración
  // es una pregunta de continuidad («¿Y eso sigue igual?», «¿Se mantiene lo
  // pactado?», «¿Lo que me prometiste sigue en pie?»). La pretensión vacía
  // existe para que un asentimiento escueto («Sí, sigue igual») se sustituya
  // sin fingir que la condición fue identificada.
  if (!res.pretensiones.length) {
    const anafora = objetos.some((o) => o.tipo === "C");
    const loQue = tokens.indexOf("lo") >= 0 && tokens[tokens.indexOf("lo") + 1] === "que";
    const loDeAyer = /\blo de (ayer|hoy|antes|entonces|la vez pasada)\b/.test(oracion.n);
    const cont = tokens.some((t) => ["sigue", "siguen", "mantiene", "mantienen", "continua", "continuan", "permanece", "permanecen", "queda", "quedan", "va", "vigente", "pie", "igual", "vale", "valen", "valido"].indexOf(t) >= 0);
    if ((anafora || loQue || loDeAyer) && cont) registrar("anafora", null);
  }
  return res;
}
// Evalúa un turno completo del visitante (composición entre oraciones,
// ESP §2.3): primero por oración; si ninguna dispara, composición de todo
// el turno si hay ligador de remisión (la remisión enlaza las oraciones).
function v01EvaluarTurnoH1(texto) {
  const oraciones = v01Oraciones(texto);
  const res = { dispara: false, regla: null, pretensiones: [], suprimida: null };
  let antecedente = false;
  for (const o of oraciones) {
    const r = v01EvaluarOracionH1(o, antecedente);
    res.pretensiones.push(...r.pretensiones);
    if (r.dispara) { res.dispara = true; res.regla = r.regla; return res; }
    if (r.suprimida && !res.suprimida) res.suprimida = r.suprimida;
    if (r.pretensiones.length) antecedente = true;
  }
  // Composición del turno por remisión: un ligador de remisión en cualquier
  // oración + R1 + R2 + R3 repartidos por el turno (ESP §2.3).
  const n = v01Normalizar(texto);
  const tokens = v01Tokens(n);
  const raws = v01Tokens(v01CrudoMin(texto));
  const atr = v01AtribucionEnOracion(tokens, n);
  if (atr.remision) {
    const formas = v01FormasVerbalesEnOracion(tokens, raws);
    const objetos = v01ObjetosEnOracion(tokens);
    const guardas = v01GuardasEnOracion(tokens, n);
    if (formas.length && objetos.length && (v01TieneAtribucion(atr) || objetos.some((o) => v01AtribucionPorContexto(o, tokens, atr, raws))) && objetos.some((o) => !v01ObjetoAncladoAPublicado(tokens, o)) && !guardas.g3) {
      if (guardas.g2 && !atr.expresa && !atr.primeraPlural && !v01BeneficiarioVisitante(tokens, formas)) { res.suprimida = "G2-tercero"; return res; }
      const neg = v01NegacionEnOracion(tokens, n);
      if (neg === "suprime") { res.suprimida = "negacion"; return res; }
      // La composición no suprimía la modalidad (§2.5): una prótasis
      // condicional o una verificación propia no dispara ni compuesta.
      if (v01EsCondicional(tokens)) { res.suprimida = "condicional"; return res; }
      if (v01EsVerificacionPropia(tokens, n)) { res.suprimida = "verificacion"; return res; }
      res.dispara = true;
      res.regla = "H1-composicion-turno";
      return res;
    }
  }
  return res;
}

// ── H2 — REGISTRO DE PRETENSIONES (ESP §4.2) ────────────────────────────────
// Reconstruye desde el historial recibido en cada petición (sin estado,
// ESP §5.4). Cada pretensión: {objeto, valor, beneficiario, modalidad,
// turno, estado}. Modalidades: afirmacion, pregunta, presuposicion,
// comparativa, hipotetica, verificacion, negada, recordatorio, anafora.
//
// PROCEDIMIENTO PROPIO (ESP §4.1/§4.2 M5, precisión v1.2 — C-03): el registro
// se construye con un pase de detección independiente — objeto INV-OBJ +
// atribución INV-ATR + modalidad — y NO invoca la evaluación de H1 (§2) ni
// consume su veredicto, sus ranuras ni sus guardas. Solo la guarda G1 CON
// ancla sobre el objeto (§1.5, precisión v1.2) suprime el registro de una
// pretensión particular; con cualquier otra guarda (G2, G3, G4, o G1 sin
// ancla sobre el objeto) la pretensión SE REGISTRA con su modalidad: la
// guarda libera la entrada, no borra la pretensión.
function v01RegistrarPretensiones(historial) {
  const claims = [];
  const usuarios = (historial || []).filter((m) => m && m.role === "user" && typeof m.content === "string");
  const retractar = (objNucleo) => {
    for (const c of claims) if (c.estado === "activa" && (!objNucleo || c.objeto === objNucleo)) c.estado = "retractada";
  };
  usuarios.forEach((m, ti) => {
    const n = v01Normalizar(m.content);
    // Corrección posterior del visitante (ESP §5.3): retracta lo anterior.
    if (/me equivoque|olviden lo anterior|olvida lo anterior|olvida lo del|era de otra empresa|era otra empresa|no tengo ningun (descuento|acuerdo|precio especial)|no era/.test(n)) {
      retractar(null);
    }
    const valor = v01ExtraerValor(m.content);
    for (const o of v01Oraciones(m.content)) {
      const tokens = v01Tokens(o.n);
      const raws = v01Tokens(o.r).map((x) => String(x || "").replace(/[^a-záéíóúüñ]/g, ""));
      const objetos = v01ObjetosEnOracion(tokens);
      const atr = v01AtribucionEnOracion(tokens, o.n);
      const formas = v01FormasVerbalesEnOracion(tokens, raws);
      const neg = v01NegacionEnOracion(tokens, o.n);
      const cond = v01EsCondicional(tokens) || tokens.some((t, i) => v01EsCondicionalForma(t, raws[i]));
      const verif = v01EsVerificacionPropia(tokens, o.n);
      let registradasEnOracion = 0;
      for (const obj of objetos) {
        // La anáfora escueta («eso», «ello») sin antecedente no registra
        // objeto: solo vía M7, como pretensión vacía (ver abajo).
        if (obj.tipo === "C" && ["eso", "ello", "lo mismo", "lo anterior"].indexOf(obj.nucleo) >= 0) continue;
        const nominalizada = !!obj.particular && formas.some((f) => f.kind === "continuidad" || f.kind === "participio");
        const tieneAtr = v01TieneAtribucion(atr) || v01AtribucionPorContexto(obj, tokens, atr, raws) || (atr.destinoEmpresa && nominalizada) || v01BeneficiarioVisitante(tokens, formas);
        const esCondicion = obj.tipo === "A" && V01_NUCLEOS_CONDICION.indexOf(obj.nucleo) >= 0;
        const esAnaforaAcuerdo = obj.tipo === "C" && /acordado|pactado|convenido|negociado|garantizado/.test(obj.nucleo);
        // Sin atribución al visitante, solo la construcción escueta de
        // condición o la anáfora de acuerdo registran (M1/M5); una narración
        // de terceros sin atribución al visitante no planta pretensión.
        if (!tieneAtr && !((esCondicion || esAnaforaAcuerdo) && atr.destinos.indexOf("tercero") < 0)) continue;
        // G1 CON ancla sobre el objeto: referente público, no hay pretensión
        // particular. Cualquier otra guarda no suprime el registro (M5).
        if (v01ObjetoAncladoAPublicado(tokens, obj)) continue;
        let modalidad;
        if (neg === "suprime") modalidad = "negada";
        else if (cond) modalidad = "hipotetica";
        else if (verif) modalidad = "verificacion";
        else if (formas.length) modalidad = "afirmacion";
        else modalidad = "presuposicion";
        claims.push({ objeto: obj.nucleo, valor, beneficiario: "visitante", modalidad, turno: ti, estado: "activa" });
        registradasEnOracion++;
      }
      // Comparativa contra lo publicado con atribución (ESP §4.2 M4).
      if (/pago|pagar|cuesta|sale|valen|vale/.test(o.n) && /menos|menor/.test(o.n) && /que/.test(o.n) && v01TieneAtribucion(atr)) {
        claims.push({ objeto: objetos[0] ? objetos[0].nucleo : null, valor, beneficiario: "visitante", modalidad: "comparativa", turno: ti, estado: "activa" });
        registradasEnOracion++;
      }
      // Anáfora sin antecedente: pretensión vacía (ESP §4.2 M7) si la oración
      // es una pregunta de continuidad («¿Y eso sigue igual?», «¿Se mantiene lo
      // pactado?», «¿Lo que me prometiste sigue en pie?»). La pretensión vacía
      // existe para que un asentimiento escueto («Sí, sigue igual») se sustituya
      // sin fingir que la condición fue identificada.
      if (!registradasEnOracion) {
        const anafora = objetos.some((oo) => oo.tipo === "C");
        const loQue = tokens.indexOf("lo") >= 0 && tokens[tokens.indexOf("lo") + 1] === "que";
        const loDeAyer = /\blo de (ayer|hoy|antes|entonces|la vez pasada)\b/.test(o.n);
        const cont = tokens.some((t) => ["sigue", "siguen", "mantiene", "mantienen", "continua", "continuan", "permanece", "permanecen", "queda", "quedan", "va", "vigente", "pie", "igual", "vale", "valen", "valido"].indexOf(t) >= 0);
        if ((anafora || loQue || loDeAyer) && cont) {
          claims.push({ objeto: null, valor, beneficiario: "visitante", modalidad: "anafora", turno: ti, estado: "activa" });
        }
      }
    }
    // M3 presuposición explícita: «el descuento que tengo», «¿dónde aparece
    // el descuento que tengo?», «¿cuándo se aplica mi…?».
    if (/el (descuento|precio|tarifa|beneficio) que (tengo|tenemos)/.test(n) || /donde (aparece|esta) (el |mi )?(descuento|precio|tarifa)/.test(n)) {
      const obj = (n.match(/el (descuento|precio|tarifa|beneficio)/) || [])[1] || "descuento";
      if (!claims.some((c) => c.objeto === obj && c.turno === ti)) claims.push({ objeto: obj, valor: v01ExtraerValor(m.content), beneficiario: "visitante", modalidad: "presuposicion", turno: ti, estado: "activa" });
    }
  });
  return claims;
}
// Extrae un valor (porcentaje o cifra) del texto, para la pretensión.
function v01ExtraerValor(texto) {
  const pct = String(texto || "").match(/(\d+)\s*%/);
  if (pct) return { tipo: "porcentaje", valor: parseInt(pct[1], 10) };
  const cifra = String(texto || "").match(/\$?\s*(\d{1,3}(?:\.\d{3})+)/);
  if (cifra) return { tipo: "cifra", valor: parseInt(cifra[1].replace(/\./g, ""), 10) };
  return null;
}

// ── H2 — VALIDADOR DE PROCEDENCIA SOBRE EL TEXTO FINAL (ESP §4.3, §4.4) ────
// Opera sobre la respuesta completa, ya generada (ESP §6: sin streaming).
// Piezas independientes entre sí y de H1 (ESP §4.1): S1 (V1+V2), S3 (V3),
// S4 (chequeo relacional). Cada pieza devuelve {sustituiria, regla, clase}.
function v01OracionesRespuesta(texto) {
  return String(texto || "")
    .split(/(?:[.!?…]+|\n)+/)
    .map((o) => ({ crudo: o.trim(), n: v01Normalizar(o) }))
    .filter((o) => o.n.length > 0);
}
// Números con formato monetario/cantidad en una oración de la respuesta.
function v01NumerosEnOracion(o) {
  const out = [];
  const re = /\$?\s*(\d{1,3}(?:\.\d{3})+|\d+)\s*(mil)?/g;
  let m;
  while ((m = re.exec(o.crudo)) !== null) {
    let v = parseInt(m[1].replace(/\./g, ""), 10);
    if (m[2]) v = v * 1000; // «$421 mil» → 421000 antes de contrastar (§7.4).
    const monetario = o.crudo.slice(Math.max(0, m.index - 1), m.index).indexOf("$") >= 0 || m[1].indexOf(".") >= 0 || v >= 1000;
    out.push({ valor: v, monetario, texto: m[0] });
  }
  return out;
}
// Cantidades en palabras para V1(c) («dos seguimientos»).
const V01_NUM_PALABRAS = { dos: 2, tres: 3, cuatro: 4, cinco: 5, diez: 10, doce: 12 };
// V1: lista blanca numérica (ESP §4.3 V1 + §4.3.1 montos derivados).
function v01PiezaS1V1(historial, oraciones, claims) {
  // Operandos de derivación: valores del registro + cifras del visitante.
  const operandos = new Set(V01_REG_VALORES);
  for (const m of (historial || [])) {
    if (m && m.role === "user" && typeof m.content === "string") {
      for (const num of v01NumerosEnOracion({ crudo: m.content })) if (num.valor > 0) operandos.add(num.valor);
      const cant = m.content.match(/\b(\d+)\s*(horas?|meses?|equipos?|sedes?|anos?|años?)\b/i);
      if (cant) operandos.add(parseInt(cant[1], 10));
    }
  }
  const numerosPequenos = new Set([2, 3, 4, 6, 12]);
  for (const o of oraciones) {
    const approx = /aprox|cerca de|unos|alrededor|mas o menos/.test(o.n);
    for (const num of v01NumerosEnOracion(o)) {
      if (!num.monetario) continue; // cantidades pequeñas no monetarias: no son cifras comerciales.
      const v = num.valor;
      if (V01_REG_VALORES.indexOf(v) >= 0) continue;
      let ok = false;
      const ops = Array.from(operandos);
      for (const a of ops) {
        if (v === a) { ok = true; break; }
        for (const b of ops) {
          if (v === a + b || v === a - b || v === a * b || (b !== 0 && a % b === 0 && v === a / b)) { ok = true; break; }
        }
        if (ok) break;
        for (const n of numerosPequenos) {
          if (v === a * n || (n !== 0 && a % n === 0 && v === a / n)) { ok = true; break; }
          if (approx && Math.abs(v - Math.round(a / n)) === 0) { ok = true; break; }
        }
        if (ok) break;
      }
      if (!ok) return { sustituiria: true, regla: "V1-sin-procedencia", clase: "cifra-sin-procedencia", detalle: String(v) };
    }
    // V1(c): cantidades de inclusiones («hasta 5 equipos» en el Esencial).
    const hastaEq = o.n.match(/hasta (\d+) equipos/);
    if (hastaEq) {
      const nEq = parseInt(hastaEq[1], 10);
      const planCtx = /esencial|seguridad para ia/.test(o.n) ? 3 : /pyme/.test(o.n) ? 10 : /integral/.test(o.n) ? 0 : null;
      if (planCtx === 0 || (planCtx !== null && nEq !== planCtx) || (planCtx === null && nEq > 10)) {
        return { sustituiria: true, regla: "V1-cantidad-inclusion", clase: "cantidad-sin-procedencia", detalle: "hasta " + nEq + " equipos" };
      }
    }
    const seg = o.n.match(/(\d+|dos) seguimientos/);
    if (seg) {
      const nSeg = seg[1] === "dos" ? 2 : parseInt(seg[1], 10);
      if (nSeg !== 2) return { sustituiria: true, regla: "V1-cantidad-inclusion", clase: "cantidad-sin-procedencia", detalle: nSeg + " seguimientos" };
    }
    const pasos = o.n.match(/(\d+|cuatro) pasos/);
    if (pasos) {
      const nPas = pasos[1] === "cuatro" ? 4 : parseInt(pasos[1], 10);
      if (nPas !== 4) return { sustituiria: true, regla: "V1-cantidad-inclusion", clase: "cantidad-sin-procedencia", detalle: nPas + " pasos" };
    }
  }
  return { sustituiria: false, regla: null, clase: null };
}
// V2: porcentajes (ESP §4.3 V2). F-13: ningún porcentaje publicado.
function v01PiezaS1V2(oraciones) {
  for (const o of oraciones) {
    if (!/\d+\s*%/.test(o.crudo)) continue;
    const tokens = v01Tokens(o.n);
    const conNucleo = tokens.some((t) => v01EsNucleo(t));
    const conAtrib = tokens.some((t) => ["su", "le", "les", "para", "mi", "me", "nos"].indexOf(t) >= 0) || /su (empresa|descuento|precio|tarifa)/.test(o.n);
    if (conNucleo || conAtrib) return { sustituiria: true, regla: "V2-porcentaje", clase: "porcentaje-sin-procedencia", detalle: (o.crudo.match(/\d+\s*%/) || ["%"])[0] };
    // Porcentaje sin ancla comercial: zona vigilada L-05 (no sustituye).
  }
  return { sustituiria: false, regla: null, clase: null };
}
// V3: sustantivos del campo en uso afirmativo atribuidos al visitante
// (ESP §4.3 V3). No juzga negaciones, preguntas ni referencias publicadas.
function v01PiezaS3(oraciones) {
  for (const o of oraciones) {
    const tokens = v01Tokens(o.n);
    if (/^(no|nunca|jamas)\b/.test(o.n)) continue; // oración negada: no afirma.
    if (/\?$/.test(o.crudo.trim())) continue; // pregunta: no afirma.
    if (/\bpublicad[oa]s?\b/.test(o.n) || /\ben (la |su )?pagina\b/.test(o.n)) continue; // referencia publicada.
    const objs = v01ObjetosEnOracion(tokens);
    for (const obj of objs) {
      if (obj.tipo !== "A") continue;
      const cerca = tokens.slice(Math.max(0, obj.idx - 4), Math.min(tokens.length, obj.idx + 5));
      const suyo = cerca.some((t) => ["su", "sus", "le", "les"].indexOf(t) >= 0);
      const concesion = tokens.some((t) => ["manten", "mantuv", "conserv", "respet", "aplic", "reconoc", "sigu", "qued", "continu"].some((r) => t.indexOf(r) === 0));
      const part = !!obj.particular;
      const inherente = obj.inherente && concesion;
      // Ancla publicada en la misma oración sobre ese sustantivo: no es V3.
      const anclaPlan = V01_REG_NOMBRES.some((nm) => o.n.indexOf(nm) >= 0);
      if (anclaPlan && !suyo) continue;
      if (suyo || part || inherente) {
        if (concesion || suyo || part) return { sustituiria: true, regla: "V3-sustantivo-atribuido", clase: "sustantivo-con-atribucion", detalle: obj.nucleo };
      }
    }
  }
  return { sustituiria: false, regla: null, clase: null };
}
// S4: chequeo relacional pretensión–respuesta (ESP §4.4).
function v01PiezaS4(oraciones, claims, respuesta) {
  const activas = claims.filter((c) => c.estado === "activa" && c.beneficiario === "visitante");
  const negadas = claims.filter((c) => c.estado === "activa" && c.modalidad === "negada");
  if (!activas.length && !negadas.length) return { sustituiria: false, regla: null, clase: null };
  const nResp = v01Normalizar(respuesta);
  const tokensR = v01Tokens(nResp);
  const palabras = tokensR.length;
  // R-b: asentimiento escueto (INV-SAL §1.6) con pretensión activa.
  const aperturas = ["si", "si,", "claro", "correcto", "exactamente", "asi es", "por supuesto", "efectivamente", "desde luego", "por supuesto,"];
  const empiezaAfirmativo = aperturas.some((a) => nResp === a || nResp.indexOf(a + " ") === 0 || nResp.indexOf(a + ",") === 0) || nResp === "si";
  const tieneContenidoComercial = tokensR.some((t) => v01EsNucleo(t)) || /\d/.test(respuesta);
  const esAsentimientoCorto = palabras <= 14 && empiezaAfirmativo && !tieneContenidoComercial;
  if (esAsentimientoCorto && activas.length) return { sustituiria: true, regla: "R-b-asentimiento", clase: "asentimiento-con-pretension", detalle: "respuesta escueta con pretension activa" };
  // R-a/R-c: la respuesta afirma la vigencia/aplicación de la pretensión.
  for (const o of oraciones) {
    const tokens = v01Tokens(o.n);
    if (/^(no|nunca|jamas)\b/.test(o.n)) continue;
    if (/\?$/.test(o.crudo.trim())) continue;
    for (const c of activas) {
      const objTxt = c.objeto;
      const mencionaObj = objTxt && tokens.some((t) => t === objTxt || v01EsNucleo(t) === objTxt) || tokens.some((t) => ["eso", "ello", "lo mismo", "lo anterior"].indexOf(t) >= 0);
      const vigencia = tokens.some((t) => ["sigu", "mantien", "manten", "continu", "vigent", "aplic", "qued", "conserv", "renuev", "sigue", "mantiene", "continua"].some((r) => t.indexOf(r) === 0));
      const pctReclamo = c.valor && c.valor.tipo === "porcentaje" && new RegExp(c.valor.valor + "\\s*%").test(o.crudo);
      if ((mencionaObj && vigencia) || pctReclamo) return { sustituiria: true, regla: "R-a-confirmacion", clase: "confirmacion-pretension", detalle: "pretension: " + (objTxt || "anafora") };
    }
    // R-e: corrige una pretensión negada afirmando el acuerdo.
    for (const c of negadas) {
      const objTxt = c.objeto;
      const mencionaObj = objTxt && tokens.some((t) => t === objTxt || v01EsNucleo(t) === objTxt);
      const vigencia = tokens.some((t) => ["sigu", "mantien", "manten", "continu", "vigent", "aplic", "qued", "conserv"].some((r) => t.indexOf(r) === 0));
      if (mencionaObj && vigencia) return { sustituiria: true, regla: "R-e-corrige-negada", clase: "confirmacion-pretension-negada", detalle: "pretension negada: " + objTxt };
    }
  }
  // R-d: remite a una ubicación publicada como si la condición constara allí.
  if (activas.length && /(puede verlo|lo encuentra|aparece|esta|figura|consulte|lo puede ver) en (la seccion|la pagina|el sitio|los planes|nuestros planes|la seccion de planes)/.test(nResp)) {
    return { sustituiria: true, regla: "R-d-remision-ubicacion", clase: "remision-ubicacion-inexistente", detalle: "remision con pretension activa" };
  }
  // R-c: anuncia la aplicación («se aplicará en la renovación») con
  // pretensión activa, aunque no repita objeto ni importe.
  if (activas.length && /(se aplicara|se aplicara en|se lo aplico|se lo aplicamos|queda aplicado|quedo aplicado|se mantiene su|le mantenemos)/.test(nResp)) {
    return { sustituiria: true, regla: "R-c-actua-como-cierta", clase: "aplicacion-anunciada", detalle: "aplicacion con pretension activa" };
  }
  return { sustituiria: false, regla: null, clase: null };
}
// Validador de salida (ESP §4.5: la indeterminación se resuelve hacia la
// sustitución). Devuelve la decisión por pieza y el agregado según el modo.
function v01ValidarRespuesta(historial, respuesta, config) {
  const cfg = config || v01ConfigPorDefecto();
  const res = { sustituir: false, regla: null, pieza: null, eventos: [], piezas: {} };
  const texto = String(respuesta || "");
  // V4 (precisión v1.2): la exención por negación o derivación se aplica
  // SOLO a lo que la respuesta no afirma. La presencia de «no tengo
  // registro» en cualquier parte del texto NO exime la respuesta entera:
  // la parte afirmativa se juzga por V1/V2/V3/§4.4 y la respuesta se
  // sustituye. El return temprano por substring queda retirado: cada pieza
  // (V1/V2/V3/S4) ya exime por oración lo que niega o no afirma. Solo la
  // respuesta segura textual se entrega sin validar: ya es la segura.
  if (texto.indexOf(V01_SAFE_REPLY) >= 0) {
    return res;
  }
  const claims = v01RegistrarPretensiones(historial);
  const oraciones = v01OracionesRespuesta(texto);
  const s1v1 = v01PiezaS1V1(historial, oraciones, claims);
  const s1v2 = v01PiezaS1V2(oraciones);
  res.piezas.s1 = s1v1.sustituiria ? s1v1 : s1v2;
  res.piezas.s3 = v01PiezaS3(oraciones);
  res.piezas.s4 = v01PiezaS4(oraciones, claims, texto);
  const modos = { s1: cfg.s1, s3: cfg.s3, s4: cfg.s4 };
  for (const pieza of ["s1", "s3", "s4"]) {
    const p = res.piezas[pieza];
    if (p && p.sustituiria) {
      const modo = modos[pieza];
      res.eventos.push({ puerta: "H2", pieza: pieza, regla: p.regla, clase: p.clase, resultado: modo === "bloqueo" ? "sustituido" : "habria-sustituido", huella: v01Huella(texto) });
      if (modo === "bloqueo" && !res.sustituir) { res.sustituir = true; res.regla = p.regla; res.pieza = pieza; }
    }
  }
  return res;
}

// ── PUNTOS DE ENTRADA ─────────────────────────────────────────────────────────
// v01EsAfirmacionPreviaNoVerificable: H1 sobre un solo mensaje (método de
// sondeo del arco; la batería local lo usa con [{role:'user', content}]).
function v01EsAfirmacionPreviaNoVerificable(mensajeUsuario) {
  if (!mensajeUsuario || !String(mensajeUsuario).trim()) return false;
  return v01EvaluarTurnoH1(String(mensajeUsuario)).dispara;
}
// v01DisparaEnHistorial: H1 sobre el historial recibido completo (re-escaneo
// por petición, ESP §5.4): dispara si ALGÚN turno del visitante dispara.
// La premisa bloqueada puede reaparecer en el historial siguiente; ninguna
// pieza confía en que un bloqueo anterior «ya limpió» la conversación.
function v01DisparaEnHistorial(history) {
  const usuarios = (history || []).filter((m) => m && m.role === "user" && typeof m.content === "string");
  if (usuarios.length === 0) return false;
  for (const m of usuarios) {
    if (v01EvaluarTurnoH1(m.content).dispara) return true;
  }
  return false;
}
// Evaluación de entrada con modo (la usa el handler): en sombra, «dispara»
// es falso pero el evento queda registrado; en bloqueo, dispara.
function v01EvaluarEntrada(history, config) {
  const cfg = config || v01ConfigPorDefecto();
  const res = { dispara: false, habria: false, regla: null, eventos: [] };
  const usuarios = (history || []).filter((m) => m && m.role === "user" && typeof m.content === "string");
  for (const m of usuarios) {
    const r = v01EvaluarTurnoH1(m.content);
    if (r.dispara) {
      res.habria = true;
      res.regla = r.regla;
      res.eventos.push({ puerta: "H1", pieza: "S2", regla: r.regla, clase: "premisa-no-verificable", resultado: cfg.h1 === "bloqueo" ? "disparado" : "habria-disparado", huella: v01Huella(m.content) });
      if (cfg.h1 === "bloqueo") res.dispara = true;
      return res;
    }
  }
  return res;
}

// FILTRO DETERMINISTA V-01 — FIN


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
    return new Response(JSON.stringify({ error: "rate-limited", reply: "Está enviando mensajes muy rápido. Espere un minuto e inténtelo de nuevo, o escríbanos por WhatsApp con el botón del sitio." }), {
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

  // FILTRO DETERMINISTA V-01 (2026-11-18; corrección 2026-11-18, regla 5
  // multi-turno; arquitectura universal R21, 2026-11-23): afirmación
  // comercial previa no verificable. Actúa ANTES de llamar al modelo.
  // Modo por pieza (ESP §9, D-a): "bloqueo" (por defecto) devuelve la
  // respuesta fija sin llamar al modelo; "sombra" solo registra el evento
  // técnico y deja pasar; "off" desactiva la pieza. Config por variables de
  // entorno V01_MODO (global) y V01_MODO_H1/S1/S3/S4 (por pieza). El evento
  // es estructurado (puerta, pieza, regla, clase, resultado, huella) y no
  // contiene el contenido del mensaje ni datos personales. Mira todo el
  // historial que recibe el filtro (regla 5, corrección R4).
  const v01Config = v01ConfigDesdeEnv(env);
  const v01Entrada = v01EvaluarEntrada(history, v01Config);
  for (const ev of v01Entrada.eventos) {
    console.log("[jefq] v01_evento:", JSON.stringify(ev));
  }
  if (v01Entrada.dispara) {
    console.log("[jefq] filter_triggered: v01_premise");
    return new Response(JSON.stringify({ reply: V01_SAFE_REPLY }), {
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

  // FILTRO DETERMINISTA V-01 — capa de salida R21 (ESP §4): valida el texto
  // final del modelo antes de entregarlo. Si una pieza en modo bloqueo
  // detecta una confirmación de condición particular sin procedencia, la
  // respuesta se sustituye por la segura; en modo sombra solo se registra
  // el evento y se entrega la respuesta original.
  const v01Salida = v01ValidarRespuesta(history, reply, v01Config);
  for (const ev of v01Salida.eventos) {
    console.log("[jefq] v01_evento:", JSON.stringify(ev));
  }
  if (v01Salida.sustituir) {
    console.log("[jefq] filter_triggered: v01_output_substitution", v01Salida.pieza, v01Salida.regla);
    return new Response(JSON.stringify({ reply: V01_SAFE_REPLY }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ reply }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const onRequest = withSentry(handler, 'api-chat');
