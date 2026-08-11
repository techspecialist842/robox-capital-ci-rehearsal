import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Modelo de datos inicial de Identidad (Fase 1, Kickoff Dia 1-2).
 * Los roles se modelan como texto simple en el MVP; RBAC granular por permiso
 * se evalua en fases posteriores si el negocio lo requiere.
 */
@Entity({ name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: "password_hash" })
  passwordHash!: string;

  @Column({ type: "varchar", name: "mfa_secret", nullable: true })
  mfaSecret?: string | null;

  @Column({ name: "mfa_enabled", default: false })
  mfaEnabled!: boolean;

  @Column({ type: "text", array: true, default: () => "'{}'" })
  roles!: string[];

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
