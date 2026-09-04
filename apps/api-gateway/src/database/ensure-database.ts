import "reflect-metadata";
import { Client } from "pg";
import { configuracionTls } from "./ssl";

/**
 * Crea la base de datos de la aplicacion si aun no existe.
 *
 * No se usa la base inicial de RDS (databaseName) a proposito. Esa propiedad es
 * inmutable: cambiarla obliga a REEMPLAZAR la instancia, y CloudFormation
 * ademas se niega a hacerlo cuando la instancia tiene nombre propio
 * ("cannot update a stack when a custom-named resource requires replacing").
 * En un entorno con datos, reemplazar la base de datos para corregir su nombre
 * no es una opcion.
 *
 * Creandola desde aqui, el nombre lo gobierna la aplicacion y no una propiedad
 * irreversible de la infraestructura. Es idempotente: si ya existe, no hace nada.
 */
async function main(): Promise<void> {
  const objetivo = process.env.POSTGRES_DB ?? "robox";

  const cliente = new Client({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    user: process.env.POSTGRES_USER ?? "robox",
    password: process.env.POSTGRES_PASSWORD ?? "robox_dev_only",
    // Se conecta a "postgres", que siempre existe, para poder crear la otra.
    database: "postgres",
    ssl: configuracionTls(),
  });

  await cliente.connect();
  try {
    const existe = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      objetivo,
    ]);

    if (existe.rowCount && existe.rowCount > 0) {
      process.stdout.write(`La base de datos "${objetivo}" ya existe\n`);
      return;
    }

    // El nombre no puede ir como parametro en CREATE DATABASE. Se valida en su
    // lugar: solo letras, digitos y guion bajo, que es lo que admite un
    // identificador sin comillas en PostgreSQL.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(objetivo)) {
      throw new Error(`Nombre de base de datos no valido: ${objetivo}`);
    }

    await cliente.query(`CREATE DATABASE "${objetivo}"`);
    process.stdout.write(`Base de datos "${objetivo}" creada\n`);
  } finally {
    await cliente.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
