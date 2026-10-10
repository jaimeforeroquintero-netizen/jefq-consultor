export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  readingTime: string;
  intro: string;
  sections: { heading: string; paragraphs?: string[]; bullets?: string[] }[];
};

export const blogPosts: BlogPost[] = [
  {
    slug: "checklist-hardening-windows-11",
    title: "Checklist de hardening para Windows 11 en empresas",
    description: "Lista práctica para reforzar equipos Windows 11 y reducir configuraciones inseguras en organizaciones.",
    category: "Hardening",
    readingTime: "7 min",
    intro: "El endurecimiento debe aplicarse por capas y validarse para evitar interrupciones. Esta guía resume una ruta inicial para equipos empresariales.",
    sections: [
      { heading: "Antes de cambiar configuraciones", bullets: ["Inventariar equipos, aplicaciones y usuarios", "Confirmar copias de seguridad", "Definir una ventana de cambios", "Documentar el estado inicial"] },
      { heading: "Controles prioritarios", bullets: ["Mantener Windows y aplicaciones actualizados", "Usar cuentas sin privilegios administrativos para tareas diarias", "Activar cifrado cuando el equipo y la operación lo permitan", "Revisar firewall, protección antimalware y bloqueo de pantalla", "Eliminar software innecesario tras validar dependencias"] },
      { heading: "Validación posterior", paragraphs: ["Después de cada grupo de cambios conviene comprobar inicio de sesión, aplicaciones críticas, conectividad, impresión y recuperación. Un hardening útil debe mejorar la seguridad sin romper la operación."] }
    ]
  },
  {
    slug: "como-proteger-pyme-colombia",
    title: "Cómo fortalecer la ciberseguridad de una pyme en Colombia",
    description: "Prioridades prácticas para proteger cuentas, equipos, información y continuidad operativa de una pyme.",
    category: "Pymes",
    readingTime: "6 min",
    intro: "Una pyme no necesita empezar por herramientas costosas. El mayor avance suele venir de ordenar activos, accesos, copias y responsabilidades.",
    sections: [
      { heading: "Cinco prioridades iniciales", bullets: ["Inventario de activos y responsables", "Autenticación multifactor en cuentas críticas", "Copias de seguridad verificadas", "Actualizaciones consistentes", "Procedimiento básico para incidentes"] },
      { heading: "Decisiones proporcionales", paragraphs: ["Las medidas deben corresponder al tamaño, exposición y datos tratados por la organización. La priorización evita gastar en controles que no responden al riesgo principal."] },
      { heading: "Qué debe entregar una evaluación", bullets: ["Resumen ejecutivo", "Hallazgos con evidencia", "Prioridad de corrección", "Acciones recomendadas", "Plan de seguimiento"] }
    ]
  },
  {
    slug: "phishing-empresarial-senales",
    title: "Señales de phishing empresarial que conviene revisar",
    description: "Indicadores comunes para analizar mensajes sospechosos sin exponer cuentas ni dispositivos.",
    category: "Phishing",
    readingTime: "5 min",
    intro: "Los mensajes fraudulentos suelen combinar urgencia, suplantación y enlaces diseñados para capturar credenciales o inducir pagos.",
    sections: [
      { heading: "Señales frecuentes", bullets: ["Dominio del remitente similar pero no idéntico", "Solicitud inesperada de credenciales o pagos", "Enlaces cuyo destino no coincide con el texto", "Archivos adjuntos no solicitados", "Cambios repentinos en instrucciones bancarias"] },
      { heading: "Respuesta segura", bullets: ["No abrir enlaces ni adjuntos", "Confirmar por un canal independiente", "Reportar el mensaje", "Cambiar credenciales si fueron introducidas", "Revisar sesiones y autenticación multifactor"] },
      { heading: "Simulaciones autorizadas", paragraphs: ["Una simulación empresarial debe contar con autorización, alcance, protección de datos y una estrategia educativa. El objetivo es mejorar procesos, no señalar personas."] }
    ]
  },
  {
    slug: "seguridad-microsoft-365-pyme",
    title: "Seguridad básica de Microsoft 365 para pymes",
    description: "Controles iniciales para fortalecer identidades, correo y colaboración en entornos Microsoft 365.",
    category: "Microsoft 365",
    readingTime: "6 min",
    intro: "Las identidades y el correo suelen concentrar buena parte del riesgo. Una revisión ordenada permite priorizar cuentas, permisos y mecanismos de recuperación.",
    sections: [
      { heading: "Controles iniciales", bullets: ["Autenticación multifactor", "Revisión de administradores", "Métodos de recuperación controlados", "Alertas y registros disponibles", "Reglas de reenvío y aplicaciones conectadas"] },
      { heading: "Permisos", paragraphs: ["Los privilegios deben limitarse a las funciones necesarias. También conviene revisar cuentas inactivas, invitados y aplicaciones con acceso a información corporativa."] },
      { heading: "Continuidad", bullets: ["Inventario de cuentas críticas", "Procedimiento de recuperación", "Responsables alternos", "Respaldo de información esencial según la necesidad del negocio"] }
    ]
  },
  {
    slug: "copias-seguridad-empresa",
    title: "Copias de seguridad empresariales: qué conviene verificar",
    description: "Guía para revisar alcance, aislamiento, retención y restauración de copias de seguridad.",
    category: "Continuidad",
    readingTime: "5 min",
    intro: "Una copia no está validada hasta que la organización demuestra que puede restaurar información útil dentro de un tiempo aceptable.",
    sections: [
      { heading: "Aspectos esenciales", bullets: ["Qué información se respalda", "Frecuencia y retención", "Separación de credenciales", "Copia fuera del equipo principal", "Pruebas periódicas de restauración"] },
      { heading: "Riesgos comunes", bullets: ["Copias conectadas permanentemente", "Errores silenciosos", "Falta de cifrado cuando es necesario", "Dependencia de una sola persona", "Ausencia de documentación"] },
      { heading: "Evidencia de recuperación", paragraphs: ["Registre fecha, alcance, resultado y tiempo de cada prueba. Esa evidencia permite mejorar el procedimiento y detectar vacíos antes de un incidente real."] }
    ]
  }
];

export type LocalPage = {
  slug: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  points: string[];
};

export const localPages: LocalPage[] = [
  {
    slug: "ciberseguridad-bogota",
    title: "Ciberseguridad para empresas en Bogotá | JEFQ Consultor",
    description: "Consultoría, diagnóstico, hardening y pruebas autorizadas para empresas en Bogotá.",
    heading: "Ciberseguridad para empresas en Bogotá",
    intro: "Acompañamiento remoto para identificar riesgos, priorizar mejoras y fortalecer equipos, cuentas y procesos.",
    points: ["Valoración inicial", "Alcance autorizado", "Informes técnicos y ejecutivos", "Plan de remediación", "Atención directa"]
  },
  {
    slug: "ciberseguridad-colombia",
    title: "Servicios de ciberseguridad en Colombia | JEFQ Consultor",
    description: "Servicios remotos de ciberseguridad para pymes y organizaciones en Colombia.",
    heading: "Ciberseguridad remota para organizaciones en Colombia",
    intro: "Evaluaciones proporcionales y documentadas para organizaciones que necesitan una ruta clara de mejora.",
    points: ["Cobertura nacional remota", "Diagnóstico de seguridad", "Hardening", "Pruebas controladas", "Acompañamiento"]
  },
  {
    slug: "consultor-ciberseguridad-bogota",
    title: "Consultor de ciberseguridad en Bogotá | Jaime Forero",
    description: "Consultoría directa en ciberseguridad para empresas y pymes en Bogotá y Colombia.",
    heading: "Consultoría directa de ciberseguridad en Bogotá",
    intro: "Atención con Jaime Forero para convertir hallazgos técnicos en decisiones comprensibles y priorizadas.",
    points: ["Atención directa", "Lenguaje claro", "Evidencia y prioridad", "Alcance proporcional", "Seguimiento"]
  }
];