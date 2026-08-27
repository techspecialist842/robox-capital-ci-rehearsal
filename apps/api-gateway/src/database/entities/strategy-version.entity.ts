import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

/**
 * Version inmutable de una estrategia. No tiene columna de actualizacion a
 * proposito: una vez creada no cambia.
 *
 * Es la evidencia que permite responder "con que parametros exactos se decidio
 * esta operacion". Si las versiones se sobrescribieran, esa pregunta dejaria de
 * tener respuesta y con ella la trazabilidad de las decisiones.
 */
@Entity({ name: "strategy_versions" })
export class StrategyVersionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "strategy_id", type: "uuid" })
  strategyId!: string;

  @Column()
  version!: number;

  @Column({ type: "jsonb" })
  parameters!: Record<string, unknown>;

  @Column({ name: "instrument_ids", type: "uuid", array: true, default: () => "'{}'" })
  instrumentIds!: string[];

  @Column({ name: "created_by", type: "uuid" })
  createdBy!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
