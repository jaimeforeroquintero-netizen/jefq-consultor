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
];
