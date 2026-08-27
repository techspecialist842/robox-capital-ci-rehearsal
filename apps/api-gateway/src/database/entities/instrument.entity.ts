import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Registro de instrumentos (Fase 2). Foco inicial del MVP: Oro, Bitcoin e
 * instrumentos liquidos seleccionados.
 */
@Entity({ name: "instruments" })
export class InstrumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  symbol!: string;

  @Column()
  name!: string;

  @Column({ name: "asset_class" })
  assetClass!: string;

  @Column({ length: 3 })
  currency!: string;

  @Column({ type: "varchar", nullable: true })
  exchange?: string | null;

  /**
   * Incremento minimo de precio. Se guarda como numeric y se transporta como
   * texto: en coma flotante binaria, 0.01 no es exactamente 0.01, y ese error
   * acumulado en calculos de precio es inaceptable.
   */
  @Column({ name: "tick_size", type: "numeric", precision: 18, scale: 8 })
  tickSize!: string;

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
