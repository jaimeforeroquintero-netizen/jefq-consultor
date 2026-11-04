// Fuente única de precios (autoría) — JEFQ Consultor.
// Precios S1 vigentes (escenario S1, retefuente 1,5%).
// REGLA: cambiar un precio AQUÍ y verificar todas las superficies con
// `node scripts/verificar-precios.mjs` antes de desplegar.
// LÍMITE CONOCIDO: las Functions de Cloudflare (functions/, api/) y
// public/llms.txt NO pueden importar este archivo (frontera Astro estático /
// Workers / archivo estático). Sus valores son espejos verificados por el
// script (fases B/C/D preparadas, no ejecutadas en este bloque).

export type Precio = {
  id: string;
  /** Clave Wompi para el pago por botón; null = no se vende por botón. */
  producto: string | null;
  /** Nombre canónico del plan o servicio. */
  nombre: string;
  /** Nombre en la oferta del JSON-LD (solo planes). */
  nombreOferta?: string;
  /** Cifra única en COP. Si falta, se deriva de `basadoEn` (nunca literal dos veces). */
  precioDesdeCOP?: number;
  /** Entrada de la que deriva el precio cuando no tiene cifra propia. */
  basadoEn?: string;
  unidad: "proyecto" | "hora" | "servicio";
  destacado?: boolean;
  /** Descripción corta (JSON-LD / llms.txt). */
  descripcion: string;
  /** Texto de la tarjeta del plan en la home. */
  texto?: string;
  /** Qué incluye el plan (tarjeta de la home; el chatbot lo redacta en prosa). */
  incluye: string[];
};

export const PRECIOS: Precio[] = [
  {
    id: "esencial",
    producto: "esencial",
    nombre: "Diagnóstico Esencial",
    nombreOferta: "Plan Esencial",
    precioDesdeCOP: 421500,
    unidad: "proyecto",
    descripcion: "Diagnóstico de ciberseguridad para pymes en Colombia.",
    texto: "Punto de partida para profesionales y microempresas.",
    incluye: ["Reunión remota", "Hasta 3 equipos", "Riesgos prioritarios", "Informe ejecutivo", "Sesión de resultados"],
  },
  {
    id: "pyme",
    producto: "pyme",
    nombre: "Evaluación Pyme",
    nombreOferta: "Plan Pyme",
    precioDesdeCOP: 960500,
    unidad: "proyecto",
    destacado: true,
    descripcion: "Diagnóstico ampliado con priorización y acompañamiento.",
    texto: "Evaluación ampliada con ruta de mejora.",
    incluye: ["Alcance autorizado", "Hasta 10 activos", "Revisión de configuraciones", "Informe técnico y ejecutivo", "Plan de remediación", "Acompañamiento"],
  },
  {
    id: "integral",
    producto: "integral",
    nombre: "Seguridad Integral",
    nombreOferta: "Plan Integral",
    precioDesdeCOP: 1930500,
    unidad: "proyecto",
    descripcion: "Cobertura integral: diagnóstico, pruebas autorizadas, hardening e informes.",
    texto: "Fortalecimiento por capas y seguimiento.",
    incluye: ["Alcance personalizado", "Evaluación autorizada", "Hardening priorizado", "Evidencias", "Plan por etapas", "Dos seguimientos"],
  },
  {
    id: "consultoria-hora",
    producto: null,
    nombre: "Consultoría remota",
    precioDesdeCOP: 130500,
    unidad: "hora",
    descripcion: "Consultoría remota por hora.",
    incluye: [],
  },
  {
    id: "hardening",
    producto: null,
    nombre: "Hardening de sistemas",
    precioDesdeCOP: 313500,
    unidad: "servicio",
    descripcion: "Hardening de sistemas.",
    incluye: [],
  },
  {
    id: "evaluacion-ia",
    producto: null,
    nombre: "Seguridad para IA",
    // Sin cifra propia: es el mismo punto de partida que el Diagnóstico
    // Esencial, reutilizado. Deriva de "esencial"; nunca escribir 421500 dos veces.
    basadoEn: "esencial",
    unidad: "servicio",
    descripcion: "Evaluación del uso de herramientas de IA.",
    incluye: [],
  },
];

export function precioDe(id: string): number {
  const p = PRECIOS.find((x) => x.id === id);
  if (!p) throw new Error(`Precio desconocido: ${id}`);
  if (p.basadoEn) return precioDe(p.basadoEn);
  if (p.precioDesdeCOP === undefined) throw new Error(`Precio sin cifra ni base: ${id}`);
  return p.precioDesdeCOP;
}

export function formatearCOP(n: number): string {
  return "$" + n.toLocaleString("es-CO");
}

export function centavos(n: number): number {
  return n * 100;
}

/** Ofertas del JSON-LD (los 3 planes con botón de pago), en el formato actual. */
export function offersJSONLD() {
  return PRECIOS.filter((p) => p.producto).map((p) => ({
    "@type": "Offer",
    name: p.nombreOferta ?? p.nombre,
    price: String(precioDe(p.id)),
    priceCurrency: "COP",
    description: p.descripcion,
  }));
}

/** Líneas de precios para el prompt del chatbot (fase C, preparada). */
export function lineasParaChat(): string {
  const f = (id: string) => `${PRECIOS.find((x) => x.id === id)!.nombre}: desde ${formatearCOP(precioDe(id))}`;
  return [
    `- ${f("esencial")}.`,
    `- ${f("pyme")} (el recomendado para pymes).`,
    `- ${f("integral")}.`,
    `- Servicios puntuales: consultoría remota desde ${formatearCOP(precioDe("consultoria-hora"))}/hora; hardening de sistemas desde ${formatearCOP(precioDe("hardening"))}.`,
  ].join("\n");
}
