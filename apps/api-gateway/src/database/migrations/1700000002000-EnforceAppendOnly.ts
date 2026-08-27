import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Hace cumplir de verdad la inmutabilidad de las tablas de solo insercion.
 *
 * La migracion anterior usaba REVOKE UPDATE, DELETE ... FROM PUBLIC, que NO
 * protege nada en la practica: el propietario de una tabla conserva todos sus
 * privilegios al margen de lo que se revoque a PUBLIC, y el usuario de la
 * aplicacion es el propietario. Se comprobo ejecutando un UPDATE y un DELETE
 * sobre audit_events con el usuario de la aplicacion: ambos tuvieron exito.
 *
 * Un disparador si se aplica al propietario, asi que es el mecanismo correcto.
 *
 * Limitacion que conviene conocer: un superusuario puede eliminar el disparador.
 * Contra un administrador de base de datos comprometido, la unica defensa real es
 * replicar la auditoria a un destino externo append-only, fuera del alcance de
 * quien administra esta base. Eso depende de las cuentas AWS y esta relacionado
 * con la consulta pendiente al cliente sobre tolerancia cero a perdida.
 */
export class EnforceAppendOnly1700000002000 implements MigrationInterface {
  name = "EnforceAppendOnly1700000002000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION robox_solo_insercion() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION
          'La tabla % es de solo insercion: % no esta permitido',
          TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'restrict_violation';
      END;
      $$ LANGUAGE plpgsql;
    `);

    for (const tabla of ["audit_events", "strategy_versions"]) {
      await queryRunner.query(`
        CREATE TRIGGER "${tabla}_solo_insercion"
        BEFORE UPDATE OR DELETE ON "${tabla}"
        FOR EACH ROW EXECUTE FUNCTION robox_solo_insercion();
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of ["audit_events", "strategy_versions"]) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS "${tabla}_solo_insercion" ON "${tabla}"`);
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS robox_solo_insercion()`);
  }
}
