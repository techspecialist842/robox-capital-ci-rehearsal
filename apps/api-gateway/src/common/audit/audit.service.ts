import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { v4 as uuid } from "uuid";
import { EVENT_BUS, EventBus } from "../../events/event-bus.interface";

/**
 * Escribe en la tabla de solo-insercion "audit_events" (ver migracion CreateUsers)
 * y publica el evento correspondiente en el bus, para acciones de autenticacion,
 * administracion, decisiones de riesgo y recomendaciones de IA (RFP §9).
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  async record(eventType: string, actorUserId: string | null, payload: Record<string, unknown>): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO audit_events (event_type, actor_user_id, payload) VALUES ($1, $2, $3)`,
      [eventType, actorUserId, JSON.stringify(payload)],
    );

    await this.eventBus.publish({
      eventId: uuid(),
      eventType,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      producer: "api-gateway",
      payload,
    });
  }
}
