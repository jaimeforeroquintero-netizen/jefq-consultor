export interface HerramientaProbada {
  slug: string;
  nombre: string;
  fecha: string;
  categoria: string;
  queEs: string;
  paraQuien: string[];
  loBueno: string[];
  limitaciones: string[];
  veredicto: string;
  fuente: { texto: string; url: string };
}

export const herramientasProbadas: HerramientaProbada[] = [
  {
    slug: "strix",
    nombre: "Strix",
    fecha: "Octubre 2026",
    categoria: "Pruebas de penetración con inteligencia artificial",
    queEs:
      "Strix es una herramienta gratuita y de código abierto que pone a un equipo de agentes de inteligencia artificial a intentar hackear su propia aplicación, antes de que lo haga un delincuente. Cada hueco que encuentra lo demuestra con una prueba funcional, no con teoría. Funciona por línea de comandos, se ejecuta en un entorno aislado (Docker) y necesita una clave de un modelo de IA para operar. También existe una versión en la nube con panel para equipos.",
    paraQuien: [
      "Empresas de software que quieren revisar su aplicación antes de lanzarla",
      "Equipos de TI que necesitan una primera capa de revisión automática y repetible",
      "Dueños de pyme: no es para operarla usted mismo, es para exigirle a su proveedor de TI que use este tipo de herramientas",
    ],
    loBueno: [
      "Valida cada hallazgo con una prueba real de explotación, no solo reporta sospechas",
      "Automatiza lo que antes exigía horas de un especialista, y se puede repetir en cada despliegue",
      "Código abierto (licencia Apache 2.0): se puede auditar lo que hace por dentro",
      "Genera reportes en formatos estándar (Markdown, JSON, SARIF) listos para un plan de remediación",
    ],
    limitaciones: [
      "No reemplaza una prueba de penetración profesional en sistemas críticos: el juicio humano sigue mandando",
      "La opera un técnico; no es una herramienta para el dueño de negocio sin equipo de TI",
      "Cada análisis consume llamadas al modelo de IA, lo que tiene un costo por uso",
      "Solo debe usarse sobre aplicaciones propias o con autorización explícita y por escrito",
    ],
    veredicto:
      "Prometedora como primera capa de defensa automatizada: encuentra lo explotable de verdad y lo demuestra. Pero un robot no entiende el impacto en su negocio ni decide qué arreglar primero. Ahí es donde entra el criterio profesional. En JEFQ la vemos como complemento del análisis humano, nunca como reemplazo.",
    fuente: { texto: "Repositorio oficial: github.com/usestrix/strix", url: "https://github.com/usestrix/strix" },
  },
  {
    slug: "garak",
    nombre: "garak",
    fecha: "Noviembre 2026",
    categoria: "Seguridad de inteligencia artificial (pruebas a modelos de lenguaje)",
    queEs:
      "garak es un escáner gratuito y de código abierto, mantenido por NVIDIA, que pone a prueba un chatbot o un modelo de inteligencia artificial para ver si se le puede engañar. Le lanza cientos de preguntas tramposas —intentos de sacarle datos, de hacerlo decir cosas prohibidas o de inventar información— y anota cuáles funcionaron. Es como un examen de resistencia para la IA de su empresa, antes de que un atacante lo haga de verdad.",
    paraQuien: [
      "Empresas que ya usan un chatbot o un asistente de IA para atender clientes o empleados",
      "Equipos de TI y de seguridad que quieren revisar su IA antes de lanzarla o después de cada cambio",
      "Dueños de pyme sin equipo técnico: no es para operarla usted mismo, es para exigirle a su proveedor de IA que demuestre que su chatbot pasó esta prueba",
    ],
    loBueno: [
      "Prueba decenas de fallas conocidas: inyección de instrucciones, fuga de datos, jailbreaks, alucinaciones y toxicidad",
      "Gratis y de código abierto (licencia Apache 2.0): cualquiera puede revisar lo que hace por dentro",
      "Funciona con casi cualquier modelo: OpenAI, Hugging Face, AWS Bedrock, modelos locales y cualquier sistema por REST",
      "Entrega un reporte con los intentos que funcionaron, listo para corregirlos, y se puede repetir en cada cambio del modelo",
    ],
    limitaciones: [
      "La opera un técnico por línea de comandos; no es una herramienta para el dueño de negocio sin equipo de TI. Además, si el modelo es comercial, cada prueba consume créditos de la API",
      "Un resultado limpio no significa que el modelo sea seguro: solo dice que esas pruebas no funcionaron ese día",
      "Sus detectores a veces marcan falsos positivos y garak no corrige nada: cada hallazgo hay que revisarlo a mano antes de actuar",
      "Solo debe usarse sobre modelos y sistemas propios o con autorización explícita y por escrito",
    ],
    veredicto:
      "Si su empresa ya habla con clientes a través de una IA, garak es la forma más barata y seria de saber si esa IA se puede manipular antes de que alguien lo haga en serio. No es magia ni es una certificación: es un examen honesto que muestra dónde falla el modelo. En JEFQ lo vemos como el primer paso obligatorio antes de poner un chatbot frente a sus clientes, y como complemento del análisis humano, que es el que decide qué riesgo importa de verdad.",
    fuente: { texto: "Repositorio oficial: github.com/NVIDIA/garak", url: "https://github.com/NVIDIA/garak" },
  },
];
