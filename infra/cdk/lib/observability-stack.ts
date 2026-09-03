import { Duration, Stack, StackProps, Tags } from "aws-cdk-lib";
import {
  Alarm,
  ComparisonOperator,
  Metric,
  TreatMissingData,
} from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Key } from "aws-cdk-lib/aws-kms";
import { Topic } from "aws-cdk-lib/aws-sns";
import { IQueue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface ObservabilityStackProps extends StackProps {
  environmentName: string;
  /** ARN, no el objeto: evita que CDK modifique la politica de la clave. */
  encryptionKeyArn: string;
  loadBalancerFullName: string;
  targetGroupFullName: string;
  deadLetterQueue: IQueue;
}

/**
 * Alarmas de la plataforma.
 *
 * Cada umbral corresponde a un objetivo APROBADO por el cliente el 14/08/2026 y
 * registrado en docs/objetivos-no-funcionales.md. No se inventan valores aqui:
 * si un umbral cambia, se cambia primero ese documento, que es el acuerdo.
 *
 * Solo se alarma sobre lo que alguien haria algo al recibirlo. Una alarma que se
 * ignora entrena al equipo a ignorar las demas.
 */
export class ObservabilityStack extends Stack {
  public readonly alarmTopic: Topic;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { environmentName } = props;

    this.alarmTopic = new Topic(this, "AlarmTopic", {
      topicName: `robox-${environmentName}-alarmas`,
      masterKey: Key.fromKeyArn(this, "EncryptionKey", props.encryptionKeyArn),
      // Las suscripciones (correo, guardia) se anaden fuera de CDK: cambian con
      // las personas, no con la infraestructura.
    });

    const accion = new SnsAction(this.alarmTopic);
    const alarma = (
      id: string,
      metrica: Metric,
      umbral: number,
      descripcion: string,
      operador: ComparisonOperator = ComparisonOperator.GREATER_THAN_THRESHOLD,
    ): Alarm => {
      const a = new Alarm(this, id, {
        alarmName: `robox-${environmentName}-${id}`,
        metric: metrica,
        threshold: umbral,
        evaluationPeriods: 2,
        comparisonOperator: operador,
        alarmDescription: descripcion,
        // Sin datos NO es un fallo: un servicio sin trafico a las 3 de la manana
        // despertaria a alguien para nada.
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      a.addAlarmAction(accion);
      return a;
    };

    const dimensionesAlb = { LoadBalancer: props.loadBalancerFullName };
    const dimensionesDestino = {
      LoadBalancer: props.loadBalancerFullName,
      TargetGroup: props.targetGroupFullName,
    };

    // Objetivo aprobado: consultas de lectura por debajo de 500 ms en p95.
    alarma(
      "latencia-p95",
      new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "TargetResponseTime",
        dimensionsMap: dimensionesDestino,
        statistic: "p95",
        period: Duration.minutes(5),
      }),
      0.5,
      "Latencia p95 por encima del objetivo aprobado de 500 ms",
    );

    // Objetivo aprobado: 99,9 % de disponibilidad mensual equivale a unos 43
    // minutos al mes. Se alarma sobre la tasa de error, que es lo accionable.
    alarma(
      "errores-5xx",
      new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HTTPCode_Target_5XX_Count",
        dimensionsMap: dimensionesAlb,
        statistic: "Sum",
        period: Duration.minutes(5),
      }),
      10,
      "Errores 5xx sostenidos: compromete el objetivo de disponibilidad",
    );

    alarma(
      "sin-instancias-sanas",
      new Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HealthyHostCount",
        dimensionsMap: dimensionesDestino,
        statistic: "Minimum",
        period: Duration.minutes(1),
      }),
      1,
      "Ninguna instancia sana: el servicio esta caido",
      ComparisonOperator.LESS_THAN_THRESHOLD,
    );

    // Un mensaje en la cola de fallidos significa que algo se rompio de forma que
    // el reintento no arregla. Umbral 0: uno solo ya merece atencion.
    alarma(
      "mensajes-en-dlq",
      props.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
        statistic: "Maximum",
      }),
      0,
      "Hay eventos en la cola de fallidos; requieren inspeccion manual",
    );

    Tags.of(this).add("robox:environment", environmentName);
    Tags.of(this).add("robox:managed-by", "cdk");
  }
}
