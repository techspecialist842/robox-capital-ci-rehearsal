#!/usr/bin/env node
/**
 * Comprueba que todo evento publicado por el codigo tiene su esquema versionado.
 *
 * Existe porque ya paso: la Fase 1 anadio eventos de MFA y la Fase 2 los de
 * estrategias e instrumentos, y ninguno llego a los esquemas. Un consumidor que
 * valide el contrato —como hace el quant-service— habria rechazado esos eventos
 * con UnknownEventTypeError, y el fallo solo aparece cuando alguien se suscribe.
 *
 * Ninguna prueba lo detectaba: los fixtures solo cubren los eventos que SI tienen
 * esquema, asi que la ausencia era invisible por construccion.
 */
const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const RAIZ = join(__dirname, "..", "..", "..");
const ESQUEMAS = join(__dirname, "..", "schemas");

/** Recorre los fuentes de produccion buscando llamadas a audit.record("tipo", ...). */
function tiposPublicados(directorio, encontrados = new Set()) {
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const ruta = join(directorio, entrada.name);

    if (entrada.isDirectory()) {
      if (entrada.name === "node_modules" || entrada.name === "dist") continue;
      tiposPublicados(ruta, encontrados);
      continue;
    }

    if (!entrada.name.endsWith(".ts") || entrada.name.includes(".spec.")) continue;

    const contenido = readFileSync(ruta, "utf8");
    for (const coincidencia of contenido.matchAll(/audit\.record\(\s*"([^"]+)"/g)) {
      encontrados.add(coincidencia[1]);
    }
  }
  return encontrados;
}

const conEsquema = new Set(
  readdirSync(ESQUEMAS)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.v\d+\.json$/, "")),
);

const publicados = tiposPublicados(join(RAIZ, "apps", "api-gateway", "src"));
const sinEsquema = [...publicados].filter((t) => !conEsquema.has(t)).sort();

if (sinEsquema.length > 0) {
  console.error("Eventos publicados por el codigo que no tienen esquema versionado:\n");
  for (const tipo of sinEsquema) {
    console.error(`  - ${tipo}  (falta schemas/${tipo}.v1.json)`);
  }
  console.error(
    "\nUn consumidor que valide el contrato rechazaria estos eventos. " +
      "Anade el esquema antes de publicarlos.",
  );
  process.exit(1);
}

console.log(
  `Todos los eventos publicados tienen esquema (${publicados.size} tipos comprobados).`,
);
