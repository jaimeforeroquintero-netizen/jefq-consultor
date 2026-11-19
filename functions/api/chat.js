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
// corrección R2 2026-11-18 según DeepSeek (e) del PIR-1 R2, verificada por Pax;
// corrección R3 2026-11-19, filtro v4, según la lista (e) consolidada del
// cierre NO-GO definitivo del PIR-1 R3, verificada por Pax;
// corrección R4 2026-11-19, filtro v5, según la lista (e) consolidada A–G
// del cierre NO-GO definitivo del PIR-1 R4, verificada por Pax;
// corrección R5 2026-11-19, filtro v6, según la lista (e) consolidada A–H
// del cierre NO-GO del PIR-1 R5, verificada por Pax;
// corrección R6 2026-11-19, filtro v7, según la lista (e) consolidada A–F
// del cierre NO-GO del PIR-1 R6, verificada por Pax).
// Impide que el chatbot confirme como verdaderos acuerdos comerciales previos
// no verificables (precios especiales, descuentos, promociones, acuerdos,
// colaboraciones, contratos, pagos, clientes, compromisos, conversaciones
// anteriores). Actúa ANTES de llamar al modelo. NO es una lista de frases
// exactas: normaliza el mensaje y exige señales combinadas (reglas 1-7).
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
// firmar, quedar, aprobar, asignar, respetar, conceder, trabajar juntos).
// NO incluye los verbos de continuidad (esos van en A_DEBIL) ni los posesivos
// «nuestra/o» SUELTOS (demasiado amplios: «nuestra oferta» es una pregunta
// pública legítima). SÍ incluye posesivo + sustantivo de arreglo previo
// («nuestro acuerdo», «nuestra colaboración», «nuestro contrato»...): la
// combinación afirma un arreglo concreto compartido, no una oferta pública.
// «confirmar» en presente/infinitivo («confirmar», «confirma», «confirmas»,
// «confirmamos», «confirman») NO está aquí: es señal DÉBIL (regla 6), porque
// con objetos genéricos forma preguntas públicas («¿Me pueden confirmar si
// tienen descuentos?»). Quedan en A_FUERTE las formas pasadas («confirmado»,
// «confirmaste», «confirmaron», «me habia confirmado»...) y «confirmo»
// (afirmación en primera persona).
// CORRECCIÓN R3 (2026-11-19): los marcadores TEMPORALES escuetos («ayer»,
// «la llamada», «el ano pasado»...) salieron de A_FUERTE y pasaron a
// A_TEMPORAL: solos no afirman un acto comercial previo, solo que algo
// ocurrió antes; con un objeto genérico forman preguntas públicas (FP1, FP2:
// «Ayer revisé su página. ¿Tienen descuentos para clientes nuevos?»). La
// regla 1b los exige combinados con continuidad o con el objeto vinculado
// («el descuento de ayer»). Los verbos de concesión previa («me aprobaron»,
// «me asignaron», «me respetaron», «me/nos/le/les + dieron/ofrecieron/...»)
// entran aquí (FN1–FN4, P1–P3). «negociamos» y «me enviaron» NO entran:
// «¿Negociamos un descuento?» es prospectivo y «¿Me enviaron el contrato?»
// pregunta por un envío; solo funcionan dentro de patrones «X que Y»
// (regla 1c). «trabajamos juntos» entra por H6 #16 («Como ya trabajamos
// juntos el año pasado...»), que en v3 solo disparaba por el temporal.
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
  "me han confirmado",
  "hablamos", "hablado", "hablada", "hablados",
  "conversamos", "conversado", "conversada",
  "trabajamos juntos", "ya trabajamos juntos", "hemos trabajado juntos",
  "quedamos", "quede", "quedaste", "quedaron", "como quedamos",
  "habiamos", "habias",
  "me diste", "me dieron", "me dio", "me ofreciste", "me ofrecieron",
  "me prometiste", "me prometieron", "me dijiste", "me dijeron",
  "me confirmaste", "me confirmaron",
  "me hicieron", "me hizo", "me has hecho", "me han hecho",
  "me han dado", "me han ofrecido", "me han prometido",
  "me has ofrecido", "me has prometido",
  "me habia dicho", "me habias dicho", "me habian dicho",
  "me has dicho", "me han dicho",
  "me hiciste", "me has dado",
  "me pasaste", "me pasaron", "me cotizaste", "me cotizaron",
  "me aprobaron", "me aprobo", "me aprobaste", "me han aprobado",
  "me has aprobado", "nos aprobaron",
  "aprobaron", "aprobo", "aprobaste", "te aprobaron", "te aprobo",
  "te aprobaste", "han aprobado", "has aprobado",
  "me asignaron", "me asigno", "me asignaste", "me han asignado",
  "nos asignaron",
  "asignaron", "asigno", "asignaste", "te asignaron", "te asigno",
  "te asignaste", "han asignado", "has asignado",
  "me respetaron", "me respeto", "me respetaste", "nos respetaron",
  "respetaron", "respeto", "respetaste", "te respetaron", "te respeto",
  "te respetaste", "han respetado", "has respetado", "le respetaron",
  "les respetaron",
  "me concedieron", "me concedio", "me concediste", "nos concedieron",
  "concedieron", "concedio", "concediste", "te concedieron", "te concedio",
  "te concediste", "han concedido", "has concedido",
  // CORRECCIÓN R4 (lista (e) A): variantes sin pronombre, con «te» y con
  // auxiliar de aprobar/asignar/conceder/negociar/respetar, y formas de
  // «hacer» sin pronombre (hicimos/hicieron/hiciste/hizo). «negocio» NO
  // entra: 1.ª persona del presente («¿Negocio un descuento?») es
  // prospectiva, igual que «negociamos» quedó fuera en v4; las formas
  // pasadas sí entran. «se» no tiene construcción natural de destinatario
  // para estos verbos («¿El precio que se aprobaron...?» no es español
  // válido); la forma escueta de 3.ª plural cubre el caso sin destinatario.
  "negociaron", "negociaste", "me negociaron", "nos negociaron",
  "le negociaron", "les negociaron", "te negociaron", "han negociado",
  "has negociado",
  "hicimos", "hicieron", "hiciste", "hizo",
  // CORRECCIÓN R5 (lista (e) C): había/habías/habían + participio con
  // «te/le/les» para los verbos de concesión (en v5 solo había formas
  // con «me» para «confirmado»; GPT lo juzgó NO ACEPTABLE). Cubre
  // «¿Te habían aprobado el descuento?» por la regla 1; la forma
  // «X que Y» («¿El precio que te habían aprobado sigue vigente?») la
  // cubre la regla 1c con las mismas formas en V01_VERBOS_QUE.
  "te habia aprobado", "te habias aprobado", "te habian aprobado",
  "le habia aprobado", "le habias aprobado", "le habian aprobado",
  "les habia aprobado", "les habias aprobado", "les habian aprobado",
  "te habia asignado", "te habias asignado", "te habian asignado",
  "le habia asignado", "le habias asignado", "le habian asignado",
  "les habia asignado", "les habias asignado", "les habian asignado",
  "te habia concedido", "te habias concedido", "te habian concedido",
  "le habia concedido", "le habias concedido", "le habian concedido",
  "les habia concedido", "les habias concedido", "les habian concedido",
  "te habia negociado", "te habias negociado", "te habian negociado",
  "le habia negociado", "le habias negociado", "le habian negociado",
  "les habia negociado", "les habias negociado", "les habian negociado",
  "te habia respetado", "te habias respetado", "te habian respetado",
  "le habia respetado", "le habias respetado", "le habian respetado",
  "les habia respetado", "les habias respetado", "les habian respetado",
  "nos dieron", "nos dio", "nos ofrecieron", "nos prometieron",
  "nos dijeron", "nos confirmaron", "nos hicieron", "nos han dado",
  "nos han ofrecido", "nos pasaron", "nos cotizaron", "nos diste",
  "nos dijiste", "nos hiciste", "nos pasaste", "nos cotizaste",
  "le dieron", "les dieron", "le ofrecieron", "les ofrecieron",
  "le prometieron", "les prometieron", "le confirmaron", "les confirmaron",
  "le asignaron", "les asignaron", "le aprobaron", "les aprobaron",
  "le concedieron", "les concedieron",
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

// (A_TEMPORAL) Marcadores temporales escuetos (corrección R3): afirman solo
// que algo ocurrió antes, no un acto comercial previo. NO disparan solos
// con un objeto genérico (FP1, FP2). La regla 1b los exige combinados con
// continuidad («sigue», «vigente», «todavía», «vale»...) o con el objeto
// vinculado por «de» («el descuento de ayer», regla 1b). «la vez pasada»
// y «la ultima vez» siguen además en D_A (regla 3).
const V01_SENAL_A_TEMPORAL = [
  "llamada", "llamadas", "llamado", "llamados",
  "ayer", "el ano pasado", "la semana pasada", "el mes pasado",
  "la vez pasada", "la ultima vez",
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
  "cotizacion", "cotizaciones", "presupuesto", "presupuestos",
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
  // CORRECCIÓN R4 (lista (e) B): participios negociado/concedido y
  // «preferencial». CORRECCIÓN R5 (lista (e) D): las 16 entradas quedan
  // FUERA de B_FUERTE (están en su lista de exclusión): la forma escueta
  // con solo continuidad («¿Siguen ofreciendo tarifas negociadas?»,
  // «¿Las tarifas negociadas siguen vigentes?») es indistinguible de
  // una descripción pública de la oferta vigente y ya NO dispara por
  // la regla 2 (falso positivo material según Ultra y GPT en el PIR-1
  // R5). Siguen en B: con un marcador fuerte (regla 1), con «X que Y»
  // (regla 1c), con las reglas 1d/1e o con «confirmar» (reglas 6/7a,
  // vía la lista dedicada V01_OBJETOS_CONFIRMA_NEGOCIADO) sí disparan.
  "precio negociado", "precios negociados",
  "tarifa negociada", "tarifas negociadas",
  "condicion negociada", "condiciones negociadas",
  "precio concedido", "precios concedidos",
  "tarifa concedida", "tarifas concedidas",
  "condicion concedida", "condiciones concedidas",
  "precio preferencial", "precios preferenciales",
  "tarifa preferencial", "tarifas preferenciales",
];

// Patrones «X que Y» generados (corrección R2, DeepSeek (e) punto 1):
// sinónimos de precio (costo/monto/valor/cuota/importe) y variantes completas
// de precio/tarifa/condición/descuento/oferta/beneficio/pago. Cada patrón
// contiene un verbo ya en A_FUERTE, así que la regla 1 dispara cuando casa.
// NO se añaden los sustantivos solos («costo», «valor»...) a B: con un
// marcador temporal fuerte («el año pasado») dispararían preguntas públicas
// como «¿Cuál es el valor del año pasado?»; el patrón «X que Y» solo casa
// cuando el usuario afirma que X le fue acordado/dicho/dado.
const V01_SUSTANTIVOS_X_QUE = ["precio", "tarifa", "condicion", "descuento", "oferta", "beneficio", "pago", "costo", "monto", "valor", "cuota", "importe", "cotizacion", "presupuesto", "trato", "rebaja"];
const V01_VERBOS_QUE = ["acordamos", "acordaste", "acordaron", "acordo", "pactamos", "convenimos", "convinimos", "quedamos", "me diste", "me dijiste", "me dijeron", "me dieron", "me ofreciste", "me ofrecieron", "me prometiste", "me prometieron", "me confirmaste", "me confirmaron", "me has dado", "me han dado", "me hiciste", "me hicieron", "me hizo", "me pasaste", "me pasaron", "me cotizaste", "me cotizaron", "me aprobaron", "me aprobo", "me aprobaste", "me han aprobado", "me has aprobado", "nos aprobaron", "aprobaron", "me asignaron", "me asigno", "me asignaste", "me han asignado", "nos asignaron", "asignaron", "me respetaron", "me respeto", "me respetaste", "nos respetaron", "respetaron", "negociamos", "negociaste", "negociaron", "negocio", "me enviaron", "me envio", "me enviaste", "me han enviado", "nos enviaron", "enviaron", "me concedieron", "me concedio", "me concediste", "nos concedieron", "concedieron", "nos dieron", "nos dio", "nos ofrecieron", "nos prometieron", "nos dijeron", "nos confirmaron", "nos hicieron", "nos han dado", "nos han ofrecido", "nos pasaron", "nos cotizaron", "nos diste", "nos dijiste", "nos hiciste", "nos pasaste", "nos cotizaste", "le dieron", "les dieron", "le ofrecieron", "les ofrecieron", "le prometieron", "les prometieron", "le confirmaron", "les confirmaron", "le asignaron", "les asignaron", "le aprobaron", "les aprobaron", "le enviaron", "les enviaron", "le concedieron", "les concedieron", "me contaste", "me contaron", "me has dicho", "me han dicho", "me habia dicho", "me habias dicho", "me habian dicho", "me habia confirmado", "me habias confirmado", "me habian confirmado", "me han confirmado"];
// CORRECCIÓN R4 (lista (e) A): variantes de persona, número y pronombre
// (me/nos/le/les/te) y con auxiliar (han/has, había) de los verbos de
// concesión y comunicación. Sin estas formas, «X que Y» dejaba pasar
// «¿El precio que hiciste sigue?», «¿El precio que diste sigue vigente?»,
// «¿El precio que me negociaron sigue vigente?», etc. «se» no tiene
// construcción natural de destinatario para estos verbos; la forma escueta
// de 3.ª plural cubre el caso sin destinatario.
V01_VERBOS_QUE.push(
  // 3.ª plural sin pronombre
  "dieron", "dijeron", "ofrecieron", "prometieron", "confirmaron",
  "hicieron", "pasaron", "cotizaron", "contaron",
  // 3.ª singular sin pronombre
  "dio", "dijo", "ofrecio", "prometio", "confirmo", "hizo", "paso",
  "cotizo", "conto", "envio", "aprobo", "asigno", "concedio", "respeto",
  // 2.ª singular sin pronombre
  "diste", "dijiste", "ofreciste", "prometiste", "confirmaste", "hiciste",
  "pasaste", "cotizaste", "contaste", "enviaste", "aprobaste", "asignaste",
  "concediste", "respetaste",
  // 1.ª plural sin pronombre
  "dimos", "dijimos", "ofrecimos", "prometimos", "confirmamos", "hicimos",
  "pasamos", "cotizamos", "enviamos", "contamos", "aprobamos", "asignamos",
  "concedimos", "respetamos",
  // «te» + 3.ª plural
  "te dieron", "te dijeron", "te ofrecieron", "te prometieron",
  "te confirmaron", "te hicieron", "te pasaron", "te cotizaron",
  "te enviaron", "te contaron", "te aprobaron", "te asignaron",
  "te concedieron", "te respetaron", "te negociaron",
  // «me/nos/le/les» + «negociaron»
  "me negociaron", "nos negociaron", "le negociaron", "les negociaron",
  // «le/les» + pasaron/cotizaron/contaron/hicieron
  "le pasaron", "les pasaron", "le cotizaron", "les cotizaron",
  "le contaron", "les contaron", "le hicieron", "les hicieron",
  // han/has sin pronombre
  "han dado", "has dado", "han dicho", "has dicho", "han ofrecido",
  "has ofrecido", "han prometido", "has prometido", "han confirmado",
  "has confirmado", "han hecho", "has hecho", "han aprobado",
  "has aprobado", "han asignado", "has asignado", "han concedido",
  "has concedido", "han respetado", "has respetado", "han negociado",
  "has negociado", "han enviado", "has enviado", "han pasado",
  "has pasado", "han cotizado", "has cotizado", "han contado",
  "has contado",
  // «nos» + han/has
  "nos han aprobado", "nos han asignado", "nos han concedido",
  "nos han respetado", "nos han negociado", "nos han enviado",
  "nos han dicho", "nos han confirmado", "nos han hecho", "nos han pasado",
  "nos han cotizado", "nos han contado",
  // «te» + han/has
  "te han dado", "te han ofrecido", "te han prometido", "te han dicho",
  "te han confirmado", "te han hecho", "te han aprobado", "te han asignado",
  "te han concedido", "te han respetado", "te han negociado",
  "te han enviado", "te han pasado", "te han cotizado", "te han contado",
  // «le/les» + han/has
  "le han dado", "les han dado", "le han ofrecido", "les han ofrecido",
  "le han prometido", "les han prometido", "le han dicho", "les han dicho",
  "le han confirmado", "les han confirmado", "le han hecho",
  "les han hecho", "le han aprobado", "les han aprobado",
  "le han asignado", "les han asignado", "le han concedido",
  "les han concedido", "le han respetado", "les han respetado",
  "le han negociado", "les han negociado", "le han enviado",
  "les han enviado", "le han pasado", "les han pasado", "le han cotizado",
  "les han cotizado", "le han contado", "les han contado",
  // había + participio («me/nos» + había/habías/habían)
  "me habia aprobado", "me habias aprobado", "me habian aprobado",
  "nos habia aprobado", "nos habias aprobado", "nos habian aprobado",
  "me habia asignado", "me habias asignado", "me habian asignado",
  "nos habia asignado", "nos habias asignado", "nos habian asignado",
  "me habia concedido", "me habias concedido", "me habian concedido",
  "nos habia concedido", "nos habias concedido", "nos habian concedido",
  "me habia respetado", "me habias respetado", "me habian respetado",
  "nos habia respetado", "nos habias respetado", "nos habian respetado",
  "me habia negociado", "me habias negociado", "me habian negociado",
  "nos habia negociado", "nos habias negociado", "nos habian negociado",
  "me habia dado", "me habias dado", "me habian dado",
  "nos habia dado", "nos habias dado", "nos habian dado",
  "me habia ofrecido", "me habias ofrecido", "me habian ofrecido",
  "nos habia ofrecido", "nos habias ofrecido", "nos habian ofrecido",
  "me habia prometido", "me habias prometido", "me habian prometido",
  "nos habia prometido", "nos habias prometido", "nos habian prometido",
  "me habia hecho", "me habias hecho", "me habian hecho",
  "nos habia hecho", "nos habias hecho", "nos habian hecho",
  "me habia enviado", "me habias enviado", "me habian enviado",
  "nos habia enviado", "nos habias enviado", "nos habian enviado",
  "nos habia dicho", "nos habias dicho", "nos habian dicho",
  "nos habia confirmado", "nos habias confirmado", "nos habian confirmado",
  // CORRECCIÓN R5 (lista (e) C): había/habías/habían + participio con
  // «te/le/les» (en v5 solo «me/nos»). «han/has» no cubre las
  // construcciones con «había»: «¿El precio que te habían aprobado
  // sigue vigente?» no disparaba (hallazgo de GPT en el PIR-1 R5).
  "te habia aprobado", "te habias aprobado", "te habian aprobado",
  "le habia aprobado", "le habias aprobado", "le habian aprobado",
  "les habia aprobado", "les habias aprobado", "les habian aprobado",
  "te habia asignado", "te habias asignado", "te habian asignado",
  "le habia asignado", "le habias asignado", "le habian asignado",
  "les habia asignado", "les habias asignado", "les habian asignado",
  "te habia concedido", "te habias concedido", "te habian concedido",
  "le habia concedido", "le habias concedido", "le habian concedido",
  "les habia concedido", "les habias concedido", "les habian concedido",
  "te habia respetado", "te habias respetado", "te habian respetado",
  "le habia respetado", "le habias respetado", "le habian respetado",
  "les habia respetado", "les habias respetado", "les habian respetado",
  "te habia negociado", "te habias negociado", "te habian negociado",
  "le habia negociado", "le habias negociado", "le habian negociado",
  "les habia negociado", "les habias negociado", "les habian negociado",
  "te habia dado", "te habias dado", "te habian dado",
  "le habia dado", "le habias dado", "le habian dado",
  "les habia dado", "les habias dado", "les habian dado",
  "te habia ofrecido", "te habias ofrecido", "te habian ofrecido",
  "le habia ofrecido", "le habias ofrecido", "le habian ofrecido",
  "les habia ofrecido", "les habias ofrecido", "les habian ofrecido",
  "te habia prometido", "te habias prometido", "te habian prometido",
  "le habia prometido", "le habias prometido", "le habian prometido",
  "les habia prometido", "les habias prometido", "les habian prometido",
  "te habia hecho", "te habias hecho", "te habian hecho",
  "le habia hecho", "le habias hecho", "le habian hecho",
  "les habia hecho", "les habias hecho", "les habian hecho",
  "te habia enviado", "te habias enviado", "te habian enviado",
  "le habia enviado", "le habias enviado", "le habian enviado",
  "les habia enviado", "les habias enviado", "les habian enviado",
  "te habia dicho", "te habias dicho", "te habian dicho",
  "le habia dicho", "le habias dicho", "le habian dicho",
  "les habia dicho", "les habias dicho", "les habian dicho",
  "te habia confirmado", "te habias confirmado", "te habian confirmado",
  "le habia confirmado", "le habias confirmado", "le habian confirmado",
  "les habia confirmado", "les habias confirmado", "les habian confirmado"
);
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
// CORRECCIÓN R5 (lista (e) D, opción A de Ultra, respaldada por GPT):
// las 16 formas «precio/tarifa/condición + negociado/concedido» y
// «precio/tarifa + preferencial» (singular/plural) también se EXCLUYEN
// de B_FUERTE: con solo un verbo de continuidad forman preguntas
// públicas sobre la oferta vigente («¿Siguen ofreciendo tarifas
// negociadas?») que recibían la respuesta fija (falso positivo material
// del PIR-1 R5). Quedan en B (reglas 1, 1c, 1d, 1e) y en la lista
// dedicada de las reglas 6/7a (V01_OBJETOS_CONFIRMA_NEGOCIADO).
const V01_SENAL_B_FUERTE = V01_SENAL_B.filter((s) => ![
  "pago", "pagos", "cliente", "clientes", "oferta", "ofertas",
  "promocion", "promociones", "promosion", "promosiones",
  "beneficio", "beneficios", "descuento", "descuentos",
  "deskuento", "deskuentos", "rebaja", "rebajas",
  "contrato", "contratos", "acuerdo", "acuerdos", "convenio", "convenios",
  "colaboracion", "colaboraciones", "compromiso", "compromisos",
  "cotizacion", "cotizaciones", "presupuesto", "presupuestos",
  "precio negociado", "precios negociados", "tarifa negociada",
  "tarifas negociadas", "condicion negociada", "condiciones negociadas",
  "precio concedido", "precios concedidos", "tarifa concedida",
  "tarifas concedidas", "condicion concedida", "condiciones concedidas",
  "precio preferencial", "precios preferenciales",
  "tarifa preferencial", "tarifas preferenciales",
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
  "lo que me dijiste", "lo que me dijeron", "lo que me has dicho",
  "lo que me han dicho", "lo que me contaste", "lo que me contaron",
  // CORRECCIÓN R4 (lista (e) A): «lo que hicimos/hicieron/hiciste/hizo»
  // (clase 1 del cierre R4). Van en C_DEBIL, no en C_FUERTE: solos no
  // afirman un acuerdo comercial («¿Lo que hiciste en la reunión?» es una
  // pregunta por contenido); con continuidad sí («¿Lo que hicieron sigue
  // vigente?», «¿Lo que hicimos todavía vale?» vía regla 4b).
  "lo que hicimos", "lo que hicieron", "lo que hiciste", "lo que hizo",
];

// (CONTINUIDAD) Marcadores de que algo sigue vigente: verbos débiles +
// «vigente», «en pie», «igual», «todavía», «aún». Usado por la regla 5
// (multi-turno): ahí la premisa ya disparó, así que un seguimiento vago
// («¿Todavía?», «¿Igual?») sí se refiere a ella.
// (CONTINUIDAD_FUERTE) Lo mismo SIN «igual», «todavia», «aun», «vale» ni
// «valen»: en la regla 4 (C_DEBIL) esos solos no bastan, porque forman
// preguntas sobre contenido («¿Lo dicho es igual para la Evaluación Pyme?»,
// «¿Lo que hablamos ayer aún está en el informe?», «¿Lo dicho vale para la
// Evaluación Pyme?»). Con «sigue/vigente/en pie» la regla 4 sí dispara
// («¿Lo de ayer sigue igual?» dispara por «sigue»). «todavía» + «vale»
// juntos sí cuentan, pero en la regla 4b, no aquí.
const V01_SENAL_CONTINUIDAD = [
  "sigue", "siga", "siguen", "sigan", "seguir",
  "mantiene", "mantenga", "mantienen", "mantengan", "mantener",
  "continua", "continue", "continuan", "continuen", "continuar",
  "sige", "sigen",
  "vigente", "vigencia", "en pie", "igual", "todavia", "aun",
  "vale", "valen",
];
const V01_SENAL_CONTINUIDAD_FUERTE = V01_SENAL_CONTINUIDAD.filter((s) => !["igual", "todavia", "aun", "vale", "valen"].includes(s));
// «vale»/«valen» quedan FUERA de CONTINUIDAD_FUERTE (corrección R3): solos
// no bastan en la regla 4 («¿Lo dicho vale para la Evaluación Pyme?» es una
// pregunta sobre contenido y NO debe disparar); solo cuentan junto a
// «todavía»/«aún» en la regla 4b, o como seguimiento vago en la regla 5.

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
  // CORRECCIÓN R4 (lista (e) D, L1): «me das/dan/da», «nos das/dan/da» —
  // concesión en primera persona en presente («¿Me das el mismo precio
  // que ayer?»). NO se añade «ayer» a D_A: «¿Tienen el mismo precio que
  // ayer?» seguiría siendo pública y no debe disparar; la señal que
  // distingue es el «me/nos», no el temporal (ver informe R3 §6.1).
  "me das", "me dan", "me da", "nos das", "nos dan", "nos da",
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
const V01_RE_A_TEMPORAL = v01Patron(V01_SENAL_A_TEMPORAL);
// B_FUERTE sin «trato» (corrección R3, FP3/FP4): la regla 6 no debe disparar
// por «me confirma + trato» («¿Me confirma cuál es el trato con los
// clientes?» es una pregunta pública). «trato» SIGUE en B_FUERTE para la
// regla 2 («¿Sigue el trato?» dispara) y en B para la regla 1.
const V01_SENAL_B_FUERTE_SIN_TRATO = V01_SENAL_B_FUERTE.filter((s) => s !== "trato" && s !== "tratos");
const V01_RE_B_FUERTE_SIN_TRATO = v01Patron(V01_SENAL_B_FUERTE_SIN_TRATO);
// Lista dedicada de las reglas 6/7a (corrección R5, lista (e) D, opción
// A de Ultra): las formas negociado/concedido/preferencial salieron de
// B_FUERTE (ya no disparan con solo continuidad, regla 2), pero con
// «confirmar» SÍ afirman una condición previa concreta del visitante
// («¿Me confirmas el precio negociado?» dispara, como en v5). La regla
// 7a ya las cubre por sustantivo + participio («precio» + «negociado»);
// esta lista da a la regla 6 la misma cobertura de forma explícita.
const V01_OBJETOS_CONFIRMA_NEGOCIADO = [
  "precio negociado", "precios negociados", "tarifa negociada", "tarifas negociadas",
  "condicion negociada", "condiciones negociadas",
  "precio concedido", "precios concedidos", "tarifa concedida", "tarifas concedidas",
  "condicion concedida", "condiciones concedidas",
  "precio preferencial", "precios preferenciales", "tarifa preferencial", "tarifas preferenciales",
];
const V01_RE_OBJETOS_CONFIRMA_NEGOCIADO = v01Patron(V01_OBJETOS_CONFIRMA_NEGOCIADO);
// Patrones «X que Y» como regex compacta (corrección R3, regla 1c): el
// producto cartesiano sustantivo × verbo se expresa como
// (sustantivos) que (verbos), sin enumerar los ~900 patrones. Dispara sola:
// así los verbos nuevos («negociamos», «me enviaron») funcionan dentro del
// patrón sin entrar en A_FUERTE, donde serían falsos positivos («¿Negociamos
// un descuento?» es prospectivo; «¿Me enviaron el contrato?» pregunta por
// un envío).
// CORRECCIÓN R5 (lista (e) B): la pasiva/impersonal con «se» («¿El
// precio que se negoció sigue vigente?», «¿La tarifa que se concedió
// sigue vigente?») entra con el «se» opcional tras «que». Los verbos
// siguen siendo los de concesión/comunicación en pasado: «que se
// ofrece» o «que se publica» (presente o verbo ajeno a la lista) NO
// casa y sigue al modelo. En v5 la desviación «sin variantes con se»
// fue juzgada NO ACEPTABLE por GPT: la pasiva con «se» no es un
// destinatario, es otra voz gramatical.
const V01_RE_X_QUE = new RegExp(`\\b(?:${V01_SUSTANTIVOS_X_QUE.join("|")}) que (?:se )?(?:${V01_VERBOS_QUE.join("|")})\\b`);
// Objeto vinculado al temporal por «de» (corrección R3, regla 1b): «el
// descuento de ayer», «la tarifa de la semana pasada». Solo sustantivos de
// CONDICIÓN (descuento, promoción, oferta...), NO de cantidad (precio,
// valor, costo...): «¿Cuál es el precio del año pasado?» es información
// pública y NO debe disparar. Incluye «precio/tarifa/condición especial»,
// que sí son condiciones.
const V01_OBJETOS_DE_TEMPORAL = ["descuento", "descuentos", "promocion", "promociones", "oferta", "ofertas", "beneficio", "beneficios", "tarifa", "tarifas", "tarifa especial", "tarifas especiales", "condicion", "condiciones", "condicion especial", "condiciones especiales", "trato", "tratos", "rebaja", "rebajas", "contrato", "contratos", "acuerdo", "acuerdos", "convenio", "convenios", "colaboracion", "colaboraciones", "compromiso", "compromisos", "cotizacion", "cotizaciones", "presupuesto", "presupuestos", "precio especial", "precios especiales"];
const V01_RE_OBJETO_DE_TEMPORAL = new RegExp(`\\b(?:${V01_OBJETOS_DE_TEMPORAL.join("|")})\\s+(?:de ayer|de la semana pasada|del mes pasado|del ano pasado|de la vez pasada|de la ultima vez|de la llamada)\\b`);
// Sustantivos de cantidad (corrección R3, regla 1b'): «precio», «tarifa»,
// «costo»... NO están en B (con un marcador verbal dispararían preguntas
// públicas como «¿Me diste el precio del Diagnóstico Esencial?»), pero con
// un temporal + continuidad («¿El precio de la semana pasada sigue
// vigente?») la pregunta presupone un precio pasado que sigue aplicando:
// eso sí es una condición previa no verificable.
const V01_SENAL_MONTO = ["precio", "precios", "tarifa", "tarifas", "condicion", "condiciones", "costo", "costos", "monto", "montos", "valor", "valores", "cuota", "cuotas", "importe", "importes"];
const V01_RE_MONTO = v01Patron(V01_SENAL_MONTO);
// Regla 1d (corrección R3; GENERALIZADA en la corrección R4, lista (e) A
// y D, L4): concesión en primera persona + sustantivo de cantidad + fin de
// mensaje. «¿Me dieron el precio?» dispara; «¿Me diste el precio del
// Diagnóstico Esencial?» NO (hay más después del objeto: el anclaje al
// final del mensaje es lo que distingue la premisa de la pregunta por un
// precio público). En v4 solo cubría «respetar»; ahora cubre todos los
// verbos de concesión (dar, ofrecer, prometer, aprobar, asignar, conceder,
// negociar, confirmar, pasar, cotizar, contar, decir, hacer, respetar) en
// pasado, con y sin auxiliar, y con destinatario me/nos/le/les. Cola
// temporal opcional («ayer», «la semana pasada»...): «¿Me dieron el precio
// ayer?» también es una premisa. El presente («me dan») NO entra: «¿Me dan
// el precio del Diagnóstico Esencial?» sigue sin disparar. La forma
// «X que Y» («el precio que me respetaron») la cubre la regla 1c.
// Colas compartidas de las reglas 1d/1e/1f (corrección R6, lista (e) B):
// complemento de ATRIBUCIÓN al visitante tras el objeto («para nuestro
// grupo», «para mi empresa», «de mi empresa», «para nosotros», «para
// mí»). En el PIR-1 R6, GPT demostró que las reglas 1d/1e anclaban a
// fin de mensaje y que cualquier complemento posterior rompía la
// detección, aunque el complemento ATRIBUYERA la condición al propio
// visitante (B-1, B-2). La cola solo admite atribución expresa: NO
// admite complementos de la oferta pública («del Diagnóstico
// Esencial», «para clientes nuevos», «para empresas», «para otra
// empresa»), que siguen rompiendo el anclaje y yendo al modelo. La
// cola temporal es la misma lista que la regla 1d ya admitía en v6.
const V01_COLA_ATRIBUCION = "(?:(?:para|de) (?:mi|nuestro|nuestra)(?: (?:grupo|empresa|compania|negocio|equipo|organizacion|pyme))?|para (?:nosotros|nosotras))";
const V01_COLA_TEMPORAL = "(?:ayer|la semana pasada|el mes pasado|el ano pasado|la vez pasada|la ultima vez|de ayer|de la semana pasada|del mes pasado|del ano pasado|de la vez pasada|de la ultima vez|de la llamada)";
const V01_VERBOS_CONCESION_MONTO = ["dieron", "dio", "diste", "ofrecieron", "ofreciste", "prometieron", "prometiste", "aprobaron", "aprobaste", "asignaron", "asignaste", "concedieron", "concediste", "negociaron", "negociaste", "confirmaron", "confirmaste", "pasaron", "pasaste", "cotizaron", "cotizaste", "contaron", "contaste", "dijeron", "dijiste", "hicieron", "hiciste", "hizo", "respetaron", "respeto", "respetaste", "han respetado", "has respetado", "han dado", "has dado", "han ofrecido", "has ofrecido", "han prometido", "has prometido", "han aprobado", "has aprobado", "han asignado", "has asignado", "han concedido", "has concedido", "han confirmado", "has confirmado"];
const V01_RE_CONCESION_MONTO = new RegExp(`\\b(?:me|te|nos|le|les) (?:${V01_VERBOS_CONCESION_MONTO.join("|")}) (?:el|la|los|las) (?:precio|precios|tarifa|tarifas|condicion|condiciones|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes)(?: (?:acordado|acordada|acordados|acordadas|convenido|convenida|convenidos|convenidas|pactado|pactada|pactados|pactadas|negociado|negociada|negociados|negociadas|concedido|concedida|concedidos|concedidas|aprobado|aprobada|aprobados|aprobadas|asignado|asignada|asignados|asignadas|especial|especiales))?(?: ${V01_COLA_ATRIBUCION})?(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// CORRECCIÓN R5 (lista (e) A, hallazgo determinante de GPT): la regla
// 1d contempla ahora el destinatario «te» («¿Te dieron el precio?»,
// «¿Te aprobaron el precio?», «¿Te concedieron la tarifa?») y los
// plurales de todos los sustantivos de cantidad («¿Me dieron los
// precios?», «¿Me asignaron las tarifas?», «¿Me concedieron las
// condiciones?»); en v5 solo contemplaba me/nos/le/les y el singular.
// CORRECCIÓN R6 (lista (e) B): la regla 1d admite ahora la cola de
// atribución tras el objeto («¿Me dieron el precio para mi empresa?»
// dispara; B-2 del PIR-1 R6). La guarda pública queda intacta: la
// cola no admite «del Diagnóstico Esencial» ni «para clientes nuevos».
// Regla 1e (corrección R5, lista (e) E — DEFINICIÓN ADOPTADA para la
// 3.ª persona plural sin pronombre; REVISADA en la corrección R6,
// lista (e) C del cierre del PIR-1 R6): verbo de concesión en 3.ª
// plural SIN pronombre + sustantivo de cantidad + fin de mensaje.
// DEFINICIÓN REVISADA (R6): la regla NO sostiene que la ausencia de
// pronombre demuestre que el visitante es el destinatario (objeción
// semántica de GPT en el PIR-1 R6). Sostiene algo más estrecho y
// delimitado: en ESTE chatbot no existe información pública sobre
// negociaciones con terceros — los únicos precios públicos son los
// publicados, y se preguntan en presente o con verbos de existencia
// («¿Tienen tarifas?», «¿Ofrecen descuentos?»), no con verbos de
// concesión en pasado —. Por tanto, una concesión pasada +
// sustantivo de cantidad SIN ningún otro referente en el mensaje
// (sin pronombre, sin tercero nombrado, sin complemento de
// atribución, sin ancla temporal o de evento) no tiene en este
// contexto otro referente disponible que el caso del propio
// visitante: es una premisa por defecto contextual, no por
// gramática. Delimitación operativa: (1) si el mensaje nombra otro
// referente («a terceros», «para otra empresa», «con un cliente»)
// o ancla el hecho en el tiempo («ayer», «la semana pasada», «en
// 2024»), la forma SALE de la regla y va al modelo como pregunta
// por un evento: la cola temporal sigue sin admitirse en la forma
// escueta; (2) si el mensaje lleva atribución expresa al visitante
// (cola de atribución, punto B), la atribución ya no depende del
// defecto contextual y la forma dispara AUNQUE lleve cola temporal
// («¿Negociaron la tarifa para nuestro grupo ayer?» dispara). Por
// eso la regla 1d (con «me/te», atribución gramatical) siempre
// admitió cola temporal y la 1e solo la admite tras la cola de
// atribución. El presente no entra («¿Ofrecen tarifas?» no lleva
// verbo de concesión en 3.ª plural); «pago» y «contrato» no están
// en la lista de sustantivos (como en la propuesta de Ultra). La
// definición revisada se somete al PIR-1 R7.
const V01_VERBOS_TERCERA_PLURAL_MONTO = ["dieron", "dijeron", "ofrecieron", "prometieron", "confirmaron", "hicieron", "pasaron", "cotizaron", "contaron", "negociaron", "aprobaron", "asignaron", "concedieron", "respetaron"];
const V01_RE_TERCERA_PLURAL_MONTO = new RegExp(`\\b(?:${V01_VERBOS_TERCERA_PLURAL_MONTO.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:precio|precios|tarifa|tarifas|condicion|condiciones|descuento|descuentos|oferta|ofertas|beneficio|beneficios|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes)(?: (?:acordado|acordada|acordados|acordadas|convenido|convenida|convenidos|convenidas|pactado|pactada|pactados|pactadas|negociado|negociada|negociados|negociadas|concedido|concedida|concedidos|concedidas|aprobado|aprobada|aprobados|aprobadas|asignado|asignada|asignados|asignadas|especial|especiales))?(?: ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?)?\\s*(?:por favor)?\\s*$`);
// Regla 1f (corrección R6, lista (e) A — impersonales con «se»):
// «se» + verbo de concesión en pasado (3.ª singular o plural, o
// «había/habían» + participio) + sustantivo de cantidad + fin de
// mensaje, con la misma cola de atribución de las reglas 1d/1e.
// GPT en el PIR-1 R6 (problema A): la pasiva con «se» solo estaba
// cubierta tras «que» (regla 1c); la construcción impersonal
// independiente («¿Se concedió una tarifa?», «¿Se negoció una
// tarifa?») atravesaba el filtro. Es la misma voz gramatical sin
// destinatario expreso: se rige por la definición contextual de la
// regla 1e (sin otro referente en el mensaje, la concesión pasada
// solo puede referirse al caso del visitante). Guardas: los verbos
// son SOLO los de concesión en pasado — «se ofrece»/«se ofrecen»
// (presente, oferta vigente) y «se publicó»/«se actualizó» (verbos
// ajenos a la concesión) NO casan y siguen al modelo —; y la cola
// pública («del Diagnóstico Esencial») sigue rompiendo el anclaje.
const V01_SE_CONCESION_FINITO = ["concedio", "concedieron", "negocio", "negociaron", "aprobo", "aprobaron", "asigno", "asignaron", "respeto", "respetaron", "ofrecio", "ofrecieron", "prometio", "prometieron", "dio", "dieron", "confirmo", "confirmaron", "cotizo", "cotizaron", "pacto", "pactaron", "acordo", "acordaron"];
const V01_SE_CONCESION_PARTICIPIO = ["concedido", "negociado", "aprobado", "asignado", "respetado", "ofrecido", "prometido", "dado", "confirmado", "cotizado", "pactado", "acordado"];
const V01_RE_SE_IMPERSONAL = new RegExp(`\\bse (?:(?:${V01_SE_CONCESION_FINITO.join("|")})|(?:habia|habian) (?:${V01_SE_CONCESION_PARTICIPIO.join("|")})) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:precio|precios|tarifa|tarifas|condicion|condiciones|descuento|descuentos|oferta|ofertas|beneficio|beneficios|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes)(?: (?:acordado|acordada|acordados|acordadas|convenido|convenida|convenidos|convenidas|pactado|pactada|pactados|pactadas|negociado|negociada|negociados|negociadas|concedido|concedida|concedidos|concedidas|aprobado|aprobada|aprobados|aprobadas|asignado|asignada|asignados|asignadas|especial|especiales))?(?: ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?)?\\s*(?:por favor)?\\s*$`);
// Atribución expresa al visitante (corrección R6, lista (e) D):
// posesivo o complemento que ata la condición al propio visitante,
// a su grupo o a su empresa («para nuestro grupo», «para mi
// empresa», «de mi empresa», «nuestro grupo», «mi tarifa»). NO es
// atribución el segmento público sin posesivo («para empresas»,
// «para grupos», «para clientes nuevos») ni el tercero («a
// terceros», «para otra empresa»).
const V01_RE_ATRIBUCION = /\b(?:(?:para|de) (?:mi|nuestro|nuestra)(?: (?:grupo|empresa|compania|negocio|equipo|organizacion|pyme))?|para (?:nosotros|nosotras)|(?:mi|mis|nuestro|nuestra|nuestros|nuestras) (?:grupo|empresa|compania|negocio|equipo|organizacion|pyme)|(?:mi|mis|nuestro|nuestra|nuestros|nuestras) (?:precio|precios|tarifa|tarifas|condicion|condiciones|descuento|descuentos|oferta|ofertas|beneficio|beneficios))\b/;
// Regla 2c (corrección R6, lista (e) D): la forma escueta anclada
// «(artículo) + objeto negociado/concedido/preferencial +
// complemento de atribución» y nada más: «¿La tarifa negociada
// para nuestro grupo?» presupone la condición atribuida aunque no
// lleve verbo de continuidad. Sin posesivo («¿La tarifa negociada
// para empresas?») NO dispara.
const V01_RE_OBJETO_NEGOCIADO_ATRIBUIDO = new RegExp(`^(?:(?:el|la|los|las) )?(?:${V01_OBJETOS_CONFIRMA_NEGOCIADO.join("|")}) (?:(?:para|de) (?:mi|nuestro|nuestra) (?:grupo|empresa|compania|negocio|equipo|organizacion|pyme)|para (?:mi|nosotros|nosotras))\\s*(?:por favor)?\\s*$`);
// Regla 4, excepción documento (corrección R4, lista (e) D, L3): «¿Lo que
// me dijiste sigue en el informe?» pregunta por el contenido de un
// documento, no por una condición comercial. La continuidad seguida de
// «en el informe/reporte/documento/correo» NO dispara la regla 4, salvo
// que el mensaje tenga además un objeto comercial (B o MONTO): «¿Lo que me
// dijiste sobre el precio sigue en el informe?» sí dispara. C_FUERTE no
// se ve afectado («¿Lo que acordamos sigue en el informe?» dispara).
const V01_RE_CONTINUIDAD_EN_DOCUMENTO = /\b(?:sigue|siguen|continua|continuan|mantiene|mantienen)\s+en\s+(?:el|la)\s+(?:informe|reporte|documento|correo)\b/;
// Regla 4b (corrección R3, L5/P6): referencia vaga previa + «todavía»/«aún»
// + «vale/valen/válido...». Ni «todavía» solo («¿Lo que hablamos todavía
// está en el informe?») ni «vale» solo («¿Lo dicho vale para la Evaluación
// Pyme?») bastan; juntos sí («¿Lo que hablamos todavía vale?»).
const V01_RE_REF_VAGA_VALE = /(?:lo que hablamos|lo que conversamos|lo de ayer|lo del otro dia|lo de la vez pasada|lo de la ultima vez|lo de la semana pasada|lo del mes pasado|lo del ano pasado|lo hablado|lo conversado|lo dicho|lo prometido|lo ofrecido|lo que me dijiste|lo que me dijeron|lo que me has dicho|lo que me han dicho|lo que me contaste|lo que me contaron|lo acordado|lo acordada|lo acordados|lo acordadas|lo pactado|lo pactada|lo pactados|lo pactadas|lo convenido|lo convenidos|lo convenida|lo que hicimos|lo que hicieron|lo que hiciste|lo que hizo)\b/;
// Regla 7a (corrección R3, L6): «me confirmas/confirma/confirman el X» y
// nada más (salvo «por favor»): «¿Me confirmas el descuento?» dispara;
// «¿Me confirmas el descuento para clientes nuevos?» y «¿Me confirmas el
// precio del Diagnóstico Esencial?» NO (hay más después del objeto). «pago»
// queda fuera: «¿Me confirmas el pago?» pregunta por un pago, no por un
// acuerdo. Objetos en singular definido; participio opcional tras el objeto.
const V01_OBJETOS_CONFIRMA = ["descuento", "precio especial", "precio", "tarifa especial", "tarifa", "condicion especial", "condicion", "oferta", "beneficio", "promocion", "cuota", "monto", "valor", "costo", "importe", "cotizacion", "presupuesto", "contrato", "acuerdo", "convenio", "colaboracion", "compromiso", "trato", "rebaja"];
const V01_RE_CONFIRMA_DEFINIDO = new RegExp(`\\bme (?:confirmas|confirma|confirman) (?:el|la) (?:${V01_OBJETOS_CONFIRMA.join("|")})(?: (?:acordado|acordada|convenido|convenida|pactado|pactada|aprobado|aprobada|asignado|asignada|negociado|negociada|respetado|respetada|concedido|concedida|ofrecido|ofrecida|prometido|prometida|confirmado|confirmada|dado|dada))?\\s*(?:por favor)?\\s*$`);
// Regla 7b (corrección R3, L7a/L7b): «sigue + el acuerdo/compromiso/...»
// y nada más tras el sustantivo: «¿Sigue el acuerdo?» dispara; «¿Sigue el
// acuerdo de confidencialidad?» y «¿Sigue el contrato de soporte?» NO.
const V01_SUSTANTIVOS_ACUERDO = ["acuerdo", "acuerdos", "compromiso", "compromisos", "contrato", "contratos", "convenio", "convenios", "colaboracion", "colaboraciones"];
const V01_RE_SIGUE_ACUERDO_1 = new RegExp(`\\b(?:sigue|siga|siguen|sigan)\\s+(?:vigente\\s+)?(?:el|la|los|las)\\s+(?:${V01_SUSTANTIVOS_ACUERDO.join("|")})(?:\\s+(?:vigente|activo|activa|en pie))?\\s*$`);
const V01_RE_SIGUE_ACUERDO_2 = new RegExp(`\\b(?:el|la|los|las)\\s+(?:${V01_SUSTANTIVOS_ACUERDO.join("|")})\\s+(?:sigue|siga|siguen|sigan)\\s+(?:vigente|activo|activa|en pie|igual)?\\s*$`);

// Determinista: el mismo mensaje produce siempre el mismo resultado.
// Reglas (OR) — corrección R6 (2026-11-19, filtro v7):
//  1. A_FUERTE (verbal) + B (cualquier objeto, incluido «pago/cliente/oferta»)
//  1b. A_TEMPORAL + B, solo con continuidad («sigue», «vigente», «todavía»,
//      «vale»...) o con el objeto vinculado por «de» («el descuento de
//      ayer»). Un temporal escueto + objeto genérico NO dispara (FP1, FP2).
//  1b'. A_TEMPORAL + continuidad + sustantivo de cantidad («el precio de la
//      semana pasada sigue vigente?»): el precio pasado que sigue aplicando
//      es una condición previa; sin continuidad («¿Cuál es el precio del año
//      pasado?») NO dispara.
//  1c. Patrón «X que Y» (regla compacta): «el descuento que me aprobaron»,
//      «la cotización que me enviaron», «el precio que negociamos»...
//  1d. Concesión en primera persona + sustantivo de cantidad + fin de
//      mensaje («¿Me dieron el precio?»; generalización R4 de «me/nos
//      respetaron el precio»: dar, ofrecer, prometer, aprobar, asignar,
//      conceder, negociar, confirmar, pasar, cotizar, contar, decir,
//      hacer, respetar; con y sin auxiliar; cola temporal opcional;
//      R5: + destinatario «te» y plurales de cantidad; R6: + cola de
//      atribución tras el objeto («para mi empresa»))
//  1e. Concesión en 3.ª plural SIN pronombre + sustantivo de cantidad +
//      fin de mensaje («¿Negociaron la tarifa?»; corrección R5, lista
//      (e) E: definición adoptada — propuesta de Ultra; REVISADA en R6,
//      lista (e) C: premisa por defecto contextual — sin ningún otro
//      referente en el mensaje —; la cola temporal solo se admite tras
//      cola de atribución; «¿Negociaron la tarifa ayer?» NO dispara:
//      evento pasado sin atribución)
//  1f. Impersonal con «se» + verbo de concesión en pasado + sustantivo
//      de cantidad + fin de mensaje («¿Se concedió una tarifa?»; R6,
//      lista (e) A; «se ofrece»/«se publicó» NO casan)
//  2. A_DEBIL + B_FUERTE (verbo de continuidad + objeto específico;
//      R5: las formas negociado/concedido/preferencial ya NO están en
//      B_FUERTE: la forma escueta con solo continuidad no dispara)
//  2b. Objeto negociado/concedido/preferencial + atribución expresa +
//      continuidad fuerte («¿La tarifa negociada para nuestro grupo
//      sigue vigente?»; R6, lista (e) D: resolución del punto D sin
//      reintroducir el FP público — la forma escueta SIN atribución
//      sigue yendo al modelo)
//  2c. Forma escueta anclada: objeto negociado/concedido/preferencial
//      + complemento de atribución y nada más («¿La tarifa negociada
//      para nuestro grupo?»; R6, lista (e) D)
//  3. D_A + D_B («el mismo precio...» + marcador previo estrecho;
//      D_A incluye ahora «me/nos das/dan/da» para L1)
//  4. C_FUERTE, o C_DEBIL + CONTINUIDAD_FUERTE (referencia previa sin
//      objeto); EXCEPCIÓN documento R4: la continuidad seguida de «en el
//      informe/reporte/documento/correo» no dispara si no hay objeto
//      comercial en el mensaje (L3 resuelto)
//  4b. Referencia vaga previa + «todavía»/«aún» + «vale/válido...»
//      («¿Lo que hablamos todavía vale?», «¿Todavía vale lo que hablamos?»)
//  6. CONFIRMAR_DEBIL + (CONTINUIDAD_FUERTE o B_FUERTE sin «trato» o
//     lista dedicada negociado/concedido/preferencial de la corrección
//     R5) («confirmar» en presente/infinitivo con continuidad u objeto
//     específico; solo con un objeto genérico NO dispara; «trato» fuera
//     por FP3/FP4)
//  7a. «me confirmas/confirma/confirman el X» y nada más («¿Me confirmas
//      el descuento?»; «pago» excluido)
//  7b. «sigue + el acuerdo/compromiso/contrato/...» y nada más tras el
//      sustantivo («¿Sigue el acuerdo?»; «¿Sigue el acuerdo de
//      confidencialidad?» NO)
function v01EsAfirmacionPreviaNoVerificable(mensajeUsuario) {
  const n = v01Normalizar(mensajeUsuario);
  if (!n) return false;
  const aFuerte = V01_RE_A_FUERTE.test(n) || V01_RE_ME_CONTINUIDAD.test(n);
  if (aFuerte && V01_RE_B.test(n)) return true;
  if (V01_RE_A_TEMPORAL.test(n) && V01_RE_B.test(n) && (V01_RE_CONTINUIDAD.test(n) || V01_RE_OBJETO_DE_TEMPORAL.test(n))) return true;
  if (V01_RE_A_TEMPORAL.test(n) && V01_RE_CONTINUIDAD.test(n) && V01_RE_MONTO.test(n)) return true;
  if (V01_RE_X_QUE.test(n)) return true;
  if (V01_RE_CONCESION_MONTO.test(n)) return true;
  if (V01_RE_TERCERA_PLURAL_MONTO.test(n)) return true;
  if (V01_RE_SE_IMPERSONAL.test(n)) return true;
  if (V01_RE_A_DEBIL.test(n) && V01_RE_B_FUERTE.test(n)) return true;
  if (V01_RE_OBJETOS_CONFIRMA_NEGOCIADO.test(n) && V01_RE_ATRIBUCION.test(n) && V01_RE_CONTINUIDAD_FUERTE.test(n)) return true;
  if (V01_RE_OBJETO_NEGOCIADO_ATRIBUIDO.test(n)) return true;
  if (V01_RE_D_A.test(n) && V01_RE_D_B.test(n)) return true;
  if (V01_RE_C_FUERTE.test(n)) return true;
  if (V01_RE_C_DEBIL.test(n) && V01_RE_CONTINUIDAD_FUERTE.test(n) && !(V01_RE_CONTINUIDAD_EN_DOCUMENTO.test(n) && !V01_RE_B.test(n) && !V01_RE_MONTO.test(n))) return true;
  if ((V01_RE_C_DEBIL.test(n) || V01_RE_REF_VAGA_VALE.test(n)) && /\b(todavia|aun)\b/.test(n) && /\b(vale|valen|valido|valida|validos|validas)\b/.test(n)) return true;
  if (V01_RE_CONFIRMAR_DEBIL.test(n) && (V01_RE_CONTINUIDAD_FUERTE.test(n) || V01_RE_B_FUERTE_SIN_TRATO.test(n) || V01_RE_OBJETOS_CONFIRMA_NEGOCIADO.test(n))) return true;
  if (V01_RE_CONFIRMA_DEFINIDO.test(n)) return true;
  if (V01_RE_SIGUE_ACUERDO_1.test(n) || V01_RE_SIGUE_ACUERDO_2.test(n)) return true;
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
// («¿Sigue vigente?») y un mensaje de usuario anterior disparó el filtro,
// la premisa ya está en la conversación y el seguimiento también dispara.
// Mira los últimos 5 mensajes de usuario (corrección R4, L6): 5 es todo el
// historial que el handler pasa al filtro (toAiMessages hace slice(-10):
// como máximo 5 mensajes de usuario). La ventana ya no es un número
// arbitrario: cubre exactamente lo que el filtro puede ver, sin conservar
// nada más allá. Una pregunta legítima en medio («¿Cuánto cuesta la
// Evaluación Pyme?») NO dispara porque no es continuidad. Un mensaje
// legítimo posterior a una premisa NO dispara.
function v01DisparaEnHistorial(history) {
  const usuarios = (history || []).filter(
    (m) => m && m.role === "user" && typeof m.content === "string"
  );
  if (usuarios.length === 0) return false;
  const ultimo = usuarios[usuarios.length - 1];
  if (v01EsAfirmacionPreviaNoVerificable(ultimo.content)) return true;
  if (!v01EsContinuidad(ultimo.content)) return false;
  for (let i = 2; i <= 5; i++) {
    const anterior = usuarios[usuarios.length - i];
    if (anterior && v01EsAfirmacionPreviaNoVerificable(anterior.content)) return true;
  }
  return false;
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
  // datos personales. Mira los últimos 5 mensajes de usuario (regla 5,
  // corrección R4: todo el historial que recibe el filtro).
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
