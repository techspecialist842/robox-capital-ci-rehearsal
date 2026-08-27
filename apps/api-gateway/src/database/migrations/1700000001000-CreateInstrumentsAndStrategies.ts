import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Fase 2: registro de instrumentos y registro de estrategias con versionado y
 * ciclo de vida.
 *
 * El versionado se modela como tabla aparte y de solo insercion, no como columnas
 * mutables en "strategies". El motivo es que una estrategia decide operaciones con
 * dinero: para auditar por que se opero de cierta forma hay que poder recuperar
 * los parametros EXACTOS vigentes en ese momento, y eso desaparece si las
 * versiones se sobrescriben.
 */
export class CreateInstrumentsAndStrategies1700000001000 implements MigrationInterface {
  name = "CreateInstrumentsAndStrategies1700000001000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Foco inicial del MVP: Oro, Bitcoin e instrumentos liquidos seleccionados.
    await queryRunner.query(`
      CREATE TABLE "instruments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "symbol" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "asset_class" varchar NOT NULL,
        "currency" varchar(3) NOT NULL,
        "exchange" varchar,
        "tick_size" numeric(18, 8) NOT NULL DEFAULT 0.01,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "strategies" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL UNIQUE,
        "description" text,
        "status" varchar NOT NULL DEFAULT 'draft',
        "current_version" integer NOT NULL DEFAULT 1,
        "created_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Estados del ciclo de vida. Se restringen en la base y no solo en el codigo:
    // una escritura por otra via no puede dejar una estrategia en un estado que la
    // aplicacion no sepa interpretar.
    await queryRunner.query(`
      ALTER TABLE "strategies" ADD CONSTRAINT "strategies_status_valido"
        CHECK ("status" IN ('draft', 'active', 'suspended', 'archived'))
    `);

    await queryRunner.query(`
      CREATE TABLE "strategy_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "strategy_id" uuid NOT NULL REFERENCES "strategies"("id") ON DELETE CASCADE,
        "version" integer NOT NULL,
        "parameters" jsonb NOT NULL,
        "instrument_ids" uuid[] NOT NULL DEFAULT '{}',
        "created_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "strategy_versions_unicas" UNIQUE ("strategy_id", "version")
      )
    `);

    // El historial de versiones es evidencia de auditoria: solo se anade.
    await queryRunner.query(`
      REVOKE UPDATE, DELETE ON "strategy_versions" FROM PUBLIC
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_strategy_versions_strategy" ON "strategy_versions" ("strategy_id", "version" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "strategy_versions"`);
    await queryRunner.query(`DROP TABLE "strategies"`);
    await queryRunner.query(`DROP TABLE "instruments"`);
  }
}
