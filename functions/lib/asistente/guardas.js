// Guardas deterministas del asistente V2.10.
// Implementa la normalización y las guardas C9 como guarda secundaria: la
// garantía principal es el contrato estructurado, no el conteo léxico.

const TILDES = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u', 'ñ': 'n' };

const CARDINALES = [
  ['treinta y un', '31'], ['treinta y uno', '31'],
  ['uno', '1'], ['dos', '2'], ['tres', '3'], ['cuatro', '4'], ['cinco', '5'],
  ['seis', '6'], ['siete', '7'], ['ocho', '8'], ['nueve', '9'], ['diez', '10'],
  ['once', '11'], ['doce', '12'], ['trece', '13'], ['catorce', '14'], ['quince', '15'],
  ['dieciseis', '16'], ['diecisiete', '17'], ['dieciocho', '18'], ['diecinueve', '19'],
  ['veinte', '20'], ['veintiun', '21'], ['veintiuno', '21'], ['veintidos', '22'],
  ['veintitres', '23'], ['veinticuatro', '24'], ['veinticinco', '25'],
  ['veintiseis', '26'], ['veintisiete', '27'], ['veintiocho', '28'],
  ['veintinueve', '29'], ['treinta', '30'],
  ['cuarenta', '40'], ['cincuenta', '50'], ['sesenta', '60'], ['setenta', '70'],
  ['ochenta', '80'], ['noventa', '90'], ['cien', '100'],
];

export function quitarTildes(texto) {
  return String(texto || '').replace(/[áéíóúüñ]/g, (c) => TILDES[c]);
}

export function normalizar(texto) {
  let t = quitarTildes(String(texto || '').toLowerCase());
  for (const [palabra, digito] of CARDINALES) {
    t = t.replace(new RegExp('\\b' + palabra.replace(/ /g, '\\s+') + '\\b', 'g'), digito);
  }
  return t;
}

// Normalización para alias y fragmentos: además de tildes y minúsculas,
// convierte puntuación en espacios y colapsa espacios. No convierte
// cardinales, porque un fragmento debe seguir siendo reconocible en el
// mensaje actual.
export function normalizarParaCoincidencia(texto) {
  return quitarTildes(String(texto || '').toLowerCase())
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNIDAD = '(?:ano|mes|semana|dia|anos|meses|semanas|dias|hora|horas|minuto|minutos|trimestre|trimestres|semestre|semestres)';
const UNIDAD_NUM = '(?:dias?|mes(?:es)?|anos?|semanas?|horas?|minutos?|trimestres?|semestres?)';
const ORDINAL = '(?:primer|primera|segundo|segunda|tercer|tercera|cuarto|cuarta|quinto|quinta|sexto|sexta|septimo|septima|octavo|octava|noveno|novena|decimo|decima)';
const ARTICULO = '(?:un|una|el|la|los|las)';

const PATRONES_DURACION = [
  '\\b\\d+\\s*' + UNIDAD_NUM + '\\b',
  '\\bdurante\\s+\\d+\\s*' + UNIDAD_NUM + '\\b',
  '\\bpor\\s+\\d+\\s*' + UNIDAD_NUM + '\\b',
  '\\bdurante\\s+' + ARTICULO + '\\s+(\\d+\\s*)?' + UNIDAD + '\\b',
  '\\bpor\\s+(un|una)\\s+(?:ano|mes|semana|dia|hora|minuto|trimestre|semestre)\\b',
  '\\bdurante\\s+(?:el|la|los|las)\\s+' + ORDINAL + '\\s+' + UNIDAD + '\\b',
  '\\bpor\\s+un\\s+periodo\\s+de(?:\\s+(?:un|una|el|la)|l)?\\s*(\\d+\\s*)?' + UNIDAD + '\\b',
  '\\b(?:con\\s+)?vigencia\\s+(?:anual|mensual|semanal|diaria|trimestral|semestral)\\b',
  '\\ba\\s+lo\\s+largo\\s+(?:del|de\\s+la|de\\s+los|de\\s+las|de\\s+' + ARTICULO + '?)\\s*(\\d+\\s*)?' + ORDINAL + '?\\s*' + UNIDAD + '\\b',
  '\\b(?:vigencia|duracion)\\s+de(?:\\s+(?:un|una|el|la|los|las)|l)?\\s*(\\d+\\s*)?' + ORDINAL + '?\\s*' + UNIDAD + '\\b',
  '\\b(?:durante\\s+)?(?:todos?|todas?)\\s+(?:el|la|los|las)\\s+' + ORDINAL + '?\\s*' + UNIDAD + '\\b',
  '\\bplazo\\s+de(?:\\s+(?:un|una|el|la|los|las)|l)?\\s*(\\d+\\s*)?' + ORDINAL + '?\\s*' + UNIDAD + '\\b',
  '\\b(?:el|la|los|las)\\s+' + ORDINAL + '\\s+' + UNIDAD + '\\b',
  '\\bduracion\\s+(?:anual|mensual|semanal|diaria|trimestral|semestral)\\b',
  '\\b(?:dura|duran)\\s+(?:un|una|el|la|los|las|\\d+)\\s*' + UNIDAD + '\\b',
  '\\b\\d+\\s*\\(\\d+\\)\\s*' + UNIDAD + '\\b',
  '\\b(?:un|una)\\s*\\(\\d+\\)\\s*' + UNIDAD + '\\b',
  '\\b\\d+\\s*\\((?:un|una)\\)\\s*' + UNIDAD + '\\b',
  '\\b(?:medio|media)\\s*' + UNIDAD + '\\b',
  '\\b(?:un|una|\\d+)\\s*' + UNIDAD + '\\s+de\\s+soporte\\b',
  '\\bsoporte\\s+de\\s+(?:un|una|\\d+)\\s*' + UNIDAD + '\\b',
].map((src) => new RegExp(src, 'g'));

export function contarDuracion(textoNormalizado) {
  const todas = [];
  PATRONES_DURACION.forEach((re, i) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(textoNormalizado)) !== null) {
      todas.push({ inicio: m.index, fin: m.index + m[0].length, patron: i + 1, texto: m[0] });
      if (m[0].length === 0) re.lastIndex++;
    }
  });
  todas.sort((a, b) => (a.inicio - b.inicio) || (b.fin - a.fin));
  const aceptadas = [];
  for (const c of todas) {
    if (!aceptadas.some((a) => c.inicio < a.fin && a.inicio < c.fin)) aceptadas.push(c);
  }
  let extra = 0;
  for (const c of aceptadas) {
    if (c.patron === 16) {
      const m = c.texto.match(/(\d+)\s*\((\d+)\)/);
      if (m && m[1] !== m[2]) extra++;
    }
  }
  return { conteo: aceptadas.length + extra, aceptadas };
}

const RE_DINERO = /\$\s?[\d.]+|\b\d[\d.]*\s*pesos\b|\bcop\s*\d[\d.]*|\b\d+\s*mil\s+pesos\b/g;
const RAICES_CONDICION = ['descuent', 'acuerd', 'condicion', 'incluy', 'incluid'];
const PALABRAS_CONDICION = ['gratis', 'anticipo', 'depósito', 'reembolso', 'devolución'].map((p) => normalizar(p));

export function contarDinero(textoNormalizado) {
  return (textoNormalizado.match(RE_DINERO) || []).length;
}

function quitarEtiquetasDeCampo(textoNormalizado, campo) {
  let t = textoNormalizado;
  // La locución «de acuerdo» no es un acuerdo comercial.
  t = t.replace(/\bde\s+acuerdo\b/g, 'segun');
  if (campo === 'cobertura') {
    // La plantilla nombra el campo; esa etiqueta no es un dato adicional.
    t = t.replace(/\bincluy\w*\b/g, 'contiene').replace(/\bincluid\w*\b/g, 'contenido');
  }
  return t;
}

export function contarCondicion(textoNormalizado, dinero, duracion, opciones = {}) {
  const t = quitarEtiquetasDeCampo(textoNormalizado, opciones.campo);
  let n = 0;
  for (const r of RAICES_CONDICION) {
    n += (t.match(new RegExp('\\b' + r + '\\w*', 'g')) || []).length;
  }
  for (const p of PALABRAS_CONDICION) {
    n += (t.match(new RegExp('\\b' + p + '\\b', 'g')) || []).length;
  }
  if (/\bmantenimiento\b/.test(t) && (dinero >= 1 || duracion >= 1)) n++;
  return n;
}

export function contarServicio(textoNormalizado, aliasServicio = []) {
  const todas = [];
  for (const alias of aliasServicio) {
    const s = normalizarParaCoincidencia(alias);
    if (!s) continue;
    const re = new RegExp('\\b' + s.replace(/ /g, '\\s+') + '\\b', 'g');
    let m;
    while ((m = re.exec(textoNormalizado)) !== null) {
      todas.push({ inicio: m.index, fin: m.index + m[0].length, alias: s });
    }
  }
  todas.sort((a, b) => (a.inicio - b.inicio) || (b.fin - a.fin));
  const aceptadas = [];
  for (const c of todas) {
    if (!aceptadas.some((a) => c.inicio < a.fin && a.inicio < c.fin)) aceptadas.push(c);
  }
  return aceptadas.length;
}

export function esAtomica(dinero, duracion, condicion, servicio) {
  return (dinero + duracion + condicion) <= 1 && servicio <= 1;
}

export function analizarGuardas(texto, opciones = {}) {
  const norm = normalizar(texto);
  const dinero = contarDinero(norm);
  const duracion = contarDuracion(norm).conteo;
  const condicion = contarCondicion(norm, dinero, duracion, opciones);
  const servicio = contarServicio(norm, opciones.aliasServicio || []);
  return {
    normalizado: norm,
    dinero,
    duracion,
    condicion,
    servicio,
    atomica: esAtomica(dinero, duracion, condicion, servicio),
  };
}

function montoAEntero(textoMonto) {
  const limpio = String(textoMonto).replace(/[^0-9]/g, '');
  return limpio ? Number.parseInt(limpio, 10) : NaN;
}

export function extraerMontos(texto) {
  const norm = normalizar(texto);
  const montos = [];
  const re = /\$\s?[\d.]+|\b\d[\d.]*\s*pesos\b|\bcop\s*\d[\d.]*|\b\d+\s*mil\s+pesos\b/g;
  let m;
  while ((m = re.exec(norm)) !== null) {
    let valor = montoAEntero(m[0]);
    if (/\bmil\s+pesos\b/.test(m[0])) valor = montoAEntero(m[0]) * 1000;
    montos.push({ texto: m[0], valor });
  }
  return montos;
}

export function puertaNumerica(texto, registro, afirmacion = null) {
  const norm = normalizar(texto);
  const motivos = [];
  const montos = extraerMontos(texto);
  const preciosRegistro = new Set();
  for (const entrada of registro?.entradas || []) {
    if (Number.isInteger(entrada.precio)) preciosRegistro.add(entrada.precio);
  }
  if (/\b\d+(?:[.,]\d+)?\s*%/.test(norm) || /\b\d+\s+por\s+ciento\b/.test(norm)) {
    motivos.push('porcentaje-sin-registro');
  }
  if (/\b(?:la\s+mitad|un\s+tercio|un\s+cuarto|medio\s+precio)\b/.test(norm)) {
    motivos.push('fraccion-sin-registro');
  }
  if (afirmacion?.campo === 'precio') {
    if (montos.length !== 1 || montos[0].valor !== afirmacion.valor) motivos.push('precio-no-coincide-con-afirmacion');
  } else {
    for (const monto of montos) {
      if (!preciosRegistro.has(monto.valor)) motivos.push('precio-fuera-del-registro');
    }
    if (montos.length > 1) motivos.push('mas-de-un-precio');
  }
  return { ok: motivos.length === 0, montos, motivos };
}

export function validarTextoComercial(texto, registro, opciones = {}) {
  const guardas = analizarGuardas(texto, opciones);
  const puerta = puertaNumerica(texto, registro, opciones.afirmacion || null);
  const motivos = [...puerta.motivos];
  // La cobertura renderizada desde el registro es una lista por diseño; la
  // atomicidad no aplica a ese campo (la puerta numérica sí).
  if (!guardas.atomica && opciones.afirmacion?.campo !== 'cobertura') motivos.push('no-atomica');
  return { ok: motivos.length === 0, guardas, puerta, motivos };
}
