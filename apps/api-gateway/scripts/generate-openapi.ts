import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { buildOpenApiDocument } from "../src/openapi";

/**
 * Genera openapi.json a partir del codigo.
 *
 * Se arranca en modo "preview": Nest construye el grafo de modulos y controladores
 * pero no instancia los proveedores ni ejecuta los ganchos de ciclo de vida, asi
 * que no hace falta PostgreSQL ni Redis. Eso permite regenerar el contrato en
 * cualquier job del pipeline y no solo donde hay servicios levantados.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });

  const document = buildOpenApiDocument(app);
  const destino = join(__dirname, "..", "openapi.json");

  // Dos espacios y salto final: el formato debe ser estable, o la comparacion del
  // pipeline detectaria diferencias que no son cambios de contrato.
  writeFileSync(destino, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
  process.stdout.write(`openapi.json generado (${Object.keys(document.paths).length} rutas)\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
