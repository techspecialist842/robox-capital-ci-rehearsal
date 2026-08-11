#!/usr/bin/env node
/**
 * Prueba de contrato de eventos (ADR-002 / CI, ver .github/workflows/ci.yml).
 * Valida cada fixture de ejemplo en fixtures/ contra su esquema versionado en schemas/.
 * Se ejecuta en CI para todo cambio a un esquema o a un productor/consumidor de eventos.
 */
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const schemasDir = path.join(__dirname, "..", "schemas");
const fixturesDir = path.join(__dirname, "..", "fixtures");

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);

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
