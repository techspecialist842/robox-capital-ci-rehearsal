#!/usr/bin/env node
/**
 * Prueba de contrato de eventos (ADR-002 / CI, ver .github/workflows/ci.yml).
 * Valida cada fixture de ejemplo en fixtures/ contra su esquema versionado en schemas/.
 * Se ejecuta en CI para todo cambio a un esquema o a un productor/consumidor de eventos.
 */
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const schemasDir = path.join(__dirname, "..", "schemas");
const fixturesDir = path.join(__dirname, "..", "fixtures");

// ajv-formats en lugar de expresiones regulares propias: cubre todos los formatos
// estandar y, sobre todo, evita que la definicion de "uuid" o "date-time" aqui se
// aparte de la que aplica el validador de Python. El objetivo del ADR-002 es que
// ambos lados acepten y rechacen exactamente lo mismo.
const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));

let failures = 0;

for (const schemaFile of fs.readdirSync(schemasDir)) {
  const eventType = schemaFile.replace(/\.v(\d+)\.json$/, "");
  const version = schemaFile.match(/\.v(\d+)\.json$/)[1];
  const fixtureFile = `${eventType}.v${version}.sample.json`;
  const fixturePath = path.join(fixturesDir, fixtureFile);

  if (!fs.existsSync(fixturePath)) {
    console.error(`FALTA fixture para ${schemaFile}: se esperaba ${fixtureFile}`);
    failures++;
    continue;
  }

  const schema = JSON.parse(fs.readFileSync(path.join(schemasDir, schemaFile), "utf8"));
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const validate = ajv.compile(schema);
  const valid = validate(fixture);

  if (valid) {
    console.log(`OK   ${schemaFile}`);
  } else {
    console.error(`FAIL ${schemaFile}`);
    console.error(validate.errors);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} esquema(s) de evento fallaron la validacion de contrato.`);
  process.exit(1);
}
console.log("\nTodos los esquemas de eventos son validos.");
