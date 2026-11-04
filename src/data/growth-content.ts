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
    description: "Checklist práctico para reforzar equipos Windows 11 en empresas: controles prioritarios, validación posterior y reducción de configuraciones inseguras.",
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
    description: "Cómo fortalecer la ciberseguridad de una pyme en Colombia: prioridades prácticas para proteger cuentas, equipos, información y continuidad operativa.",
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
    description: "Señales de phishing empresarial: indicadores comunes para analizar mensajes sospechosos sin exponer las cuentas ni los dispositivos de su empresa.",
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
    description: "Seguridad básica de Microsoft 365 para pymes: controles iniciales para fortalecer identidades, correo electrónico y colaboración en su organización.",
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
    description: "Copias de seguridad empresariales: guía para revisar alcance, aislamiento, retención y restauración efectiva de la información de su empresa.",
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

/* Las páginas locales (ciberseguridad-bogota, ciberseguridad-colombia,
   consultor-ciberseguridad-bogota) eran tres variantes casi idénticas del
   mismo texto (Jaccard 0,87-0,89) generadas por [local].astro. Se fusionaron
   en una sola página real: src/pages/ciberseguridad-bogota.astro, con las
   otras dos redirigidas (301) en public/_redirects. No recrear variantes
   locales sin contenido propio y diferenciado. */