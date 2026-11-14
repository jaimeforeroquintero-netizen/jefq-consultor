export type ServicePage = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  promise: string;
  /** Id en src/data/precios.ts para el ancla "Desde $X" (#6 ronda 2).
      Sin valor = el servicio no tiene precio publicado propio y la
      página no muestra ancla (no se inventa ningún precio). */
  precioId?: string;
  includes: string[];
  deliverables: string[];
  process: { title: string; text: string }[];
  related: string[];
  /** Público al que va dirigido (fusionado desde las páginas de
      aterrizaje retiradas en la optimización 2026-11-13). */
  audience?: string[];
  /** Preguntas frecuentes del servicio (fusionadas desde las páginas
      de aterrizaje retiradas en la optimización 2026-11-13). */
  faq?: { question: string; answer: string }[];
};

export const services: ServicePage[] = [
  {
    slug: "diagnostico-seguridad",
    title: "Diagnóstico de seguridad",
    eyebrow: "VISIBILIDAD ANTES DE INVERTIR",
    description: "Identifique configuraciones inseguras, riesgos prioritarios y oportunidades de mejora con un alcance proporcional a su organización.",
    promise: "Convierta incertidumbre técnica en un plan de acción claro y priorizado.",
    precioId: "esencial",
    includes: ["Revisión inicial de activos y contexto", "Evaluación de configuraciones y exposición", "Clasificación de riesgos", "Reunión de resultados"],
    deliverables: ["Informe ejecutivo", "Hallazgos priorizados", "Recomendaciones aplicables", "Hoja de ruta inicial"],
    process: [{title:"Descubrimiento",text:"Definimos objetivos, activos y restricciones."},{title:"Evaluación",text:"Revisamos los controles acordados."},{title:"Análisis",text:"Priorizamos por riesgo, impacto y esfuerzo."},{title:"Entrega",text:"Presentamos resultados y próximos pasos."}],
    related: ["hardening", "informes-tecnicos", "acompanamiento-remediacion"],
    audience: ["Pymes que necesitan conocer su nivel actual de seguridad", "Empresas antes de ampliar su operación digital", "Pymes sin responsable interno de seguridad", "Empresas que necesitan priorizar inversiones y ordenar sus controles"],
    faq: [
      { question: "¿Puede hacerse de forma remota?", answer: "Sí, cuando el alcance y los accesos autorizados lo permitan." },
      { question: "¿Incluye correcciones?", answer: "La propuesta define si incluye acompañamiento o implementación de mejoras." },
      { question: "¿La consultoría obliga a comprar productos?", answer: "No. Las recomendaciones deben justificarse por necesidad y riesgo." },
      { question: "¿Cuánto cuesta?", answer: "Los valores orientativos están publicados en la página de planes, desde $421.500 para el Diagnóstico Esencial." },
      { question: "¿Qué recibe la gerencia?", answer: "Un resumen ejecutivo, prioridades y próximos pasos, además del detalle técnico acordado." }
    ]
  },
  {
    slug: "hardening",
    title: "Hardening de sistemas",
    eyebrow: "MENOS SUPERFICIE, MÁS CONTROL",
    description: "Fortalezca equipos Windows, cuentas, navegadores, aplicaciones y configuraciones empresariales sin complicar innecesariamente la operación.",
    promise: "Reduzca oportunidades de ataque mediante configuraciones más seguras y verificables.",
    precioId: "hardening",
    includes: ["Windows y estaciones de trabajo", "Cuentas y privilegios", "Navegadores y aplicaciones", "Controles básicos de acceso"],
    deliverables: ["Configuración aplicada o recomendada", "Registro de cambios", "Lista de validación", "Plan de mantenimiento"],
    process: [{title:"Línea base",text:"Identificamos el estado actual."},{title:"Priorización",text:"Seleccionamos controles de mayor valor."},{title:"Aplicación",text:"Implementamos cambios acordados."},{title:"Verificación",text:"Comprobamos resultados y documentamos."}],
    related: ["diagnostico-seguridad", "pruebas-autorizadas", "acompanamiento-remediacion"],
    audience: ["Empresas con equipos sin una línea base común", "Organizaciones que manejan información sensible", "Pymes que quieren reducir configuraciones innecesarias"],
    faq: [
      { question: "¿Se desinstalan componentes críticos?", answer: "No se eliminan componentes críticos sin justificación, autorización y posibilidad de recuperación." },
      { question: "¿Puede adaptarse por áreas?", answer: "Sí. La línea base puede variar según funciones, aplicaciones y nivel de riesgo." }
    ]
  },
  {
    slug: "pruebas-autorizadas",
    title: "Pruebas autorizadas",
    eyebrow: "EVALUAR SIN EXCEDER EL ALCANCE",
    description: "Evalúe controles y superficies de exposición bajo autorización escrita, reglas claras y medidas destinadas a reducir riesgos operativos.",
    promise: "Conozca debilidades reales mediante pruebas controladas y documentadas.",
    includes: ["Definición de alcance", "Reglas de ejecución", "Pruebas controladas", "Registro de evidencias"],
    deliverables: ["Informe de hallazgos", "Evidencias disponibles", "Impacto y prioridad", "Recomendaciones de remediación"],
    process: [{title:"Autorización",text:"Validamos titularidad y permiso."},{title:"Alcance",text:"Definimos activos, límites y ventanas."},{title:"Pruebas",text:"Ejecutamos actividades acordadas."},{title:"Cierre",text:"Entregamos resultados y recomendaciones."}],
    related: ["diagnostico-seguridad", "informes-tecnicos", "acompanamiento-remediacion"],
    audience: ["Empresas que necesitan validar controles", "Organizaciones antes de publicar un servicio", "Pymes que requieren evidencias y prioridades"],
    faq: [
      { question: "¿Se hacen pruebas sin autorización?", answer: "No. Toda prueba requiere autorización escrita y alcance acordado." },
      { question: "¿Puede afectar la operación?", answer: "Las condiciones se diseñan para reducir el impacto, pero cualquier riesgo específico debe quedar acordado antes de iniciar." }
    ]
  },
  {
    slug: "informes-tecnicos",
    title: "Informes técnicos y ejecutivos",
    eyebrow: "EVIDENCIA QUE FACILITA DECISIONES",
    description: "Transforme hallazgos técnicos en información comprensible para responsables empresariales y equipos encargados de aplicar correcciones.",
    promise: "Entienda qué ocurre, qué importa primero y qué acción conviene tomar.",
    includes: ["Resumen ejecutivo", "Detalle técnico", "Clasificación de prioridad", "Plan de acciones"],
    deliverables: ["Documento ejecutivo", "Anexo técnico", "Matriz de hallazgos", "Sesión de presentación"],
    process: [{title:"Consolidación",text:"Organizamos las evidencias disponibles."},{title:"Análisis",text:"Evaluamos impacto y prioridad."},{title:"Redacción",text:"Separamos visión ejecutiva y técnica."},{title:"Presentación",text:"Explicamos resultados y próximos pasos."}],
    related: ["diagnostico-seguridad", "pruebas-autorizadas", "acompanamiento-remediacion"]
  },
  {
    slug: "simulacros-seguridad",
    title: "Simulacros de seguridad",
    eyebrow: "PREPARAR ANTES DEL INCIDENTE",
    description: "Realice ejercicios autorizados para fortalecer la respuesta de personas y procesos frente a situaciones de seguridad plausibles.",
    promise: "Detecte vacíos de preparación y conviértalos en oportunidades de mejora.",
    includes: ["Escenario acordado", "Objetivos de aprendizaje", "Ejecución controlada", "Retroalimentación"],
    deliverables: ["Resumen del ejercicio", "Observaciones", "Oportunidades de mejora", "Recomendaciones de preparación"],
    process: [{title:"Diseño",text:"Definimos escenario y objetivos."},{title:"Preparación",text:"Establecemos reglas y participantes."},{title:"Ejecución",text:"Realizamos el ejercicio controlado."},{title:"Lecciones",text:"Documentamos mejoras y acciones."}],
    related: ["diagnostico-seguridad", "informes-tecnicos", "acompanamiento-remediacion"]
  },
  {
    slug: "acompanamiento-remediacion",
    title: "Acompañamiento de remediación",
    eyebrow: "DEL HALLAZGO A LA MEJORA",
    description: "Priorice, aplique y verifique correcciones después de un diagnóstico, una prueba autorizada o una revisión técnica.",
    promise: "Evite que los informes terminen archivados sin producir cambios reales.",
    includes: ["Priorización conjunta", "Orientación técnica", "Seguimiento de avances", "Verificación de correcciones"],
    deliverables: ["Plan por etapas", "Registro de seguimiento", "Validación de acciones", "Estado de pendientes"],
    process: [{title:"Priorización",text:"Ordenamos tareas por riesgo y esfuerzo."},{title:"Plan",text:"Definimos responsables y etapas."},{title:"Ejecución",text:"Acompañamos la aplicación de mejoras."},{title:"Validación",text:"Comprobamos resultados y pendientes."}],
    related: ["diagnostico-seguridad", "hardening", "informes-tecnicos"]
  }
];

export const serviceBySlug = Object.fromEntries(services.map((service) => [service.slug, service]));