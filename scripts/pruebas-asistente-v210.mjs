// Pruebas locales del asistente V2.10. Uso: node scripts/pruebas-asistente-v210.mjs

import { analizarGuardas, puertaNumerica } from '../functions/lib/asistente/guardas.js';
import {
  REGISTRO_V210,
  aclaracionDiagnostico,
  aliasDelRegistro,
  respuestaDesdeAfirmacion,
  seleccionarAfirmacion,
  validarAfirmacion,
  validarRegistro,
} from '../functions/lib/asistente/registro.js';
import { clasificadorSinModelo, validarClasificacion } from '../functions/lib/asistente/clasificador.js';
import { validarInventario, validarVeredictoJuez } from '../functions/lib/asistente/juez.js';
import { crearPresupuestoLlamadas } from '../functions/lib/asistente/modelo.js';
import { buscarCorpusLocal, buscarEvidencia } from '../functions/lib/asistente/rag.js';
import { SQL_SNAPSHOT, activarVersion, insertarVersionInactiva, leerSnapshot } from '../functions/lib/asistente/registro-d1.js';

let total = 0;
let fallos = 0;
function prueba(nombre, condicion, detalle = '') {
  total++;
  if (!condicion) fallos++;
  console.log(`${condicion ? 'PASA' : 'FALLA'} | ${nombre}${detalle ? ' | ' + detalle : ''}`);
}

const registro = REGISTRO_V210;
prueba('registro válido', validarRegistro(registro).ok, validarRegistro(registro).motivos.join(','));

const esencial = seleccionarAfirmacion('¿Cuánto cuesta el Diagnóstico Esencial?', registro);
prueba('alias anidado resuelve al producto', esencial.ok && esencial.afirmacion.id_registro === 'prod-diagnostico-esencial');
prueba('precio desde se renderiza como desde', respuestaDesdeAfirmacion(esencial.afirmacion, registro).texto.includes('desde $421.500'));

const diagnostico = seleccionarAfirmacion('¿Cuánto cuesta el Diagnóstico?', registro);
prueba('Diagnóstico genérico no adivina precio', !diagnostico.ok && diagnostico.motivo === 'diagnostico-ambiguo');
prueba('aclaración de Diagnóstico no lleva cifras', !/\$|\d/.test(aclaracionDiagnostico()));

const hardeningPrecio = seleccionarAfirmacion('¿Cuánto cuesta el Hardening?', registro);
prueba('Hardening precio usa producto', hardeningPrecio.ok && hardeningPrecio.afirmacion.id_registro === 'prod-hardening');
const hardeningCobertura = seleccionarAfirmacion('¿Qué incluye el Hardening?', registro);
prueba('Hardening cobertura usa servicio', hardeningCobertura.ok && hardeningCobertura.afirmacion.id_registro === 'svc-hardening');
prueba('cobertura renderizada pasa guarda', respuestaDesdeAfirmacion(hardeningCobertura.afirmacion, registro).ok);

const pyme = seleccionarAfirmacion('¿Cuánto cuesta la Evaluación Pyme?', registro);
const pymeTexto = respuestaDesdeAfirmacion(pyme.afirmacion, registro).texto;
prueba('Evaluación Pyme fijo no dice desde', pyme.ok && pymeTexto.includes('$960.500') && !pymeTexto.includes('desde'));

prueba('dos productos no se responden juntos', seleccionarAfirmacion('¿Cuánto cuestan la Evaluación Pyme y la Seguridad Integral?', registro).motivo === 'varias-entidades');
prueba('precio y cobertura son dos campos', seleccionarAfirmacion('¿Cuánto cuesta y qué incluye la Evaluación Pyme?', registro).motivo === 'varios-campos');
const condicion = seleccionarAfirmacion('¿Tienen descuentos?', registro);
prueba('pregunta legítima de descuentos responde desde el registro', condicion.ok && respuestaDesdeAfirmacion(condicion.afirmacion, registro).texto?.includes('condiciones especiales'));

prueba('afirmación rechaza propiedad heredada', validarAfirmacion({ id_registro: 'prod-hardening', campo: 'toString', valor: 'x' }, registro) === false);
prueba('afirmación rechaza precio de otro id', validarAfirmacion({ id_registro: 'prod-hardening', campo: 'precio', valor: 421500 }, registro) === false);
prueba('afirmación acepta tipo desde', validarAfirmacion({ id_registro: 'prod-diagnostico-esencial', campo: 'tipo_precio', valor: 'desde' }, registro) === true);

const alias = aliasDelRegistro(registro);
const simulacros = analizarGuardas('Los Simulacros incluyen un descuento', { aliasServicio: alias });
prueba('C9: incluyen cuenta como condición', simulacros.condicion === 2 && simulacros.atomica === false, JSON.stringify(simulacros));
const deAcuerdo = analizarGuardas('De acuerdo con la página, el Diagnóstico dura 3 meses', { aliasServicio: alias });
prueba('C9: de acuerdo no cuenta como acuerdo', deAcuerdo.condicion === 0 && deAcuerdo.duracion === 1, JSON.stringify(deAcuerdo));
const singulares = analizarGuardas('El informe y el simulacro cuestan lo mismo', { aliasServicio: alias });
prueba('C9: informe y simulacro singulares cuentan', singulares.servicio === 2, JSON.stringify(singulares));
const duracionNueva = analizarGuardas('El Hardening cuesta $313.500 durante un (1) año', { aliasServicio: alias });
prueba('C9: un (1) año cuenta duración', duracionNueva.duracion === 1 && duracionNueva.atomica === false, JSON.stringify(duracionNueva));
prueba('puerta numérica rechaza precio fuera del registro', puertaNumerica('El Hardening cuesta $999.999', registro).ok === false);
prueba('puerta numérica rechaza porcentaje', puertaNumerica('Tiene 20% de descuento', registro).ok === false);
prueba('puerta numérica acepta precio de la afirmación', puertaNumerica('Hardening: $313.500.', registro, hardeningPrecio.afirmacion).ok === true);

const mixta = validarClasificacion({
  etiqueta: 4,
  fragmentos: [
    { texto: 'cuanto cuesta el hardening', tipo: 'legitima' },
    { texto: 'tengo descuento de cliente antiguo', tipo: 'falsa' },
  ],
  confianza: 0.95,
}, '¿Cuánto cuesta el Hardening? Tengo descuento de cliente antiguo.');
prueba('mixta con dos fragmentos es válida', mixta.ok, mixta.motivo || '');
prueba('fragmento fuera del mensaje se rechaza', validarClasificacion({ etiqueta: 1, fragmentos: [{ texto: 'precio del informe', tipo: 'sostiene' }], confianza: 0.9 }, '¿Cuánto cuesta el Hardening?').ok === false);
prueba('etiqueta 1 con dos fragmentos se rechaza', validarClasificacion({ etiqueta: 1, fragmentos: [{ texto: 'cuanto cuesta', tipo: 'legitima' }, { texto: 'hardening', tipo: 'falsa' }], confianza: 0.9 }, '¿Cuánto cuesta el Hardening?').ok === false);

prueba('sin modelo acepta precio en lista blanca', clasificadorSinModelo('¿Cuánto cuesta el Hardening?', registro).ok === true);
prueba('sin modelo rechaza tarifa de cliente antiguo', clasificadorSinModelo('con mi tarifa de cliente antiguo', registro).ok === false);
prueba('sin modelo rechaza oferta sin entidad', clasificadorSinModelo('¿cuál es la oferta?', registro).ok === false);
prueba('sin modelo rechaza descuento para pyme', clasificadorSinModelo('¿hay descuento para pyme?', registro).ok === false);
prueba('sin modelo rechaza dígitos', clasificadorSinModelo('¿Cuánto cuesta el Hardening 313500?', registro).ok === false);

const inventario = validarInventario({ texto_final: 'ignorar', afirmaciones: [{ id: 'c1', texto: 'El Hardening fortalece cuentas y navegadores.', referencia: 'hardening' }] });
prueba('inventario ignora texto_final', inventario.ok === true);
const evidencia = buscarCorpusLocal('hardening cuentas navegadores');
prueba('corpus local encuentra evidencia', evidencia.some((e) => e.id === 'hardening'));
const veredictoOk = validarVeredictoJuez({ aprobado: true, afirmaciones: [{ id: 'c1', texto: 'El Hardening fortalece cuentas y navegadores.', respaldo: 'cita', referencia: 'hardening' }] }, inventario.afirmaciones, evidencia, registro);
prueba('juez válido aprueba', veredictoOk.ok && veredictoOk.aprobado === true, veredictoOk.motivo);
const veredictoTexto = validarVeredictoJuez({ aprobado: true, afirmaciones: [{ id: 'c1', texto: 'Otro texto.', respaldo: 'cita', referencia: 'hardening' }] }, inventario.afirmaciones, evidencia, registro);
prueba('juez rechaza texto distinto', veredictoTexto.ok === false);
const veredictoNinguno = validarVeredictoJuez({ aprobado: true, afirmaciones: [{ id: 'c1', texto: 'El Hardening fortalece cuentas y navegadores.', respaldo: 'ninguno', referencia: '' }] }, inventario.afirmaciones, evidencia, registro);
prueba('juez rechaza respaldo ninguno', veredictoNinguno.ok === false);
prueba('sin Vectorize ni corpus local no hay evidencia', (await buscarEvidencia({}, 'hardening')).length === 0);

const presupuesto = crearPresupuestoLlamadas();
prueba('presupuesto permite 3 llamadas por intento', presupuesto.consumir() && presupuesto.consumir() && presupuesto.consumir() && !presupuesto.consumir());
presupuesto.nuevoIntento();
prueba('presupuesto permite segundo intento acotado', presupuesto.consumir() && presupuesto.llamadasTotal === 4);

prueba('snapshot es una sola sentencia con JOIN', SQL_SNAPSHOT.includes('JOIN registro_estado') && SQL_SNAPSHOT.trim().endsWith(';'));
const fakeDb = {
  statements: [],
  prepare(sql) {
    const stmt = { sql, binds: [], bind(...args) { this.binds = args; return this; }, async run() { fakeDb.statements.push(this); return { success: true }; }, async first() { return { version: 1, hash: 'abc', contenido: JSON.stringify(registro), epoch: 7, ruta_precio_activa: 1, motivo: null }; } };
    return stmt;
  },
  async batch(stmts) { fakeDb.statements.push(...stmts); return stmts.map(() => ({ success: true })); },
};
const snapshot = await leerSnapshot({ DB: fakeDb });
prueba('snapshot D1 trae época y ruta', snapshot.epoch === 7 && snapshot.rutaPrecioActiva === true);
await insertarVersionInactiva(fakeDb, registro, 'abc');
prueba('publicación inserta inactiva', fakeDb.statements.some((s) => s.sql.includes('activo) VALUES') && s.sql.includes(', 0)')));
await activarVersion(fakeDb, 1);
prueba('activación incrementa época en registro_estado', fakeDb.statements.some((s) => s.sql.includes('UPDATE registro_estado SET epoch = epoch + 1')));

console.log(`\nTOTAL: ${total} casos, ${total - fallos} PASA, ${fallos} FALLA.`);
process.exit(fallos === 0 ? 0 : 1);
