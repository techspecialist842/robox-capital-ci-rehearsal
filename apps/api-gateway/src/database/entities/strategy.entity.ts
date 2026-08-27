import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Estados del ciclo de vida de una estrategia (Fase 2, criterio de aceptacion:
 * "las estrategias pueden crearse/versionarse/suspenderse").
 *
 *   draft     -> recien creada, no opera
 *   active    -> puede generar recomendaciones
 *   suspended -> detenida temporalmente; puede reactivarse
 *   archived  -> retirada de forma definitiva; no vuelve
 */
export type StrategyStatus = "draft" | "active" | "suspended" | "archived";

@Entity({ name: "strategies" })
export class StrategyEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ type: "text", nullable: true })
  description?: string | null;

  @Column({ type: "varchar", default: "draft" })
  status!: StrategyStatus;

  @Column({ name: "current_version", default: 1 })
  currentVersion!: number;

  @Column({ name: "created_by", type: "uuid" })
  createdBy!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
