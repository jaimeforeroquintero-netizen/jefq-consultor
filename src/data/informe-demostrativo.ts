// Fuente única del informe demostrativo (M3).
// Los 5 hallazgos, sus prioridades, áreas y textos son los mismos que
// publicaba src/pages/informe-demostrativo.astro: se movieron aquí
// VERBATIM para que la muestra visual (InformeMuestra.astro) y la página
// completa compartan una sola fuente y ningún texto pueda divergir.
// Nada de este archivo corresponde a un cliente real: todo es ilustrativo.
export interface HallazgoDemo {
  id: string;
  priority: "Alta" | "Media" | "Baja";
  area: string;
  actions: number;
  observation: string;
  impact: string;
  evidence: string;
  recommendation: string;
  benefit: string;
}

export const NIVEL_GENERAL_DEMO = "MEDIO";

export const findings: HallazgoDemo[] = [
  {
    id: "H-01", priority: "Alta", area: "Control de acceso", actions: 3,
    observation: "Cuentas de uso cotidiano mantienen privilegios administrativos superiores a los necesarios.",
    impact: "Aumenta la superficie de exposición y la posibilidad de cambios críticos no autorizados.",
    evidence: "Muestra redactada: pertenencia a grupos administrativos detectada en cuentas de operación habitual.",
    recommendation: "Separar las cuentas administrativas, aplicar privilegio mínimo y revisar periódicamente los grupos con permisos elevados.",
    benefit: "Mayor control sobre cambios críticos y menor exposición ante el compromiso de una cuenta de uso diario."
  },
  {
    id: "H-02", priority: "Alta", area: "Exposición externa", actions: 3,
    observation: "Un servicio publicado en Internet presenta una configuración que requiere validación de necesidad, restricción de origen y actualización.",
    impact: "Amplía la superficie visible desde el exterior y puede facilitar intentos de acceso no autorizado.",
    evidence: "Muestra redactada: servicio accesible desde redes externas durante una revisión autorizada del alcance público.",
    recommendation: "Confirmar la necesidad del servicio, limitar orígenes permitidos, revisar versiones y aplicar controles de autenticación adecuados.",
    benefit: "Reducción de exposición innecesaria y mejor control de los servicios accesibles desde Internet."
  },
  {
    id: "H-03", priority: "Media", area: "Configuración", actions: 2,
    observation: "Los equipos revisados no comparten una línea base homogénea de configuración.",
    impact: "Dificulta mantener controles consistentes y aumenta el riesgo de configuraciones débiles o divergentes.",
    evidence: "Muestra redactada: diferencias observadas en ajustes de seguridad, actualizaciones y políticas locales.",
    recommendation: "Definir una línea base mínima, documentarla y verificar su aplicación periódicamente.",
    benefit: "Mayor consistencia operativa y reducción de errores de configuración."
  },
  {
    id: "H-04", priority: "Media", area: "Identidad y autenticación", actions: 2,
    observation: "La autenticación reforzada no está aplicada de forma uniforme en las cuentas relevantes.",
    impact: "Una credencial comprometida puede ofrecer acceso directo cuando no existe un segundo factor adecuado.",
    evidence: "Muestra redactada: cobertura parcial de autenticación multifactor en cuentas incluidas en el alcance.",
    recommendation: "Priorizar MFA en cuentas administrativas, correo y servicios críticos; documentar excepciones temporales.",
    benefit: "Mayor resistencia frente al robo y reutilización de credenciales."
  },
  {
    id: "H-05", priority: "Baja", area: "Continuidad", actions: 2,
    observation: "Las copias de seguridad existen, pero no hay evidencia reciente de una prueba documentada de restauración.",
    impact: "La disponibilidad de archivos de copia no garantiza que la recuperación sea completa ni oportuna.",
    evidence: "Muestra redactada: copias identificadas sin registro reciente de restauración controlada.",
    recommendation: "Programar una prueba de restauración, registrar resultados y definir responsables y frecuencia.",
    benefit: "Mayor confianza en la capacidad de recuperación ante pérdida, error o incidente."
  }
];

export const totalActions = findings.reduce((sum, item) => sum + item.actions, 0);

export const counts = {
  high: findings.filter((item) => item.priority === "Alta").length,
  medium: findings.filter((item) => item.priority === "Media").length,
  low: findings.filter((item) => item.priority === "Baja").length
};
