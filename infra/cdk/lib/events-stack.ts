import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import { IKey } from "aws-cdk-lib/aws-kms";
import { Topic } from "aws-cdk-lib/aws-sns";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface EventsStackProps extends StackProps {
  environmentName: string;
  encryptionKey: IKey;
}

/**
 * Bus de eventos de la plataforma (ADR-002). La semantica que deben cumplir
 * productores y consumidores esta en packages/event-contracts/SEMANTICA.md; esta
 * pila es la parte que hace cumplir dos de esas reglas desde la infraestructura.
 */
export class EventsStack extends Stack {
  public readonly topic: Topic;
  public readonly quantServiceQueue: Queue;
  public readonly deadLetterQueue: Queue;

  constructor(scope: Construct, id: string, props: EventsStackProps) {
    super(scope, id, props);

    const { environmentName, encryptionKey } = props;

    // Los eventos de dominio pueden contener datos de negocio: se cifran en reposo
    // con la misma clave gestionada que el resto de la plataforma (ADR-008).
    this.topic = new Topic(this, "DomainEvents", {
      topicName: `roboX-${environmentName}-domain-events`,
      masterKey: encryptionKey,
    });

    // Regla 3: tras 5 entregas fallidas el mensaje se aparta en lugar de
    // reintentarse para siempre. Un mensaje aqui es una alerta operativa.
    this.deadLetterQueue = new Queue(this, "QuantServiceDlq", {
      queueName: `roboX-${environmentName}-quant-service-dlq`,
      encryptionMasterKey: encryptionKey,
      // Amplio a proposito: da margen para diagnosticar y reprocesar sin prisa.
      retentionPeriod: Duration.days(14),
    });

    this.quantServiceQueue = new Queue(this, "QuantServiceQueue", {
      queueName: `roboX-${environmentName}-quant-service`,
      encryptionMasterKey: encryptionKey,
      // Debe superar el tiempo maximo de proceso de un mensaje; si se queda corto,
      // SQS lo reentrega mientras aun se esta procesando y se generan duplicados
      // evitables (la idempotencia los absorbe, pero es trabajo desperdiciado).
      visibilityTimeout: Duration.seconds(60),
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: 5 },
    });

    // Entrega en crudo: el consumidor recibe el evento tal cual, sin el sobre de
    // SNS. Los adaptadores aceptan ambas formas, pero asi el mensaje en la cola es
    // exactamente el que define el contrato.
    this.topic.addSubscription(
      new SqsSubscription(this.quantServiceQueue, { rawMessageDelivery: true }),
    );

    new CfnOutput(this, "TopicArn", { value: this.topic.topicArn });
    new CfnOutput(this, "QuantServiceQueueUrl", { value: this.quantServiceQueue.queueUrl });
    new CfnOutput(this, "DeadLetterQueueUrl", { value: this.deadLetterQueue.queueUrl });
  }
}
