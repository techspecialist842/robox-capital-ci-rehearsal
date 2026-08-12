/**
 * Publica un platform.test_message en SNS usando el adaptador real ya compilado.
 *
 * Lo usa la prueba de integracion del bus contra LocalStack. Publica el MISMO
 * evento dos veces a proposito: es lo que permite comprobar del otro lado que una
 * reentrega no se procesa dos veces (regla 1 de SEMANTICA.md).
 */
const { randomUUID } = require("node:crypto");
const { SnsSqsEventBusAdapter } = require("../dist/events/sns-sqs-event-bus.adapter");

// El adaptador solo usa la idempotencia al consumir; aqui publicamos.
const idempotencyStub = { claim: async () => true, release: async () => {} };

async function main() {
  const topicArn = process.env.EVENT_BUS_TOPIC_ARN;
  if (!topicArn) {
    throw new Error("falta EVENT_BUS_TOPIC_ARN");
  }

  const bus = new SnsSqsEventBusAdapter(
    {
      region: process.env.AWS_REGION ?? "us-east-1",
      topicArn,
      endpoint: process.env.AWS_ENDPOINT_URL,
    },
    idempotencyStub,
  );

  const event = {
    eventId: randomUUID(),
    eventType: "platform.test_message",
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    producer: "api-gateway",
    payload: { message: "prueba de extremo a extremo de la Fase 1" },
  };

  await bus.publish(event);
  await bus.publish(event); // reentrega deliberada

  // El script de Python lo lee para saber que eventId debe esperar.
  process.stdout.write(`${event.eventId}\n`);
  await bus.onModuleDestroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
