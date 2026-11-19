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
// FILTRO DETERMINISTA V-01 (2026-11-18, decisión canónica de Jaime, opción (c);
// corrección 2026-11-18 según DeepSeek (e) del PIR-1, verificada por Pax;
// corrección R2 2026-11-18 según DeepSeek (e) del PIR-1 R2, verificada por Pax).
// Impide que el chatbot confirme como verdaderos acuerdos comerciales previos
// no verificables (precios especiales, descuentos, promociones, acuerdos,
// colaboraciones, contratos, pagos, clientes, compromisos, conversaciones
// anteriores). Actúa ANTES de llamar al modelo. NO es una lista de frases
// exactas: normaliza el mensaje y exige señales combinadas (reglas 1-6).
// Si dispara, el handler devuelve la respuesta fija SIN llamar al modelo.
// NO cambia el texto del prompt, el modelo, la temperatura ni max_tokens.
// El registro es solo el evento técnico, sin el contenido del mensaje ni
// datos personales.
const V01_SAFE_REPLY = "No tengo un registro verificable de ese acuerdo, descuento o condición especial. Para confirmarlo, por favor comuníquese directamente con JEFQ Consultor.";

// Normalización determinista: minúsculas, sin tildes, puntuación a espacios,
// espacios colapsados. Conserva los límites de palabra.
function v01Normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// (A_FUERTE) Marcadores fuertes de premisa previa: afirman un acto anterior
// concreto (acordar, pactar, confirmar, dar, ofrecer, prometer, decir, hacer,
// firmar, quedar) o una referencia temporal previa. NO incluye los verbos de
// continuidad (esos van en A_DEBIL) ni los posesivos «nuestra/o» SUELTOS
// (demasiado amplios: «nuestra oferta» es una pregunta pública legítima).
// SÍ incluye posesivo + sustantivo de arreglo previo («nuestro acuerdo»,
// «nuestra colaboración», «nuestro contrato»...): la combinación afirma un
// arreglo concreto compartido, no una oferta pública. «confirmar» en
// presente/infinitivo («confirmar», «confirma», «confirmas», «confirmamos»,
// «confirman») NO está aquí: es señal DÉBIL (regla 6), porque con objetos
// genéricos forma preguntas públicas («¿Me pueden confirmar si tienen
// descuentos?»). Quedan en A_FUERTE las formas pasadas («confirmado»,
// «confirmaste», «confirmaron», «me habia confirmado»...) y «confirmo»
// (afirmación en primera persona).
const V01_SENAL_A_FUERTE = [
  "acordamos", "acordaron", "acordo", "acordado", "acordada", "acordados",
  "acordadas", "acordaste", "acordabamos", "acordaba",
  "pactamos", "pactado", "pactada", "pactados", "pactadas", "pactaron",
  "pactaste", "pacte",
  "convenimos", "convenido", "convenidos", "convenida", "convinimos",
  "conveniste",
  "confirmado", "confirmada", "confirmados", "confirmadas", "confirmaste",
  "confirmaron", "confirmo",
  "me habia confirmado", "me habias confirmado", "me habian confirmado",
  "hablamos", "hablado", "hablada", "hablados",
  "conversamos", "conversado", "conversada",
  "llamada", "llamadas", "llamado", "llamados",
  "ayer", "el ano pasado", "la semana pasada", "el mes pasado",
  "la vez pasada", "la ultima vez",
  "quedamos", "quede", "quedaste", "quedaron", "como quedamos",
  "habiamos", "habias",
  "me diste", "me dieron", "me dio", "me ofreciste", "me ofrecieron",
  "me prometiste", "me prometieron", "me dijiste", "me dijeron",
  "me confirmaste", "me confirmaron",
  "me hicieron", "me hizo", "me has hecho", "me han hecho",
  "me han dado", "me han ofrecido", "me han prometido",
  "me has ofrecido", "me has prometido",
  "me habia dicho", "me habias dicho", "me habian dicho",
  "me hiciste", "me has dado",
  "me pasaste", "me pasaron", "me cotizaste", "me cotizaron",
  "firmamos", "firmaste", "firmaron",
  "segun lo acordado", "lo convenido", "lo pactado", "lo acordado",
  "mi descuento", "mis descuentos", "mi precio especial", "mi promocion",
  "mi beneficio", "mi oferta", "mi contrato", "mi acuerdo",
  "mi tarifa especial", "mi rebaja", "mi colaboracion",
  "mi compromiso", "mi convenio",
  "nuestro acuerdo", "nuestros acuerdos", "nuestro contrato",
  "nuestros contratos", "nuestro convenio", "nuestros convenios",
  "nuestra colaboracion", "nuestras colaboraciones",
  "nuestro compromiso", "nuestros compromisos",
];

// (CONFIRMAR_DEBIL) «confirmar» en presente/infinitivo: preguntar si algo
// existe no es afirmar un acuerdo previo («¿Me pueden confirmar si tienen
// descuentos?» es una pregunta pública legítima). Solo dispara junto a un
// marcador de continuidad fuerte o un objeto específico (regla 6).
const V01_SENAL_CONFIRMAR_DEBIL = [
  "confirmar", "confirma", "confirmas", "confirmamos", "confirman",
];

// (A_DEBIL) Verbos de continuidad: solos no afirman un acuerdo previo; solo
// disparan junto a un objeto FUERTE (regla 2). «sige/sigen» son erratas de
// «sigue» observadas en pruebas.
const V01_SENAL_A_DEBIL = [
  "sigue", "siga", "siguen", "sigan", "seguir",
  "mantiene", "mantenga", "mantienen", "mantengan", "mantener",
  "continua", "continue", "continuan", "continuen", "continuar",
  "sige", "sigen",
];

// Continuidad personal: «me mantiene», «me lo mantienen», «me sigue»...
// El «me» personal convierte el verbo de continuidad en afirmación de algo
// dado a mí. Cubre también las formas con pronombre («me lo/la/los/las»).
const V01_RE_ME_CONTINUIDAD = /\bme\s+(?:lo\s+|la\s+|los\s+|las\s+)?(?:mantiene|mantienen|mantenga|mantengan|sigue|siguen|siga|sigan|continua|continuan|continue|continuen)\b/;

// (B) Objetos comerciales (formas normalizadas, sin tildes).
// «precio» solo NO es objeto (el precio público es información verificable);
// solo «precio especial» o «precio + acordado/dicho/dado». «condicion» solo
// tampoco; solo «condicion especial» o «condicion + acordada/dicha/dada».
// Los patrones «X que acordamos / X que me diste» cubren los bypass del PIR-1
// («¿El precio que acordamos sigue vigente?», «¿La tarifa que me diste sigue?»).
const V01_SENAL_B = [
  "precio especial", "precios especiales",
  "descuento", "descuentos",
  "promocion", "promociones",
  "colaboracion", "colaboraciones",
  "contrato", "contratos",
  "pago", "pagos",
  "cliente", "clientes",
  "compromiso", "compromisos",
  "condicion especial", "condiciones especiales",
  "beneficio", "beneficios",
  "tarifa especial", "tarifas especiales",
  "oferta", "ofertas",
  "acuerdo", "acuerdos",
  "convenio", "convenios",
  "trato", "tratos",
  "rebaja", "rebajas",
  "acordado", "acordada", "acordados", "acordadas",
  "pactado", "pactada", "pactados", "pactadas",
  "convenido", "convenidos", "convenida",
  "presio especial", "presios especiales",
  "deskuento", "deskuentos",
  "promosion", "promosiones",
  // Precio/tarifa/condición/descuento/promoción/oferta/beneficio/pago acordados
  // o dichos/dados (corrección PIR-1: eran los bypass). Los patrones «X que Y»
  // se generan abajo (corrección R2); aquí quedan solo los «X acordado».
  "precio acordado", "precio convenido", "precio pactado",
  "precios acordados", "precios convenidos", "precios pactados",
  "tarifa acordada", "tarifa convenida", "tarifa pactada",
  "tarifas acordadas", "tarifas convenidas", "tarifas pactadas",
  "condicion acordada", "condicion convenida", "condicion pactada",
  "condiciones acordadas", "condiciones convenidas", "condiciones pactadas",
  "descuento acordado", "descuento convenido", "descuento pactado",
  "descuentos acordados",
  "promocion acordada", "oferta acordada", "beneficio acordado",
  "pago acordado", "pago convenido", "pago pactado",
];

// Patrones «X que Y» generados (corrección R2, DeepSeek (e) punto 1):
// sinónimos de precio (costo/monto/valor/cuota/importe) y variantes completas
// de precio/tarifa/condición/descuento/oferta/beneficio/pago. Cada patrón
// contiene un verbo ya en A_FUERTE, así que la regla 1 dispara cuando casa.
// NO se añaden los sustantivos solos («costo», «valor»...) a B: con un
// marcador temporal fuerte («el año pasado») dispararían preguntas públicas
// como «¿Cuál es el valor del año pasado?»; el patrón «X que Y» solo casa
// cuando el usuario afirma que X le fue acordado/dicho/dado.
const V01_SUSTANTIVOS_X_QUE = ["precio", "tarifa", "condicion", "descuento", "oferta", "beneficio", "pago", "costo", "monto", "valor", "cuota", "importe"];
const V01_VERBOS_QUE = ["acordamos", "acordaste", "acordaron", "acordo", "pactamos", "convenimos", "convinimos", "quedamos", "me diste", "me dijiste", "me dijeron", "me dieron", "me ofreciste", "me ofrecieron", "me prometiste", "me prometieron", "me confirmaste", "me confirmaron", "me has dado", "me han dado", "me hiciste", "me hicieron", "me hizo", "me pasaste", "me pasaron", "me cotizaste", "me cotizaron"];
for (const _s of V01_SUSTANTIVOS_X_QUE) for (const _v of V01_VERBOS_QUE) V01_SENAL_B.push(`${_s} que ${_v}`);

// (B_FUERTE) Objetos que, junto a un verbo de continuidad débil, sí afirman
// un acuerdo previo. Se EXCLUYEN los sustantivos genéricos que con «sigue»
// forman preguntas públicas legítimas: «pago», «cliente», «oferta»,
// «promocion», «beneficio», «descuento», «rebaja» (con sus erratas) y, desde
// la corrección R2, «contrato», «acuerdo», «convenio», «colaboracion» y
// «compromiso» (con sus plurales): con solo «sigue» forman preguntas sobre
// documentos o servicios estándar («¿Sigue el contrato de soporte?», «¿Sigue
// el acuerdo de confidencialidad?»). Esos solo disparan con un marcador
// FUERTE (regla 1): «firmamos», «me diste», «nuestro acuerdo»... «trato»
// sigue en B_FUERTE (limitación residual: ver informe R2).
const V01_SENAL_B_FUERTE = V01_SENAL_B.filter((s) => ![
  "pago", "pagos", "cliente", "clientes", "oferta", "ofertas",
  "promocion", "promociones", "promosion", "promosiones",
  "beneficio", "beneficios", "descuento", "descuentos",
  "deskuento", "deskuentos", "rebaja", "rebajas",
  "contrato", "contratos", "acuerdo", "acuerdos", "convenio", "convenios",
  "colaboracion", "colaboraciones", "compromiso", "compromisos",
].includes(s));

// (C_FUERTE) Referencias previas sin objeto comercial que por sí solas
// afirman un acto anterior concreto (acordar, ofrecer, prometer, dar,
// confirmar). Disparan solas (regla 4).
const V01_SENAL_C_FUERTE = [
  "lo que acordamos", "lo que acordaste", "lo que acordaron", "lo que acordo",
  "lo que pactamos", "lo que pactaste", "lo que pactaron",
  "lo que convenimos", "lo que convinimos",
  "lo que quedamos", "lo que quedaste", "lo que quedaron",
  "lo que me ofreciste", "lo que me ofrecieron",
  "lo que me prometiste", "lo que me prometieron",
  "lo que me diste", "lo que me dieron",
  "lo que me confirmaste", "lo que me confirmaron",
  "lo que me habias confirmado", "lo que me habia confirmado",
  "lo que me han ofrecido", "lo que me han prometido",
  "lo que me han dado", "lo que me han confirmado",
];

// (C_DEBIL) Referencias previas vagas («lo que hablamos», «lo de ayer»,
// «lo hablado», «lo dicho»): solo disparan junto a un marcador de
// continuidad (regla 4), para no bloquear preguntas sobre el contenido de
// la conversación («¿Lo que hablamos aplica también para la Evaluación?»).
const V01_SENAL_C_DEBIL = [
  "lo que hablamos", "lo que conversamos",
  "lo de ayer", "lo del otro dia", "lo de la vez pasada", "lo de la ultima vez",
  "lo de la semana pasada", "lo del mes pasado", "lo del ano pasado",
  "lo hablado", "lo conversado", "lo dicho", "lo prometido", "lo ofrecido",
];

// (CONTINUIDAD) Marcadores de que algo sigue vigente: verbos débiles +
// «vigente», «en pie», «igual», «todavía», «aún». Usado por la regla 5
// (multi-turno): ahí la premisa ya disparó, así que un seguimiento vago
// («¿Todavía?», «¿Igual?») sí se refiere a ella.
// (CONTINUIDAD_FUERTE) Lo mismo SIN «igual», «todavia» ni «aun»: en la
// regla 4 (C_DEBIL) esos tres solos no bastan, porque forman preguntas
// sobre contenido («¿Lo dicho es igual para la Evaluación Pyme?», «¿Lo que
// hablamos ayer aún está en el informe?»). Con «sigue/vigente/en pie» la
// regla 4 sí dispara («¿Lo de ayer sigue igual?» dispara por «sigue»).
const V01_SENAL_CONTINUIDAD = [
  "sigue", "siga", "siguen", "sigan", "seguir",
  "mantiene", "mantenga", "mantienen", "mantengan", "mantener",
  "continua", "continue", "continuan", "continuen", "continuar",
  "sige", "sigen",
  "vigente", "vigencia", "en pie", "igual", "todavia", "aun",
];
const V01_SENAL_CONTINUIDAD_FUERTE = V01_SENAL_CONTINUIDAD.filter((s) => !["igual", "todavia", "aun"].includes(s));

// (D) «El mismo precio / la misma tarifa...» + marcador previo estrecho.
// «mismo precio» NO está en B: «¿Tienen el mismo precio que el año pasado?»
// es una pregunta pública legítima y NO debe disparar.
const V01_SENAL_D_A = [
  "la vez pasada", "la ultima vez",
  "me diste", "me dijiste", "me dieron", "me ofreciste", "me prometiste",
  "acordamos", "acordaste", "acordaron", "acordo",
  "pactamos", "pactaste", "convenimos", "quedamos", "como quedamos",
  "me confirmaste", "me confirmaron", "me hicieron", "me hizo",
  "me hiciste", "me has dado", "me han dado",
  "me pasaste", "me pasaron", "me cotizaste", "me cotizaron",
];
const V01_SENAL_D_B = [
  "mismo precio", "misma tarifa", "mismo descuento", "misma promocion",
  "misma oferta", "mismo beneficio", "misma condicion", "mismo trato",
  "misma rebaja",
  "mismos precios", "mismas tarifas", "mismos descuentos",
  "mismas promociones", "mismas ofertas", "mismos beneficios",
  "mismas condiciones", "mismos tratos", "mismas rebajas",
];

function v01Patron(lista) {
  const escapadas = lista.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${escapadas.join("|")})\\b`);
}
const V01_RE_A_FUERTE = v01Patron(V01_SENAL_A_FUERTE);
const V01_RE_A_DEBIL = v01Patron(V01_SENAL_A_DEBIL);
const V01_RE_CONFIRMAR_DEBIL = v01Patron(V01_SENAL_CONFIRMAR_DEBIL);
const V01_RE_B = v01Patron(V01_SENAL_B);
const V01_RE_B_FUERTE = v01Patron(V01_SENAL_B_FUERTE);
const V01_RE_C_FUERTE = v01Patron(V01_SENAL_C_FUERTE);
const V01_RE_C_DEBIL = v01Patron(V01_SENAL_C_DEBIL);
const V01_RE_CONTINUIDAD = v01Patron(V01_SENAL_CONTINUIDAD);
const V01_RE_CONTINUIDAD_FUERTE = v01Patron(V01_SENAL_CONTINUIDAD_FUERTE);
const V01_RE_D_A = v01Patron(V01_SENAL_D_A);
const V01_RE_D_B = v01Patron(V01_SENAL_D_B);

// Determinista: el mismo mensaje produce siempre el mismo resultado.
// Reglas (OR):
//  1. A_FUERTE + B (cualquier objeto, incluido «pago/cliente/oferta»)
//  2. A_DEBIL + B_FUERTE (verbo de continuidad + objeto específico)
//  3. D_A + D_B («el mismo precio...» + marcador previo estrecho)
//  4. C_FUERTE, o C_DEBIL + CONTINUIDAD_FUERTE (referencia previa sin objeto)
//  6. CONFIRMAR_DEBIL + (CONTINUIDAD_FUERTE o B_FUERTE) («confirmar» en
//     presente/infinitivo con continuidad u objeto específico; solo con un
//     objeto genérico NO dispara)
function v01EsAfirmacionPreviaNoVerificable(mensajeUsuario) {
  const n = v01Normalizar(mensajeUsuario);
  if (!n) return false;
  const aFuerte = V01_RE_A_FUERTE.test(n) || V01_RE_ME_CONTINUIDAD.test(n);
  if (aFuerte && V01_RE_B.test(n)) return true;
  if (V01_RE_A_DEBIL.test(n) && V01_RE_B_FUERTE.test(n)) return true;
  if (V01_RE_D_A.test(n) && V01_RE_D_B.test(n)) return true;
  if (V01_RE_C_FUERTE.test(n)) return true;
  if (V01_RE_C_DEBIL.test(n) && V01_RE_CONTINUIDAD_FUERTE.test(n)) return true;
  if (V01_RE_CONFIRMAR_DEBIL.test(n) && (V01_RE_CONTINUIDAD_FUERTE.test(n) || V01_RE_B_FUERTE.test(n))) return true;
  return false;
}

// ¿El mensaje es solo una pregunta vaga de continuidad («¿Sigue vigente?»)?
// Usado por la regla 5 (multi-turno).
function v01EsContinuidad(mensajeUsuario) {
  const n = v01Normalizar(mensajeUsuario);
  if (!n) return false;
  return V01_RE_CONTINUIDAD.test(n);
}

// Regla 5 (multi-turno): si el último mensaje del usuario es solo continuidad
// («¿Sigue vigente?») y el mensaje de usuario anterior disparó el filtro,
// la premisa ya está en la conversación y el seguimiento también dispara.
// Solo mira los últimos 2 mensajes de usuario: un mensaje legítimo posterior
// a una premisa («¿Cuánto cuesta la Evaluación Pyme?») NO dispara, porque
// no es continuidad.
function v01DisparaEnHistorial(history) {
  const usuarios = (history || []).filter(
    (m) => m && m.role === "user" && typeof m.content === "string"
  );
  if (usuarios.length === 0) return false;
  const ultimo = usuarios[usuarios.length - 1];
  if (v01EsAfirmacionPreviaNoVerificable(ultimo.content)) return true;
  const penultimo = usuarios[usuarios.length - 2];
  if (!penultimo) return false;
  return (
    v01EsContinuidad(ultimo.content) &&
    v01EsAfirmacionPreviaNoVerificable(penultimo.content)
  );
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
  // multi-turno): afirmación comercial previa no verificable. Actúa ANTES de
  // llamar al modelo: si dispara, devuelve la respuesta fija y NO llama al
  // modelo. Solo registra el evento técnico, sin el contenido del mensaje ni
  // datos personales. Mira los últimos 2 mensajes de usuario (regla 5).
  if (v01DisparaEnHistorial(history)) {
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

  return new Response(JSON.stringify({ reply }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const onRequest = withSentry(handler, 'api-chat');
