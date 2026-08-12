import { Logger, OnModuleDestroy } from "@nestjs/common";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { DomainEvent, EventBus, EventHandler } from "./event-bus.interface";
import { IdempotencyService } from "./idempotency.service";

export interface SnsSqsOptions {
  region: string;
  topicArn: string;
  /** Cola de la que consume este servicio. Si falta, el adaptador solo publica. */
  queueUrl?: string;
  /** Endpoint alternativo — lo usa LocalStack en las pruebas de integracion. */
  endpoint?: string;
  waitTimeSeconds?: number;
}

/**
 * Adaptador real del bus (ADR-002). Publica en SNS y consume de una cola SQS.
 *
 * Cumple la semantica documentada en packages/event-contracts/SEMANTICA.md:
 *  - idempotencia por eventId antes de ejecutar el manejador,
 *  - el mensaje solo se borra si el manejador termino bien; si falla, se deja
 *    vencer el plazo de visibilidad para que SQS lo reintente y, tras N intentos,
 *    la propia cola lo mueva a la DLQ.
 */
export class SnsSqsEventBusAdapter implements EventBus, OnModuleDestroy {
  private readonly logger = new Logger(SnsSqsEventBusAdapter.name);
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly sns: SNSClient;
  private readonly sqs: SQSClient;
  private polling = false;
  private stopped = false;

  constructor(
    private readonly options: SnsSqsOptions,
    private readonly idempotency: IdempotencyService,
  ) {
    const common = {
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    };
    this.sns = new SNSClient(common);
    this.sqs = new SQSClient(common);
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        TopicArn: this.options.topicArn,
        Message: JSON.stringify(event),
        // Permiten que un consumidor filtre por tipo en la suscripcion en vez de
        // recibir todo y descartar lo que no le interesa.
        MessageAttributes: {
          eventType: { DataType: "String", StringValue: event.eventType },
          eventVersion: { DataType: "Number", StringValue: String(event.eventVersion) },
        },
      }),
    );
    this.logger.log(`publicado ${event.eventType} v${event.eventVersion} (${event.eventId})`);
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);

    if (!this.polling && this.options.queueUrl) {
      this.polling = true;
      void this.poll();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.sns.destroy();
    this.sqs.destroy();
  }

  /** Bucle de consumo con espera larga: menos llamadas vacias y menor latencia. */
  private async poll(): Promise<void> {
    while (!this.stopped) {
      try {
        const response = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.options.queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: this.options.waitTimeSeconds ?? 20,
          }),
        );
        for (const message of response.Messages ?? []) {
          await this.handleMessage(message);
        }
      } catch (error) {
        if (!this.stopped) {
          this.logger.error(`fallo al leer de SQS: ${String(error)}`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    let event: DomainEvent;
    try {
      event = this.parse(message.Body ?? "");
    } catch {
      // Un mensaje ilegible no mejora con reintentos; se deja que la cola lo
      // lleve a la DLQ para inspeccion manual.
      this.logger.error("mensaje descartado: cuerpo ilegible");
      return;
    }

    // Regla 1: reservar antes de actuar. Si ya estaba reservado, es un duplicado
    // y basta con borrarlo de la cola.
    if (!(await this.idempotency.claim(event.eventId))) {
      this.logger.log(`duplicado ignorado: ${event.eventId}`);
      await this.deleteMessage(message);
      return;
    }

    try {
      for (const handler of this.handlers.get(event.eventType) ?? []) {
        await handler(event);
      }
      await this.deleteMessage(message);
    } catch (error) {
      // Regla 3: NO se borra el mensaje. Se libera la marca para que el reintento
      // vuelva a ejecutarse de verdad en lugar de descartarse como duplicado.
      await this.idempotency.release(event.eventId);
      this.logger.error(`fallo al procesar ${event.eventId}, se reintentara: ${String(error)}`);
    }
  }

  /**
   * SNS entrega envuelto en su propio sobre cuando la suscripcion no tiene
   * "raw message delivery"; se aceptan ambas formas para no depender de ese ajuste.
   */
  private parse(body: string): DomainEvent {
    const parsed = JSON.parse(body);
    return typeof parsed?.Message === "string" ? JSON.parse(parsed.Message) : parsed;
  }

  private async deleteMessage(message: Message): Promise<void> {
    await this.sqs.send(
      new DeleteMessageCommand({
        QueueUrl: this.options.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }
}
