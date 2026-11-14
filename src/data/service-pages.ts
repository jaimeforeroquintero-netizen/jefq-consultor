export interface ServicePage {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  intro: string;
  audience: string[];
  includes: string[];
  process: { title: string; text: string }[];
  faq: { question: string; answer: string }[];
  whatsappMessage: string;
  /** Id en src/data/precios.ts para el ancla "Desde $X" (#6 ronda 2).
      Sin valor = la página no tiene precio publicado propio y no muestra
      ancla (no se inventa ningún precio). La IA no lleva ancla en el hero
      de ServiceLanding: su precio ya aparece enlazado en su banda
      "INVERSIÓN ORIENTATIVA" (seguridad-inteligencia-artificial.astro). */
  precioId?: string;
}

export const servicePages: ServicePage[] = [
  {
    slug: "seguridad-inteligencia-artificial",
    precioId: "evaluacion-ia",
    eyebrow: "IA BAJO CONTROL",
    title: "Seguridad para IA",
    description: "Evaluación del uso de herramientas de IA en su pyme: datos en prompts, aplicaciones sin gobierno, riesgos de suplantación y controles proporcionales.",
    intro: "Las herramientas de IA ya están en su empresa, las haya aprobado o no. Revisamos cómo se usan, qué datos circulan por ellas y qué controles necesita para usarlas sin exponerse.",
    audience: ["Pymes cuyo equipo ya usa ChatGPT, Copilot, Gemini, Claude, Meta AI u otras herramientas de IA", "Empresas que manejan datos de clientes o información sensible", "Negocios que quieren reglas claras antes de ampliar el uso de IA"],
    includes: ["Inventario de herramientas de IA en uso", "Revisión de datos compartidos en prompts", "Evaluación de configuraciones y accesos", "Política básica de uso de IA", "Sesión de concienciación para el equipo"],
    process: [
      { title: "Descubrir", text: "Identificamos qué herramientas de IA se usan y quién las usa." },
      { title: "Evaluar", text: "Revisamos datos expuestos, configuraciones y accesos." },
      { title: "Ordenar", text: "Definimos reglas de uso y controles proporcionales." },
      { title: "Entregar", text: "Presentamos hallazgos, política sugerida y próximos pasos." }
    ],
    faq: [
      { question: "¿Usar herramientas de IA es un riesgo para mi empresa?", answer: "Depende de cómo se usen. El riesgo real está en compartir datos sensibles en prompts y en usar aplicaciones sin ningún control. Una evaluación muestra dónde está expuesto." },
      { question: "¿Tenemos que dejar de usar la IA?", answer: "No. El objetivo es usarla con reglas claras: qué datos pueden compartirse, qué herramientas están aprobadas y quién responde por su uso." },
      { question: "¿Qué pasa con los fraudes por voz o video falsos?", answer: "La suplantación con voz sintética es una amenaza real para pymes. La evaluación incluye recomendaciones prácticas de verificación para transferencias y solicitudes sensibles." },
      { question: "¿Esto reemplaza un diagnóstico de seguridad general?", answer: "No. Es un complemento enfocado en el uso de IA. Si su empresa no tiene una visión básica de su seguridad, conviene empezar por el diagnóstico general." }
    ],
    whatsappMessage: "Hola Jaime, quiero información sobre la evaluación de seguridad para el uso de IA en mi empresa."
  }
];

export const siteFaq = [
  { question: "¿Las pruebas requieren autorización?", answer: "Sí. Las pruebas de seguridad solo se realizan con autorización escrita y alcance previamente acordado." },
  { question: "¿Atienden fuera de Bogotá?", answer: "Sí. JEFQ Consultor ofrece atención remota en toda Colombia." },
  { question: "¿Qué contiene el informe?", answer: "El alcance contratado determina el contenido. Normalmente se organizan hallazgos, evidencia, prioridad y recomendaciones." },
  { question: "¿Una evaluación garantiza seguridad total?", answer: "No. Una evaluación refleja el alcance y el momento revisados; la seguridad requiere mejora continua." },
  { question: "¿Cómo se define el precio?", answer: "Se considera el número de activos, complejidad, alcance, horarios y nivel de acompañamiento." }
];