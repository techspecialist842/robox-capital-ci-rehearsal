import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { buildOpenApiDocument } from "../src/openapi";

/**
 * Prueba de contrato de API (Definicion de Hecho de la Fase 1: "incluye etapas de
 * prueba de contrato de API y de eventos").
 *
 * Compara el contrato que el codigo produce hoy contra el openapi.json versionado.
 * Si difieren, el pipeline falla.
 *
 * El valor no es tener el fichero al dia por pulcritud: es que cualquier cambio de
 * la API queda visible en la revision de codigo como una diferencia explicita en
 * el contrato, en lugar de colarse dentro de un cambio de implementacion y romper
 * una app movil ya desplegada.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false });
  const actual = `${JSON.stringify(buildOpenApiDocument(app), null, 2)}\n`;
  await app.close();

  const ruta = join(__dirname, "..", "openapi.json");
  let versionado: string;
  try {
    versionado = readFileSync(ruta, "utf8");
  } catch {
    process.stderr.write(
      "No existe openapi.json. Generalo con: npm run openapi:generate\n",
    );
    process.exit(1);
  }

  if (actual === versionado) {
    process.stdout.write("El contrato de API coincide con openapi.json\n");
    return;
  }

  process.stderr.write(
    "El contrato de API ha cambiado y openapi.json no esta actualizado.\n\n" +
      "Si el cambio es intencionado:\n" +
      "  1. npm run openapi:generate\n" +
      "  2. revisa la diferencia — es el cambio que veran los clientes de la API\n" +
      "  3. si rompe compatibilidad, sube API_CONTRACT_VERSION en src/openapi.ts\n" +
      "  4. incluye openapi.json en el commit\n\n" +
      `${describirDiferencias(versionado, actual)}\n`,
  );
  process.exit(1);
}

/** Resume que rutas se anadieron o desaparecieron, que es lo que suele importar. */
function describirDiferencias(versionado: string, actual: string): string {
  try {
    const antes = Object.keys(JSON.parse(versionado).paths ?? {});
    const ahora = Object.keys(JSON.parse(actual).paths ?? {});
    const anadidas = ahora.filter((p) => !antes.includes(p));
    const eliminadas = antes.filter((p) => !ahora.includes(p));

    const lineas = [
      ...anadidas.map((p) => `  + ${p}`),
      ...eliminadas.map((p) => `  - ${p} (ELIMINADA: rompe a los clientes existentes)`),
    ];
    return lineas.length > 0
      ? `Rutas:\n${lineas.join("\n")}`
      : "Las rutas son las mismas; cambiaron esquemas o descripciones.";
  } catch {
    return "";
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
