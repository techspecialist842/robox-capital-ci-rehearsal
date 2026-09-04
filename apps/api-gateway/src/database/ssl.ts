import { readFileSync } from "node:fs";

/**
 * Configuracion TLS de la conexion a PostgreSQL.
 *
 * RDS rechaza las conexiones sin cifrar: el primer despliegue real fallo con
 * "no pg_hba.conf entry for host ..., no encryption".
 *
 * Se valida el certificado del servidor contra la autoridad de RDS, que la
 * imagen incorpora en POSTGRES_SSL_CA. La alternativa habitual
 * —rejectUnauthorized: false— cifra el trafico pero acepta cualquier
 * certificado, con lo que un intermediario podria interponerse sin que nada
 * falle. En una plataforma que mueve dinero eso no compensa el atajo.
 *
 * En local no hay CA configurada y se conecta sin TLS, que es lo correcto
 * contra un PostgreSQL en la propia maquina.
 */
export function configuracionTls(): false | { ca: string; rejectUnauthorized: true } {
  const ruta = process.env.POSTGRES_SSL_CA;
  if (!ruta) {
    return false;
  }

  return {
    ca: readFileSync(ruta, "utf8"),
    rejectUnauthorized: true,
  };
}
