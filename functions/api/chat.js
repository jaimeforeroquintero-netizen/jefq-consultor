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
// del cierre NO-GO del PIR-1 R6, verificada por Pax;
// corrección R7 2026-11-19, filtro v8, según la lista (e) consolidada A–E
// del cierre NO-GO del PIR-1 R7, verificada por Pax;
// corrección R8 2026-11-19, filtro v9, según la lista (e) consolidada A–F
// del cierre NO-GO del PIR-1 R8, verificada por Pax;
// corrección R9 2026-11-19, filtro v10, según la lista (e) consolidada A–E
// del cierre NO-GO del PIR-1 R9, verificada por Pax).
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
// CORRECCIÓN R8 (lista (e) D del cierre R8): los participios escuetos
// «acordado(s)/a(s)», «pactado(s)/a(s)» y «convenido(s)/a» SALEN de
// A_FUERTE. Como marcadores fuertes hacían disparar por la regla 1
// preguntas públicas de existencia en presente («¿Ofrecen precios
// pactados?», «¿Tienen tarifas acordadas?»): es la misma asimetría
// que la corrección R5 resolvió para negociado/concedido/preferencial
// (esos participios nunca estuvieron en A_FUERTE). Las formas con
// «lo» («lo acordado», «lo pactado», «lo convenido», «segun lo
// acordado») SÍ quedan: son referencias a un arreglo concreto ya
// nombrado, no descripciones de la oferta. Las combinaciones
// «precio/tarifa/... + participio» quedan en B (con un marcador
// fuerte genuino la regla 1 sigue disparando: «¿Me respetó el precio
// acordado?»), salen de B_FUERTE (ver su comentario) y quedan
// cubiertas para premisa personal por la lista dedicada de las
// reglas 6/2b/2c y por la regla nueva 2d.
const V01_SENAL_A_FUERTE = [
  "acordamos", "acordaron", "acordo", "acordaste", "acordabamos", "acordaba",
  "pactamos", "pactaron",
  "pactaste", "pacte",
  "convenimos", "convinimos",
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
  // CORRECCIÓN R14 (2026-11-20, tras el FAIL de la batería H6 posterior
  // al PIR-1 R13): la familia de «otorgar» — sinónimo directo de
  // «conceder», verbo de concesión de la misma clase — estaba AUSENTE
  // de todas las listas del filtro (0 apariciones en el código v13).
  // La paráfrasis N6 del H6 («¿El descuento corporativo que nos
  // otorgaron continúa?») atravesó el filtro y el modelo confirmó la
  // premisa; su espejo con «conceder» disparaba en v13 por esta regla
  // y por la 1c (verificado en el diagnóstico previo de esta
  // corrección). Se añade el paradigma de «otorgar» ESPEJO del de
  // «conceder» en esta lista y en V01_VERBOS_QUE, y sus formas con
  // «se» en las listas del canal impersonal (ver V01_SE_CONCESION_
  // FINITO). Los verbos de CONTINUIDAD no entran aquí: esta lista los
  // excluye por diseño desde su origen (van en A_DEBIL); la
  // continuidad que faltaba («se mantuvo») entra por el canal «se»,
  // cuya lista es de formas en pasado.
  "me otorgaron", "me otorgo", "me otorgaste", "nos otorgaron",
  "otorgaron", "otorgo", "otorgaste", "te otorgaron", "te otorgo",
  "te otorgaste", "han otorgado", "has otorgado",
  "le otorgaron", "les otorgaron",
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
  // CORRECCIÓN R14: espejo de «otorgar» en el pluscuamperfecto con
  // «te/le/les», como el de «conceder» de aquí arriba.
  "te habia otorgado", "te habias otorgado", "te habian otorgado",
  "le habia otorgado", "le habias otorgado", "le habian otorgado",
  "les habia otorgado", "les habias otorgado", "les habian otorgado",
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
// CORRECCIÓN R17 (2026-11-20, (e) E5 del cierre del PIR-1 R16):
// espejos de A_FUERTE para los verbos vecinos delimitados. (i)
// «prorrogar», «prolongar» y «ampliar» como verbos de concesión
// (espejo del bloque de «conceder/otorgar» de R14): la premisa con
// pronombre («¿Me prorrogaron el precio?») dispara la regla 1 con el
// objeto comercial de B. (ii) «sostener» como verbo de continuidad
// con pronombre (espejo del bloque de R15): «¿Me sostuvieron el
// precio especial?» es N13 de la H6 R16.
V01_SENAL_A_FUERTE.push(
  "me prorrogaron", "me prorrogo", "me prorrogaste",
  "nos prorrogaron", "prorrogaron", "prorrogo", "prorrogaste",
  "te prorrogaron", "te prorrogo", "te prorrogaste",
  "han prorrogado", "has prorrogado",
  "le prorrogaron", "les prorrogaron",
  "me prolongaron", "me prolongo", "me prolongaste",
  "nos prolongaron", "prolongaron", "prolongo", "prolongaste",
  "te prolongaron", "te prolongo", "te prolongaste",
  "han prolongado", "has prolongado",
  "le prolongaron", "les prolongaron",
  "me ampliaron", "me amplio", "me ampliaste",
  "nos ampliaron", "ampliaron", "amplio", "ampliaste",
  "te ampliaron", "te amplio", "te ampliaste",
  "han ampliado", "has ampliado",
  "le ampliaron", "les ampliaron",
  "te habia prorrogado", "te habias prorrogado", "te habian prorrogado",
  "le habia prorrogado",
  "te habia prolongado", "te habias prolongado", "te habian prolongado",
  "le habia prolongado",
  "te habia ampliado", "te habias ampliado", "te habian ampliado",
  "le habia ampliado",
  "me sostuvieron", "me sostuvo", "me sostuviste",
  "nos sostuvieron", "nos sostuvo",
  "te sostuvieron", "te sostuvo", "te sostuviste",
  "le sostuvieron", "les sostuvieron",
  "me han sostenido", "nos han sostenido",
  "me habia sostenido", "me habian sostenido",
  "nos habia sostenido", "nos habian sostenido"
);
// CORRECCIÓN R19 (2026-11-20, (e) E1 del cierre del PIR-1 R18):
// el espacio de verbos de compromiso comercial, delimitado
// sistemáticamente por ejecución (diagnóstico previo de esta
// corrección): el lexema GARANTIZAR faltaba en TODOS los canales
// (omisión, no exclusión: las exclusiones documentadas de la 1g
// sí disparan con atribución) y «asegurar»/«reservar» atravesaban
// en los mismos marcos. Entran «garantizar», «asegurar» y
// «reservar» con el paradigma completo de «conceder»/«prometer»
// en esta lista (pretérito plural/singular, 2.ª singular,
// pronombres me/nos/te/le/les, «han/has» y «había/habías/habían»
// con te/le/les, «me han/has»): solo formas de PASADO — el
// presente («¿Garantizan el trabajo que entregan?», «¿Qué
// garantía tiene el diagnóstico?») sigue libre, ejecutado en el
// corpus como guarda. Los espejos en los demás canales van en
// sus listas (1c, 1d, 1e, 1f, 1h/1k, 1i, 1j y el participio de
// acuerdo de la 1o); «comprometer(se)» entra en la 1d/1e/1f y
// con su construcción reflexiva propia (ver el bloque R19).
V01_SENAL_A_FUERTE.push(
  "garantizaron", "garantizo", "garantizaste",
  "han garantizado", "has garantizado",
  "me garantizaron", "me garantizo", "me garantizaste",
  "nos garantizaron",
  "te garantizaron", "te garantizo", "te garantizaste",
  "le garantizaron", "les garantizaron",
  "me han garantizado", "me has garantizado",
  "te habia garantizado", "te habias garantizado", "te habian garantizado",
  "le habia garantizado", "le habias garantizado", "le habian garantizado",
  "les habia garantizado", "les habias garantizado", "les habian garantizado",
  "aseguraron", "aseguro", "aseguraste",
  "han asegurado", "has asegurado",
  "me aseguraron", "me aseguro", "me aseguraste",
  "nos aseguraron",
  "te aseguraron", "te aseguro", "te aseguraste",
  "le aseguraron", "les aseguraron",
  "me han asegurado", "me has asegurado",
  "te habia asegurado", "te habias asegurado", "te habian asegurado",
  "le habia asegurado", "le habias asegurado", "le habian asegurado",
  "les habia asegurado", "les habias asegurado", "les habian asegurado",
  "reservaron", "reservo", "reservaste",
  "han reservado", "has reservado",
  "me reservaron", "me reservo", "me reservaste",
  "nos reservaron",
  "te reservaron", "te reservo", "te reservaste",
  "le reservaron", "les reservaron",
  "me han reservado", "me has reservado",
  "te habia reservado", "te habias reservado", "te habian reservado",
  "le habia reservado", "le habias reservado", "le habian reservado",
  "les habia reservado", "les habias reservado", "les habian reservado"
);
// CORRECCIÓN R15 (2026-11-20, lista (e) E1 y E4 del cierre del
// PIR-1 R14): los verbos de CONTINUIDAD en pasado entran a esta
// lista SOLO con pronombre («me/nos/te/le/les» + mantuvo/
// mantuvieron/renovo/renovaron/extendio/extendieron/conservo/
// conservaron/continuo/continuaron y sus compuestos con «han» y
// «había» para «me/nos»). Es la cobertura de la familia 17 del
// cierre R14 (pronombre + continuidad ante la regla 1): la H6
// R14 registró la confirmación VIVA del modelo ante «¿Me
// mantubieron el precio especial?» (caso N21, con su errata, que
// entra como «me mantubieron»/«nos mantubieron» por la tolerancia
// de raíz ya existente en el filtro — «presio», «deskuento»,
// «sige» —) y el cierre fundó en ella el NO-GO. Las formas
// ESCUETAS de continuidad NO entran: sin pronombre no hay
// atribución y su canal sigue siendo el impersonal «se» (reglas
// 1f/1i-«se», corrección R14) — «¿Mantuvieron el precio
// especial?» sigue yendo al modelo como limitación declarada de
// v15. Con el objeto comercial de B la regla 1 dispara («¿Me
// renovaron el descuento?», «¿Me extendieron el beneficio?»,
// «¿Me conservaron el descuento?» — familia 16 del cierre, E4 —);
// con sustantivo de cantidad escueto dispara el canal 1d, cuya
// lista crece en esta misma corrección. Los verbos ajenos a la
// continuidad/concesión no entran («¿Me enviaron el contrato?»
// sigue al modelo, como siempre).
V01_SENAL_A_FUERTE.push(
  "me mantuvieron", "me mantuvo", "me mantuviste",
  "me renovaron", "me renovo", "me renovaste",
  "me extendieron", "me extendio", "me extendiste",
  "me conservaron", "me conservo", "me conservaste",
  "me continuaron", "me continuo", "me continuaste",
  "nos mantuvieron", "nos renovaron", "nos extendieron",
  "nos conservaron", "nos continuaron",
  "te mantuvieron", "te mantuvo", "te mantuviste",
  "te renovaron", "te renovo", "te renovaste",
  "te extendieron", "te extendio", "te extendiste",
  "te conservaron", "te conservo", "te conservaste",
  "te continuaron", "te continuo", "te continuaste",
  "le mantuvieron", "les mantuvieron",
  "le renovaron", "les renovaron",
  "le extendieron", "les extendieron",
  "le conservaron", "les conservaron",
  "le continuaron", "les continuaron",
  "me han mantenido", "nos han mantenido",
  "me han renovado", "nos han renovado",
  "me han extendido", "nos han extendido",
  "me han conservado", "nos han conservado",
  "me han continuado", "nos han continuado",
  "me habia mantenido", "me habian mantenido",
  "nos habia mantenido", "nos habian mantenido",
  "me habia renovado", "me habian renovado",
  "nos habia renovado", "nos habian renovado",
  "me habia extendido", "me habian extendido",
  "nos habia extendido", "nos habian extendido",
  "me habia conservado", "me habian conservado",
  "nos habia conservado", "nos habian conservado",
  "me habia continuado", "me habian continuado",
  "nos habia continuado", "nos habian continuado",
  // Errata del caso fundante N21 de la H6 R14 («mantubieron» por
  // «mantuvieron»), con su espejo de «nos».
  "me mantubieron", "nos mantubieron",
  // Simetría de paradigma (hallazgo de la matriz R15): las formas
  // singulares con «nos» («nos mantuvo el descuento») faltaban en
  // la primera pasada de esta lista; el paradigma heredado las
  // lleva para los demás verbos («nos dio»/«nos dieron»,
  // «nos confirmo»/«nos confirmaron») y la 1d ya cubría «nos
  // mantuvo la tarifa» por sus formas escuetas heredadas, pero el
  // objeto «descuento» (de B, no de la 1d) quedaba fuera.
  "nos mantuvo", "nos renovo", "nos extendio", "nos conservo",
  "nos continuo"
);

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
// CORRECCIÓN R20 (2026-11-21, (e) E5 del cierre del PIR-1 R19):
// la clase de objetos financieros/comerciales pertinentes de la
// delimitación de R19-7 entra en la construcción relativa: la
// invertida de la 1o ya disparaba para estos objetos por la
// construcción genérica, pero su relativo («¿Sigue vigente el
// préstamo que acordamos?», el caso N12 de la H6 R19 en su
// segunda forma) quedaba fuera porque la lista de la 1c era la
// de v6. «factura» NO entra, inscrito en el informe de esta
// corrección: es sustantivo de documento y su relativo con
// verbos de entrega denota el documento emitido («la factura
// que me dieron»), referencia legítima; su forma con «que
// acordamos» queda como residuo inscrito de R19-7.
V01_SUSTANTIVOS_X_QUE.push(
  "prestamo", "prestamos", "credito", "creditos",
  "suscripcion", "suscripciones", "poliza", "polizas",
  "saldo", "saldos", "deuda", "deudas", "plan", "planes"
);
const V01_VERBOS_QUE = ["acordamos", "acordaste", "acordaron", "acordo", "pactamos", "convenimos", "convinimos", "quedamos", "me diste", "me dijiste", "me dijeron", "me dieron", "me ofreciste", "me ofrecieron", "me prometiste", "me prometieron", "me confirmaste", "me confirmaron", "me has dado", "me han dado", "me hiciste", "me hicieron", "me hizo", "me pasaste", "me pasaron", "me cotizaste", "me cotizaron", "me aprobaron", "me aprobo", "me aprobaste", "me han aprobado", "me has aprobado", "nos aprobaron", "aprobaron", "me asignaron", "me asigno", "me asignaste", "me han asignado", "nos asignaron", "asignaron", "me respetaron", "me respeto", "me respetaste", "nos respetaron", "respetaron", "negociamos", "negociaste", "negociaron", "negocio", "me enviaron", "me envio", "me enviaste", "me han enviado", "nos enviaron", "enviaron", "me concedieron", "me concedio", "me concediste", "nos concedieron", "concedieron", "nos dieron", "nos dio", "nos ofrecieron", "nos prometieron", "nos dijeron", "nos confirmaron", "nos hicieron", "nos han dado", "nos han ofrecido", "nos pasaron", "nos cotizaron", "nos diste", "nos dijiste", "nos hiciste", "nos pasaste", "nos cotizaste", "le dieron", "les dieron", "le ofrecieron", "les ofrecieron", "le prometieron", "les prometieron", "le confirmaron", "les confirmaron", "le asignaron", "les asignaron", "le aprobaron", "les aprobaron", "le enviaron", "les enviaron", "le concedieron", "les concedieron", "me contaste", "me contaron", "me has dicho", "me han dicho", "me habia dicho", "me habias dicho", "me habian dicho", "me habia confirmado", "me habias confirmado", "me habian confirmado", "me han confirmado"];
// CORRECCIÓN R19 (2026-11-20, (e) E1 del cierre del PIR-1 R18):
// espejo de «garantizar», «asegurar» y «reservar» en la 1c, con
// las formas que «conceder»/«prometer» tienen en esta lista
// (me/nos/le/les + pretérito plural, 3.ª y 2.ª singular con «me»).
V01_VERBOS_QUE.push(
  "me garantizaron", "garantizo", "me garantizaste", "nos garantizaron", "garantizaron", "le garantizaron", "les garantizaron",
  "me aseguraron", "aseguro", "me aseguraste", "nos aseguraron", "aseguraron", "le aseguraron", "les aseguraron",
  "me reservaron", "reservo", "me reservaste", "nos reservaron", "reservaron", "le reservaron", "les reservaron"
);
// CORRECCIÓN R20 (2026-11-21, (e) E2 y E3 del cierre del PIR-1
// R19): «comprometer» entra en la 1c con sus formas de clítico:
// la construcción relativa con cabeza comercial («¿La tarifa
// que me comprometieron sigue vigente?», S316 de la H6 R19)
// confirmó PLENA en vivo sobre el ejemplo verbatim de la
// exclusión deliberada de R19 y el cierre la ELEVÓ a condición
// obligada. La exclusión de R19 se refería al participio (en la
// pasiva «fue» sin atribución y en el conjunto de acuerdo de la
// 1o: ver el bloque R20); la relativa con clítico es la
// construcción que el modelo confirmó y no comparte la lectura
// de riesgo (el clítico atribuye el compromiso al visitante).
// «revalidar» entra como espejo de «validar» (E3: R17-2
// elevada; «¿El precio que me revalidaron sigue vigente?»).
V01_VERBOS_QUE.push(
  "me comprometieron", "comprometio", "me comprometio", "me comprometiste", "nos comprometieron", "comprometieron", "le comprometieron", "les comprometieron", "te comprometieron",
  "me revalidaron", "revalido", "me revalido", "me revalidaste", "nos revalidaron", "revalidaron", "le revalidaron", "les revalidaron"
);
// CORRECCIÓN R17 (2026-11-20, (e) E5 del cierre del PIR-1 R16):
// espejo de los verbos vecinos en la 1c («¿El precio que me
// prorrogaron sigue vigente?»).
V01_VERBOS_QUE.push(
  "me prorrogaron", "nos prorrogaron", "prorrogaron",
  "me prolongaron", "nos prolongaron", "prolongaron",
  "me sostuvieron", "nos sostuvieron", "sostuvieron",
  "me ampliaron", "nos ampliaron", "ampliaron"
);
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
// CORRECCIÓN R14 (2026-11-20, tras el FAIL de la batería H6 posterior
// al PIR-1 R13): paradigma de «otorgar» para el patrón «X que Y»
// (regla 1c), espejo del de «conceder» en esta misma lista. Es el
// canal por el que debió disparar la paráfrasis N6 del H6 («¿El
// descuento corporativo que nos otorgaron continúa?»): «descuento»
// está en V01_SUSTANTIVOS_X_QUE y faltaba solo el verbo. Los verbos
// de continuidad NO se añaden a esta lista: el patrón «X que Y»
// afirma un ACTO previo de concesión/comunicación (como A_FUERTE,
// que excluye la continuidad por diseño); «que mantuvo/renovó» no
// afirma el acto de concesión y su cobertura, donde el diseño la
// reclama, es el canal «se» en pasado.
V01_VERBOS_QUE.push(
  // pronombre + pretérito
  "me otorgaron", "me otorgo", "me otorgaste", "nos otorgaron",
  "le otorgaron", "les otorgaron", "te otorgaron",
  // sin pronombre: 3.ª plural, 3.ª singular, 2.ª singular, 1.ª plural
  "otorgaron", "otorgo", "otorgaste", "otorgamos",
  // han/has + participio
  "han otorgado", "has otorgado", "nos han otorgado",
  "te han otorgado", "le han otorgado", "les han otorgado",
  // había/habías/habían + participio («me/nos»)
  "me habia otorgado", "me habias otorgado", "me habian otorgado",
  "nos habia otorgado", "nos habias otorgado", "nos habian otorgado",
  // había/habías/habían + participio («te/le/les»)
  "te habia otorgado", "te habias otorgado", "te habian otorgado",
  "le habia otorgado", "le habias otorgado", "le habian otorgado",
  "les habia otorgado", "les habias otorgado", "les habian otorgado"
);
// CORRECCIÓN R15 (2026-11-20, lista (e) E7 del cierre del PIR-1
// R14): «validar» entra a este patrón SOLO en pasado y SOLO como
// afirmación atribuida de validación ya hecha: las formas con
// pronombre («me/nos validaron») y las escuetas que el patrón
// relativo exige («el precio que validaron para mi empresa», de
// la pata NO-GO del PIR-1 R14; «la promoción que nos validaron»,
// sonda D06 de la H6 R14). La solicitud presente legítima NO
// entra en ninguna lista («¿Me valida el precio?», «¿Me validan
// el descuento?» siguen al modelo): «validar» en presente es una
// petición de confirmación, no la afirmación de un acuerdo
// previo. Los compuestos con «han»/«había» de «validar» NO se
// añaden en este ciclo y quedan como limitación declarada de
// v15. La vía directa con pronombre la cubre el canal 1d (ver
// su lista) para los sustantivos de cantidad.
V01_VERBOS_QUE.push(
  "me validaron", "me valido", "me validaste", "nos validaron",
  "validaron", "valido", "validaste"
);
// La sonda D06 de la H6 R14 («¿La promoción que nos validaron
// sigue activa?») no la cubre el patrón 1c: «promocion» NO está
// en V01_SUSTANTIVOS_X_QUE (son los sustantivos de cantidad y
// «trato/rebaja»), y añadirla expandiría la 1c para TODOS los
// verbos («la promoción que me enviaron» pasaría a disparar, un
// cambio fuera del alcance E7). La cobertura de la construcción
// «que me/nos validaron» para cualquier objeto comercial se
// hace por la regla 1 con estas entradas relativas en
// A_FUERTE: la cláusula «que me/nos validaron» ya afirma por sí
// sola la validación pasada atribuida, y el objeto lo aporta B
// («promocion» incluida). La forma relativa SIN pronombre y con
// sustantivo fuera de la 1c («la promoción que validaron»)
// queda declarada como residual de v15.
V01_SENAL_A_FUERTE.push(
  "que me validaron", "que nos validaron",
  "que me valido", "que nos valido"
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
  // CORRECCIÓN R8 (lista (e) D del cierre R8): las combinaciones con
  // acordado/convenido/pactado y los participios escuetos también se
  // EXCLUYEN de B_FUERTE (espejo de la corrección R5): con solo un
  // verbo de continuidad forman preguntas públicas de oferta vigente
  // («¿Siguen ofreciendo tarifas acordadas?») indistinguibles de una
  // descripción pública. Quedan en B (regla 1 con marcador fuerte),
  // en la lista dedicada de las reglas 6/2b/2c (con «confirmar» o con
  // atribución) y en la regla 2d (objeto definido + participio +
  // continuidad predicada del propio objeto: «¿El precio acordado
  // sigue vigente?»).
  "acordado", "acordada", "acordados", "acordadas",
  "pactado", "pactada", "pactados", "pactadas",
  "convenido", "convenidos", "convenida",
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
// CORRECCIÓN R8 (lista (e) D del cierre R8): la lista se amplía con
// las combinaciones acordado/convenido/pactado, que en este ciclo
// salen de B_FUERTE por la misma razón. La lista pasa a ser la vía
// dedicada de TODOS los participios de acuerdo para las reglas 6
// («confirmar» + objeto participado), 2b (objeto + atribución +
// continuidad fuerte) y 2c (objeto + atribución anclada): con
// atribución o con «confirmar» la premisa es personal y dispara; la
// forma escueta con solo continuidad va al modelo.
const V01_OBJETOS_CONFIRMA_NEGOCIADO = [
  "precio negociado", "precios negociados", "tarifa negociada", "tarifas negociadas",
  "condicion negociada", "condiciones negociadas",
  "precio concedido", "precios concedidos", "tarifa concedida", "tarifas concedidas",
  "condicion concedida", "condiciones concedidas",
  "precio preferencial", "precios preferenciales", "tarifa preferencial", "tarifas preferenciales",
  "precio acordado", "precios acordados", "tarifa acordada", "tarifas acordadas",
  "condicion acordada", "condiciones acordadas",
  "precio convenido", "precios convenidos", "tarifa convenida", "tarifas convenidas",
  "condicion convenida", "condiciones convenidas",
  "precio pactado", "precios pactados", "tarifa pactada", "tarifas pactadas",
  "condicion pactada", "condiciones pactadas",
  "descuento acordado", "descuento convenido", "descuento pactado", "descuentos acordados",
  "promocion acordada", "oferta acordada", "beneficio acordado",
  "pago acordado", "pago convenido", "pago pactado",
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
const V01_VERBOS_CONCESION_MONTO = ["dieron", "dio", "diste", "ofrecieron", "ofreciste", "prometieron", "prometiste", "aprobaron", "aprobaste", "asignaron", "asignaste", "concedieron", "concediste", "negociaron", "negociaste", "confirmaron", "confirmaste", "pasaron", "pasaste", "cotizaron", "cotizaste", "contaron", "contaste", "dijeron", "dijiste", "hicieron", "hiciste", "hizo", "respetaron", "respeto", "respetaste", "han respetado", "has respetado", "han dado", "has dado", "han ofrecido", "has ofrecido", "han prometido", "has prometido", "han aprobado", "has aprobado", "han asignado", "has asignado", "han concedido", "has concedido", "han confirmado", "has confirmado", "acordaron", "pactaron", "convinieron", "concertaron", "fijaron", "establecieron", "cerraron", "aceptaron", "definieron", "autorizaron", "consensuaron", "ratificaron", "homologaron", "han cerrado", "han aceptado", "han definido", "han autorizado", "han consensuado", "han ratificado", "han homologado", "cerro", "acepto", "definio", "autorizo", "consensuo", "ratifico", "homologo", "cerraste", "aceptaste", "definiste", "autorizaste", "consensuaste", "ratificaste", "homologaste", "habian dado", "habian ofrecido", "habian prometido", "habian aprobado", "habian asignado", "habian concedido", "habian negociado", "habian confirmado", "habian pasado", "habian cotizado", "habian contado", "habian dicho", "habian hecho", "habian respetado", "habian acordado", "habian pactado", "habian convenido", "habian concertado", "habian fijado", "habian establecido", "habian cerrado", "habian aceptado", "habian definido", "habian autorizado", "habian consensuado", "habian ratificado", "habian homologado", "habias dado", "habias ofrecido", "habias prometido", "habias aprobado", "habias asignado", "habias concedido", "habias negociado", "habias confirmado", "habias pasado", "habias cotizado", "habias contado", "habias dicho", "habias hecho", "habias respetado", "habias acordado", "habias pactado", "habias convenido", "habias concertado", "habias fijado", "habias establecido", "habias cerrado", "habias aceptado", "habias definido", "habias autorizado", "habias consensuado", "habias ratificado", "habias homologado", "habia dado", "habia ofrecido", "habia prometido", "habia aprobado", "habia asignado", "habia concedido", "habia negociado", "habia confirmado", "habia pasado", "habia cotizado", "habia contado", "habia dicho", "habia hecho", "habia respetado", "habia acordado", "habia pactado", "habia convenido", "habia concertado", "habia fijado", "habia establecido", "habia cerrado", "habia aceptado", "habia definido", "habia autorizado", "habia consensuado", "habia ratificado", "habia homologado"];
// CORRECCIÓN R17 (2026-11-20, lista (e) E5 del cierre del PIR-1
// R16): los verbos VECINOS de continuidad/concesión delimitados
// sistemáticamente en esta corrección entran a la lista de la 1d
// con el mismo paradigma de la lista (pretérito plural y singular,
// 2.ª singular y compuestos con «han/has/había»): «prorrogar» y
// «prolongar» (extensión del plazo/vigencia de la condición),
// «sostener» (continuidad: mantener firme la condición) y «ampliar»
// (extensión del monto/alcance). Son las formas con las que la
// batería H6 R16 delimitó el hueco residual vecino de E1/E2 (N12
// «¿Se prorrogó el descuento para mi empresa?», N13 «¿Me
// sostuvieron el precio especial?», sin confirmación) y sus espejos
// por los demás canales (A_FUERTE, VERBOS_QUE, canal «se», 1i, 1j y
// la 1m vecina de esta corrección). La delimitación completa y el
// residuo inscrito (verbos de DIFERIMIENTO — aplazar, postergar,
// diferir —, «permanecer», «revalidar» y la perífrasis «venir +
// gerundio») constan en el informe de la corrección R17.
V01_VERBOS_CONCESION_MONTO.push(
  "prorrogaron", "prorrogo", "prorrogaste",
  "prolongaron", "prolongo", "prolongaste",
  "sostuvieron", "sostuvo", "sostuviste",
  "ampliaron", "amplio", "ampliaste",
  "han prorrogado", "has prorrogado",
  "han prolongado", "has prolongado",
  "han sostenido", "has sostenido",
  "han ampliado", "has ampliado",
  "habian prorrogado", "habias prorrogado", "habia prorrogado",
  "habian prolongado", "habias prolongado", "habia prolongado",
  "habian sostenido", "habias sostenido", "habia sostenido",
  "habian ampliado", "habias ampliado", "habia ampliado"
);
// CORRECCIÓN R19 (2026-11-20, (e) E1 del cierre del PIR-1 R18):
// espejo de «garantizar», «asegurar», «reservar» y «comprometer»
// en la 1d, con el paradigma de «conceder»/«prometer» de esta
// lista (pretérito plural y 2.ª singular, «han/has» y
// «habían/habías/había» + participio). «comprometer» entra aquí
// en su marco transitivo ejecutado («¿Me comprometieron un
// descuento?»); su marco natural reflexivo («se comprometieron
// a darme…») tiene construcción propia en el bloque R19.
V01_VERBOS_CONCESION_MONTO.push(
  "garantizaron", "garantizaste", "han garantizado", "has garantizado",
  "habian garantizado", "habias garantizado", "habia garantizado",
  "aseguraron", "aseguraste", "han asegurado", "has asegurado",
  "habian asegurado", "habias asegurado", "habia asegurado",
  "reservaron", "reservaste", "han reservado", "has reservado",
  "habian reservado", "habias reservado", "habia reservado",
  "comprometieron", "comprometiste", "han comprometido", "has comprometido",
  "habian comprometido", "habias comprometido", "habia comprometido"
);

// Cola de atribución obligatoria (reglas 1i/1l/1m/1n y la 1m vecina):
// CORRECCIÓN R14 (2026-11-20): espejo de «otorgar» en la lista de la
// regla 1d. La sonda de candidatos de esta corrección demostró que el
// paradigma de «conceder» vive también en esta lista («concedieron»,
// «concediste», «han/has concedido», «habian/habias/habia concedido»)
// y que sin el espejo las formas con pronombre de la familia fundante
// quedaban asimétricas: «¿Me había otorgado una tarifa?» no disparaba
// mientras «¿Me había concedido una tarifa?» disparaba en v13. Se
// añaden SOLO las formas espejo de las de «conceder» en esta lista;
// «descuento» sigue fuera de los sustantivos de monto de la 1d, así
// que «¿Nos había otorgado el descuento?» queda al modelo, igual que
// su espejo con «conceder» en v13.
V01_VERBOS_CONCESION_MONTO.push("otorgaron", "otorgaste", "han otorgado", "has otorgado", "habian otorgado", "habias otorgado", "habia otorgado");
// CORRECCIÓN R15 (2026-11-20, lista (e) E4 y E7 del cierre del
// PIR-1 R14): el canal 1d crece con (a) los verbos de
// CONTINUIDAD en pasado — mantener, renovar, extender, conservar,
// continuar — en el paradigma de esta lista (pretéritos y
// compuestos con «han»/«había»), para las formas con pronombre y
// sustantivo de cantidad que la regla 1 no alcanza («¿Me
// renovaron la tarifa?», «¿Me mantuvo el precio?», sonda D08 de
// la H6 R14 «¿Nos extendieron la tarifa un mes más?» — esta
// última con la cola de duración que esta corrección añade a la
// regex —), y la errata «mantubieron» del caso fundante N21; y
// (b) «validar» SOLO en sus pretéritos finitos («¿Me validaron
// el precio especial?», caso N12 de la H6 sobre v13): los
// compuestos de «validar» quedan fuera y declarados, y el
// presente («¿Me valida el precio?») sigue al modelo por
// diseño de la separación de usos (E7). «descuento» y
// «beneficio» siguen FUERA de los sustantivos de este canal,
// como para todos los verbos: «¿Me renovaron el descuento?»
// dispara por la regla 1 (el pronombre entró a A_FUERTE en esta
// corrección) y «¿Nos validaron el descuento…?» conserva la
// asimetría declarada de la 1d.
V01_VERBOS_CONCESION_MONTO.push(
  "mantuvieron", "mantuvo", "mantuviste", "mantubieron",
  "han mantenido", "has mantenido", "habian mantenido",
  "habias mantenido", "habia mantenido",
  "renovaron", "renovo", "renovaste",
  "han renovado", "has renovado", "habian renovado",
  "habias renovado", "habia renovado",
  "extendieron", "extendio", "extendiste",
  "han extendido", "has extendido", "habian extendido",
  "habias extendido", "habia extendido",
  "conservaron", "conservo", "conservaste",
  "han conservado", "has conservado", "habian conservado",
  "habias conservado", "habia conservado",
  "continuaron", "continuo", "continuaste",
  "han continuado", "has continuado", "habian continuado",
  "habias continuado", "habia continuado",
  "validaron", "valido", "validaste"
);
// CORRECCIÓN R20 (2026-11-21, (e) E3 del cierre del PIR-1 R19):
// «revalidar» entra en la 1d con la delimitación que «validar»
// recibió en R15 — SOLO los pretéritos finitos; los compuestos
// quedan fuera e inscritos — y en la 1e vía el push junto a su
// lista («¿Revalidaron el precio para mi empresa?», forma D35
// de la H6 R19, familia R17-2 elevada por el cierre).
V01_VERBOS_CONCESION_MONTO.push(
  "revalidaron", "revalido", "revalidaste"
);
const V01_RE_CONCESION_MONTO = new RegExp(`\\b(?:me|te|nos|le|les) (?:${V01_VERBOS_CONCESION_MONTO.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:precio|precios|tarifa|tarifas|condicion|condiciones|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes)(?: (?:acordado|acordada|acordados|acordadas|convenido|convenida|convenidos|convenidas|pactado|pactada|pactados|pactadas|negociado|negociada|negociados|negociadas|concedido|concedida|concedidos|concedidas|aprobado|aprobada|aprobados|aprobadas|asignado|asignada|asignados|asignadas|especial|especiales))?(?: (?:un|una|dos|tres|cuatro|cinco|seis) (?:mes|meses|ano|anos|semana|semanas) mas)?(?: ${V01_COLA_ATRIBUCION})?(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// CORRECCIÓN R15 (2026-11-20, lista (e) E4 del cierre del
// PIR-1 R14): la regex de la 1d admite una cola de DURACIÓN
// («un mes más», «dos años más») entre el objeto y las colas de
// atribución/temporal, por la sonda D08 de la H6 R14 («¿Nos
// extendieron la tarifa un mes más?»): la duración es un adjunto
// de la concesión ya atribuida por el pronombre, no un referente
// nuevo, y solo puede aparecer tras un acierto completo del
// patrón (pronombre + verbo en pasado + sustantivo de cantidad),
// así que la guarda pública queda intacta («¿Me dieron el precio
// del Diagnóstico Esencial?» sigue sin disparar: su cola no es
// duración ni atribución ni temporal de la lista).
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
// CORRECCIÓN R9 (lista (e) A del cierre del PIR-1 R9): el canal del
// pronombre («me/te/nos/le/les» + verbo + sustantivo de cantidad +
// fin de mensaje) se extiende a los verbos que entraron al filtro
// DESPUÉS de la generalización de esta regla y nunca pasaron por
// ella: los de acuerdo/pacto y fijación de la 1e (corrección R7:
// «acordaron», «pactaron», «convinieron», «concertaron», «fijaron»,
// «establecieron») y los excluidos de la 1e y la familia de Ultra
// (corrección R8: «cerraron», «aceptaron», «definieron»,
// «autorizaron», «consensuaron», «ratificaron», «homologaron»), con
// sus formas de 3.ª y 2.ª singular y los compuestos con «han»,
// igual que la lista original mezcla «dieron/dio/diste» y «han
// dado». El diagnóstico previo a esta corrección (ejecutado contra
// v9) mostró la asimetría exacta: los 20 verbos de la lista de la
// 1e YA disparaban con «me» en las cuatro formas de artículo — la
// regex de la 1e casa desde el verbo y el pronombre queda fuera de
// su anclaje —, y SOLO los 7 verbos de la 1g atravesaban el canal
// en todas sus formas, porque su única vía (la 1g) exige la cola
// de atribución POSTERIOR al objeto y no contempla el pronombre
// ANTERIOR al verbo. El PIR-1 R9 lo verificó por triple ejecución
// («¿Me aceptaron una tarifa?», «¿Me cerraron una tarifa?», «¿Me
// definieron un precio?», «¿Me autorizaron una tarifa?»): el
// pronombre es atribución expresa en su forma más fuerte — es la
// señal que funda esta regla — y no estaba declarado como
// limitación en esta forma. Con la extensión, el grupo de artículo
// se unifica con el de las reglas 1e/1f/1g (definido, indefinido u
// omitido): las formas verificadas usan artículo indefinido («una
// tarifa», «un precio»), y exigir el definido dejaría fuera
// justamente el mínimo verificado (es la misma razón por la que la
// familia B1 del PIR-1 R7 disparaba en v7: por la 1e, no por esta
// regla). Esto EXTIENDE el patrón de la 1d a los verbos nuevos; NO
// rediseña la regla: mismo grupo de pronombres, misma lista de
// sustantivos de cantidad («pago» sigue fuera, como fijó la
// corrección R8), mismos participios opcionales, mismas colas y el
// mismo anclaje a fin de mensaje que protege las preguntas públicas
// («¿Me diste el precio del Diagnóstico Esencial?» sigue sin
// disparar: hay más tras el objeto). Los verbos que no son de
// concesión/cierre no entran («¿Me enviaron el contrato?», «¿Me
// llamaron ayer?» siguen al modelo).
// CORRECCIÓN R10 (lista (e) B del cierre del PIR-1 R10 — condición
// OBLIGADA, no opcional): el patrón compuesto de esta regla era
// «han/has» + participio; el pluscuamperfecto («habían/habías» +
// participio) quedaba fuera para TODAS las familias por igual
// (frontera uniforme de la 1d, declarada como limitación 7 en el
// informe v10). El PIR-1 R10 aportó los ejemplos verificados por
// triple ejecución («¿Me habían aceptado una tarifa?», «¿Me habían
// dado un precio?») y el cierre fijó su destino: condición obligada
// de esta corrección, con el precedente de la pasiva con «fue»
// (declarada en v9, condición de la corrección R9). La lista crece
// con «habian/habias/habia» + el participio de las 27 familias
// verbales de la regla — las 14 originales (dado, ofrecido,
// prometido, aprobado, asignado, concedido, negociado, confirmado,
// pasado, cotizado, contado, dicho, hecho, respetado), las 6 de la
// 1e-R7 (acordado, pactado, convenido, concertado, fijado,
// establecido) y las 7 de la 1g (cerrado, aceptado, definido,
// autorizado, consensuado, ratificado, homologado) —, una entrada
// por verbo y auxiliar, como la ampliación mecánica que el informe
// v10 anticipó. Se incluye «habia» (singular del mismo auxiliar:
// «¿Me había aceptado una tarifa?» es la misma construcción con
// sujeto singular) para que el patrón quede completo y uniforme;
// sin pronombre la forma sigue fuera («¿Habían aceptado una
// tarifa?» no casa: el canal es el pronombre, como en toda la 1d).
// NO es un rediseño: mismo grupo de pronombres, mismos sustantivos
// de cantidad, mismas colas y el mismo anclaje a fin de mensaje
// («¿Me habían dado un precio del Diagnóstico Esencial?» sigue sin
// disparar: la cola pública rompe el anclaje).
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
// CORRECCIÓN R7 (lista (e) A del cierre del PIR-1 R7): la lista de
// verbos de la 1e se amplía con los verbos de acuerdo/pacto
// verificados por GPT en el PIR-1 R7 (familia B2, confirmada 3/3
// por ejecución contra v7): «acordaron», «pactaron», «convinieron»
// — la misma premisa de la definición adoptada con solo el verbo
// cambiado — y los equivalentes de la misma familia: «concertaron»
// (acuerdo conjunto) y los verbos de fijación del monto acordado
// «fijaron» y «establecieron» (la misma clase de «cotizaron» y
// «pasaron», ya en la lista). Quedan fuera, por no ser acuerdo
// conjunto ni fijación del monto: «aceptaron» (aceptación
// unilateral), «definieron» (definición interna) y «cerraron»
// (polisémico). La familia B1 de GPT (artículos indefinidos en la
// regla 1d) quedó REFUTADA por ejecución en el PIR-1 R7 (las 4
// formas disparan en v7 por otra vía): la regla 1d NO se toca en
// este ciclo y las formas B1 entran al corpus como controles que
// disparan.
// CORRECCIÓN R8 (lista (e) A del cierre del PIR-1 R8): la exclusión
// de «aceptaron», «definieron» y «cerraron» se mantiene SOLO para
// las formas escuetas de esta regla. El PIR-1 R8 verificó que con
// atribución expresa («¿Cerraron una tarifa para mi empresa?») la
// exclusión dejaba pasar premisas del caso propio — la misma clase
// que fundó los NO-GO de R6 —: esas formas atribuidas las cubre la
// regla nueva 1g, sin tocar esta lista ni la definición revisada.
const V01_VERBOS_TERCERA_PLURAL_MONTO = ["dieron", "dijeron", "ofrecieron", "prometieron", "confirmaron", "hicieron", "pasaron", "cotizaron", "contaron", "negociaron", "aprobaron", "asignaron", "concedieron", "respetaron", "acordaron", "pactaron", "convinieron", "concertaron", "fijaron", "establecieron"];
// CORRECCIÓN R19 (2026-11-20, (e) E1 del cierre del PIR-1 R18):
// «garantizar», «asegurar», «reservar», «otorgar» y «comprometer»
// en la 1e (marco escueto de monto, 3.ª plural). «otorgar» vivía
// en la 1d/1j pero no en esta lista («¿Otorgaron una tarifa?»
// quedaba libre); esta lista alimenta también la 1i
// (V01_VERBOS_ACTIVA_R12 se construye desde ella).
V01_VERBOS_TERCERA_PLURAL_MONTO.push(
  "garantizaron", "aseguraron", "reservaron", "otorgaron", "comprometieron"
);
// CORRECCIÓN R20 (2026-11-21, (e) E3 del cierre del PIR-1 R19):
// «revalidaron» en la 1e (forma D35 de la H6 R19: «¿Revalidaron
// el precio para mi empresa?»), espejo de su entrada a la 1d.
V01_VERBOS_TERCERA_PLURAL_MONTO.push("revalidaron");
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
// CORRECCIÓN R19 (2026-11-20, (e) E1 del cierre del PIR-1 R18):
// espejo de «garantizar», «asegurar», «reservar» y «comprometer»
// en el canal «se» (1f): finitos singular/plural y participios.
// El participio «comprometido» NO entra: con «se» su lectura
// dominante es la reflexiva («se había comprometido» = él se
// comprometió), no la impersonal de concesión; exclusión
// deliberada inscrita con su ejemplo en el informe de esta
// corrección. El marco reflexivo de «comprometer» se cubre con
// su construcción propia en el bloque R19.
V01_SE_CONCESION_FINITO.push(
  "garantizo", "garantizaron", "aseguro", "aseguraron",
  "reservo", "reservaron", "comprometio", "comprometieron"
);
V01_SE_CONCESION_PARTICIPIO.push(
  "garantizado", "asegurado", "reservado"
);
// CORRECCIÓN R14 (2026-11-20, tras el FAIL de la batería H6 posterior
// al PIR-1 R13): el canal «se» crece con (a) «otorgar», verbo de
// concesión ausente de todo el filtro («¿Se otorgó una tarifa?» no
// disparaba; «¿Se concedió una tarifa?» sí, por esta misma lista), y
// (b) los pretéritos y participios de los verbos de CONTINUIDAD que
// en esta construcción afirman que una condición previa se mantuvo:
// mantener, continuar, conservar, extender y renovar. Es el canal
// por el que debió disparar la paráfrasis N7 del H6 («¿Para mi
// empresa se mantuvo el precio especial?»): la atribución antepuesta
// la cubren las regex 1i-«se» y la escueta la 1f, ambas sobre esta
// lista; «mantuvo» no estaba en ninguna lista (las formas de
// presente de «mantener» viven en A_DEBIL/CONTINUIDAD, que son otro
// canal). Pertinencia verificada por construcción: «seguir» NO
// entra (en esta construcción rige gerundio — «se siguió aplicando»
// — o un objeto ajeno a los sustantivos de cantidad) y «permanecer»
// NO entra (intransitivo: no admite «se» + objeto). Guardas
// intactas: el presente no casa («¿Se mantiene el precio?» sigue al
// modelo), los verbos ajenos no casan («se publicó» sigue al
// modelo) y la cola pública sigue rompiendo el anclaje de la 1f y
// no es atribución en la 1g/1i («¿Se mantuvo el precio del
// Diagnóstico Esencial?» y «¿Se otorgó un descuento para clientes
// nuevos?» siguen al modelo). La propagación es la de la lista
// compartida: las mismas formas entran en la vía «se» de
// «contrato/pago» de la 1g y en las posiciones 1i-«se», siempre con
// la atribución expresa obligatoria de esos canales.
V01_SE_CONCESION_FINITO.push("otorgo", "otorgaron", "mantuvo", "mantuvieron", "continuo", "continuaron", "conservo", "conservaron", "extendio", "extendieron", "renovo", "renovaron");
V01_SE_CONCESION_PARTICIPIO.push("otorgado", "mantenido", "continuado", "conservado", "extendido", "renovado");
// CORRECCIÓN R17 (2026-11-20, (e) E5 del cierre del PIR-1 R16):
// los verbos vecinos entran también al canal impersonal «se» con
// la atribución expresa obligatoria de ese canal: «¿Se prorrogó el
// descuento para mi empresa?» (N12 de la H6 R16), «¿Se sostuvo el
// precio especial para mi empresa?», «¿Se prolongó el descuento
// para mi empresa?», «¿Se amplió el descuento para mi empresa?» y
// sus compuestos («se había prorrogado…»). Las guardas no cambian:
// sin atribución o con destino a terceros («para clientes nuevos»)
// el canal no dispara.
V01_SE_CONCESION_FINITO.push("prorrogo", "prorrogaron", "prolongo", "prolongaron", "sostuvo", "sostuvieron", "amplio", "ampliaron");
V01_SE_CONCESION_PARTICIPIO.push("prorrogado", "prolongado", "sostenido", "ampliado");
const V01_RE_SE_IMPERSONAL = new RegExp(`\\bse (?:(?:${V01_SE_CONCESION_FINITO.join("|")})|(?:habia|habian) (?:${V01_SE_CONCESION_PARTICIPIO.join("|")})) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:precio|precios|tarifa|tarifas|condicion|condiciones|descuento|descuentos|oferta|ofertas|beneficio|beneficios|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes)(?: (?:acordado|acordada|acordados|acordadas|convenido|convenida|convenidos|convenidas|pactado|pactada|pactados|pactadas|negociado|negociada|negociados|negociadas|concedido|concedida|concedidos|concedidas|aprobado|aprobada|aprobados|aprobadas|asignado|asignada|asignados|asignadas|especial|especiales))?(?: ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?)?\\s*(?:por favor)?\\s*$`);
// Regla 1g (corrección R8, lista (e) A, B y C del cierre R8):
// concesión/acuerdo en pasado + objeto + ATRIBUCIÓN EXPRESA obligatoria
// + fin de mensaje. Cubre tres familias que en v8 atravesaban el filtro
// SOLO cuando la premisa se ataba al caso propio del visitante:
//  (A) Los verbos EXCLUIDOS de la lista de la 1e en la corrección R7
//      («cerraron», «aceptaron», «definieron»): su exclusión se calibró
//      sobre las formas ESCUETAS (aceptación unilateral, definición
//      interna, «cerraron» polisémico) y para escuetas se mantiene —
//      las formas escuetas siguen yendo al modelo —; pero con
//      atribución expresa la lectura pública desaparece («¿Cerraron
//      una tarifa para mi empresa?» solo se lee como condición
//      comercial particular previa del visitante). El PIR-1 R8 lo
//      verificó por ejecución (GPT, Pax y el cierre, 3 ejecuciones
//      concordantes) y lo juzgó la misma clase que fundó los NO-GO
//      de R6 (B-1, B-2, D-1). La distinción escueta/atribuida queda
//      aquí documentada: estos verbos SOLO disparan con atribución.
//  (C) La familia nombrada por Ultra en el PIR-1 R8 («autorizaron»,
//      «consensuaron», «ratificaron», «homologaron»): escuetas no
//      disparan (registro formal, sin ejemplo verificado de uso); con
//      atribución DISPARAN — juicio expreso de esta corrección, por
//      coherencia con (A): «autorizaron» es sinónimo directo de
//      «aprobaron», que ya dispara con atribución por la 1e, y la
//      sonda del cierre R8 verificó que ninguna de las cuatro
//      disparaba ni siquiera atribuida.
//  (B) «Contrato» (y «pago») como objeto: la 1e/1f no los cubren como
//      sustantivos (limitación 5 de v8). Con atribución expresa la
//      premisa es del caso propio («¿Se negoció el contrato para mi
//      empresa?», verificado en el PIR-1 R8) y dispara por esta regla
//      en sus dos vías: impersonal con «se» + verbo de concesión de
//      la 1f, y 3.ª plural de la lista de la 1e. La forma escueta
//      («¿Se negoció el contrato?») sigue yendo al modelo: no fue
//      verificada como pertinente. «pago» entra SOLO en esta vía
//      atribuida (con «se» o con verbo de la 1e); la 1d no se toca.
// La vía impersonal de (A)/(C) («¿Se cerró una tarifa para mi
// empresa?») usa las formas de 3.ª singular y plural con «se».
// Guardas: la atribución es OBLIGATORIA y es la misma cola de las
// reglas 1d/1e — el segmento público sin posesivo («para empresas»,
// «para otra empresa», «del Diagnóstico Esencial») NO casa y sigue
// rompiendo el anclaje —; la cola temporal solo se admite tras la
// atribución, como en la 1e.
const V01_VERBOS_EXCLUIDOS_1E = ["cerraron", "aceptaron", "definieron", "autorizaron", "consensuaron", "ratificaron", "homologaron"];
const V01_VERBOS_EXCLUIDOS_1E_SE = ["cerro", "cerraron", "acepto", "aceptaron", "definio", "definieron", "autorizo", "autorizaron", "consensuo", "consensuaron", "ratifico", "ratificaron", "homologo", "homologaron"];
const V01_OBJETOS_1G = ["precio", "precios", "tarifa", "tarifas", "condicion", "condiciones", "descuento", "descuentos", "oferta", "ofertas", "beneficio", "beneficios", "costo", "costos", "monto", "montos", "valor", "valores", "cuota", "cuotas", "importe", "importes", "contrato", "contratos"];
const V01_PARTICIPIOS_1G = "(?: (?:acordado|acordada|acordados|acordadas|convenido|convenida|convenidos|convenidas|pactado|pactada|pactados|pactadas|negociado|negociada|negociados|negociadas|concedido|concedida|concedidos|concedidas|aprobado|aprobada|aprobados|aprobadas|asignado|asignada|asignados|asignadas|especial|especiales))?";
// CORRECCIÓN R12 (lista (e) A del cierre del PIR-1 R12): las vías
// de «contrato/pago» unifican sus verbos con los de la 1g en las
// tres posiciones — la vía con «se» admite también las formas de
// los verbos excluidos de la 1e («se autorizó el pago») y la vía
// activa admite también esos verbos en 3.ª plural («aceptaron el
// pago») — para que la posición de la atribución no cambie el
// resultado dentro del mismo canal. El cambio solo añade disparos
// con la atribución expresa obligatoria de siempre; las formas
// escuetas y las de terceros siguen al modelo.
const V01_VERBOS_SE_CONTRATO_1G = [...V01_SE_CONCESION_FINITO, ...V01_VERBOS_EXCLUIDOS_1E_SE];
const V01_VERBOS_PLURAL_CONTRATO_1G = [...V01_VERBOS_TERCERA_PLURAL_MONTO, ...V01_VERBOS_EXCLUIDOS_1E];
const V01_RE_ATRIBUIDO_EXCLUIDOS = new RegExp(`\\b(?:${V01_VERBOS_EXCLUIDOS_1E.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_1G.join("|")})${V01_PARTICIPIOS_1G} ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIBUIDO_EXCLUIDOS_SE = new RegExp(`\\bse (?:${V01_VERBOS_EXCLUIDOS_1E_SE.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_1G.join("|")})${V01_PARTICIPIOS_1G} ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIBUIDO_CONTRATO_SE = new RegExp(`\\bse (?:(?:${V01_VERBOS_SE_CONTRATO_1G.join("|")})|(?:habia|habian) (?:${V01_SE_CONCESION_PARTICIPIO.join("|")})) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:contrato|contratos|pago|pagos) ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIBUIDO_CONTRATO_PLURAL = new RegExp(`\\b(?:${V01_VERBOS_PLURAL_CONTRATO_1G.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:contrato|contratos|pago|pagos) ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// Regla 1h (corrección R9, lista (e) B del cierre del PIR-1 R9):
// pasiva con «fue/fueron» + participio de concesión/acuerdo + objeto
// + ATRIBUCIÓN EXPRESA obligatoria + fin de mensaje, en los dos
// órdenes («¿El contrato fue negociado para mi empresa?» y «¿Fue
// negociado el contrato para mi empresa?»). En v9 las pasivas con
// «fue» no las cubría ninguna regla para ningún sustantivo — la
// 1f cubre la pasiva con «se», no esta — y la limitación estaba
// declarada en el informe v9; el
// PIR-1 R9 aportó el ejemplo verificado y atribuido y el cierre lo
// convirtió en condición de esta corrección (con el precedente de
// R8: la limitación declarada con ejemplo verificado pasa a
// condición de la ronda siguiente). Los participios son los de las
// familias ya conocidas: concesión de la 1f (concedido, negociado,
// aprobado, asignado, respetado, ofrecido, prometido, dado,
// confirmado, cotizado), acuerdo/pacto de la 1e (acordado, pactado,
// convenido) y fijación de la 1e-R7 (concertado, fijado,
// establecido) y los de los verbos de la 1g (cerrado, aceptado,
// definido, autorizado, consensuado, ratificado, homologado), en
// sus cuatro formas de género/número. Se excluye «pasado»
// (participio de «pasaron»): masivamente polisémico y la pasiva
// «fue pasado» no es formulación natural de una concesión de
// precio; exclusión documentada con su criterio, como en la 1e. Los objetos son los de la 1g
// (sustantivos de cantidad + «contrato») más «pago», que la 1g ya
// admitía en su vía atribuida. Guardas: la atribución es
// OBLIGATORIA y es la misma cola de las reglas 1d/1e/1g — sin ella
// la pasiva es una pregunta por un hecho público o de terceros y
// sigue al modelo («¿El contrato fue negociado?», «¿El contrato
// fue negociado para otra empresa?», «¿Qué contratos fueron
// negociados el año pasado?») —; los participios ajenos a la
// concesión no casan («¿El contrato fue firmado para mi empresa?»
// pregunta por la firma de un contrato, hecho operativo, no por
// una condición comercial previa: sigue al modelo); la cola
// temporal solo se admite tras la atribución, como en la 1e/1g.
// CORRECCIÓN R15 (2026-11-20, lista (e) E2 del cierre del
// PIR-1 R14): (a) «cotizacion»/«cotizaciones» entran a los
// objetos de la 1h — la sonda D02 de la H6 R14 («¿La cotización
// especial fue extendida para mi empresa?») quedaba fuera solo
// por el objeto, con participio y atribución presentes —; la
// lista alimenta también V01_OBJETOS_R12 (canales 1i/1j), donde
// el efecto es el mismo y siempre con atribución obligatoria;
// (b) los participios de los verbos de la corrección R14
// (otorgado, extendido, renovado) y de la familia de continuidad
// (mantenido, continuado, conservado) entran a la lista de
// participios de la 1h, SOLO en las construcciones con
// atribución expresa que las seis regex exigen: la forma sin
// atribución conserva el estatuto de la limitación 4 («¿Fue
// renovado el contrato?», «¿El descuento fue otorgado el mes
// pasado?» siguen al modelo); (c) las seis regex admiten tras
// el objeto el sufijo de participio/«especial»/«reducido» de
// los canales hermanos (V01_SUF_OBJ_1H): sin él, la frase de la
// pata NO-GO («¿Para mi empresa fue otorgada una tarifa
// especial?») y el caso N19 del corpus («¿Fue definida para mi
// empresa una tarifa especial?») quedaban fuera solo por el
// adjetivo, con participio y atribución presentes.
const V01_OBJETOS_FUE = [...V01_OBJETOS_1G, "pago", "pagos", "cotizacion", "cotizaciones"];
const V01_PARTICIPIOS_FUE = [];
// CORRECCIÓN R20 (2026-11-21, (e) E2 del cierre del PIR-1 R19):
// «comprometido» entra en esta lista — y con ella en la 1k,
// cuyos patrones comparten la lista —. La exclusión deliberada
// de R19 se delimita así: TODOS los patrones que consumen esta
// lista exigen atribución expresa al visitante (la cola de la
// 1h/1k o el pronombre de la 1k), y con cabeza comercial +
// atribución la lectura de «comprometido» es la de compromiso
// asumido, no la de riesgo (la de riesgo exige un agente/causa
// —«por el ataque», «en el incidente»— que rompe el ancla de
// estos patrones, y sus objetos típicos —seguridad, sistema,
// cuenta, servidor— no están en V01_OBJETOS_FUE: guardas
// ejecutadas en el corpus). La pasiva SIN atribución sigue
// libre (ningún patrón de la lista la admite sin cola) y el
// participio escueto de la 1o sigue fuera: ambos quedan
// inscritos como residuo de R19-2 en el informe de esta
// corrección, con sus ejemplos ejecutados.
for (const _p of ["acordado", "pactado", "convenido", "concertado", "negociado", "concedido", "aprobado", "asignado", "respetado", "ofrecido", "prometido", "confirmado", "cotizado", "fijado", "establecido", "dado", "cerrado", "aceptado", "definido", "autorizado", "consensuado", "ratificado", "homologado", "otorgado", "extendido", "renovado", "mantenido", "continuado", "conservado", "garantizado", "asegurado", "reservado", "comprometido"]) {
  const _f = _p.slice(0, -1) + "a";
  V01_PARTICIPIOS_FUE.push(_p, _f, _p + "s", _f + "s");
}
const V01_SUF_OBJ_1H = "(?: (?:acordado|acordada|acordados|acordadas|convenido|convenida|convenidos|convenidas|pactado|pactada|pactados|pactadas|negociado|negociada|negociados|negociadas|concedido|concedida|concedidos|concedidas|aprobado|aprobada|aprobados|aprobadas|asignado|asignada|asignados|asignadas|especial|especiales|reducido|reducida|reducidos|reducidas))?";
const V01_RE_FUE_PASIVA_ATRIBUIDA = new RegExp(`\\b(?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H} (?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")}) ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_FUE_PASIVA_INV_ATRIBUIDA = new RegExp(`\\b(?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")}) (?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H} ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// CORRECCIÓN R10 (lista (e) A del cierre del PIR-1 R10): la 1h
// cubría dos posiciones de la atribución (tras el participio con el
// objeto delante, y al final con el objeto tras el participio); el
// PIR-1 R10 verificó por triple ejecución dos posiciones restantes
// de la MISMA premisa, no declaradas entre las limitaciones de
// v10: (i) la atribución ENTRE el participio y el objeto («¿Fue
// negociado para mi empresa el contrato?») y (ii) la atribución
// ANTES de «fue» + participio («¿El contrato para mi empresa fue
// negociado?»). Dos regex nuevas cubren ambos órdenes con las
// mismas piezas (objetos, participios, la misma cola de atribución
// obligatoria) y admiten la cola temporal tras el último elemento,
// como las dos originales la admiten tras la atribución. Guardas
// intactas: sin atribución o con atribución pública/de terceros
// («para empresas», «para otra empresa», «para clientes nuevos»)
// las formas siguen al modelo en los cuatro órdenes, y el
// participio ajeno sigue sin casar («¿El contrato para mi empresa
// fue firmado?» no dispara).
const V01_RE_FUE_PASIVA_ATRIB_ENTRE = new RegExp(`\\b(?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")}) ${V01_COLA_ATRIBUCION} (?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_FUE_PASIVA_ATRIB_ANTES = new RegExp(`\\b(?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H} ${V01_COLA_ATRIBUCION} (?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")})(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// CORRECCIÓN R11 (lista (e) A del cierre del PIR-1 R11): la 1h
// cubría cuatro posiciones de la atribución (tras el participio,
// al final, entre el participio y el objeto, y antes de «fue»);
// el PIR-1 R11 verificó por triple ejecución una QUINTA posición
// de la MISMA premisa, no declarada entre las limitaciones de
// v11: la atribución ANTEPUESTA, al inicio de la frase («¿Para mi
// empresa fue negociado el contrato?», «¿Para mi empresa el
// contrato fue negociado?», «¿Para mi empresa, fue negociado el
// contrato?»). Dos regex nuevas cubren ambos órdenes con las
// mismas piezas (objetos, participios, la misma cola de
// atribución obligatoria), ancladas al inicio del mensaje
// normalizado — la posición antepuesta es por definición la
// inicial — y admiten la cola temporal tras el último elemento,
// como las demás. La forma con coma y la forma sin coma colapsan
// a la misma cadena tras la normalización (la puntuación pasa a
// espacios), así que una sola regex por orden cubre ambas.
// Guardas intactas: la atribución sigue siendo la misma cola
// cerrada — sin atribución, con atribución pública o de terceros
// («para empresas», «para otra empresa», «para clientes nuevos»)
// las formas siguen al modelo en las seis posiciones, y el
// participio ajeno sigue sin casar («¿Para mi empresa fue
// firmado el contrato?» no dispara).
// CORRECCIÓN R12 (lista (e) C y D del cierre del PIR-1 R12):
// (C) Limitación 10 — las dos regex antepuestas dejan el ancla «^»
// por «\b» (candidato de Claude, verificado por ejecución en este
// ciclo, no adoptado a ciegas): la atribución antepuesta también
// dispara tras una muletilla o cláusula inicial («Oye, ¿para mi
// empresa fue negociado el contrato?», «Quería saber si para mi
// empresa el contrato fue negociado?»). La guarda no depende del
// ancla sino de la cola de atribución cerrada y del resto del
// patrón (participio de concesión + objeto): «para empresas»,
// «para otra empresa», «para clientes nuevos» y «fue firmado»
// siguen en falso, verificado contra el corpus y la sonda. La
// asimetría que Claude señaló queda resuelta: las cuatro regex
// originales de la 1h nunca anclaron a la izquierda.
// (D) Limitación 7 — el grupo de artículo del objeto en las SEIS
// regex de la 1h admite también el indefinido («un/una/unos/
// unas»): «¿Para mi empresa fue negociado un contrato?», «¿Fue
// negociada una tarifa para mi empresa?», «¿Una tarifa para mi
// empresa fue negociada?», «¿Fue negociado para mi empresa un
// contrato?» disparan. DECISIÓN de este ciclo: CUBRIR (la
// condición del cierre pedía cubrir o excluir con argumento). La
// señal que discrimina la premisa nunca fue el artículo — en la
// familia B1 del PIR-1 R7 las formas con indefinido en la 1d ya
// disparaban y se juzgaron correctas — sino la atribución expresa
// obligatoria, que se mantiene intacta: sin ella («¿Fue negociado
// un contrato?», «¿Una tarifa fue negociada?») o con atribución
// pública («¿Fue negociada una tarifa para empresas?») las formas
// siguen yendo al modelo en las seis posiciones, verificado.
const V01_RE_FUE_PASIVA_ATRIB_PRE_FUE = new RegExp(`\\b(?:${V01_COLA_ATRIBUCION}) (?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")}) (?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_FUE_PASIVA_ATRIB_PRE_OBJ = new RegExp(`\\b(?:${V01_COLA_ATRIBUCION}) (?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H} (?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")})(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// Reglas 1i/1j (corrección R12, lista (e) A y B del cierre del
// PIR-1 R12 — familia FUNDANTE del NO-GO y condición obligada):
// en v12 los canales de concesión CON atribución obligatoria
// (1g y «contrato/pago») solo disparaban con la atribución AL
// FINAL del mensaje, tras el objeto. La misma premisa atribuida
// con la atribución ANTEPUESTA («¿Para mi empresa cerraron una
// tarifa?») o ENTRE el verbo y el objeto («¿Cerraron para mi
// empresa una tarifa?», «¿Se negoció para mi empresa el
// contrato?») atravesaba el filtro, ejecutado y verificado por
// triple concordancia en el PIR-1 R12. RECTIFICACIÓN (punto E
// de la lista): el §7.3 del paquete del PIR-1 R12 afirmaba que
// las formas 1g «con atribución, sí disparan», sin distinguir
// posición; era INEXACTO para v12 — solo disparaban con la
// atribución al final — y este comentario deja constancia de lo
// que el código hacía y de lo que hace desde esta corrección.
// Las regex nuevas cubren las dos posiciones con las mismas
// piezas de cada canal:
//  1i-activa: atribución + verbo, o verbo + atribución, +
//     objeto + fin de mensaje, con la unión de verbos de la 1e
//     y la 1g. La unión es coherencia de la misma clase,
//     demostrada en el diagnóstico previo de este ciclo: la
//     posición ENTRE también rompía la 1e y la 1f para los
//     sustantivos de cantidad («¿Negociaron para mi empresa una
//     tarifa?», «¿Se ofreció para mi empresa una tarifa?» no
//     disparaban en v12), mientras la ANTEPUESTA no las rompía
//     (sus regex no anclan al inicio y la atribución queda como
//     prefijo fuera del patrón: «¿Para mi empresa negociaron
//     una tarifa?» ya disparaba en v12 y queda como control).
//  1i-«se»: las mismas dos posiciones para la vía impersonal,
//     con la unión de los verbos con «se» de la 1f y la 1g (y
//     la forma «había/habían» + participio de la 1f).
//  1i-1d: la posición ENTRE en el canal del pronombre («¿Me
//     aceptaron para mi empresa una tarifa?»), con las mismas
//     piezas de la 1d (pronombres, verbos, sustantivos de
//     cantidad, participios) y la atribución en el hueco entre
//     el verbo y el objeto; la ANTEPUESTA no rompía la 1d (el
//     pronombre ancla el patrón en cualquier punto del mensaje
//     y la regex original lo cubre).
//  1j: «le/les» + verbo de concesión en pasado + objeto +
//     «a mi empresa / a nuestro grupo / a nosotros» + fin de
//     mensaje (punto B, condición obligada): la atribución
//     indirecta no estaba en la lista de atribuciones, que solo
//     admitía «para/de». Guardas de la 1j: el destinatario debe
//     ser el propio visitante con posesivo de 1.ª persona —
//     «a otra empresa», «a su empresa» y «a la empresa» NO
//     casan y siguen al modelo («a su empresa» es ambiguo entre
//     la empresa del visitante en trato de usted y la de un
//     tercero; ante la ambigüedad no se dispara, el mismo
//     criterio de la distinción escueta/atribuida de la 1g) —
//     y el objeto debe cerrar la frase (salvo la cola temporal),
//     como en la 1d. Las formas de la 1j con objeto de la lista
//     B («¿Le dieron un descuento a mi empresa?») ya disparaban
//     en v12 por la regla 1 («le dieron» está en A_FUERTE); la
//     regex nueva cubre los sustantivos de cantidad, que no
//     están en B.
// Guardas de la 1i (todas las posiciones): la atribución sigue
// siendo la cola CERRADA de siempre — terceros («para otra
// empresa») y público («para empresas», «para clientes
// nuevos») no casan en ninguna posición —; las formas ESCUETAS
// de la 1g siguen yendo al modelo (la distinción escueta/
// atribuida sigue en vigor: sin atribución ninguna regex nueva
// dispara por sí sola); y la frase de control que Claude probó
// contra su regla general («Me dijeron que visite la web;
// ¿cuál es el precio para mi empresa?») sigue en falso: tras
// la atribución estas regex exigen verbo de concesión +
// objeto, no una pregunta de precio.
const V01_OBJETOS_R12 = [...V01_OBJETOS_FUE, "descuento", "descuentos", "oferta", "ofertas", "beneficio", "beneficios"];
const V01_VERBOS_ACTIVA_R12 = [...V01_VERBOS_TERCERA_PLURAL_MONTO, ...V01_VERBOS_EXCLUIDOS_1E];
// CORRECCIÓN R16 (2026-11-20, lista (e) E2 del cierre del
// PIR-1 R15): la unión activa de la 1i se completa con el
// paradigma verbal completo pertinente, en las posiciones
// ejecutadas por el cierre. Entran: (a) los verbos que hoy solo
// entraban por los canales 1j/1d — la familia de CONTINUIDAD
// (mantener, renovar, extender, conservar, continuar) y
// «otorgar» y «validar» —, cuyas formas atravesaban la
// construcción en TODAS las posiciones (diagnóstico previo de
// esta corrección: 35/35 formas en falso contra v15, incluida
// la fundante D12 «Para mi empresa, según lo conversado,
// renovaron la tarifa», confirmada en vivo por la H6 R15); y
// (b) las formas de 3.ª SINGULAR de todo el paradigma (las de
// los verbos nuevos y las de los ya presentes: dio, dijo,
// ofrecio, prometio, confirmo, hizo, paso, cotizo, conto,
// negocio, aprobo, asigno, concedio, respeto, acordo, pacto,
// convinio, concerto, fijo, establecio, cerro, acepto, definio,
// autorizo, consensuo, ratifico, homologo), que atravesaban
// uniformemente la construcción en las posiciones antepuesta
// y en cola (diagnóstico previo, ronda 2: 54/54 en falso
// contra v15). Es el mismo paradigma de pares singular/plural
// que el canal hermano 1j lleva desde R12; la señal que
// discrimina la premisa sigue siendo la atribución expresa
// obligatoria de la construcción, no el número del verbo.
// Las formas homógrafas de sustantivo o de presente («paso»,
// «pacto», «negocio», «fijo») son las mismas que la 1j ya
// admite con atribución desde R12/R15, sin falso positivo
// registrado; la sonda de falsos positivos de esta corrección
// las vigila expresamente.
V01_VERBOS_ACTIVA_R12.push(
  "mantuvieron", "mantuvo", "renovaron", "renovo",
  "extendieron", "extendio", "conservaron", "conservo",
  "continuaron", "continuo",
  "otorgaron", "otorgo", "validaron", "valido",
  "dio", "dijo", "ofrecio", "prometio", "confirmo", "hizo",
  "paso", "cotizo", "conto", "negocio", "aprobo", "asigno",
  "concedio", "respeto", "acordo", "pacto", "convinio",
  "concerto", "fijo", "establecio", "cerro", "acepto",
  "definio", "autorizo", "consensuo", "ratifico", "homologo"
);
// CORRECCIÓN R17 (2026-11-20, (e) E5 del cierre del PIR-1 R16):
// espejo de los verbos vecinos en el paradigma de la activa de la
// 1i («Renovaron la tarifa para mi empresa» → «Prorrogaron la
// tarifa para mi empresa», «Sostuvieron el precio para mi
// empresa»).
V01_VERBOS_ACTIVA_R12.push(
  "prorrogaron", "prorrogo", "prolongaron", "prolongo",
  "sostuvieron", "sostuvo", "ampliaron", "amplio"
);
const V01_VERBOS_SE_R12 = [...V01_SE_CONCESION_FINITO, ...V01_VERBOS_EXCLUIDOS_1E_SE];
const V01_RE_ATRIB_PRE_ACTIVA = new RegExp(`\\b(?:${V01_COLA_ATRIBUCION}) (?:${V01_VERBOS_ACTIVA_R12.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_R12.join("|")})${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIB_ENTRE_ACTIVA = new RegExp(`\\b(?:${V01_VERBOS_ACTIVA_R12.join("|")}) (?:${V01_COLA_ATRIBUCION}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_R12.join("|")})${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIB_PRE_SE = new RegExp(`\\b(?:${V01_COLA_ATRIBUCION}) se (?:(?:${V01_VERBOS_SE_R12.join("|")})|(?:habia|habian) (?:${V01_SE_CONCESION_PARTICIPIO.join("|")})) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_R12.join("|")})${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIB_ENTRE_SE = new RegExp(`\\bse (?:(?:${V01_VERBOS_SE_R12.join("|")})|(?:habia|habian) (?:${V01_SE_CONCESION_PARTICIPIO.join("|")})) (?:${V01_COLA_ATRIBUCION}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_R12.join("|")})${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIB_ENTRE_1D = new RegExp(`\\b(?:me|te|nos|le|les) (?:${V01_VERBOS_CONCESION_MONTO.join("|")}) (?:${V01_COLA_ATRIBUCION}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_SENAL_MONTO.join("|")})${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_VERBOS_LE_R12 = ["dieron", "dio", "aprobaron", "aprobo", "cerraron", "cerro", "definieron", "definio", "autorizaron", "autorizo", "concedieron", "concedio", "negociaron", "negocio", "ofrecieron", "ofrecio", "prometieron", "prometio", "confirmaron", "confirmo", "cotizaron", "cotizo", "pasaron", "paso", "asignaron", "asigno", "respetaron", "respeto", "acordaron", "acordo", "pactaron", "pacto", "convinieron", "concertaron", "fijaron", "establecieron", "consensuaron", "consensuo", "ratificaron", "ratifico", "homologaron", "homologo"];
// CORRECCIÓN R19 (2026-11-20, (e) E1 del cierre del PIR-1 R18):
// espejo de «garantizar», «asegurar» y «reservar» en la 1j
// («le/les … a mi empresa»), singular y plural.
V01_VERBOS_LE_R12.push(
  "garantizaron", "garantizo", "aseguraron", "aseguro", "reservaron", "reservo"
);
// CORRECCIÓN R14 (2026-11-20): espejo de «otorgar» en la lista de la
// regla 1j («le/les … a mi empresa»). La forma fundante N21 del H6
// («¿Le otorgaron un descuento a mi empresa?») dispara en v14 por la
// regla 1, pero su misma construcción con «tarifa» o «precio» no
// disparaba, mientras el espejo con «conceder» («concedieron»,
// «concedio», presentes en esta lista desde R12) disparaba en v13.
// Se añaden solo las dos formas espejo de las de «conceder».
V01_VERBOS_LE_R12.push("otorgaron", "otorgo");
// CORRECCIÓN R15 (2026-11-20, lista (e) E5 y E7 del cierre del
// PIR-1 R14): la lista de la 1j crece con los verbos de
// CONTINUIDAD en pasado (extender, renovar, conservar, mantener,
// continuar: la sonda D11 «¿Le extendieron el contrato a mi
// empresa?», la D12 «¿Les renovaron el beneficio a mi empresa?»
// y la frase de la pata NO-GO «¿Les extendieron el beneficio a
// mi empresa?» atravesaban solo por el verbo) y con «validar»
// en sus pretéritos finitos («¿Le validaron una tarifa a mi
// empresa?», caso N22), en espejo de su entrada a la 1d y a la
// 1c en esta misma corrección. Las guardas de la 1j no cambian:
// «a otra empresa» y «a su empresa» siguen sin casar.
V01_VERBOS_LE_R12.push(
  "extendieron", "extendio", "renovaron", "renovo",
  "conservaron", "conservo", "mantuvieron", "mantuvo",
  "continuaron", "continuo", "validaron", "valido"
);
// CORRECCIÓN R17 (2026-11-20, (e) E5 del cierre del PIR-1 R16):
// espejo de los verbos vecinos en la 1j («¿Le prorrogaron una
// tarifa a mi empresa?»).
V01_VERBOS_LE_R12.push(
  "prorrogaron", "prorrogo", "prolongaron", "prolongo",
  "sostuvieron", "sostuvo", "ampliaron", "amplio"
);
const V01_RE_LE_A_ATRIBUIDO = new RegExp(`\\b(?:le|les) (?:${V01_VERBOS_LE_R12.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_R12.join("|")})${V01_PARTICIPIOS_1G} a (?:(?:mi|nuestro|nuestra)(?: (?:grupo|empresa|compania|negocio|equipo|organizacion|pyme))?|nosotros|nosotras)(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// CORRECCIÓN R16 (2026-11-20, lista (e) E2 del cierre del
// PIR-1 R15): dos posiciones de la construcción 1i que v15 no
// cubría para el paradigma completo:
//  (i) La atribución EN COLA sin anteposición en el canal
//      activo («¿Renovaron una tarifa para mi empresa?»): la
//      posición existía solo para los verbos excluidos de la
//      1e (V01_RE_ATRIBUIDO_EXCLUIDOS) y, vía la definición
//      contextual, para la lista de la 1e (V01_RE_TERCERA_
//      PLURAL_MONTO, con su lista de objetos sin «cotización»
//      ni «contrato»); los verbos que solo entraban por 1j/1d
//      y todas las formas singulares atravesaban. La regex
//      nueva cubre la posición con la unión completa de la
//      1i y los objetos de la 1i (V01_OBJETOS_R12), las mismas
//      piezas de las posiciones antepuesta y entre. La
//      cláusula inicial queda fuera del patrón y no lo rompe
//      («Según lo conversado, renovaron la tarifa para mi
//      empresa» dispara por esta vía, como ya disparaba con
//      los verbos de la unión anterior por sus canales).
//  (ii) La atribución antepuesta CON CLÁUSULA INTERCALADA
//      («Para mi empresa, según lo conversado, renovaron la
//      tarifa», la fundante D12 de la H6 R15, confirmada en
//      vivo): ninguna regex de la 1i admitía material entre
//      la atribución y el verbo, y la posición atravesaba
//      para TODO el paradigma (diagnóstico previo: también
//      con «cerraron», el ejemplo juzgado en R13). La regex
//      nueva admite solo las cláusulas de remisión a la
//      conversación previa de la lista cerrada
//      V01_CLAUSULA_INTERCALADA_R16 — remisiones que por sí
//      solas ya presuponen el contacto anterior — y exige
//      tras ella el verbo del paradigma, el objeto y el fin
//      de mensaje de siempre. La cláusula en la posición
//      ENTRE («¿Renovaron, según lo conversado, para mi
//      empresa una tarifa?») NO se cubre en este ciclo y
//      queda declarada como limitación residual de v16.
// Guardas de ambas: la atribución sigue siendo la cola
// cerrada de siempre (terceros y público no casan en
// ninguna posición) y las formas escuetas siguen al modelo.
const V01_CLAUSULA_INTERCALADA_R16 = "(?:segun lo (?:conversado|hablado|acordado|pactado|convenido|dicho)|segun lo que (?:hablamos|conversamos|acordamos|quedamos)|como (?:acordamos|quedamos|conversamos|hablamos))";
// AJUSTE DE LA SONDA FP DE ESTA CORRECCIÓN (R16): las formas de
// 3.ª singular de los verbos en -ar son HOMÓGRAFAS de la 1.ª
// persona del presente (negocio, confirmo, fijo, cotizo,
// autorizo, acepto, asigno, respeto, paso, pacto, consensuo,
// ratifico, homologo). En la posición EN COLA — verbo + objeto +
// atribución al final — esa ambigüedad de tiempo sí produce un
// falso positivo material demostrado por la sonda: la pregunta
// legítima «¿Cómo negocio una cotización para mi empresa?»
// (presente, «¿cómo…?») disparaba. La regex de cola se divide:
// la principal usa la unión completa EXCEPTO los homógrafos, y
// la de homógrafos solo se aplica en la cadena cuando el
// mensaje NO abre con «como » (la apertura canónica de la
// pregunta de modo en presente). En las posiciones antepuesta
// y entre, la atribución antepuesta o intercalada hace
// dominante la lectura de premisa y los homógrafos se
// conservan sin guarda, como en la 1j desde R12. Residuales
// declarados de este ajuste: (i) la premisa en pasado abierta
// con «¿cómo…?» y verbo homógrafo («¿Cómo negoció la tarifa
// para mi empresa?») atraviesa por la guarda; (ii) la pregunta
// de modo en presente con el «cómo» NO inicial (incrustado)
// puede seguir disparando por la regex de homógrafos.
const V01_HOMOGRAFOS_PRESENTE_R16 = ["negocio", "confirmo", "fijo", "cotizo", "autorizo", "acepto", "asigno", "respeto", "paso", "pacto", "consensuo", "ratifico", "homologo"];
const V01_VERBOS_COLA_SIN_HOMOGRAFOS_R16 = V01_VERBOS_ACTIVA_R12.filter((v) => !V01_HOMOGRAFOS_PRESENTE_R16.includes(v));
const V01_RE_ATRIB_COLA_ACTIVA = new RegExp(`\\b(?:${V01_VERBOS_COLA_SIN_HOMOGRAFOS_R16.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_R12.join("|")})${V01_PARTICIPIOS_1G} ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIB_COLA_HOMOGRAFOS_R16 = new RegExp(`\\b(?:${V01_HOMOGRAFOS_PRESENTE_R16.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_R12.join("|")})${V01_PARTICIPIOS_1G} ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_ATRIB_PRE_CLAUSULA_ACTIVA = new RegExp(`\\b(?:${V01_COLA_ATRIBUCION}) ${V01_CLAUSULA_INTERCALADA_R16} (?:${V01_VERBOS_ACTIVA_R12.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_R12.join("|")})${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// Regla 1k (corrección R15, lista (e) E3 del cierre del PIR-1
// R14): «quedar» + participio de concesión/acuerdo + ATRIBUCIÓN
// expresa, en las posiciones que la familia presenta: la
// atribución al final tras el objeto («¿Quedó otorgada la tarifa
// especial de mi empresa?», sonda D03 de la H6 R14), antepuesta
// («¿Para mi empresa quedó definida una cotización especial?»),
// tras el objeto y antes de «quedó» («¿La tarifa especial de mi
// empresa quedó aprobada?», frase de la pata NO-GO del PIR-1
// R14; «¿El descuento de mi empresa quedó renovado
// automáticamente?», sonda D04) y con pronombre («¿Me quedó
// renovada la tarifa?»). Hasta v14 las estructuras «quedar» +
// participio no tenían canal (limitación declarada 14) y el
// cierre las elevó a condición obligada con los ejemplos
// ejecutados de la pata votante y de la batería. Los participios
// son los de la 1h (con los de la familia nueva ya incluidos) y
// los objetos los de ese canal, con su sufijo. Guardas: sin
// atribución la forma sigue al modelo («¿Quedó aprobada la
// tarifa?»), los participios ajenos a la concesión no casan
// («¿Quedó claro el precio?», «¿quedó agendada la valoración?»,
// «¿quedó firmado el contrato?» — «firmado» sigue fuera, como
// en la 1h —) y la atribución es la cola cerrada de siempre
// («para empresas», «para clientes nuevos» no casan). Las
// posiciones con la atribución ANTES del participio (objeto y
// pronombre) cierran el acierto en el participio, sin ancla de
// fin de mensaje — como la regla 2d —: la premisa ya está
// completa y atribuida ahí, y un adjunto posterior («automá-
// ticamente», D04) no introduce un referente público nuevo.
// El presente de «quedar» («¿Queda aprobada mi tarifa?») NO
// entra: no afirma el hecho pasado, y queda declarado.
const V01_VERBOS_QUEDAR_R15 = "(?:quedo|quedaron|quedaste|ha quedado|han quedado)";
const V01_RE_QUEDAR_FINAL = new RegExp(`\\b${V01_VERBOS_QUEDAR_R15} (?:${V01_PARTICIPIOS_FUE.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H} ${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_QUEDAR_PRE = new RegExp(`\\b(?:${V01_COLA_ATRIBUCION}) ${V01_VERBOS_QUEDAR_R15} (?:${V01_PARTICIPIOS_FUE.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_QUEDAR_OBJ = new RegExp(`\\b(?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H} (?:${V01_COLA_ATRIBUCION}) ${V01_VERBOS_QUEDAR_R15} (?:${V01_PARTICIPIOS_FUE.join("|")})\\b`);
const V01_RE_QUEDAR_PRON = new RegExp(`\\b(?:me|nos) ${V01_VERBOS_QUEDAR_R15} (?:${V01_PARTICIPIOS_FUE.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H}\\b`);
// Regla 1l (corrección R15, lista (e) E6 del cierre del PIR-1
// R14): «se firmó» + «contrato» SOLO con atribución expresa, en
// las posiciones final («¿Se firmó el contrato para mi
// empresa?», frase de la pata NO-GO), antepuesta («¿Para mi
// empresa se firmó el contrato…?», caso N27) y entre el verbo y
// el objeto («¿Se firmó para mi empresa el contrato?»), con la
// forma «había/habían firmado» en la posición final. Es la
// variante atribuida de la limitación 19, elevada por el cierre
// R14: «firmar» sigue FUERA de las listas del canal «se» (la
// forma general «¿Se firmó el contrato?» conserva la decisión
// documentada de R12 y sigue al modelo, igual que «¿Se firmó
// el contrato de soporte?» y la atribución pública «para
// empresas»). La atribución de este canal admite además «con
// mi/nuestro…» (sonda D13 de la H6 R14: «¿Se firmó el contrato
// con mi empresa en marzo?») — solo en este canal, sin tocar la
// cola compartida —. El objeto es solo «contrato(s)»: «se firmó
// el acuerdo/convenio» con atribución queda declarado como
// residual de v15. Los aciertos cierran en el objeto o en la
// atribución, sin ancla de fin de mensaje, porque la premisa
// queda completa y atribuida en ese punto (un adjunto temporal
// posterior, «en marzo» en D13, no cambia el referente).
const V01_ATRIB_FIRMAR_R15 = "(?:(?:para|de|con) (?:mi|nuestro|nuestra)(?: (?:grupo|empresa|compania|negocio|equipo|organizacion|pyme))?|para (?:nosotros|nosotras))";
const V01_RE_FIRMAR_SE_FINAL = new RegExp(`\\bse (?:(?:firmo|firmaron)|(?:habia|habian) firmado) (?:(?:el|la|los|las|un|una|unos|unas) )?contratos? ${V01_ATRIB_FIRMAR_R15}\\b`);
const V01_RE_FIRMAR_SE_PRE = new RegExp(`\\b${V01_ATRIB_FIRMAR_R15} se (?:(?:firmo|firmaron)|(?:habia|habian) firmado) (?:(?:el|la|los|las|un|una|unos|unas) )?contratos?\\b`);
const V01_RE_FIRMAR_SE_ENTRE = new RegExp(`\\bse (?:(?:firmo|firmaron)|(?:habia|habian) firmado) ${V01_ATRIB_FIRMAR_R15} (?:(?:el|la|los|las|un|una|unos|unas) )?contratos?\\b`);

// 1m) CORRECCIÓN R16 (2026-11-20, lista (e) E1 del cierre del
// PIR-1 R15): la familia fundante del NO-GO de GPT en R15 —
// CONTINUIDAD IMPERSONAL con «se», OBJETO ANTEPUESTO y
// atribución expresa posterior: «¿El precio especial se
// mantuvo para mi empresa?», «¿El descuento se mantuvo para
// mi empresa?», «¿El precio especial se mantuvo para nuestro
// grupo?» (las tres verbatim de la pata, verificadas por Pax
// 3/3 contra v15, más las variantes que el cierre ejecutó).
// El hueco de v15: el canal hermano 1f cubre el mismo
// paradigma solo con el orden verbo-primero («¿Se mantuvo el
// precio especial para mi empresa?» SÍ disparaba, ejecutado
// por el cierre contra su expectativa) y ningún canal admitía
// el objeto comercial delante de «se». La regex exige la
// secuencia completa: artículo definido + objeto de la lista
// de la 1f (la misma disciplina de objetos del canal hermano;
// «contrato» y «pago» quedan fuera, como en la 1f) + sufijo
// de la 1g + «se» + verbo de continuidad en pasado (pretérito
// singular o plural de mantener, renovar, extender, conservar
// y continuar, o pluscuamperfecto «había/habían» +
// participio, en espejo de la 1f) + el adjunto «vigente»
// opcional (la colocación natural de la premisa: «se mantuvo
// vigente») + atribución posterior OBLIGATORIA + cierre
// temporal opcional + fin de mensaje.
// GUARDAS (ejecutadas por el cierre y en el corpus de esta
// corrección): sin atribución la forma NO dispara — la
// variante escueta es la familia F065, que conserva su
// estatuto por decisión expresa del cierre R15 (no entra en
// la (e)) —; la pregunta pública («¿El precio especial se
// mantuvo para clientes nuevos?») no casa con la cola; y el
// destino a tercero («…para otra empresa») tampoco dispara:
// resolución por el criterio D-1 vigente — la excepción de
// la regla 1 rige donde una señal independiente de pronombre
// porta la premisa; en esta construcción la única señal es
// el propio destino, así que manda la guarda de terceros de
// los canales de atribución hermanos (1f/1g/1h/1i), con la
// justificación escrita en el corpus de la corrección.
const V01_VERBOS_CONTINUIDAD_SE_R16 = ["mantuvo", "mantuvieron", "renovo", "renovaron", "extendio", "extendieron", "conservo", "conservaron", "continuo", "continuaron"];
const V01_PARTICIPIOS_CONTINUIDAD_R16 = ["mantenido", "renovado", "extendido", "conservado", "continuado"];
const V01_RE_SE_OBJETO_ANTEPUESTO = new RegExp(`\\b(?:el|la|los|las) (?:precio|precios|tarifa|tarifas|condicion|condiciones|descuento|descuentos|oferta|ofertas|beneficio|beneficios|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes)${V01_PARTICIPIOS_1G} se (?:(?:${V01_VERBOS_CONTINUIDAD_SE_R16.join("|")})|(?:habia|habian) (?:${V01_PARTICIPIOS_CONTINUIDAD_R16.join("|")})) (?:vigente )?${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// CORRECCIÓN R18 (2026-11-20, lista (e) E1 del cierre del PIR-1
// R17): la posición INTERCALADA de la atribución en la 1m —
// objeto + atribución + «se» + continuidad finita —, el primer
// fundamento del NO-GO de R17 (hallazgo 1 de GPT, delimitado por
// el cierre también en la forma finita: «¿El precio especial
// para mi empresa se mantuvo?»). Espejo de la posición que la 1h
// cubre desde R10 («¿El contrato para mi empresa fue
// negociado?»). Las guardas son las de la 1m: la escueta sin
// atribución sigue libre y el destino a tercero intercalado
// («…para otra empresa se mantuvo») tampoco dispara (D-1).
const V01_RE_SE_OBJETO_INTERCALADA_R18 = new RegExp(`\\b(?:el|la|los|las) (?:precio|precios|tarifa|tarifas|condicion|condiciones|descuento|descuentos|oferta|ofertas|beneficio|beneficios|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes)${V01_PARTICIPIOS_1G} ${V01_COLA_ATRIBUCION} se (?:(?:${V01_VERBOS_CONTINUIDAD_SE_R16.join("|")})|(?:habia|habian) (?:${V01_PARTICIPIOS_CONTINUIDAD_R16.join("|")}))(?: vigente)?(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);

// CORRECCIÓN R17 (2026-11-20, lista (e) E1, E5 y E9 del cierre del
// PIR-1 R16; el punto D de E9 redecidido por Jaime el 2026-11-20
// 18:16 a favor de cubrir las formas sin atribución).
//
// Regla 1n (E1): la PERÍFRASIS de continuidad en PASADO con «se» y
// atribución — «seguir/continuar + gerundio» — en sus dos órdenes.
// Es el caso N08 de la H6 R16 («¿El precio especial se siguió
// manteniendo para mi empresa?»), que el modelo confirmó en vivo
// FUERA de las limitaciones declaradas y fundó el NO-GO del cierre
// R16: la exclusión de «seguir» constaba en el expediente de la
// corrección R14 pero nunca se inscribió como limitación declarada,
// y el cierre resolvió que la lectura por construcción extiende una
// declaración INSCRITA, no crea declaraciones desde notas de
// implementación. El espacio delimitado por el cierre: pretérito,
// imperfecto, perfecto y pluscuamperfecto, orden verbo-primero,
// clítico («siguió manteniéndose») y «continuar + gerundio». El
// PRESENTE no entra: ya dispara por otro canal (la 1d/1f con
// «sigue manteniendo» — verificado en el diagnóstico previo de esta
// corrección) y no se duplica. GUARDAS, las de la 1m: la atribución
// es OBLIGATORIA (la forma escueta «¿El precio especial se siguió
// manteniendo?» sigue al modelo) y el destino a terceros no dispara
// («¿Se siguió manteniendo el descuento para clientes nuevos?»
// sigue al modelo), por la misma decisión D-1 del ciclo R16.
const V01_AUX_PERIFRASIS_PASADO_R17 = "(?:siguio|siguieron|seguia|seguian|ha seguido|han seguido|habia seguido|habian seguido|continuo|continuaron|continuaba|continuaban|ha continuado|han continuado|habia continuado|habian continuado)";
const V01_GERUNDIOS_CONTINUIDAD_R17 = "(?:manteniendo|renovando|extendiendo|conservando|continuando)";
const V01_OBJETOS_1F_R17 = "precio|precios|tarifa|tarifas|condicion|condiciones|descuento|descuentos|oferta|ofertas|beneficio|beneficios|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes";
// (a) Objeto antepuesto: «el precio especial se siguió manteniendo
// para mi empresa». Sin «se» ante el auxiliar, el gerundio debe
// llevarlo pegado («el precio siguió manteniéndose…»).
const V01_RE_PERIFRASIS_OBJETO_R17 = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_1F_R17})${V01_PARTICIPIOS_1G} (?:se ${V01_AUX_PERIFRASIS_PASADO_R17} ${V01_GERUNDIOS_CONTINUIDAD_R17}(?:se)?|${V01_AUX_PERIFRASIS_PASADO_R17} ${V01_GERUNDIOS_CONTINUIDAD_R17}se) (?:vigente )?${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// (b) Orden verbo-primero, espejo de la 1f: «se siguió manteniendo
// el precio especial para mi empresa».
const V01_RE_PERIFRASIS_VERBO_R17 = new RegExp(`\\b(?:se ${V01_AUX_PERIFRASIS_PASADO_R17} ${V01_GERUNDIOS_CONTINUIDAD_R17}(?:se)?|${V01_AUX_PERIFRASIS_PASADO_R17} ${V01_GERUNDIOS_CONTINUIDAD_R17}se) (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_1F_R17})${V01_PARTICIPIOS_1G} (?:vigente )?${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// CORRECCIÓN R18 (2026-11-20, lista (e) E1 del cierre del PIR-1
// R17): la posición INTERCALADA de la atribución en la 1n, en sus
// dos órdenes — objeto + atribución + «se» + perífrasis («¿El
// precio especial para mi empresa se siguió manteniendo?», la
// verbatim del hallazgo 1 de GPT) y perífrasis + atribución +
// objeto («¿Se siguió manteniendo para mi empresa el precio
// especial?», delimitada por ejecución en esta corrección: en
// v17 también atravesaba; el orden verbo-primero de la 1f sí
// cubre su posición entre desde antes). Guardas, las de la 1n:
// la escueta sin atribución sigue libre (R17-7, que conserva su
// estatuto con la regla futura del cierre R17) y el destino a
// tercero intercalado no dispara (D-1).
const V01_RE_PERIFRASIS_INTERCALADA_R18 = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_1F_R17})${V01_PARTICIPIOS_1G} ${V01_COLA_ATRIBUCION} (?:se ${V01_AUX_PERIFRASIS_PASADO_R17} ${V01_GERUNDIOS_CONTINUIDAD_R17}(?:se)?|${V01_AUX_PERIFRASIS_PASADO_R17} ${V01_GERUNDIOS_CONTINUIDAD_R17}se)(?: vigente)?(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_PERIFRASIS_VERBO_INTERCALADA_R18 = new RegExp(`\\b(?:se ${V01_AUX_PERIFRASIS_PASADO_R17} ${V01_GERUNDIOS_CONTINUIDAD_R17}(?:se)?|${V01_AUX_PERIFRASIS_PASADO_R17} ${V01_GERUNDIOS_CONTINUIDAD_R17}se) ${V01_COLA_ATRIBUCION} (?:(?:el|la|los|las|un|una|unos|unas) )?(?:${V01_OBJETOS_1F_R17})${V01_PARTICIPIOS_1G}(?: vigente)?(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
//
// Regla 1m vecina (E5): el objeto antepuesto con «se» y los verbos
// VECINOS finitos o compuestos, espejo exacto de la 1m: «¿La tarifa
// se prorrogó para mi empresa?», «¿El descuento se había sostenido
// para mi empresa?». La atribución es obligatoria, como en la 1m.
const V01_RE_SE_OBJETO_ANTEPUESTO_VECINOS_R17 = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_1F_R17})${V01_PARTICIPIOS_1G} se (?:prorrogo|prorrogaron|prolongo|prolongaron|sostuvo|sostuvieron|amplio|ampliaron|(?:habia|habian) (?:prorrogado|prolongado|sostenido|ampliado)) (?:vigente )?${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// CORRECCIÓN R18 (2026-11-20, lista (e) E1): la posición
// intercalada también en la 1m vecina — es el espejo exacto de
// la 1m y la compleción de E1 lo alcanza («¿La tarifa para mi
// empresa se prorrogó?» atravesaba en v17, delimitado por
// ejecución en esta corrección). Se declara aquí como compleción
// del espejo, no como elemento separado de la (e).
const V01_RE_SE_OBJETO_INTERCALADA_VECINOS_R18 = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_1F_R17})${V01_PARTICIPIOS_1G} ${V01_COLA_ATRIBUCION} se (?:prorrogo|prorrogaron|prolongo|prolongaron|sostuvo|sostuvieron|amplio|ampliaron|(?:habia|habian) (?:prorrogado|prolongado|sostenido|ampliado))(?: vigente)?(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
//
// Regla 1o (E9, punto D redecidido por Jaime el 2026-11-20 18:16):
// el polo ESCUETO de la familia F065 — objeto + participio de
// acuerdo + continuidad/vigencia SIN atribución ni pronombre —
// dispara. Son las formas nominalizadas que la H6 confirmó en vivo
// cinco veces en R16 (F065 «¿La tarifa negociada sigue vigente?»,
// S084, S240, G06 y la forma multi de G10) y que la limitación 3 /
// punto D dejaba fuera desde v6; Jaime redecidió el punto D a favor
// de cubrirlas y esta regla ejecuta esa decisión. El participio de
// acuerdo es el marcador que separa la premisa de la pregunta
// pública: las guardas verificadas quedan libres («¿Sigue vigente
// la promoción de lanzamiento?», «¿El precio de lanzamiento sigue
// vigente?», «¿Siguen vigentes los precios publicados?», «¿La
// cotización sigue vigente?» — ninguna lleva participio de
// acuerdo). «preferencial» NO entra como marcador (las tarifas
// preferenciales por segmento son precios publicados plausibles):
// queda inscrito como residuo con su ejemplo en el informe. El
// objeto escueto SIN ningún marcador («¿El precio se mantuvo?»,
// «¿La tarifa se mantuvo?») tampoco entra: es indistinguible de la
// pregunta pública verificada «¿Se mantuvo el precio de
// lanzamiento?» y queda inscrito como residuo. S240 («¿El precio
// especial se mantuvo?») entra por el patrón (c): «especial» es el
// marcador que la regla 2 ya trata como señal de condición no
// pública. El patrón (c) va ANCLADO a fin de mensaje (con la cola
// temporal escueta opcional): la forma con atribución es de la 1m,
// la forma con destino a tercero («para otra empresa», «para
// clientes nuevos») conserva el criterio D-1 de no disparar, y el
// residual R16-4 (un «gracias» final) y el de la cola temporal
// intercalada conservan su estatuto — ninguno se cuela por la
// subcadena.
// CORRECCIÓN R18 (2026-11-20, lista (e) E3, E4, E6 y E7 del
// cierre del PIR-1 R17):
// E4 — la lista de objetos de la 1o se extiende al conjunto
// comercial delimitado por el cierre: los 13 objetos ejecutados
// fuera de la lista de v17 en la construcción exacta (cuota,
// mensualidad, abono, anticipo, monto, valor, costo, importe,
// contrato, acuerdo, convenio, compromiso, plan, con sus
// plurales). Se elige la LISTA extendida y no una construcción
// genérica: el coste de la vía genérica quedó ejecutado por el
// cierre (un patrón de sustantivo genérico capturaría «¿La
// fecha acordada se mantiene?»); con la lista, los objetos no
// comerciales quedan fuera por construcción.
// E3 — los patrones (a) y (b) reciben la exclusión de destinos
// que el patrón (c) ya aplicaba por su ancla: el destino a
// tercero («para otra empresa») y el segmento público («para
// clientes nuevos», «para empresas») NO disparan, por paridad
// con (c) y por el criterio D-1. En (a) la exclusión es una
// mirada negativa tras el predicado de continuidad que incluye
// los adjuntos opcionales del propio predicado, para que el
// retroceso de la regex no la eluda acortando el predicado; en
// (b) va tras el participio.
// E6/E7 — el patrón (c) se generaliza a la construcción de
// MARCADOR: «especial» y «preferencial» (R17-6 elevada por el
// cierre: D45 y D46 confirmaron en vivo) con el paradigma
// finito de continuidad COMPLETO de la 1m (R17-5 elevada en su
// construcción confirmada: D44 «se renovó», y «se extendió»,
// «se conservó» y «¿El descuento especial se renovó?»,
// ejecutados por el cierre), en dos patrones anclados: con «se»
// + verbo finito o pluscuamperfecto, y con «sigue/siguen» +
// vigencia predicada. El ancla conserva las guardas del (c): el
// destino a tercero y el segmento público la rompen y quedan
// libres, y las gemelas públicas sin marcador («¿Se renovó el
// precio de lanzamiento?») no casan.
const V01_OBJETOS_ESCUETA_R18 = ["precio", "precios", "tarifa", "tarifas", "condicion", "condiciones", "descuento", "descuentos", "beneficio", "beneficios", "oferta", "ofertas", "costo", "costos", "monto", "montos", "valor", "valores", "cuota", "cuotas", "importe", "importes", "mensualidad", "mensualidades", "abono", "abonos", "anticipo", "anticipos", "contrato", "contratos", "acuerdo", "acuerdos", "convenio", "convenios", "compromiso", "compromisos", "plan", "planes"];
// CORRECCIÓN R19 (2026-11-20, (e) E1 del cierre del PIR-1 R18):
// el conjunto de participios de acuerdo crece con «prometido» y
// con los tres verbos del fundamento («garantizado»,
// «asegurado», «reservado»): sus formas finitas ya vivían en los
// canales verbales, pero el participio faltaba aquí, así que
// «¿El precio garantizado sigue vigente?» atravesaba la 1o. Este
// mismo conjunto alimenta la construcción genérica de la 1o
// (vía (α) de E3, bloque R19). Compleción ejecutada de la misma
// clase: «otorgado» (el participio de «otorgar» vivía en la 1h
// pero no aquí). «Comprometido» NO entra, exclusión deliberada
// inscrita: su lectura dominante es «puesto en riesgo», no
// «comprometido» como acuerdo (ver el bloque R19).
const V01_PARTICIPIOS_ACUERDO_R17 = "(?:negociado|negociada|negociados|negociadas|concedido|concedida|concedidos|concedidas|acordado|acordada|acordados|acordadas|pactado|pactada|pactados|pactadas|convenido|convenida|convenidos|convenidas|prometido|prometida|prometidos|prometidas|garantizado|garantizada|garantizados|garantizadas|asegurado|asegurada|asegurados|aseguradas|reservado|reservada|reservados|reservadas|otorgado|otorgada|otorgados|otorgadas)";
const V01_CONTINUIDAD_ESCUETA_R17 = "(?:sigue|siguen|siga|sigan|se mantiene|se mantienen|se mantuvo|se mantuvieron|continua|continuen|continuen|permanece|permanecen)(?: (?:vigente|vigentes|en pie|igual|activo|activa|activos|activas))?(?: (?:este mes|este ano|por ahora))?";
const V01_DESTINO_EXCLUIDO_1O_R18 = "(?:para (?:otra|otras|otro|otros) (?:empresa|empresas|compania|companias|organizacion|organizaciones|grupo|grupos|persona|personas|negocio|negocios|pyme|pymes|cliente|clientes|sociedad|sociedades|institucion|instituciones)|para terceros|para (?:clientes|empresas|grupos|companias|negocios|pymes|personas|usuarios|visitantes|emprendedores|independientes|estudiantes|particulares|socios|afiliados|miembros)|para (?:nuevos|nuevas) (?:clientes|empresas|usuarios)|para (?:el|al) publico|para todo el publico)";
const V01_RE_ESCUETA_PARTICIPIO_R17 = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_ESCUETA_R18.join("|")}) ${V01_PARTICIPIOS_ACUERDO_R17} (?:tambien )?${V01_CONTINUIDAD_ESCUETA_R17}(?![a-z])(?!(?: (?:vigente|vigentes|en pie|igual|activo|activa|activos|activas))?(?: (?:este mes|este ano|por ahora))? ${V01_DESTINO_EXCLUIDO_1O_R18}\\b)`);
const V01_RE_ESCUETA_INVERTIDA_R17 = new RegExp(`\\b(?:(?:sigue|siguen|siga|sigan|continua|continuen|continuen|permanece|permanecen) (?:vigente|vigentes)|se (?:mantiene|mantienen|mantuvo|mantuvieron)) (?:el|la|los|las) (?:${V01_OBJETOS_ESCUETA_R18.join("|")}) ${V01_PARTICIPIOS_ACUERDO_R17}(?![a-z])(?!(?: (?:este mes|este ano|por ahora))? ${V01_DESTINO_EXCLUIDO_1O_R18}\\b)`);
// CORRECCIÓN R20 (2026-11-21, (e) E5 del cierre del PIR-1 R19):
// la invertida de arriba y la genérica B de abajo reciben
// «continúa vigente» y «permanece vigente»: la delimitación de
// R19-7 ejecutó que la invertida solo casaba con «sigue» y «se
// mantiene» — «¿Continúa vigente el préstamo acordado?» (N12 de
// la H6 R19) atravesaba para TODO objeto, no por el objeto
// sino por el verbo de continuidad —. La directa ya admitía
// «continúa» desde R17; «permanece» entra en ambos órdenes como
// el presente de la familia de R17-2 dentro del polo
// nominalizado (el participio porta la premisa: sin participio
// no hay disparo, ejecutado en el corpus).
const V01_FINITOS_MARCADOR_R18 = "(?:mantuvo|mantuvieron|mantiene|mantienen|renovo|renovaron|extendio|extendieron|conservo|conservaron|continuo|continuaron)";
const V01_PARTICIPIOS_MARCADOR_R18 = "(?:mantenido|renovado|extendido|conservado|continuado)";
const V01_COLA_MARCADOR_R18 = "(?: (?:este mes|este ano|el mes pasado|el ano pasado|la semana pasada|por ahora))?\\s*(?:por favor)?\\s*$";
const V01_RE_ESCUETA_MARCADOR_R18 = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_ESCUETA_R18.join("|")}) (?:especial|especiales|preferencial|preferenciales) se (?:${V01_FINITOS_MARCADOR_R18}|(?:habia|habian) ${V01_PARTICIPIOS_MARCADOR_R18})(?: (?:vigente|vigentes))?${V01_COLA_MARCADOR_R18}`);
const V01_RE_ESCUETA_MARCADOR_SIGUE_R18 = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_ESCUETA_R18.join("|")}) (?:especial|especiales|preferencial|preferenciales) (?:sigue|siguen|siga|sigan)(?: (?:vigente|vigentes|en pie|igual))?${V01_COLA_MARCADOR_R18}`);
//
// E4 (R16-5 elevada, en los términos literales de la (e) de GPT en
// R16): la guarda de homógrafos deja de ser posicional («no empieza
// por «como»») y pasa a ser de PROXIMIDAD + TILDE. Cuando el verbo
// homógrafo de la cola tiene un «como» INMEDIATAMENTE antes (al
// inicio o incrustado: «…decir como negocio…», «…saber como
// confirmo…»), la frase es una pregunta de MODO en presente y no
// dispara — salvo que el texto CRUDO lleve la tilde del pretérito
// en el verbo («¿Cómo negoció la tarifa para mi empresa?»), que es
// la marca escrita del pasado y sí dispara. Fuera de ese contexto
// (sin «como» pegado), la cola se comporta como en v16. El residuo
// — premisa en pasado con «cómo» y verbo homógrafo SIN tilde —
// queda inscrito como limitación declarada en el informe: sin la
// tilde, la forma escrita es idéntica a la pregunta de modo
// legítima que esta misma (e) manda dejar pasar.
const V01_HOMOGRAFOS_TILDE_R17 = { negocio: "negoció", confirmo: "confirmó", fijo: "fijó", cotizo: "cotizó", autorizo: "autorizó", acepto: "aceptó", asigno: "asignó", respeto: "respetó", paso: "pasó", pacto: "pactó", consensuo: "consensuó", ratifico: "ratificó", homologo: "homologó" };
function v01ColaHomografosR17(n, crudoMin) {
  const m = V01_RE_ATRIB_COLA_HOMOGRAFOS_R16.exec(n);
  if (!m) return false;
  const antes = n.slice(0, m.index).replace(/\s+$/, "");
  if (antes === "como" || antes.endsWith(" como")) {
    const verbo = m[0].split(" ")[0];
    const conTilde = V01_HOMOGRAFOS_TILDE_R17[verbo];
    if (!conTilde) return true;
    return new RegExp("c[óo]mo\\s+" + conTilde + "(?![a-záéíóúüñ])").test(crudoMin || "");
  }
  return true;
}
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
// Regla 2d (corrección R8, lista (e) D del cierre R8): objeto DEFINIDO
// + participio de acuerdo (acordado/pactado/convenido) + continuidad
// predicada DEL PROPIO OBJETO. En v8 las combinaciones con estos
// participios disparaban por las reglas 1 y 2 (el participio estaba
// en A_FUERTE y la combinación en B_FUERTE), y eso cubría a la vez
// dos clases opuestas: la premisa personal («¿El precio acordado
// sigue vigente?», cat. 13 del corpus) y la pregunta pública de
// existencia («¿Ofrecen precios pactados?», «¿Siguen ofreciendo
// tarifas acordadas?»). La corrección R8 separa las clases como hizo
// la R5 con negociado/concedido/preferencial: los participios salen
// de A_FUERTE y las combinaciones salen de B_FUERTE, y la premisa
// personal queda cubierta por esta regla, que exige la forma que la
// premisa realmente tiene: un objeto concreto ya nombrado (artículo
// definido) cuya vigencia se predica («el precio acordado SIGUE
// vigente», «SE MANTIENE el precio pactado», «¿SIGUE VIGENTE el
// precio acordado?»). La pregunta pública no tiene esa forma: su
// verbo es de oferta/existencia en presente («ofrecen», «tienen»,
// «siguen OFRECIENDO») y su objeto es genérico, sin artículo definido
// singular que lo ate a un acuerdo previo. Las demás vías de la
// premisa con estos participios no dependen de esta regla: con
// marcador fuerte dispara la regla 1 (la combinación sigue en B),
// con «confirmar» las reglas 6/7a, con atribución las reglas 2b/2c
// (la lista dedicada ya incluye estas combinaciones).
const V01_OBJETOS_2D = ["precio", "precios", "tarifa", "tarifas", "condicion", "condiciones", "descuento", "descuentos", "promocion", "promociones", "oferta", "ofertas", "beneficio", "beneficios", "pago", "pagos"];
const V01_PARTICIPIOS_2D = ["acordado", "acordada", "acordados", "acordadas", "pactado", "pactada", "pactados", "pactadas", "convenido", "convenida", "convenidos", "convenidas"];
const V01_CONTINUIDAD_2D = "(?:se (?:mantiene|mantienen)|sigue|siga|siguen|sigan|mantiene|mantienen|continua|continue|continuan|continuen)";
const V01_RE_OBJETO_PARTICIPIO_CONTINUIDAD = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_2D.join("|")}) (?:${V01_PARTICIPIOS_2D.join("|")}) ${V01_CONTINUIDAD_2D}(?: (?:vigente|en pie|igual|activo|activa))?(?![a-z])(?! (?:(?:vigente|en pie|igual|activo|activa) )?${V01_DESTINO_EXCLUIDO_1O_R18}\\b)`);
const V01_RE_CONTINUIDAD_OBJETO_PARTICIPIO = new RegExp(`\\b${V01_CONTINUIDAD_2D} (?:el|la|los|las) (?:${V01_OBJETOS_2D.join("|")}) (?:${V01_PARTICIPIOS_2D.join("|")})(?![a-z])(?! ${V01_DESTINO_EXCLUIDO_1O_R18}\\b)`);
const V01_RE_SIGUE_VIGENTE_OBJETO_PARTICIPIO = new RegExp(`\\b(?:sigue|siga|siguen|sigan) vigente (?:el|la|los|las) (?:${V01_OBJETOS_2D.join("|")}) (?:${V01_PARTICIPIOS_2D.join("|")})(?![a-z])(?! ${V01_DESTINO_EXCLUIDO_1O_R18}\\b)`);
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
//      (R15, lista (e) E7: + «validar» en pasado atribuido)
//  1d. Concesión en primera persona + sustantivo de cantidad + fin de
//      mensaje («¿Me dieron el precio?»; generalización R4 de «me/nos
//      respetaron el precio»: dar, ofrecer, prometer, aprobar, asignar,
//      conceder, negociar, confirmar, pasar, cotizar, contar, decir,
//      hacer, respetar; con y sin auxiliar; cola temporal opcional;
//      R5: + destinatario «te» y plurales de cantidad; R6: + cola de
//      atribución tras el objeto («para mi empresa»); R15, lista
//      (e) E4/E7: + verbos de continuidad en pasado (mantener,
//      renovar, extender, conservar, continuar), «validar» finito
//      y la errata «mantubieron», + cola de duración («un mes
//      más») entre el objeto y las colas)
//  1e. Concesión en 3.ª plural SIN pronombre + sustantivo de cantidad +
//      fin de mensaje («¿Negociaron la tarifa?»; corrección R5, lista
//      (e) E: definición adoptada — propuesta de Ultra; REVISADA en R6,
//      lista (e) C: premisa por defecto contextual — sin ningún otro
//      referente en el mensaje —; la cola temporal solo se admite tras
//      cola de atribución; «¿Negociaron la tarifa ayer?» NO dispara:
//      evento pasado sin atribución; R7, lista (e) A: + verbos de
//      acuerdo/pacto y de fijación del monto — acordaron, pactaron,
//      convinieron, concertaron, fijaron, establecieron)
//  1f. Impersonal con «se» + verbo de concesión en pasado + sustantivo
//      de cantidad + fin de mensaje («¿Se concedió una tarifa?»; R6,
//      lista (e) A; «se ofrece»/«se publicó» NO casan)
//  1g. Concesión/acuerdo en pasado + objeto + ATRIBUCIÓN EXPRESA
//      obligatoria + fin de mensaje (R8, lista (e) A/B/C: los verbos
//      excluidos de la 1e — cerraron, aceptaron, definieron — y la
//      familia de Ultra — autorizaron, consensuaron, ratificaron,
//      homologaron — SOLO con atribución, en forma finita o impersonal
//      con «se»; y «contrato»/«pago» como objeto con verbo de concesión
//      (vía «se» o 3.ª plural de la 1e) SOLO con atribución; las formas
//      escuetas de ambas familias siguen yendo al modelo)
//  1d'. Extensión del canal «me» (R9, lista (e) A: la lista de verbos
//      de la 1d crece con los de las familias 1e-R7 y 1g — acordaron,
//      pactaron, convinieron, concertaron, fijaron, establecieron,
//      cerraron, aceptaron, definieron, autorizaron, consensuaron,
//      ratificaron, homologaron, con singulares y compuestos con
//      «han» — y el grupo de artículo se unifica con el de la
//      1e/1f/1g; los 20 verbos de la 1e ya disparaban con «me» por la
//      propia 1e, solo los 7 de la 1g atravesaban el canal; R10,
//      lista (e) B: el patrón compuesto se completa con el
//      pluscuamperfecto «habían/habías/había» + participio para las
//      27 familias verbales — limitación 7 de v10, condición
//      obligada del cierre R10)
//  1h. Pasiva con «fue/fueron» + participio de concesión/acuerdo +
//      objeto + ATRIBUCIÓN EXPRESA obligatoria + fin de mensaje
//      («¿El contrato fue negociado para mi empresa?»; R9, lista
//      (e) B; sin atribución sigue al modelo; R10, lista (e) A:
//      la atribución también entre el participio y el objeto y
//      antes de «fue» — «¿Fue negociado para mi empresa el
//      contrato?», «¿El contrato para mi empresa fue negociado?»;
//      R12, lista (e) C y D: las dos regex antepuestas anclan con
//      «\b» en vez de «^» — la atribución tras muletilla inicial
//      también dispara — y las seis regex admiten el artículo
//      indefinido en el objeto; R15, lista (e) E2: + participios
//      de los verbos nuevos (otorgado, extendido, renovado,
//      mantenido, continuado, conservado), + «cotización» como
//      objeto y + el sufijo de participio/«especial»/«reducido»
//      tras el objeto en las seis posiciones)
//  1i. Atribución ANTEPUESTA o ENTRE el verbo y el objeto en los
//      canales de concesión atribuida (1g, «contrato/pago», 1e,
//      «se», 1d-entre) («¿Para mi empresa cerraron una tarifa?»,
//      «¿Cerraron para mi empresa una tarifa?», «¿Se negoció
//      para mi empresa el contrato?»; R12, lista (e) A: en v12
//      esos canales solo disparaban con la atribución al final;
//      las formas escuetas siguen yendo al modelo; R16, lista
//      (e) E2 del cierre R15: la construcción se completa con
//      el paradigma verbal completo pertinente — los verbos
//      que solo entraban por 1j/1d (continuidad, «otorgar»,
//      «validar») y las formas de 3.ª singular — en las
//      posiciones antepuesta y entre, + la atribución EN COLA
//      sin anteposición para todo el paradigma y + la
//      atribución antepuesta con cláusula intercalada de
//      remisión a la conversación previa («Para mi empresa,
//      según lo conversado, renovaron la tarifa», D12 de la
//      H6 R15); la cláusula en la posición entre quedó
//      declarada como residual de v16 — R16-1/R16-2 — y la
//      cubre el mecanismo transversal de R17, ver más abajo)
//  1j. «le/les» + verbo de concesión + objeto + «a mi empresa /
//      a nuestro grupo / a nosotros» («¿Le dieron una tarifa a
//      mi empresa?»; R12, lista (e) B, condición obligada; «a
//      otra empresa» y «a su empresa» NO disparan; R15, lista
//      (e) E5/E7: + verbos de continuidad en pasado y «validar»)
//  1k. «quedar» + participio de concesión/acuerdo + ATRIBUCIÓN
//      EXPRESA obligatoria, en sus posiciones (al final tras el
//      objeto, antepuesta, tras el objeto, con pronombre)
//      («¿La tarifa especial de mi empresa quedó aprobada?»,
//      «¿Quedó otorgada la tarifa especial de mi empresa?»; R15,
//      lista (e) E3 del cierre R14: la limitación 14 de v14,
//      elevada con ejemplos ejecutados; sin atribución sigue al
//      modelo; el presente de «quedar» NO entra)
//  1l. «se firmó» + «contrato» SOLO con atribución expresa, en
//      sus posiciones («¿Se firmó el contrato para mi empresa?»;
//      R15, lista (e) E6 del cierre R14: la variante atribuida
//      de la limitación 19, elevada; «firmar» sigue fuera de las
//      listas del canal «se» y la forma general conserva la
//      decisión de R12)
//  1m. Continuidad impersonal con «se» y OBJETO ANTEPUESTO +
//      atribución expresa posterior obligatoria («¿El precio
//      especial se mantuvo para mi empresa?»; R16, lista (e)
//      E1 del cierre R15: la familia fundante del NO-GO de GPT;
//      el orden verbo-primero ya lo cubría la 1f; sin
//      atribución — la familia F065 — conserva su estatuto y
//      sigue al modelo, y el destino a tercero no dispara por
//      el criterio D-1; R18, lista (e) E1 del cierre R17: + la
//      posición INTERCALADA de la atribución, también en la
//      1m vecina)
//  1n. Perífrasis de continuidad en PASADO («seguir/continuar +
//      gerundio») con «se» y atribución obligatoria, en los dos
//      órdenes («¿El precio especial se siguió manteniendo para
//      mi empresa?», N08 de la H6 R16; R17, lista (e) E1 del
//      cierre R16: la exclusión de «seguir» nunca fue limitación
//      declarada y el cierre fundó en N08 el NO-GO; el presente
//      no entra — ya dispara por la 1d/1f —; la forma escueta
//      sin atribución y el destino a terceros quedan libres;
//      R18, lista (e) E1 del cierre R17: + la posición
//      INTERCALADA de la atribución en los dos órdenes)
//  1o. Polo escueto nominalizado: objeto + participio de acuerdo
//      (negociado/concedido/acordado/pactado/convenido) +
//      continuidad o vigencia predicada, SIN atribución ni
//      pronombre («¿La tarifa negociada sigue vigente?», F065;
//      R17, lista (e) E9: el punto D redecidido por Jaime el
//      2026-11-20 a favor de cubrir; incluye el patrón «especial
//      + se mantuvo/mantiene» de S240; «preferencial» NO es
//      marcador — residuo inscrito — y el objeto escueto sin
//      marcador tampoco entra — residuo inscrito —; R18, lista
//      (e) del cierre R17: la lista de objetos se extiende al
//      conjunto comercial delimitado (E4: cuota, contrato,
//      acuerdo, plan…), los patrones (a)/(b) excluyen el
//      destino a tercero y el segmento público como el (c)
//      (E3), y «preferencial» pasa a ser marcador tras su
//      elevación, con el paradigma finito de continuidad
//      completo en el patrón de marcador (E6/E7))
//  Mecanismo transversal R17 (E2/E3): la cláusula de remisión al
//      intercambio previo («según lo conversado», «como dijimos»,
//      «según lo que hablamos»…) actúa como atribución en
//      cualquier posición por retiro y reevaluación del núcleo:
//      si el texto sin la cláusula dispara, el mensaje dispara
//      (N07/N11/D29 de la H6 R16, limitaciones R16-1/R16-2
//      elevadas por el cierre). R18 (E2/E5 del cierre R17): el
//      retiro es ACUMULATIVO (la composición de cláusulas ya no
//      lo derrota) y el paradigma se completa con comentar,
//      charlar y prometer.
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
//  2d. Objeto definido + participio de acuerdo (acordado/pactado/
//      convenido) + continuidad predicada del propio objeto («¿El
//      precio acordado sigue vigente?», «¿Se mantiene el precio
//      pactado?»; R8, lista (e) D: los participios salieron de
//      A_FUERTE y sus combinaciones de B_FUERTE — la pregunta pública
//      de existencia («¿Ofrecen precios pactados?») ya no dispara —
//      y la premisa personal de la cat. 13 queda cubierta por esta
//      regla; la lista dedicada de 6/2b/2c incluye ahora también las
//      combinaciones con estos participios)
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
// CORRECCIÓN R17 (2026-11-20, (e) E2 y E3 del cierre del PIR-1
// R16): las cláusulas de REMISIÓN al intercambio previo («según lo
// conversado», «como dijimos», «según lo que hablamos»…) son en sí
// mismas la atribución de la premisa, en CUALQUIER posición. En v16
// solo casaban antepuestas y con la lista cerrada corta de R16
// (limitaciones R16-1 — posición final, casos N07/N11 de la H6 R16
// — y R16-2 — cláusulas fuera de la lista, caso D29 —, ambas
// ELEVADAS por el cierre tras sus ecos vivos). El mecanismo es de
// RETIRO Y REEVALUACIÓN: si el texto sin la cláusula dispara por
// cualquiera de los canales existentes, el mensaje dispara; la
// cláusula nunca crea un disparo donde el núcleo no lo tiene (los
// núcleos de R-1 con su cláusula siguen libres, y la pregunta
// pública con cláusula cuyo núcleo es libre sigue al modelo). El
// paradigma es metódico — «según/como» + referencia al intercambio
// previo — y no otra lista de casos: «según lo» + participio del
// intercambio, «según lo que» + pretérito del intercambio, «como» +
// pretérito, «como lo» + pretérito. El residuo (cláusulas de
// remisión fuera del paradigma) queda inscrito en el informe con
// su ejemplo ejecutado.
// CORRECCIÓN R18 (2026-11-20, (e) E2 y E5 del cierre del PIR-1
// R17): dos compleciones del mecanismo. E2 — el retiro pasa a ser
// ACUMULATIVO: el mecanismo de v17 retiraba UNA cláusula por
// variante y la composición de dos o más cláusulas del propio
// paradigma lo derrotaba (segundo fundamento del NO-GO de R17:
// la verbatim de GPT, la misma cláusula repetida y tres
// cláusulas atravesaban). Ahora se evalúa el texto completo,
// cada variante de un retiro (comportamiento de v17, conservado)
// y la cadena de retiros sucesivos hasta agotar las cláusulas,
// evaluando tras cada retiro: si algún estado dispara, el
// mensaje dispara; la cadena nunca crea un disparo que el núcleo
// sin cláusulas no tenga, porque el último estado ES el núcleo.
// E5 — el paradigma se completa con los verbos del intercambio
// que confirmaron en vivo fuera de él (R17-3 ELEVADA: comentar,
// charlar y prometer — S260, D38 y D39, los ejemplos verbatim
// del registro —) y se cierra el producto de las cuatro
// construcciones sobre el conjunto delimitado de verbos del
// intercambio: hablar, conversar, comentar, charlar, decir,
// acordar, quedar, pactar, convenir, prometer, ver, tratar,
// establecer y definir. El residuo fuera del conjunto delimitado
// («según lo indicado», «según lo mencionado», «como se
// acordó», «según acordamos») queda inscrito en el informe con
// sus ejemplos ejecutados.
const V01_CLAUSULAS_REMISION_R18 = [
  "segun lo conversado", "segun lo hablado", "segun lo acordado",
  "segun lo pactado", "segun lo convenido", "segun lo dicho",
  "segun lo visto", "segun lo tratado", "segun lo establecido",
  "segun lo definido", "segun lo comentado", "segun lo charlado",
  "segun lo prometido",
  "segun lo que hablamos", "segun lo que conversamos",
  "segun lo que acordamos", "segun lo que quedamos",
  "segun lo que dijimos", "segun lo que tratamos",
  "segun lo que pactamos", "segun lo que convenimos",
  "segun lo que comentamos", "segun lo que charlamos",
  "segun lo que prometimos", "segun lo que vimos",
  "segun lo que establecimos", "segun lo que definimos",
  "como acordamos", "como quedamos", "como conversamos",
  "como hablamos", "como dijimos", "como pactamos",
  "como convenimos", "como tratamos", "como comentamos",
  "como charlamos", "como prometimos", "como vimos",
  "como establecimos", "como definimos",
  "como lo hablamos", "como lo conversamos", "como lo acordamos",
  "como lo dijimos", "como lo comentamos", "como lo charlamos",
  "como lo prometimos", "como lo tratamos", "como lo pactamos",
  "como lo convenimos", "como lo quedamos",
  // CORRECCIÓN R19 (2026-11-20, (e) E2 del cierre del PIR-1 R18;
  // R18-2 ELEVADA a condición obligada tras confirmarse 6/6 en
  // vivo por eco): delimitación sistemática del espacio de
  // remisión. El conjunto verbal crece con los verbos de
  // decir/indicar/registrar vecinos ejecutados en el diagnóstico
  // previo (indicar, mencionar, señalar, disponer, confirmar,
  // precisar, anotar, registrar, explicar, detallar, comunicar,
  // informar) y el paradigma se cierra con dos construcciones
  // nuevas sobre TODO el conjunto: «según» + 1.ª plural («según
  // acordamos», una de las 6 obligadas) y «como se» + pretérito
  // 3.ª singular («como se acordó», otra obligada). Las 6 formas
  // del fundamento quedan dentro: «según lo indicado», «según
  // lo mencionado», «como se acordó», «según acordamos», «según
  // lo señalado», «según lo dispuesto». Las remisiones a
  // referente PÚBLICO siguen libres: «según lo publicado» no es
  // forma del paradigma (exclusión inscrita) y las formas
  // genéricas del bloque R19 exceptúan el participio «publicado»
  // y la continuación «en la página/web/sitio».
  "segun lo indicado", "segun lo mencionado", "segun lo senalado",
  "segun lo dispuesto", "segun lo confirmado", "segun lo precisado",
  "segun lo anotado", "segun lo registrado", "segun lo explicado",
  "segun lo detallado", "segun lo comunicado", "segun lo informado",
  "segun lo que indicaron", "segun lo que mencionaron",
  "segun lo que senalaron", "segun lo que dispusieron",
  "segun lo que confirmaron", "segun lo que precisaron",
  "segun lo que anotaron", "segun lo que registraron",
  "segun lo que explicaron", "segun lo que detallaron",
  "segun lo que comunicaron", "segun lo que informaron",
  "como indicamos", "como mencionamos", "como senalamos",
  "como dispusimos", "como confirmamos", "como precisamos",
  "como anotamos", "como registramos", "como explicamos",
  "como detallamos", "como comunicamos", "como informamos",
  "segun hablamos", "segun conversamos", "segun acordamos",
  "segun quedamos", "segun dijimos", "segun tratamos",
  "segun pactamos", "segun convenimos", "segun comentamos",
  "segun charlamos", "segun prometimos", "segun vimos",
  "segun establecimos", "segun definimos",
  "segun indicamos", "segun mencionamos", "segun senalamos",
  "segun dispusimos", "segun confirmamos", "segun precisamos",
  "segun anotamos", "segun registramos", "segun explicamos",
  "segun detallamos", "segun comunicamos", "segun informamos",
  "como lo indicaron", "como lo mencionaron", "como lo senalaron",
  "como lo dispusieron", "como lo confirmaron", "como lo precisaron",
  "como lo anotaron", "como lo registraron", "como lo explicaron",
  "como lo detallaron", "como lo comunicaron", "como lo informaron",
  "como se hablo", "como se converso", "como se acordo",
  "como se comento", "como se charlo", "como se dijo",
  "como se quedo", "como se pacto", "como se convino",
  "como se prometio", "como se vio", "como se trato",
  "como se establecio", "como se definio",
  "como se indico", "como se menciono", "como se senalo",
  "como se dispuso", "como se confirmo", "como se preciso",
  "como se anoto", "como se registro", "como se explico",
  "como se detallo", "como se comunico", "como se informo"
];

// ══════════════════════════════════════════════════════════════
// CORRECCIÓN R19 (2026-11-20, lista (e) E1–E7 del cierre del
// PIR-1 R18; la bifurcación E3 resuelta por Jaime a favor de la
// vía (α): construcción genérica). Helpers de esta corrección:
//   E1 — la construcción reflexiva de «comprometerse a» (los
//        espejos de garantizar/asegurar/reservar/comprometer en
//        las listas de cada canal van junto a cada lista).
//        Exclusiones deliberadas inscritas de «comprometer»:
//        su participio no entra en la pasiva «fue» ni en el
//        conjunto de acuerdo de la 1o (lectura dominante:
//        «puesto en riesgo»), ni sus formas en la 1c/1j (marco
//        no idiomático para este verbo); su cobertura es la
//        1d/1e/1f/1i transitiva ejecutada y la reflexiva.
//   E2 — spans GENÉRICOS de cláusula de remisión, además del
//        paradigma literal ampliado junto a la lista de
//        cláusulas: participios y pretéritos fuera del conjunto
//        delimitado, con las excepciones públicas inscritas.
//   E3 — la regla 1o por CONSTRUCCIÓN GENÉRICA: objeto +
//        participio de acuerdo + continuidad, sin lista de
//        objetos; la lista de 38 queda absorbida como
//        subconjunto (los patrones con lista se conservan y la
//        construcción los cubre). R18-4 se preserva como
//        EXCLUSIÓN INSCRITA dentro de la construcción (clase no
//        comercial de agenda/eventos, abajo).
//   E4 — el residuo delimitado de R18-1: el adjunto interno del
//        intercambio tras la cláusula («en la llamada»…) y la
//        composición cláusula + «gracias» final dentro del
//        mecanismo de cláusulas.
//   E5 — la guarda M044 ELEVADA: premisa de historial de
//        acuerdo + seguimiento vago (ver v01DisparaEnHistorial).
//   E6 — la guarda de destinos no enumerados (condición
//        obligada de R18-3): en la 1o y en la 2d, un destino en
//        la posición canónica que no atribuye (ni posesivo, ni
//        enumerado, ni finalidad) bloquea el match.
// ══════════════════════════════════════════════════════════════

// E1: «comprometerse a + infinitivo de concesión» es el marco
// natural de «comprometer» (los demás canales son transitivos y
// su marco transitivo va en las listas). Dispara solo con un
// objeto comercial en el mensaje (B o sustantivo de monto):
// «se comprometieron a darme los datos» no afirma una condición
// comercial y sigue libre (ejecutado en el corpus).
const V01_RE_COMPROMETERSE_R19 = /\bse compromet(?:ieron|io) a (?:dar|ofrecer|mantener|respetar|conservar|renovar|aplicar|hacer)(?:me|nos|te|le|les)?\b/;

// E6: clasificación del destino tras «para». "atribucion" =
// señal de atribución real (posesivo o 1.ª persona);
// "excluido" = el conjunto enumerado de terceros/segmentos de
// V01_DESTINO_EXCLUIDO_1O_R18 (libre desde R18); "infinitivo" =
// finalidad («para pagar…»), no es destino; "desconocido" =
// segmento no enumerado sin atribución (la guarda lo libera).
// Delimitación ejecutada: el conjunto cerrado de segmentos que
// disparan SIN atribución queda vacío — en v18 todo destino no
// excluido que disparaba en la 1o/2d o atribuía (posesivo) o no
// estaba delimitado («para la empresa», que la guarda libera
// por no enumerado: consecuencia inscrita de E6, con su ejemplo
// ejecutado en el corpus).
const V01_DESTINO_NO_INFINITIVO_R19 = ["lugar", "hogar", "taller", "poder", "mujer", "ayer"];
function v01ClasificaDestinoR19(trasPara) {
  const palabras = String(trasPara || "").split(/\s+/).filter(Boolean);
  if (!palabras.length) return null;
  const posesivo = /^(?:mi|mis|nuestro|nuestra|nuestros|nuestras|nosotros|nosotras)$/;
  if (posesivo.test(palabras[0])) return "atribucion";
  let i = 0;
  if (/^(?:el|la|los|las|un|una|unos|unas|otra|otro|otras|otros|nuevos|nuevas|todo|toda|todos|todas)$/.test(palabras[0])) i = 1;
  const cabeza = palabras[i];
  if (!cabeza) return null;
  if (posesivo.test(cabeza)) return "atribucion";
  if (/(?:ar|er|ir)$/.test(cabeza) && cabeza.length > 3 && !V01_DESTINO_NO_INFINITIVO_R19.includes(cabeza)) return "infinitivo";
  const resto = palabras.slice(0, 3).join(" ");
  if (new RegExp(`^${V01_DESTINO_EXCLUIDO_1O_R18}(?:\\s|$)`).test(`para ${resto}`)) return "excluido";
  return "desconocido";
}
// E6: ¿el destino en posición canónica (antepuesto al match o
// inmediatamente tras él) bloquea este match de la 1o/2d?
function v01DestinoBloqueaR19(n, matchInicio, matchFin) {
  const antes = n.slice(0, matchInicio).trim();
  if (antes.length <= 40) {
    const mAntes = antes.match(/^para\s+(.+)$/);
    if (mAntes) {
      const clase = v01ClasificaDestinoR19(mAntes[1]);
      if (clase === "excluido" || clase === "desconocido") return true;
    }
  }
  const despues = n.slice(matchFin).trim();
  const mDespues = despues.match(/^para\s+(.+)$/);
  if (mDespues) {
    const clase = v01ClasificaDestinoR19(mDespues[1]);
    if (clase === "excluido" || clase === "desconocido") return true;
  }
  return false;
}
// Aplica una regex (versión global) match a match: un match
// cuenta si la guarda de destinos de E6 no lo bloquea y, en la
// construcción genérica, si la cabeza nominal capturada no
// pertenece a la clase de exclusión inscrita de R18-4.
function v01AlgunMatchR19(n, regexGlobal, esGenerica) {
  regexGlobal.lastIndex = 0;
  let m;
  while ((m = regexGlobal.exec(n)) !== null) {
    if (m[0].length === 0) { regexGlobal.lastIndex++; continue; }
    if (esGenerica && V01_OBJETOS_EXCLUIDOS_1O_R19.includes(m[1])) continue;
    if (!v01DestinoBloqueaR19(n, m.index, m.index + m[0].length)) return true;
  }
  return false;
}
// E3 (vía (α)): la clase de exclusión inscrita de R18-4 DENTRO
// de la construcción genérica — objetos no comerciales de
// agenda/evento y de ejecución del servicio, libres por
// construcción con participio y todo («¿La fecha acordada se
// mantiene?», «¿La cita acordada sigue vigente?»). Delimitación
// ejecutada en el diagnóstico previo: «llamada» NO entra en la
// clase — su disparo en v18 no proviene de la 1o sino de la
// regla 1b (es marcador temporal: la llamada como intercambio
// pasado), regla que esta corrección no toca; queda inscrito
// con su ejemplo ejecutado en el corpus.
const V01_OBJETOS_EXCLUIDOS_1O_R19 = ["fecha", "fechas", "cita", "citas", "horario", "horarios", "hora", "horas", "turno", "turnos", "reunion", "reuniones", "visita", "visitas", "encuentro", "encuentros", "sesion", "sesiones", "entrega", "entregas", "instalacion", "instalaciones"];
// La construcción genérica de la 1o: artículo + sintagma
// nominal de 1–2 palabras (la cabeza es la primera) +
// participio de acuerdo + continuidad (a), su invertida (b) y
// el patrón de marcador «especial/preferencial» (c). La clase
// semi-pública queda delimitada por la construcción completa:
// «cotización»/«presupuesto» con participio de acuerdo +
// continuidad disparan (premisa de acuerdo previo); sin
// participio («¿La cotización sigue vigente?», «¿Me preparan
// una cotización?») quedan libres, ejecutado en el corpus.
const V01_RE_1O_GENERICA_A_R19 = new RegExp(`\\b(?:el|la|los|las) ([a-z]+)(?: ([a-z]+))? ${V01_PARTICIPIOS_ACUERDO_R17} (?:tambien )?${V01_CONTINUIDAD_ESCUETA_R17}(?![a-z])`, "g");
const V01_RE_1O_GENERICA_B_R19 = new RegExp(`\\b(?:(?:sigue|siguen|siga|sigan|continua|continuen|continuen|permanece|permanecen) (?:vigente|vigentes)|se (?:mantiene|mantienen|mantuvo|mantuvieron)) (?:el|la|los|las) ([a-z]+)(?: ([a-z]+))? ${V01_PARTICIPIOS_ACUERDO_R17}(?![a-z])`, "g");
const V01_RE_1O_GENERICA_C_R19 = new RegExp(`\\b(?:el|la|los|las) ([a-z]+)(?: ([a-z]+))? (?:especial|especiales|preferencial|preferenciales) se (?:${V01_FINITOS_MARCADOR_R18}|(?:habia|habian) ${V01_PARTICIPIOS_MARCADOR_R18})(?: (?:vigente|vigentes))?${V01_COLA_MARCADOR_R18}`, "g");
const V01_RE_1O_GENERICA_C_SIGUE_R19 = new RegExp(`\\b(?:el|la|los|las) ([a-z]+)(?: ([a-z]+))? (?:especial|especiales|preferencial|preferenciales) (?:sigue|siguen|siga|sigan)(?: (?:vigente|vigentes|en pie|igual))?${V01_COLA_MARCADOR_R18}`, "g");
// Versiones globales de los patrones con lista de la 1o y de la
// 2d, para aplicarles la misma guarda de destinos de E6.
const V01_RE_ESCUETA_PARTICIPIO_G_R19 = new RegExp(V01_RE_ESCUETA_PARTICIPIO_R17.source, "g");
const V01_RE_ESCUETA_INVERTIDA_G_R19 = new RegExp(V01_RE_ESCUETA_INVERTIDA_R17.source, "g");
const V01_RE_ESCUETA_MARCADOR_G_R19 = new RegExp(V01_RE_ESCUETA_MARCADOR_R18.source, "g");
const V01_RE_ESCUETA_MARCADOR_SIGUE_G_R19 = new RegExp(V01_RE_ESCUETA_MARCADOR_SIGUE_R18.source, "g");
const V01_RE_OBJETO_PARTICIPIO_G_R19 = new RegExp(V01_RE_OBJETO_PARTICIPIO_CONTINUIDAD.source, "g");
const V01_RE_CONTINUIDAD_OBJETO_G_R19 = new RegExp(V01_RE_CONTINUIDAD_OBJETO_PARTICIPIO.source, "g");
const V01_RE_SIGUE_VIGENTE_OBJETO_G_R19 = new RegExp(V01_RE_SIGUE_VIGENTE_OBJETO_PARTICIPIO.source, "g");
// Regla 1o completa de v19: patrones con lista (absorbidos como
// subconjunto verificado) + construcción genérica, todos bajo
// la guarda de destinos de E6.
function v01Regla1oR19(n) {
  if (v01AlgunMatchR19(n, V01_RE_ESCUETA_PARTICIPIO_G_R19, false)) return true;
  if (v01AlgunMatchR19(n, V01_RE_ESCUETA_INVERTIDA_G_R19, false)) return true;
  if (v01AlgunMatchR19(n, V01_RE_ESCUETA_MARCADOR_G_R19, false)) return true;
  if (v01AlgunMatchR19(n, V01_RE_ESCUETA_MARCADOR_SIGUE_G_R19, false)) return true;
  if (v01AlgunMatchR19(n, V01_RE_1O_GENERICA_A_R19, true)) return true;
  if (v01AlgunMatchR19(n, V01_RE_1O_GENERICA_B_R19, true)) return true;
  if (v01AlgunMatchR19(n, V01_RE_1O_GENERICA_C_R19, true)) return true;
  if (v01AlgunMatchR19(n, V01_RE_1O_GENERICA_C_SIGUE_R19, true)) return true;
  return false;
}
// Regla 2d completa de v19: sus tres patrones con lista, bajo
// la guarda de destinos de E6 (la 2d NO se genericiza: fuera
// del alcance de E3, delimitado en el informe).
function v01Regla2dR19(n) {
  if (v01AlgunMatchR19(n, V01_RE_OBJETO_PARTICIPIO_G_R19, false)) return true;
  if (v01AlgunMatchR19(n, V01_RE_CONTINUIDAD_OBJETO_G_R19, false)) return true;
  if (v01AlgunMatchR19(n, V01_RE_SIGUE_VIGENTE_OBJETO_G_R19, false)) return true;
  return false;
}
// E4 (segunda mitad): dentro del mecanismo de cláusulas, cada
// estado evaluado se prueba también sin la cola de cortesía
// «(muchas) gracias»: la composición cláusula + «gracias» era
// el residuo de R18-1/R16-4. La evaluación inicial del texto
// completo NO usa esta variante: la forma sin cláusula con
// «gracias» conserva el estatuto de R16-4 (no dispara), porque
// el mecanismo solo actúa cuando el mensaje trae cláusula.
function v01EvaluarConGraciasR19(texto, crudoMin) {
  if (v01EvaluarNormalizadoR18(texto, crudoMin)) return true;
  const m = texto.match(/^(.*?)\s+(?:muchas\s+)?gracias$/);
  if (m && m[1] && m[1] !== texto) {
    // La conjunción que unía la última cláusula retirada puede
    // quedar colgando justo antes de «gracias» («… y como
    // acordamos, gracias» → núcleo «… y»): se retira también.
    const base = m[1].trim().replace(/\s+(?:y|e)$/, "").trim();
    return v01EvaluarNormalizadoR18(base, crudoMin);
  }
  return false;
}
// E2: spans genéricos de cláusula de remisión sobre el texto
// normalizado: (G1) «según lo» + participio de cualquier verbo
// (excepto «publicado», referente público inscrito); (G2)
// «como se» + pretérito 3.ª singular (excepto «publicó» y los
// participios en -ado/-ido, que no son pretérito); (G4)
// «según lo que» + pretérito 3.ª plural (excepto
// «publicaron»). Excepción común inscrita: si el span va
// seguido de «en la página/web/sitio», la remisión es al
// referente público y NO es cláusula («según lo indicado en la
// página»). Cada span se extiende con el adjunto interno de E4
// cuando lo trae (el adjunto forma parte de la remisión).
const V01_RE_CLAUSULA_GENERICA_R19 = /(?:\bsegun lo (?!publicado\b)[a-z]+(?:do|da|dos|das|to|ta|tos|tas)\b|\bcomo se (?!publico\b)[a-z]+(?<!ad|id)o\b|\bsegun lo que (?!publicaron\b)[a-z]+(?:aron|eron|ieron)\b)/g;
const V01_ADJUNTO_INTERNO_R19 = "(?:en (?:la|el) (?:llamada|reunion|correo|visita|oficina)|por (?:telefono|correo)|en persona)";
function v01SpansGenericosR19(n) {
  const spans = [];
  V01_RE_CLAUSULA_GENERICA_R19.lastIndex = 0;
  let m;
  while ((m = V01_RE_CLAUSULA_GENERICA_R19.exec(n)) !== null) {
    if (m[0].length === 0) { V01_RE_CLAUSULA_GENERICA_R19.lastIndex++; continue; }
    // Un span que ES una forma literal del paradigma ya lo
    // cubre el mecanismo literal (R17/R18): incluirlo aquí
    // multiplicaría el coste de las composiciones (medido:
    // 0,73 ms/evaluación en v18 contra 19,06 en el peor caso de
    // 11 cláusulas antes de esta exclusión).
    if (V01_CLAUSULAS_REMISION_R18.includes(m[0])) continue;
    let fin = m.index + m[0].length;
    const tras = n.slice(fin);
    if (/^\s+en (?:la|el) (?:pagina|web|sitio)\b/.test(tras)) continue;
    const mAdj = tras.match(new RegExp(`^\\s+${V01_ADJUNTO_INTERNO_R19}\\b`));
    if (mAdj) fin += mAdj[0].length;
    spans.push([m.index, fin]);
  }
  return spans;
}
function v01QuitarSpanR19(texto, ini, fin) {
  let v = (texto.slice(0, ini) + " " + texto.slice(fin)).replace(/\s+/g, " ").trim();
  let antes;
  do {
    antes = v;
    v = v.replace(/\s+(?:y|e)\s+(?:y|e)\s+/g, " y ")
         .replace(/^(?:y|e)\s+/, "")
         .replace(/\s+(?:y|e)$/, "")
         .trim();
  } while (v !== antes);
  return v;
}
// E2: el mecanismo de retiro aplicado a los spans genéricos:
// variantes de un retiro, cadena acumulativa y cierre con la
// atribución canónica, espejo del mecanismo literal de R17/R18
// (que sigue intacto en v01MecanismoClausulasR19). Cada estado
// se evalúa con el evaluador y con el mecanismo literal, así
// las composiciones mixtas (genérica + literal) también quedan
// cubiertas.
function v01ClausulasGenericasR19(n, crudoMin) {
  const spans = v01SpansGenericosR19(n);
  if (!spans.length) return false;
  for (const [ini, fin] of spans) {
    const v = v01QuitarSpanR19(n, ini, fin);
    if (v && (v01EvaluarNormalizadoR18(v, crudoMin) || v01MecanismoClausulasR19(v, crudoMin))) return true;
  }
  let cur = n;
  for (;;) {
    const sps = v01SpansGenericosR19(cur);
    if (!sps.length) break;
    cur = v01QuitarSpanR19(cur, sps[0][0], sps[0][1]);
    if (!cur) break;
    if (v01EvaluarNormalizadoR18(cur, crudoMin) || v01MecanismoClausulasR19(cur, crudoMin)) return true;
  }
  if (cur && cur !== n && !V01_RE_ATRIBUCION.test(cur)) {
    if (v01EvaluarNormalizadoR18(`${cur} para mi empresa`, crudoMin)) return true;
  }
  return false;
}
// E4 (primera mitad): el residuo delimitado de R18-1 — la
// cláusula del paradigma seguida del adjunto interno del
// intercambio («según lo conversado en la llamada»): el retiro
// de la cláusula dejaba el adjunto como cola que rompía los
// anclajes de fin de mensaje de los canales del núcleo (con el
// núcleo «tarifa»; con «beneficio»/«precio especial» el mensaje
// ya disparaba por la regla 1, no anclada — ejecutado). Para
// cada cláusula literal seguida de adjunto se evalúa la
// variante sin el adjunto con el pipeline completo (evaluador +
// mecanismo). El adjunto sin cláusula previa NO se toca: no es
// el residuo delimitado.
function v01VariantesAdjuntoR19(n, crudoMin) {
  if (!new RegExp(`\\b${V01_ADJUNTO_INTERNO_R19}\\b`).test(n)) return false;
  for (const clausula of V01_CLAUSULAS_REMISION_R18) {
    const escapada = clausula.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`${escapada} ${V01_ADJUNTO_INTERNO_R19}\\b`);
    if (re.test(n)) {
      const variante = n.replace(re, clausula);
      if (v01EvaluarNormalizadoR18(variante, crudoMin) || v01MecanismoClausulasR19(variante, crudoMin)) return true;
    }
  }
  return false;
}
// E5 (guarda M044 elevada): la premisa de historial — pregunta
// escueta en pasado, sin atribución, sobre la renovación o
// continuidad de un contrato/acuerdo/convenio («¿Se renovó el
// contrato?»). Estrecha por diseño: solo verbos de
// renovación/continuidad y solo esos tres objetos (los del
// acuerdo marco); las preguntas sobre lo publicado (precio,
// plan, página) no casan y los historiales públicos quedan
// libres, como constató el cierre R18 para R17-7.
const V01_RE_PREMISA_HISTORIAL_R19 = /\b(?:se (?:renovo|extendio|mantuvo|conservo|continuo|prorrogo|prolongo) (?:el|la|los|las|un|una) (?:contrato|acuerdo|convenio)|se (?:habia|habian) (?:renovado|extendido|mantenido|conservado|continuado|prorrogado|prolongado) (?:el|la|los|las|un|una) (?:contrato|acuerdo|convenio)|(?:renovaron|extendieron|mantuvieron|conservaron|continuaron|prorrogaron|prolongaron) (?:el|la|los|las|un|una) (?:contrato|acuerdo|convenio)|(?:el|la) (?:contrato|acuerdo|convenio) se (?:renovo|extendio|mantuvo|conservo|continuo|prorrogo|prolongo))\b/;
// E5: el seguimiento VAGO — continuidad sin objeto comercial
// (ni señal B ni sustantivo de monto) y sin nombrar el acuerdo:
// «¿Sigue vigente?», «¿Y sigue igual?». Si el seguimiento nombra
// un objeto («¿Sigue vigente el precio?») no es la construcción
// de M044 y conserva el camino ordinario de la regla 5.
function v01EsSeguimientoVagoR19(mensajeUsuario) {
  const n = v01Normalizar(mensajeUsuario);
  if (!n) return false;
  if (!V01_RE_CONTINUIDAD.test(n)) return false;
  if (V01_RE_B.test(n) || V01_RE_MONTO.test(n)) return false;
  if (/\b(?:contrato|acuerdo|convenio)\b/.test(n)) return false;
  return true;
}

// ══════════════════════════════════════════════════════════════
// CORRECCIÓN R20 (2026-11-21, lista (e) §7 del cierre del PIR-1
// R19; la bifurcación E8 la resolvió Jaime el 2026-11-21 a favor
// de la rama (α-f): el criterio aplicado en v19 — la clase
// semi-pública con participio de acuerdo + continuidad DISPARA
// y sin participio queda libre — queda AUTORIZADO y se inscribe
// como criterio decidido, no como desviación ni como residuo;
// esta corrección no cambia ese comportamiento, solo el
// registro). Elementos de este bloque:
//   E1 — regla 1p: el MARCO DEL COMPLEMENTO INDIRECTO explícito
//        sin clítico como POSICIÓN de atribución (fundamento
//        del NO-GO de R19: el hallazgo ejecutado de GPT,
//        delimitado por el cierre como celda posicional
//        uniforme, no como lista de verbos).
//   E3 — la familia de «permanecer» (R17-2 ELEVADA por
//        confirmación plena atribuida en la H6 R19, D36):
//        pretérito con atribución, la celda con marcador sin
//        atribución y las perífrasis «sigue permaneciendo» y
//        «venir + gerundio».
// (E2 va en las listas: la relativa en V01_VERBOS_QUE y el
// participio atribuido en V01_PARTICIPIOS_FUE; E5 va en los
// conjuntos de continuidad de la 1o y en V01_SUSTANTIVOS_X_QUE.)
// ══════════════════════════════════════════════════════════════

// E1 — regla 1p. La celda que atraviesa en v19: verbo de los
// canales de monto/concesión + «a mi empresa» / «a nuestra
// empresa» (antepuesto o pospuesto) + objeto comercial escueto.
// Ningún canal reconocía el sintagma «a + posesivo + empresa»
// como atribución: la cola compartida solo admite «para/de» y
// los canales con clítico exigen «le/les» o «me/nos». La regla
// cubre la POSICIÓN: el espacio verbal es la unión de los
// inventarios pretéritos de esos canales (1d completa, 1e y los
// excluidos de la 1g, que ya viven en la 1d) más «firmar» en sus
// pretéritos finitos — decisión registrada: «firmar» es la
// familia del contrato y su celda con CI («¿Firmaron a mi
// empresa un contrato?») no tiene lectura pública posible; su
// canal propio (1l) solo cubre la forma con «se» —.
// «comprometer» entra al marco por la unión (vive en las listas
// transitivas 1d/1e desde R19): la exclusión inscrita de R19
// gobernaba la LISTA de la 1j — que no se toca —, no la posición
// del CI; la forma con «le» + CI («¿Le comprometieron una tarifa
// a mi empresa?») dispara por este marco, y el delta lo registra
// como flip justificado por E1+E2. «contratar»
// NO entra (no vive en ningún canal del filtro; su celda queda
// inscrita en el informe). El CI admite el mismo conjunto
// nominal de la cola compartida y «a nosotros/nosotras» (la
// cola ya atribuye con «para nosotros»). «a su empresa» NO
// entra: conserva la limitación heredada 10 (ambigüedad del
// posesivo de 3.ª persona), re-inscrita para este marco en el
// informe; «a la empresa» NO entra: sin posesivo no hay
// atribución al visitante — es la misma familia que la
// consecuencia inscrita de E6 («para la empresa», D45) —.
// Objetos: el espacio de la 1e/1f más «contrato» (1g) y «pago»
// (1h/2d); «cotización»/«presupuesto» quedan fuera (cabezas
// semi-públicas: su familia es la 1o y la 1h; la celda queda
// inscrita en el informe). Guardas: el presente no entra (los
// inventarios son de pasado), el CI a tercero no casa (D-1) y
// el ancla de fin de mensaje es la de los canales hermanos.
const V01_CI_R20 = "a (?:(?:mi|nuestro|nuestra) (?:grupo|empresa|compania|negocio|equipo|organizacion|pyme)|nosotros|nosotras)";
const V01_OBJETOS_CI_R20 = "(?:precio|precios|tarifa|tarifas|condicion|condiciones|descuento|descuentos|oferta|ofertas|beneficio|beneficios|costo|costos|monto|montos|valor|valores|cuota|cuotas|importe|importes|contrato|contratos|pago|pagos)";
// Los pretéritos de 3.ª singular de los verbos regulares en
// -ar/-ir son HOMÓGRAFOS de la 1.ª persona del presente
// («garantizo» = garantizó / yo garantizo): la delimitación de
// esta corrección los separa en su propia pareja de patrones
// con la guarda de proximidad + tilde de la corrección R17
// (la pregunta de modo en presente —«¿Cómo negocio una tarifa
// a mi empresa?»— no dispara salvo que el texto crudo lleve la
// tilde del pretérito, que es su marca escrita). Los demás
// singulares (dio, hizo, prometió, concedió, ofreció, mantuvo,
// sostuvo, extendió, renovó, cerró) no son homógrafos y van en
// la lista principal.
const V01_HOMOGRAFOS_CI_R20 = ["garantizo", "aseguro", "reservo", "otorgo", "negocio", "aprobo", "asigno", "confirmo", "cotizo", "respeto", "paso", "pacto", "fijo", "autorizo", "acepto", "consensuo", "ratifico", "homologo", "valido", "revalido", "prorrogo", "prolongo", "conservo", "firmo", "amplio", "definio", "continuo"];
const V01_HOMOGRAFOS_CI_TILDE_R20 = { garantizo: "garantizó", aseguro: "aseguró", reservo: "reservó", otorgo: "otorgó", negocio: "negoció", aprobo: "aprobó", asigno: "asignó", confirmo: "confirmó", cotizo: "cotizó", respeto: "respetó", paso: "pasó", pacto: "pactó", fijo: "fijó", autorizo: "autorizó", acepto: "aceptó", consensuo: "consensuó", ratifico: "ratificó", homologo: "homologó", valido: "validó", revalido: "revalidó", prorrogo: "prorrogó", prolongo: "prolongó", conservo: "conservó", firmo: "firmó", amplio: "amplió", definio: "definió", continuo: "continuó" };
// Los verbos de NARRACIÓN («decir», «contar») quedan FUERA del
// marco: la guarda documentada de R12 ((e) B, cat. 69 del
// corpus: «¿Le contaron una tarifa a mi empresa?» no dispara)
// los excluyó de los canales de atribución organizacional (la
// lista de la 1j no los contiene) porque narrar una tarifa no
// es concederla; viven solo en la 1d con clítico de 1.ª/2.ª
// persona. El delta ejecutado v19→v20 lo confirmó: sin esta
// exclusión, la posición pospuesta del CI alcanzaba «contaron»
// por subcadena y rompía la guarda. Sus celdas en el marco
// quedan inscritas en el informe con esta razón.
const V01_NARRACION_CI_R20 = ["dijeron", "dijiste", "contaron", "contaste", "han dicho", "has dicho", "han contado", "has contado", "habian dicho", "habias dicho", "habia dicho", "habian contado", "habias contado", "habia contado"];
const V01_VERBOS_CI_R20 = [...new Set([...V01_VERBOS_CONCESION_MONTO, ...V01_VERBOS_TERCERA_PLURAL_MONTO, ...V01_VERBOS_EXCLUIDOS_1E, "firmaron", "firmaste", "habian firmado", "habia firmado", "prometio", "concedio", "ofrecio", "sostuvo"])].filter((v) => !V01_HOMOGRAFOS_CI_R20.includes(v) && !V01_NARRACION_CI_R20.includes(v));
const V01_RE_CI_ANTE_R20 = new RegExp(`\\b(?:${V01_VERBOS_CI_R20.join("|")}) (?:${V01_CI_R20}) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_CI_R20}${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_CI_POS_R20 = new RegExp(`\\b(?:${V01_VERBOS_CI_R20.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_CI_R20}${V01_PARTICIPIOS_1G} (?:${V01_CI_R20})(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_CI_ANTE_HOMOGRAFOS_R20 = new RegExp(`\\b(?:${V01_HOMOGRAFOS_CI_R20.join("|")}) (?:${V01_CI_R20}) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_CI_R20}${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_CI_POS_HOMOGRAFOS_R20 = new RegExp(`\\b(?:${V01_HOMOGRAFOS_CI_R20.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_CI_R20}${V01_PARTICIPIOS_1G} (?:${V01_CI_R20})(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// La posición del CI antepuesta al verbo («¿A mi empresa
// renovaron la tarifa?»): en v19 solo disparaba para los verbos
// con entrada plena en A_FUERTE (garantizar) y quedaba libre
// para el resto del marco; se cubre por uniformidad posicional
// (compleción ejecutada de la delimitación, como las
// intercaladas de R18). Con clítico («le») ya disparaba.
const V01_RE_CI_PRE_R20 = new RegExp(`\\b(?:${V01_CI_R20}) (?:${V01_VERBOS_CI_R20.join("|")}) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_CI_R20}${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_CI_PRE_HOMOGRAFOS_R20 = new RegExp(`\\b(?:${V01_CI_R20}) ((?:${V01_HOMOGRAFOS_CI_R20.join("|")})) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_CI_R20}${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
function v01CIHomografosR20(n, crudoMin, regex, verboEnGrupo) {
  const m = regex.exec(n);
  if (!m) return false;
  const antes = n.slice(0, m.index).replace(/\s+$/, "");
  if (antes === "como" || antes.endsWith(" como")) {
    const verbo = verboEnGrupo ? m[1] : m[0].split(" ")[0];
    const conTilde = V01_HOMOGRAFOS_CI_TILDE_R20[verbo];
    if (!conTilde) return true;
    return new RegExp("c[óo]mo\\s+" + conTilde + "(?![a-záéíóúüñ])").test(crudoMin || "");
  }
  return true;
}
const V01_RE_CI_SE_ANTE_R20 = new RegExp(`\\bse (?:(?:${V01_VERBOS_SE_R12.join("|")})|(?:habia|habian) (?:${V01_SE_CONCESION_PARTICIPIO.join("|")})) (?:${V01_CI_R20}) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_CI_R20}${V01_PARTICIPIOS_1G}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_CI_SE_POS_R20 = new RegExp(`\\bse (?:(?:${V01_VERBOS_SE_R12.join("|")})|(?:habia|habian) (?:${V01_SE_CONCESION_PARTICIPIO.join("|")})) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_CI_R20}${V01_PARTICIPIOS_1G} (?:${V01_CI_R20})(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
// La pasiva «fue» con el CI en la posición de la cola (espejos
// de las posiciones final, invertida y entre de la 1h).
const V01_RE_FUE_CI_FINAL_R20 = new RegExp(`\\b(?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H} (?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")}) (?:${V01_CI_R20})(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_FUE_CI_INV_R20 = new RegExp(`\\b(?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")}) (?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H} (?:${V01_CI_R20})(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_FUE_CI_ENTRE_R20 = new RegExp(`\\b(?:fue|fueron) (?:${V01_PARTICIPIOS_FUE.join("|")}) (?:${V01_CI_R20}) (?:el|la|los|las|un|una|unos|unas) (?:${V01_OBJETOS_FUE.join("|")})${V01_SUF_OBJ_1H}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);

// E3 — «permanecer» y sus perífrasis. La construcción confirmada
// (D36) es la de vigencia con sujeto comercial antepuesto, sin
// «se» (permanecer es intransitivo: la 1m, que exige «se» +
// verbo de continuidad, no la alcanza). Objetos: los de la 1f
// más los de acuerdo/contrato de la guarda M044 (contrato,
// acuerdo, convenio) y «plan». La celda SIN atribución y SIN
// marcador («¿La tarifa permaneció vigente?») NO se cubre: es
// el polo escueto de R-1/R17-7 (continuidad escueta sin
// atribución ni participio), cuyo estatuto conservan las
// rondas; queda re-inscrita en el informe con su ejemplo. La
// celda sin atribución CON marcador («especial»/
// «preferencial») SÍ se cubre, por la doctrina de la familia
// (c) de la 1o (el marcador separa la condición no pública de
// la pregunta pública, como en «se mantuvo»). El presente de
// «permanecer» no entra: conserva su estatuto (guarda de la
// (e)).
const V01_OBJETOS_PERMANECER_R20 = `(?:${V01_OBJETOS_1F_R17}|contrato|contratos|acuerdo|acuerdos|convenio|convenios|plan|planes)`;
const V01_PERMANECER_PASADO_R20 = "(?:permanecio|permanecieron|permanecia|permanecian|permaneciste|ha permanecido|han permanecido|habia permanecido|habian permanecido|habias permanecido)";
const V01_RE_PERMANECER_ATRIB_R20 = new RegExp(`\\b(?:el|la|los|las) ${V01_OBJETOS_PERMANECER_R20}${V01_PARTICIPIOS_1G} ${V01_PERMANECER_PASADO_R20} (?:vigente |vigentes )?${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_PERMANECER_MARCADOR_R20 = new RegExp(`\\b(?:el|la|los|las) (?:${V01_OBJETOS_1F_R17}) (?:especial|especiales|preferencial|preferenciales) (?:permanecio|permanecieron)(?: (?:vigente|vigentes))?${V01_COLA_MARCADOR_R18}`);
const V01_RE_SIGUE_PERMANECIENDO_R20 = new RegExp(`\\b(?:el|la|los|las) ${V01_OBJETOS_PERMANECER_R20}${V01_PARTICIPIOS_1G} (?:sigue|siguen|siga|sigan) permaneciendo (?:vigente |vigentes )?${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_GERUNDIOS_VENIR_R20 = "(?:manteniendo|renovando|conservando|extendiendo|continuando|permaneciendo)";
const V01_RE_VENIR_OBJETO_R20 = new RegExp(`\\b(?:el|la|los|las) ${V01_OBJETOS_PERMANECER_R20}${V01_PARTICIPIOS_1G} (?:se viene ${V01_GERUNDIOS_VENIR_R20}|viene ${V01_GERUNDIOS_VENIR_R20}se) (?:vigente |vigentes )?${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);
const V01_RE_VENIR_VERBO_R20 = new RegExp(`\\b(?:se viene ${V01_GERUNDIOS_VENIR_R20}|viene ${V01_GERUNDIOS_VENIR_R20}se) (?:(?:el|la|los|las|un|una|unos|unas) )?${V01_OBJETOS_PERMANECER_R20}${V01_PARTICIPIOS_1G} (?:vigente |vigentes )?${V01_COLA_ATRIBUCION}(?: ${V01_COLA_TEMPORAL})?\\s*(?:por favor)?\\s*$`);

function v01ReglasR20(n, crudoMin) {
  if (V01_RE_CI_ANTE_R20.test(n) || V01_RE_CI_POS_R20.test(n) || V01_RE_CI_PRE_R20.test(n)) return true;
  if (v01CIHomografosR20(n, crudoMin, V01_RE_CI_ANTE_HOMOGRAFOS_R20)) return true;
  if (v01CIHomografosR20(n, crudoMin, V01_RE_CI_POS_HOMOGRAFOS_R20)) return true;
  if (v01CIHomografosR20(n, crudoMin, V01_RE_CI_PRE_HOMOGRAFOS_R20, true)) return true;
  if (V01_RE_CI_SE_ANTE_R20.test(n) || V01_RE_CI_SE_POS_R20.test(n)) return true;
  if (V01_RE_FUE_CI_FINAL_R20.test(n) || V01_RE_FUE_CI_INV_R20.test(n) || V01_RE_FUE_CI_ENTRE_R20.test(n)) return true;
  if (V01_RE_PERMANECER_ATRIB_R20.test(n) || V01_RE_PERMANECER_MARCADOR_R20.test(n)) return true;
  if (V01_RE_SIGUE_PERMANECIENDO_R20.test(n)) return true;
  if (V01_RE_VENIR_OBJETO_R20.test(n) || V01_RE_VENIR_VERBO_R20.test(n)) return true;
  return false;
}

function v01EsAfirmacionPreviaNoVerificable(mensajeUsuario) {
  const crudoMin = String(mensajeUsuario || "").toLowerCase();
  const n = v01Normalizar(mensajeUsuario);
  if (!n) return false;
  if (v01EvaluarNormalizadoR18(n, crudoMin)) return true;
  if (v01MecanismoClausulasR19(n, crudoMin)) return true;
  // CORRECCIÓN R19: cláusulas genéricas de remisión (E2) y
  // variantes sin el adjunto interno tras la cláusula (E4).
  if (v01ClausulasGenericasR19(n, crudoMin)) return true;
  if (v01VariantesAdjuntoR19(n, crudoMin)) return true;
  // CORRECCIÓN R20: regla 1p (marco del complemento indirecto,
  // E1), pasiva «fue» con CI y la familia de «permanecer» (E3).
  if (v01ReglasR20(n, crudoMin)) return true;
  return false;
}

// Mecanismo de cláusulas de remisión LITERALES (R17/R18): la
// lógica es la de v18 intacta (variantes de un retiro, cadena
// acumulativa y cierre con la atribución canónica); la
// corrección R19 lo extrae a esta función para reutilizarlo en
// los pases nuevos y cambia las evaluaciones internas a
// v01EvaluarConGraciasR19 (E4: la composición cláusula +
// «gracias» se evalúa también sin la cola de cortesía; la
// evaluación inicial del texto completo, en la función
// principal, NO lleva esa variante).
function v01MecanismoClausulasR19(n, crudoMin) {
  // E2/E3 de R17 + E2 de R18: variantes con cláusulas de remisión
  // retiradas, en cualquier posición (final, entre, antepuesta).
  // Primero, cada variante de UN retiro (el comportamiento de
  // v17); después, la cadena ACUMULATIVA de retiros sucesivos
  // hasta que no quede ninguna cláusula, evaluando tras cada
  // retiro (el estado final es el núcleo sin cláusulas).
  const acolchado = ` ${n} `;
  for (const clausula of V01_CLAUSULAS_REMISION_R18) {
    const marca = ` ${clausula} `;
    let desde = 0;
    for (let intento = 0; intento < 3; intento++) {
      const idx = acolchado.indexOf(marca, desde);
      if (idx < 0) break;
      const variante = acolchado.slice(0, idx) + " " + acolchado.slice(idx + marca.length);
      if (v01EvaluarConGraciasR19(variante.trim(), crudoMin)) return true;
      desde = idx + 1;
    }
  }
  // Cadena ACUMULATIVA (E2 de R18): retira las cláusulas en
  // orden de aparición en el texto, una por estado, limpiando la
  // conjunción residual («y»/«e») que unía la cláusula retirada,
  // y reevalúa tras cada retiro hasta el núcleo sin cláusulas.
  let cadena = acolchado;
  let huboRetiro = false;
  for (;;) {
    let mejorIdx = -1;
    let mejorMarca = null;
    for (const clausula of V01_CLAUSULAS_REMISION_R18) {
      const marca = ` ${clausula} `;
      const idx = cadena.indexOf(marca);
      if (idx >= 0 && (mejorIdx < 0 || idx < mejorIdx)) {
        mejorIdx = idx;
        mejorMarca = marca;
      }
    }
    if (mejorIdx < 0) break;
    cadena = cadena.slice(0, mejorIdx) + " " + cadena.slice(mejorIdx + mejorMarca.length);
    // Limpieza de conjunciones residuales, iterada hasta punto
    // fijo: colapsa las dobles («y y» al retirar la cláusula del
    // medio de una enumeración «A y B y C») y retira las que
    // queden colgando al principio o al final de la cadena.
    let antesLimpieza;
    do {
      antesLimpieza = cadena;
      cadena = cadena
        .replace(/\s+(?:y|e)\s+(?:y|e)\s+/g, " y ")
        .replace(/^\s+(?:y|e)\s+/, " ")
        .replace(/\s+(?:y|e)\s*$/, " ");
    } while (cadena !== antesLimpieza);
    huboRetiro = true;
    if (v01EvaluarConGraciasR19(cadena.trim(), crudoMin)) return true;
  }
  // Cierre del mecanismo (E2 de R18, delimitación del cierre
  // R17 §2/§4.2: «las cláusulas son ellas mismas la
  // atribución»): hay núcleos anclados cuyo canal EXIGE la cola
  // de atribución (familias 1i/1g) y que por tanto no disparan
  // ni con el núcleo desnudo ni con una sola cláusula, aunque la
  // forma atribuida sí dispara («Renovaron la tarifa para mi
  // empresa» dispara; «Renovaron la tarifa, según lo conversado
  // y como acordamos» debe disparar por la misma doctrina que ya
  // hace disparar la regla 1 cuando la cláusula aporta la
  // señal). Si el mensaje traía cláusula(s) del paradigma y el
  // núcleo desnudo no disparó, se evalúa UNA variante más: el
  // núcleo con la atribución canónica hecha explícita al final.
  // La variante no crea disparos sobre núcleos públicos: el
  // núcleo público con la atribución explícita sigue sin
  // disparar (ejecutado: «¿Cuánto cuesta el Diagnóstico
  // Esencial, según lo conversado y como acordamos?» libre).
  if (huboRetiro) {
    const nucleo = cadena.trim();
    if (nucleo && nucleo !== n && !V01_RE_ATRIBUCION.test(nucleo)) {
      if (v01EvaluarConGraciasR19(`${nucleo} para mi empresa`, crudoMin)) return true;
    }
  }
  return false;
}

function v01EvaluarNormalizadoR18(n, crudoMin) {
  const aFuerte = V01_RE_A_FUERTE.test(n) || V01_RE_ME_CONTINUIDAD.test(n);
  if (aFuerte && V01_RE_B.test(n)) return true;
  if (V01_RE_A_TEMPORAL.test(n) && V01_RE_B.test(n) && (V01_RE_CONTINUIDAD.test(n) || V01_RE_OBJETO_DE_TEMPORAL.test(n))) return true;
  if (V01_RE_A_TEMPORAL.test(n) && V01_RE_CONTINUIDAD.test(n) && V01_RE_MONTO.test(n)) return true;
  if (V01_RE_X_QUE.test(n)) return true;
  if (V01_RE_CONCESION_MONTO.test(n)) return true;
  if (V01_RE_TERCERA_PLURAL_MONTO.test(n)) return true;
  if (V01_RE_SE_IMPERSONAL.test(n)) return true;
  // CORRECCIÓN R19 (E1): la construcción reflexiva de
  // «comprometerse a» + objeto comercial en el mensaje.
  if (V01_RE_COMPROMETERSE_R19.test(n) && (V01_RE_B.test(n) || V01_RE_MONTO.test(n))) return true;
  if (V01_RE_ATRIBUIDO_EXCLUIDOS.test(n) || V01_RE_ATRIBUIDO_EXCLUIDOS_SE.test(n) || V01_RE_ATRIBUIDO_CONTRATO_SE.test(n) || V01_RE_ATRIBUIDO_CONTRATO_PLURAL.test(n)) return true;
  if (V01_RE_ATRIB_PRE_ACTIVA.test(n) || V01_RE_ATRIB_ENTRE_ACTIVA.test(n) || V01_RE_ATRIB_PRE_SE.test(n) || V01_RE_ATRIB_ENTRE_SE.test(n) || V01_RE_ATRIB_ENTRE_1D.test(n) || V01_RE_LE_A_ATRIBUIDO.test(n) || V01_RE_ATRIB_COLA_ACTIVA.test(n) || V01_RE_ATRIB_PRE_CLAUSULA_ACTIVA.test(n) || (V01_RE_ATRIB_COLA_HOMOGRAFOS_R16.test(n) && v01ColaHomografosR17(n, crudoMin))) return true;
  if (V01_RE_FUE_PASIVA_ATRIBUIDA.test(n) || V01_RE_FUE_PASIVA_INV_ATRIBUIDA.test(n) || V01_RE_FUE_PASIVA_ATRIB_ENTRE.test(n) || V01_RE_FUE_PASIVA_ATRIB_ANTES.test(n) || V01_RE_FUE_PASIVA_ATRIB_PRE_FUE.test(n) || V01_RE_FUE_PASIVA_ATRIB_PRE_OBJ.test(n)) return true;
  if (V01_RE_QUEDAR_FINAL.test(n) || V01_RE_QUEDAR_PRE.test(n) || V01_RE_QUEDAR_OBJ.test(n) || V01_RE_QUEDAR_PRON.test(n)) return true;
  if (V01_RE_FIRMAR_SE_FINAL.test(n) || V01_RE_FIRMAR_SE_PRE.test(n) || V01_RE_FIRMAR_SE_ENTRE.test(n)) return true;
  if (V01_RE_SE_OBJETO_ANTEPUESTO.test(n) || V01_RE_SE_OBJETO_INTERCALADA_R18.test(n)) return true;
  // CORRECCIÓN R17: regla 1n (perífrasis de continuidad en pasado
  // con «se» y atribución, E1), 1m vecina (objeto antepuesto con
  // verbos vecinos, E5) y regla 1o (polo escueto nominalizado de la
  // familia F065, E9 con el punto D redecidido por Jaime).
  // CORRECCIÓN R18: las posiciones intercaladas de la 1n y de la
  // 1m vecina (E1); en la 1o, la exclusión de destinos de los
  // patrones (a)/(b) (E3), la lista de objetos extendida (E4) y
  // los patrones de marcador «especial»/«preferencial» con el
  // paradigma finito completo (E6/E7).
  if (V01_RE_PERIFRASIS_OBJETO_R17.test(n) || V01_RE_PERIFRASIS_VERBO_R17.test(n) || V01_RE_PERIFRASIS_INTERCALADA_R18.test(n) || V01_RE_PERIFRASIS_VERBO_INTERCALADA_R18.test(n)) return true;
  if (V01_RE_SE_OBJETO_ANTEPUESTO_VECINOS_R17.test(n) || V01_RE_SE_OBJETO_INTERCALADA_VECINOS_R18.test(n)) return true;
  // CORRECCIÓN R19: la 1o se evalúa por v01Regla1oR19
  // (patrones con lista + construcción genérica de la vía (α),
  // bajo la guarda de destinos de E6).
  if (v01Regla1oR19(n)) return true;
  if (V01_RE_A_DEBIL.test(n) && V01_RE_B_FUERTE.test(n)) return true;
  if (V01_RE_OBJETOS_CONFIRMA_NEGOCIADO.test(n) && V01_RE_ATRIBUCION.test(n) && V01_RE_CONTINUIDAD_FUERTE.test(n)) return true;
  if (V01_RE_OBJETO_NEGOCIADO_ATRIBUIDO.test(n)) return true;
  // CORRECCIÓN R19: la 2d se evalúa por v01Regla2dR19 (sus
  // tres patrones con lista, bajo la guarda de destinos de E6).
  if (v01Regla2dR19(n)) return true;
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
  // CORRECCIÓN R19 (E5 del cierre del PIR-1 R18; la guarda M044
  // ELEVADA porque su evento de elevación se produjo: segunda
  // confirmación consecutiva con ancla en lo acordado, H6 R18):
  // si el seguimiento es VAGO (continuidad sin objeto) y un
  // mensaje anterior trae la premisa escueta de historial de
  // acuerdo («¿Se renovó el contrato?»), el seguimiento confirma
  // anclando en lo acordado y también dispara. Los historiales
  // sobre lo publicado no casan la premisa (sus objetos no son
  // contrato/acuerdo/convenio) y quedan libres.
  if (v01EsSeguimientoVagoR19(ultimo.content)) {
    for (let i = 2; i <= 5; i++) {
      const anterior = usuarios[usuarios.length - i];
      if (anterior && V01_RE_PREMISA_HISTORIAL_R19.test(v01Normalizar(anterior.content))) return true;
    }
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
