// Registro canónico y selector determinista de afirmaciones comerciales.
// El modelo no elige id, campo ni valor: este módulo es el productor.

import { analizarGuardas, normalizarParaCoincidencia, validarTextoComercial } from './guardas.js';

export const RESPUESTA_FIJA_CONDICION = 'No tengo un registro verificable de ese acuerdo, descuento o condición especial. Para confirmarlo, por favor comuníquese directamente con JEFQ Consultor.';
export const RESPUESTA_CERRADA = 'No puedo verificar eso con la información publicada. Puede escribir por WhatsApp con el botón del sitio para que Jaime lo revise.';
export const RESPUESTA_SIN_VERIFICAR = 'No tengo información verificable en el sitio para responder eso. Puede escribir por WhatsApp con el botón del sitio para que Jaime lo revise.';
export const RESPUESTA_PRECIO_DESACTIVADA = 'En este momento no puedo confirmar precios por este medio. Para cotizar, por favor comuníquese directamente con JEFQ Consultor por WhatsApp con el botón del sitio.';

export const REGISTRO_V210 = {
  version: 2,
  fuente: 'src/data/precios.ts',
  fuente_hash: '6bea7a666c07271fd1ddfa8afb551f29c8782e7b511b35fafc29a29ec5fa298c',
  moneda: 'COP',
  descuentos: [],
  acuerdos: 'ninguno',
  vigencia: 'vigente',
  entradas: [
    {
      id: 'svc-diagnostico', tipo: 'servicio', nombre: 'Diagnóstico',
      alias: ['Diagnóstico', 'Diagnósticos', 'Diagnóstico de seguridad'],
      precio: null, tipo_precio: null, unidad: null, moneda: 'COP',
      descripcion: 'Identifique configuraciones inseguras, riesgos prioritarios y oportunidades de mejora con un alcance proporcional a su organización.',
      cobertura: ['Revisión inicial de activos y contexto', 'Evaluación de configuraciones y exposición', 'Clasificación de riesgos', 'Reunión de resultados'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'svc-pruebas-autorizadas', tipo: 'servicio', nombre: 'Pruebas autorizadas',
      alias: ['Pruebas autorizadas', 'Prueba autorizada'],
      precio: null, tipo_precio: null, unidad: null, moneda: 'COP',
      descripcion: 'Evalúe controles y superficies de exposición bajo autorización escrita, reglas claras y medidas destinadas a reducir riesgos operativos.',
      cobertura: ['Definición de alcance', 'Reglas de ejecución', 'Pruebas controladas', 'Registro de evidencias'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'svc-hardening', tipo: 'servicio', nombre: 'Hardening',
      alias: ['Hardening', 'Hardening de sistemas'],
      precio: null, tipo_precio: null, unidad: null, moneda: 'COP',
      descripcion: 'Fortalezca equipos Windows, cuentas, navegadores, aplicaciones y configuraciones empresariales sin complicar innecesariamente la operación.',
      cobertura: ['Windows y estaciones de trabajo', 'Cuentas y privilegios', 'Navegadores y aplicaciones', 'Controles básicos de acceso'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'svc-informes', tipo: 'servicio', nombre: 'Informes',
      alias: ['Informes', 'Informe', 'Informes técnicos', 'Informe técnico', 'Informes ejecutivos'],
      precio: null, tipo_precio: null, unidad: null, moneda: 'COP',
      descripcion: 'Transforme hallazgos técnicos en información comprensible para responsables empresariales y equipos encargados de aplicar correcciones.',
      cobertura: ['Resumen ejecutivo', 'Detalle técnico', 'Clasificación de prioridad', 'Plan de acciones'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'svc-simulacros', tipo: 'servicio', nombre: 'Simulacros',
      alias: ['Simulacros', 'Simulacro', 'Simulacros de seguridad', 'Simulacro de seguridad', 'Simulacros de phishing'],
      precio: null, tipo_precio: null, unidad: null, moneda: 'COP',
      descripcion: 'Realice ejercicios autorizados para fortalecer la respuesta de personas y procesos frente a situaciones de seguridad plausibles.',
      cobertura: ['Escenario acordado', 'Simulacros de phishing', 'Objetivos de aprendizaje', 'Ejecución controlada', 'Retroalimentación'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'svc-acompanamiento', tipo: 'servicio', nombre: 'Acompañamiento',
      alias: ['Acompañamiento', 'Acompañamiento de remediación', 'Remediación'],
      precio: null, tipo_precio: null, unidad: null, moneda: 'COP',
      descripcion: 'Priorice, aplique y verifique correcciones después de un diagnóstico, una prueba autorizada o una revisión técnica.',
      cobertura: ['Priorización conjunta', 'Orientación técnica', 'Seguimiento de avances', 'Verificación de correcciones'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'svc-seguridad-ia', tipo: 'servicio', nombre: 'Seguridad para IA',
      alias: ['Seguridad para IA', 'Evaluación de IA', 'Seguridad IA', 'Inteligencia artificial'],
      precio: 400425, tipo_precio: 'desde', unidad: 'servicio', moneda: 'COP',
      descripcion: 'Evaluación del uso de herramientas de IA en su pyme: datos en prompts, aplicaciones sin gobierno, riesgos de suplantación y controles proporcionales.',
      cobertura: ['Inventario de herramientas de IA en uso', 'Revisión de datos compartidos en prompts', 'Evaluación de configuraciones y accesos', 'Política básica de uso de IA', 'Sesión de concienciación para el equipo'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'prod-diagnostico-esencial', tipo: 'producto', nombre: 'Diagnóstico Esencial', servicio_asociado: 'svc-diagnostico',
      alias: ['Diagnóstico Esencial', 'Plan Esencial', 'Esencial'],
      precio: 400425, tipo_precio: 'desde', unidad: 'servicio', moneda: 'COP',
      descripcion: 'Diagnóstico de ciberseguridad para pymes en Colombia.',
      cobertura: ['Reunión remota', 'Hasta 3 equipos', 'Riesgos prioritarios', 'Informe ejecutivo', 'Sesión de resultados'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'prod-evaluacion-pyme', tipo: 'producto', nombre: 'Evaluación Pyme', servicio_asociado: 'svc-diagnostico',
      alias: ['Evaluación Pyme', 'Plan Pyme', 'Pyme'],
      precio: 912475, tipo_precio: 'fijo', unidad: 'servicio', moneda: 'COP',
      descripcion: 'Diagnóstico ampliado con priorización y acompañamiento.',
      cobertura: ['Alcance autorizado', 'Hasta 10 equipos', 'Revisión de configuraciones', 'Informe técnico y ejecutivo', 'Plan de remediación', 'Acompañamiento'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'prod-seguridad-integral', tipo: 'producto', nombre: 'Seguridad Integral', servicio_asociado: 'svc-diagnostico',
      alias: ['Seguridad Integral', 'Plan Integral', 'Integral'],
      precio: 1833975, tipo_precio: 'fijo', unidad: 'servicio', moneda: 'COP',
      descripcion: 'Cobertura integral: diagnóstico, pruebas autorizadas, hardening e informes.',
      cobertura: ['Alcance personalizado', 'Evaluación autorizada', 'Hardening priorizado', 'Evidencias', 'Informe técnico y ejecutivo', 'Plan por etapas', 'Dos seguimientos'],
      exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'prod-consultoria-remota', tipo: 'producto', nombre: 'Consultoría remota', servicio_asociado: 'svc-acompanamiento',
      alias: ['Consultoría remota', 'Consultoría por hora', 'Consultoría'],
      precio: 123975, tipo_precio: 'fijo', unidad: 'hora', moneda: 'COP',
      descripcion: 'Consultoría remota por hora.',
      cobertura: [], exclusiones: [], vigencia: 'vigente',
    },
    {
      id: 'prod-hardening', tipo: 'producto', nombre: 'Hardening', servicio_asociado: 'svc-hardening',
      alias: ['Hardening', 'Hardening de sistemas'],
      precio: 297825, tipo_precio: 'fijo', unidad: 'servicio', moneda: 'COP',
      descripcion: 'Hardening de sistemas.',
      cobertura: [], exclusiones: [], vigencia: 'vigente',
    },
  ],
};

export function formatearCOP(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

export function aliasDelRegistro(registro) {
  const alias = [];
  for (const entrada of registro.entradas || []) {
    alias.push(entrada.nombre, ...(entrada.alias || []));
  }
  return [...new Set(alias)];
}

function tienePropia(obj, clave) {
  return Object.prototype.hasOwnProperty.call(obj, clave);
}

export function validarRegistro(registro) {
  const motivos = [];
  if (!registro || typeof registro !== 'object') return { ok: false, motivos: ['registro-ausente'] };
  if (!Number.isInteger(registro.version) || registro.version < 1) motivos.push('version-invalida');
  if (!Array.isArray(registro.descuentos) || registro.descuentos.length !== 0) motivos.push('descuentos-no-vacios');
  if (registro.acuerdos !== 'ninguno') motivos.push('acuerdos-no-ninguno');
  if (!Array.isArray(registro.entradas) || registro.entradas.length === 0) motivos.push('sin-entradas');
  const ids = new Set();
  const alias = aliasDelRegistro(registro);
  for (const entrada of registro.entradas || []) {
    if (!entrada.id || ids.has(entrada.id)) motivos.push('id-duplicado-o-ausente');
    ids.add(entrada.id);
    if (!['servicio', 'producto'].includes(entrada.tipo)) motivos.push('tipo-invalido:' + entrada.id);
    if (!entrada.nombre || !Array.isArray(entrada.alias) || entrada.alias.length === 0) motivos.push('alias-ausente:' + entrada.id);
    if (entrada.precio !== null && entrada.precio !== undefined) {
      if (!Number.isInteger(entrada.precio) || entrada.precio <= 0) motivos.push('precio-invalido:' + entrada.id);
      if (!['desde', 'fijo'].includes(entrada.tipo_precio)) motivos.push('tipo-precio-invalido:' + entrada.id);
      if (!['servicio', 'hora'].includes(entrada.unidad)) motivos.push('unidad-invalida:' + entrada.id);
    }
    if (!Array.isArray(entrada.cobertura) || !Array.isArray(entrada.exclusiones)) motivos.push('cobertura-invalida:' + entrada.id);
    for (const item of entrada.cobertura || []) {
      const g = analizarGuardas(item, { aliasServicio: alias });
      if (g.dinero > 0 || g.duracion > 0 || (g.dinero + g.duracion + g.condicion) > 1 || g.servicio > 1) {
        motivos.push('cobertura-no-atomica:' + entrada.id);
      }
    }
    if (entrada.tipo === 'producto' && !ids.has(entrada.servicio_asociado) && !(registro.entradas || []).some((e) => e.id === entrada.servicio_asociado)) {
      motivos.push('servicio-asociado-ausente:' + entrada.id);
    }
  }
  return { ok: motivos.length === 0, motivos };
}

export function entradaPorId(registro, id) {
  return (registro.entradas || []).find((e) => e.id === id) || null;
}

export function validarAfirmacion(afirmacion, registro) {
  if (!afirmacion || typeof afirmacion !== 'object') return false;
  if (afirmacion.id_registro === 'registro') {
    return afirmacion.campo === 'condiciones' && afirmacion.valor === 'ninguno';
  }
  const entrada = entradaPorId(registro, afirmacion.id_registro);
  if (!entrada || !tienePropia(entrada, afirmacion.campo)) return false;
  const esperado = entrada[afirmacion.campo];
  if (Array.isArray(esperado)) return JSON.stringify(esperado) === JSON.stringify(afirmacion.valor);
  return esperado === afirmacion.valor;
}

export function resolverEntidades(mensaje, registro) {
  const norm = normalizarParaCoincidencia(mensaje);
  const coincidencias = [];
  for (const entrada of registro.entradas || []) {
    const alias = [...new Set([entrada.nombre, ...(entrada.alias || [])])];
    for (const a of alias) {
      const s = normalizarParaCoincidencia(a);
      if (!s) continue;
      const re = new RegExp('\\b' + s.replace(/ /g, '\\s+') + '\\b', 'g');
      let m;
      while ((m = re.exec(norm)) !== null) {
        coincidencias.push({ inicio: m.index, fin: m.index + m[0].length, alias: s, entrada });
      }
    }
  }
  coincidencias.sort((a, b) => (a.inicio - b.inicio) || (b.fin - a.fin));
  const tramos = [];
  for (const c of coincidencias) {
    const solapa = tramos.find((t) => c.inicio < t.fin && t.inicio < c.fin);
    if (!solapa) {
      tramos.push({ inicio: c.inicio, fin: c.fin, alias: c.alias, entradas: [c.entrada] });
    } else if (solapa.inicio === c.inicio && solapa.fin === c.fin && !solapa.entradas.some((e) => e.id === c.entrada.id)) {
      solapa.entradas.push(c.entrada);
    }
  }
  return { normalizado: norm, tramos };
}

function detectarCampo(norm) {
  const duracion = /\b(?:dura|duran|duracion|plazo|vigencia|cuanto tiempo)\b/.test(norm);
  const cobertura = /\b(?:incluye|incluyen|cobertura|alcance|entregables|que trae|que recibo|que contiene|que incluye)\b/.test(norm);
  const precioFuerte = /\b(?:cuesta|cuestan|precio|precios|valor|vale|valen|tarifa|tarifas|cobra|cobran|inversion)\b/.test(norm);
  const precioDebil = /\bcuanto\b/.test(norm);
  const campos = [];
  if (duracion) campos.push('duracion');
  if (cobertura) campos.push('cobertura');
  if (precioFuerte || (precioDebil && !duracion)) campos.push('precio');
  if (campos.length !== 1) return { campo: null, campos };
  return { campo: campos[0], campos };
}

function esPreguntaDeCondicion(norm) {
  const condicion = /\b(?:descuentos?|acuerdos?|promociones?|ofertas?|tarifas? especiales?|condiciones especiales?)\b/.test(norm);
  const existencia = /\b(?:hay|tienen|tiene|existen|existe|ofrecen|ofrece|manejan|aplican)\b/.test(norm)
    || norm.startsWith('que ') || /\bcuales\b/.test(norm);
  return condicion && existencia;
}

export function seleccionarAfirmacion(mensaje, registro) {
  const norm = normalizarParaCoincidencia(mensaje);
  if (esPreguntaDeCondicion(norm)) {
    const afirmacion = { id_registro: 'registro', tipo_hecho: 'condicion', campo: 'condiciones', valor: 'ninguno' };
    return { ok: true, afirmacion, motivo: 'condicion-legitima' };
  }
  const { campo, campos } = detectarCampo(norm);
  const mencionaCondicion = /\b(?:descuentos?|acuerdos?|promociones?|ofertas?|condiciones especiales?)\b/.test(norm);
  const presuponeCondicion = /\b(?:ofrecieron|ofrecio|acordado|acordada|pactado|pactada|prometieron|prometio|me dieron|cliente antiguo)\b/.test(norm)
    || /\btengo (?:un |una )?(?:descuento|acuerdo)\b/.test(norm);
  if (mencionaCondicion && (campos.includes('precio') || presuponeCondicion)) {
    return { ok: false, motivo: 'condicion-no-verificada', campo, campos };
  }
  if (!campo) return { ok: false, motivo: campos.length > 1 ? 'varios-campos' : 'sin-campo', campos };
  const { tramos } = resolverEntidades(mensaje, registro);
  if (tramos.length === 0) return { ok: false, motivo: 'sin-entidad', campo };
  if (tramos.length > 1) {
    return { ok: false, motivo: 'varias-entidades', campo, candidatos: tramos.flatMap((t) => t.entradas.map((e) => e.nombre)) };
  }
  const candidatos = tramos[0].entradas;
  let entrada = null;
  if (campo === 'precio') {
    const conPrecio = candidatos.filter((e) => Number.isInteger(e.precio));
    if (conPrecio.length === 1) entrada = conPrecio[0];
    else if (candidatos.some((e) => e.id === 'svc-diagnostico')) return { ok: false, motivo: 'diagnostico-ambiguo', campo };
    else return { ok: false, motivo: 'sin-precio', campo, candidatos: candidatos.map((e) => e.nombre) };
  } else if (campo === 'cobertura') {
    entrada = candidatos.find((e) => e.tipo === 'producto' && e.cobertura.length > 0)
      || candidatos.find((e) => e.tipo === 'servicio' && e.cobertura.length > 0)
      || null;
    if (!entrada) return { ok: false, motivo: 'sin-cobertura', campo, candidatos: candidatos.map((e) => e.nombre) };
  } else if (campo === 'duracion') {
    return { ok: false, motivo: 'sin-duracion-en-registro', campo, candidatos: candidatos.map((e) => e.nombre) };
  }
  const afirmacion = {
    id_registro: entrada.id,
    tipo_hecho: campo,
    campo,
    valor: campo === 'precio' ? entrada.precio : [...entrada.cobertura],
  };
  if (!validarAfirmacion(afirmacion, registro)) return { ok: false, motivo: 'afirmacion-invalida', campo };
  return { ok: true, afirmacion, entrada, motivo: 'seleccionada' };
}

export function renderizarAfirmacion(afirmacion, registro) {
  if (afirmacion.id_registro === 'registro' && afirmacion.campo === 'condiciones') {
    return 'En el registro vigente no hay condiciones especiales publicadas.';
  }
  const entrada = entradaPorId(registro, afirmacion.id_registro);
  if (!entrada) return null;
  if (afirmacion.campo === 'precio') {
    const desde = entrada.tipo_precio === 'desde' ? 'desde ' : '';
    const unidad = entrada.unidad === 'hora' ? ' por hora' : '';
    return `${entrada.nombre}: ${desde}${formatearCOP(entrada.precio)}${unidad}.`;
  }
  if (afirmacion.campo === 'cobertura') {
    return `${entrada.nombre} incluye: ${entrada.cobertura.join('; ')}.`;
  }
  return null;
}

export function respuestaDesdeAfirmacion(afirmacion, registro) {
  const texto = renderizarAfirmacion(afirmacion, registro);
  if (!texto) return { ok: false, motivo: 'sin-plantilla' };
  const validacion = validarTextoComercial(texto, registro, {
    afirmacion,
    campo: afirmacion.campo,
    aliasServicio: aliasDelRegistro(registro),
  });
  if (!validacion.ok) return { ok: false, motivo: 'guarda-renderizado', validacion };
  return { ok: true, texto, validacion };
}

export function aclaracionDiagnostico() {
  return 'Para darle el precio exacto, ¿se refiere al Diagnóstico Esencial, la Evaluación Pyme o la Seguridad Integral?';
}
