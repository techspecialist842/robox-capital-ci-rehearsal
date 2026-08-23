import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { v4 as uuid } from "uuid";
import { EVENT_BUS, EventBus } from "../../events/event-bus.interface";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";

/**
 * Escribe en la tabla de solo-insercion "audit_events" (ver migracion CreateUsers)
 * y publica el evento correspondiente en el bus, para acciones de autenticacion,
 * administracion, decisiones de riesgo y recomendaciones de IA (RFP §9).
 *
 * Las dos escrituras NO tienen la misma criticidad:
 *
 *  - La fila de auditoria es obligatoria. Si falla, la operacion falla: una
 *    accion sin auditar es inaceptable en una plataforma financiera.
 *  - La publicacion en el bus es notificacion a terceros. Si falla, se registra
 *    el error pero la operacion continua; tumbar la autenticacion porque la
 *    mensajeria se degrada seria un fallo peor que el original.
 *
 * Un evento no publicado es recuperable: "audit_events" es la fuente de verdad y
 * solo admite inserciones, asi que puede reproducirse desde ahi.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  async record(
    eventType: string,
    actorUserId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO audit_events (event_type, actor_user_id, payload) VALUES ($1, $2, $3)`,
      [eventType, actorUserId, JSON.stringify(payload)],
    );

    // Interruptor operativo del runbook: permite apagar la publicacion durante un
    // incidente del bus sin detener la autenticacion.
    if (!(await this.featureFlags.isEnabled("events.publish-enabled"))) {
      this.logger.warn(
        `publicacion desactivada por feature flag; ${eventType} queda solo en auditoria`,
      );
      return;
    }

    try {
      await this.eventBus.publish({
        eventId: uuid(),
        eventType,
        eventVersion: 1,
        occurredAt: new Date().toISOString(),
        producer: "api-gateway",
        payload,
      });
    } catch (error) {
      this.logger.error(
        `no se pudo publicar ${eventType}; la auditoria ya esta escrita y el evento ` +
          `puede reproducirse desde audit_events: ${String(error)}`,
      );
    }
  }
}
