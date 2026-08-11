import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsers1700000000000 implements MigrationInterface {
  name = "CreateUsers1700000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar NOT NULL UNIQUE,
        "password_hash" varchar NOT NULL,
        "mfa_secret" varchar,
        "mfa_enabled" boolean NOT NULL DEFAULT false,
        "roles" text[] NOT NULL DEFAULT '{}',
        "active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Log de auditoria inmutable (append-only), Fase 1 criterio de aceptacion:
    // "Eventos de auditoria generados para acciones de autenticacion".
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_type" varchar NOT NULL,
        "actor_user_id" uuid,
        "payload" jsonb NOT NULL,
        "occurred_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      REVOKE UPDATE, DELETE ON "audit_events" FROM PUBLIC
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_events"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
