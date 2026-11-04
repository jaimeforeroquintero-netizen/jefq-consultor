#!/usr/bin/env node
/**
 * verificar-precios.mjs — control de consistencia de precios S1 (JEFQ Consultor).
 * Lee la fuente autora src/data/precios.ts, resuelve los precios derivados
 * (p. ej. evaluacion-ia -> esencial) y comprueba:
 *  A. cada cifra vive una sola vez como precioDesdeCOP en la fuente;
 *  B. los archivos refactorizados (index, Layout, IA, Bogotá) ya NO tienen
 *     literales de precios (leen de la fuente);
 *  C. cero precios viejos en src/, public/, functions/, api/;
 *  D. el build (dist/, si existe) renderiza los precios S1 exactos y el
 *     titular "Siete servicios";
 *  E. los espejos (chat prompts, catálogo Wompi) siguen con las cifras S1;
 *  F. llms.txt con los 3 planes y cero viejos.
 * Uso: node scripts/verificar-precios.mjs   (desde la raíz del repo)
 * Salida: exit 0 si todo pasa, 1 si algo falla.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let failures = 0;
let checks = 0;
function check(nombre, ok, detalle = "") {
  checks++;
  if (ok) console.log(`  PASS ${nombre}${detalle ? " — " + detalle : ""}`);
  else {
    failures++;
    console.log(`  FAIL ${nombre}${detalle ? " — " + detalle : ""}`);
  }
}

// --- Leer la fuente ---
const fuente = readFileSync(join(ROOT, "src/data/precios.ts"), "utf8");
const bloques = [...fuente.matchAll(/\{\s*id:\s*"([^"]+)"([\s\S]*?)(?=},\s*\{|\];)/g)];
const precios = new Map(); // id -> { cifra?: number, basadoEn?: string }
for (const [, id, cuerpo] of bloques) {
  const cifra = cuerpo.match(/precioDesdeCOP:\s*(\d+)/);
  const base = cuerpo.match(/basadoEn:\s*"([^"]+)"/);
  precios.set(id, {
    cifra: cifra ? Number(cifra[1]) : undefined,
    basadoEn: base ? base[1] : undefined,
  });
}
function resolver(id, visto = new Set()) {
  if (visto.has(id)) throw new Error(`Ciclo en basadoEn: ${id}`);
  visto.add(id);
  const p = precios.get(id);
  if (!p) throw new Error(`Precio desconocido: ${id}`);
  if (p.basadoEn) return resolver(p.basadoEn, visto);
  if (p.cifra === undefined) throw new Error(`Precio sin cifra ni base: ${id}`);
  return p.cifra;
}
const ESPERADOS = {
  esencial: 421500,
  pyme: 960500,
  integral: 1930500,
  "consultoria-hora": 130500,
  hardening: 313500,
  "evaluacion-ia": 421500,
};
const VIEJOS = [390000, 890000, 1790000, 120000, 290000];
const fmt = (n) => "$" + n.toLocaleString("es-CO");

console.log("== A. Fuente única ==");
for (const [id, n] of Object.entries(ESPERADOS)) {
  check(`precioDe("${id}") = ${n}`, resolver(id) === n);
}
// Cada cifra literal aparece una sola vez como precioDesdeCOP (salvo la derivada).
for (const n of [421500, 960500, 1930500, 130500, 313500]) {
  const veces = (fuente.match(new RegExp(`precioDesdeCOP:\\s*${n}`, "g")) || []).length;
  check(`cifra ${n} una sola vez en la fuente`, veces === 1, `${veces}x`);
}

function contienePrecio(texto, n) {
  return texto.includes(String(n)) || texto.includes(fmt(n));
}
function contieneViejo(texto) {
  return VIEJOS.some((n) => texto.includes(String(n)) || texto.includes(fmt(n)));
}
function leer(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

console.log("== B. Archivos refactorizados sin literales ==");
for (const rel of [
  "src/pages/index.astro",
  "src/layouts/Layout.astro",
  "src/pages/seguridad-inteligencia-artificial.astro",
  "src/pages/ciberseguridad-bogota.astro",
]) {
  const t = leer(rel);
  const quedan = Object.values(ESPERADOS).filter((n) => contienePrecio(t, n));
  check(`${rel} sin literales de precio`, quedan.length === 0, quedan.length ? `quedan: ${quedan.join(", ")}` : "");
}

console.log("== C. Cero precios viejos en el código servido ==");
function* caminar(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (["node_modules", "dist", ".git"].includes(e)) continue;
      yield* caminar(p);
    } else if (/\.(astro|ts|js|txt|md|json|css|html)$/.test(e)) yield p;
  }
}
let viejosHallados = [];
for (const dir of ["src", "public", "functions", "api"]) {
  const base = join(ROOT, dir);
  if (!existsSync(base)) continue;
  for (const p of caminar(base)) {
    const t = readFileSync(p, "utf8");
    if (contieneViejo(t)) viejosHallados.push(p.replace(ROOT + "/", ""));
  }
}
check("cero precios viejos en src/public/functions/api", viejosHallados.length === 0, viejosHallados.join(", "));

console.log("== D. Build (dist/) ==");
const dist = join(ROOT, "dist");
if (!existsSync(dist)) {
  console.log("  AVISO dist/ no existe — ejecuta `npm run build` y repite este script");
} else {
  const home = leer("dist/index.html");
  for (const n of [421500, 960500, 1930500, 130500, 313500]) {
    check(`home renderiza ${fmt(n)}`, home.includes(fmt(n)));
  }
  check("home sin precios viejos", !contieneViejo(home));
  check('home JSON-LD "421500"', home.includes('"price": "421500"') || home.includes('"price":"421500"'));
  check('home JSON-LD "960500"', home.includes('"price": "960500"') || home.includes('"price":"960500"'));
  check('home JSON-LD "1930500"', home.includes('"price": "1930500"') || home.includes('"price":"1930500"'));
  const bogota = leer("dist/ciberseguridad-bogota/index.html");
  check('Bogotá titular "Siete servicios"', bogota.includes("Siete servicios"));
  check('Bogotá sin "Seis servicios"', !bogota.includes("Seis servicios"));
  const servicios = leer("dist/servicios/index.html");
  check("meta /servicios menciona seguridad para IA", servicios.toLowerCase().includes("seguridad para ia"));
}

console.log("== E. Espejos (fases C/D preparadas) ==");
for (const rel of ["functions/api/chat.js", "api/chat.js"]) {
  const t = leer(rel);
  const faltan = Object.values(ESPERADOS).filter((n) => !contienePrecio(t, n));
  // El chat solo lista algunos precios en prosa; exige al menos los 3 planes + IA.
  check(`${rel} con precios S1`, [421500, 960500, 1930500, 130500, 313500].every((n) => contienePrecio(t, n)), faltan.length ? `faltan: ${faltan.join(", ")}` : "");
}
for (const rel of ["functions/api/pagos/crear.js", "api/pagos/crear.js"]) {
  const t = leer(rel);
  check(`${rel} centavos correctos`, [42150000, 96050000, 193050000].every((n) => t.includes(String(n))));
}

console.log("== F. llms.txt ==");
const llms = leer("public/llms.txt");
check("llms.txt con los 3 planes", [421500, 960500, 1930500].every((n) => llms.includes(fmt(n))));
check("llms.txt sin precios viejos", !contieneViejo(llms));

console.log(`\n${checks - failures}/${checks} comprobaciones PASS.`);
if (failures) {
  console.log(`${failures} FALLOS — no desplegar hasta corregirlos.`);
  process.exit(1);
}
console.log("Precios consistentes con la fuente única.");
