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
}

export const servicePages: ServicePage[] = [
  {
    slug: "diagnostico-seguridad-bogota",
    eyebrow: "DIAGNÓSTICO EN BOGOTÁ Y COLOMBIA",
    title: "Diagnóstico de seguridad para empresas en Bogotá",
    description: "Diagnóstico de ciberseguridad para pymes y organizaciones en Bogotá, con revisión priorizada, informe ejecutivo y plan de mejora.",
    intro: "Identificamos configuraciones débiles, exposiciones y prácticas de riesgo para convertirlas en un plan de mejora entendible y ejecutable.",
    audience: ["Pymes que necesitan conocer su nivel actual", "Empresas antes de ampliar su operación digital", "Equipos con incidentes, dudas o configuraciones heredadas"],
    includes: ["Reunión de alcance", "Revisión autorizada de activos acordados", "Clasificación de hallazgos", "Informe técnico y ejecutivo", "Plan de remediación priorizado"],
    process: [
      { title: "Definir", text: "Acordamos activos, restricciones y objetivos." },
      { title: "Evaluar", text: "Revisamos las condiciones incluidas en el alcance." },
      { title: "Priorizar", text: "Ordenamos los hallazgos por riesgo e impacto." },
      { title: "Entregar", text: "Presentamos resultados y próximos pasos." }
    ],
    faq: [
      { question: "¿Puede hacerse de forma remota?", answer: "Sí, cuando el alcance y los accesos autorizados lo permitan." },
      { question: "¿Incluye correcciones?", answer: "La propuesta define si incluye acompañamiento o implementación de mejoras." }
    ],
    whatsappMessage: "Hola Jaime, quiero solicitar un diagnóstico de seguridad para mi organización."
  },
  {
    slug: "hardening-windows-colombia",
    eyebrow: "FORTALECIMIENTO DE EQUIPOS",
    title: "Hardening de Windows para empresas en Colombia",
    description: "Servicio de hardening de Windows para reducir exposición, fortalecer configuraciones y documentar cambios en equipos empresariales.",
    intro: "Fortalecemos equipos Windows con cambios controlados, trazables y proporcionales al uso real de cada organización.",
    audience: ["Empresas con equipos sin una línea base común", "Organizaciones que manejan información sensible", "Pymes que quieren reducir configuraciones innecesarias"],
    includes: ["Inventario y comprobaciones previas", "Respaldo de configuración", "Aplicación controlada de mejoras", "Validación funcional", "Informe de cambios y recomendaciones"],
    process: [
      { title: "Auditar", text: "Revisamos versión, uso y controles actuales." },
      { title: "Respaldar", text: "Creamos puntos de recuperación antes de cambiar." },
      { title: "Fortalecer", text: "Aplicamos medidas compatibles con la operación." },
      { title: "Verificar", text: "Comprobamos funcionamiento y documentamos." }
    ],
    faq: [
      { question: "¿Se desinstalan componentes críticos?", answer: "No se eliminan componentes críticos sin justificación, autorización y posibilidad de recuperación." },
      { question: "¿Puede adaptarse por áreas?", answer: "Sí. La línea base puede variar según funciones, aplicaciones y nivel de riesgo." }
    ],
    whatsappMessage: "Hola Jaime, quiero Solicitar valoración hardening de equipos Windows."
  },
  {
    slug: "consultoria-ciberseguridad-colombia",
    eyebrow: "CONSULTORÍA REMOTA NACIONAL",
    title: "Consultoría de ciberseguridad para empresas en Colombia",
    description: "Consultoría de ciberseguridad para pymes colombianas: diagnóstico, priorización, informes y acompañamiento remoto.",
    intro: "Aterrizamos decisiones de seguridad a la capacidad, presupuesto y prioridades reales de la organización.",
    audience: ["Pymes sin responsable interno de seguridad", "Empresas que necesitan priorizar inversiones", "Organizaciones que requieren una segunda opinión técnica"],
    includes: ["Análisis de contexto", "Mapa inicial de riesgos", "Recomendaciones priorizadas", "Sesiones de acompañamiento", "Seguimiento según propuesta"],
    process: [
      { title: "Contexto", text: "Entendemos operación, activos y preocupaciones." },
      { title: "Criterio", text: "Separamos lo urgente de lo conveniente." },
      { title: "Plan", text: "Definimos acciones, responsables y secuencia." },
      { title: "Seguimiento", text: "Revisamos avances y obstáculos acordados." }
    ],
    faq: [
      { question: "¿La consultoría obliga a comprar productos?", answer: "No. Las recomendaciones deben justificarse por necesidad y riesgo." },
      { question: "¿Atienden fuera de Bogotá?", answer: "Sí. La cobertura remota se ofrece en toda Colombia." }
    ],
    whatsappMessage: "Hola Jaime, quiero información sobre consultoría de ciberseguridad."
  },
  {
    slug: "pruebas-seguridad-autorizadas",
    eyebrow: "EVALUACIÓN CONTROLADA",
    title: "Pruebas de seguridad autorizadas",
    description: "Pruebas de seguridad con autorización escrita, alcance controlado, evidencias e informe de remediación para empresas.",
    intro: "Evaluamos únicamente activos autorizados y dentro de condiciones previamente acordadas para reducir riesgos operativos y legales.",
    audience: ["Empresas que necesitan validar controles", "Organizaciones antes de publicar un servicio", "Pymes que requieren evidencias y prioridades"],
    includes: ["Autorización y reglas de trabajo", "Definición de alcance", "Pruebas controladas", "Registro de evidencias", "Informe y recomendaciones"],
    process: [
      { title: "Autorizar", text: "Confirmamos propiedad, permiso y responsables." },
      { title: "Delimitar", text: "Acordamos activos, horarios y exclusiones." },
      { title: "Probar", text: "Ejecutamos actividades dentro del alcance." },
      { title: "Reportar", text: "Entregamos evidencias y remediación." }
    ],
    faq: [
      { question: "¿Se hacen pruebas sin autorización?", answer: "No. Toda prueba requiere autorización escrita y alcance acordado." },
      { question: "¿Puede afectar la operación?", answer: "Las condiciones se diseñan para reducir el impacto, pero cualquier riesgo específico debe quedar acordado antes de iniciar." }
    ],
    whatsappMessage: "Hola Jaime, quiero consultar una prueba de seguridad autorizada."
  },
  {
    slug: "auditoria-ciberseguridad-pyme",
    eyebrow: "SEGURIDAD PARA PYMES",
    title: "Auditoría de ciberseguridad para pymes",
    description: "Auditoría de ciberseguridad para pymes con revisión de equipos, cuentas, configuraciones, hallazgos y plan de mejora.",
    intro: "Revisamos las capas de seguridad más relevantes para una pyme y entregamos prioridades claras, sin complejidad innecesaria.",
    audience: ["Pymes en crecimiento", "Negocios que dependen de información y servicios digitales", "Empresas que necesitan ordenar sus controles"],
    includes: ["Definición de activos", "Revisión de controles acordados", "Hallazgos con severidad", "Informe para dirección", "Hoja de ruta de mejora"],
    process: [
      { title: "Preparar", text: "Definimos alcance y recopilar información." },
      { title: "Revisar", text: "Evaluamos los controles incluidos." },
      { title: "Explicar", text: "Traducimos hallazgos a impacto empresarial." },
      { title: "Mejorar", text: "Entregamos una hoja de ruta priorizada." }
    ],
    faq: [
      { question: "¿Cuánto cuesta?", answer: "El precio depende de activos, sedes, alcance y complejidad. La web muestra valores orientativos desde." },
      { question: "¿Qué recibe la gerencia?", answer: "Un resumen ejecutivo, prioridades y próximos pasos, además del detalle técnico acordado." }
    ],
    whatsappMessage: "Hola Jaime, quiero Solicitar valoración una auditoría de ciberseguridad para una pyme."
  }
];

export const siteFaq = [
  { question: "¿Las pruebas requieren autorización?", answer: "Sí. Las pruebas de seguridad solo se realizan con autorización escrita y alcance previamente acordado." },
  { question: "¿Atienden fuera de Bogotá?", answer: "Sí. JEFQ Consultor ofrece atención remota en toda Colombia." },
  { question: "¿Qué contiene el informe?", answer: "El alcance contratado determina el contenido. Normalmente se organizan hallazgos, evidencia, prioridad y recomendaciones." },
  { question: "¿Una evaluación garantiza seguridad total?", answer: "No. Una evaluación refleja el alcance y el momento revisados; la seguridad requiere mejora continua." },
  { question: "¿Cómo se define el precio?", answer: "Se considera el número de activos, complejidad, alcance, horarios y nivel de acompañamiento." }
];