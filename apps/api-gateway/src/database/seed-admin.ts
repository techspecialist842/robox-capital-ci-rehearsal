import "reflect-metadata";
import * as bcrypt from "bcryptjs";
import { Client } from "pg";
import { configuracionTls } from "./ssl";

/**
 * Crea el primer usuario administrador.
 *
 * No hay registro publico en la plataforma: el primer administrador se crea por
 * semilla y los demas los crea un administrador existente (Runbook §2). Este
 * script es esa semilla.
 *
 * La contrasena llega por variable de entorno y nunca se escribe en el codigo ni
 * en los logs. El usuario se crea SIN MFA activo: en su primer inicio de sesion
 * la plataforma le exigira darlo de alta, igual que a cualquier otro.
 *
 * Es idempotente: si el correo ya existe, no hace nada. Ejecutarlo dos veces por
 * error no debe cambiar la contrasena de un administrador en funcionamiento.
 */
async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("Faltan SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD");
  }
  if (password.length < 12) {
    throw new Error("La contrasena del administrador inicial debe tener 12 caracteres o mas");
  }

  const cliente = new Client({
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    user: process.env.POSTGRES_USER ?? "robox",
    password: process.env.POSTGRES_PASSWORD ?? "robox_dev_only",
    database: process.env.POSTGRES_DB ?? "robox",
    ssl: configuracionTls(),
  });

  await cliente.connect();
  try {
    const existente = await cliente.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existente.rowCount && existente.rowCount > 0) {
      process.stdout.write("El administrador ya existe; no se modifica\n");
      return;
    }

    const hash = await bcrypt.hash(password, 12);
    await cliente.query(
      `INSERT INTO users (email, password_hash, roles, active, mfa_enabled)
       VALUES ($1, $2, '{admin}', true, false)`,
      [email, hash],
    );
    process.stdout.write("Administrador inicial creado; debera dar de alta su MFA al entrar\n");
  } finally {
    await cliente.end();
  }
}

main().catch((error) => {
  // Se imprime solo el mensaje: el objeto de error de pg incluye parametros de
  // la consulta, y ahi viaja el hash de la contrasena.
  console.error(error instanceof Error ? error.message : "fallo desconocido");
  process.exit(1);
});
