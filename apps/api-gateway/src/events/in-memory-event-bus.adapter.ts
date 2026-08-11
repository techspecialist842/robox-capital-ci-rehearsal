import { Injectable, Logger } from "@nestjs/common";
import { DomainEvent, EventBus, EventHandler } from "./event-bus.interface";

/**
 * Adaptador de desarrollo local (EVENT_BUS_DRIVER=memory). Entrega eventos de forma
 * sincrona dentro del mismo proceso — solo sirve para el proceso de api-gateway; no
 * cruza a quant-service. Para la prueba de extremo a extremo entre servicios (Fase 1,
 * Kickoff Dia 8) se usa el endpoint HTTP de quant-service que consume el mismo
 * contrato de packages/event-contracts. El adaptador real de AWS SNS/SQS se agrega en
 * infra/cdk una vez resuelto el Open Item 5 (acceso a la AWS Organization).
 */
@Injectable()
export class InMemoryEventBusAdapter implements EventBus {
  private readonly logger = new Logger(InMemoryEventBusAdapter.name);
  private readonly handlers = new Map<string, EventHandler[]>();

  async publish(event: DomainEvent): Promise<void> {
    this.logger.log(`publish ${event.eventType} v${event.eventVersion} (${event.eventId})`);
    const handlers = this.handlers.get(event.eventType) ?? [];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }
}
