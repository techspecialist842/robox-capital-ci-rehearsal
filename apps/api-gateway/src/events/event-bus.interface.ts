export interface DomainEvent<TPayload = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  producer: string;
  payload: TPayload;
}

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

/**
 * Puerto (en el sentido de arquitectura hexagonal) del bus de eventos (ADR-002).
 * El adaptador concreto (memoria en desarrollo, SNS/SQS en AWS) se selecciona en
 * events.module.ts segun EVENT_BUS_DRIVER, sin que el resto del codigo lo sepa.
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
}

export const EVENT_BUS = Symbol("EVENT_BUS");
