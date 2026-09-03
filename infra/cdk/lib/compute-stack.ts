import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository, TagMutability } from "aws-cdk-lib/aws-ecr";
import {
  AwsLogDriver,
  Cluster,
  ContainerImage,
  ContainerInsights,
  FargateService,
  FargateTaskDefinition,
  Secret as EcsSecret,
} from "aws-cdk-lib/aws-ecs";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { IKey, Key } from "aws-cdk-lib/aws-kms";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { ITopic } from "aws-cdk-lib/aws-sns";
import { IQueue } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

export interface ComputeStackProps extends StackProps {
  environmentName: string;
  vpc: Vpc;
  appSecurityGroup: SecurityGroup;
  albSecurityGroup: SecurityGroup;
  /**
   * ARN, no el objeto Key. Pasar el objeto hace que CDK anada sentencias a la
   * POLITICA DE LA CLAVE, que vive en la pila de secretos, y eso crea un ciclo
   * entre pilas. Importada por ARN, CDK no puede tocar su politica y concede los
   * permisos en el rol, que es donde deben estar.
   */
  encryptionKeyArn: string;
  /** ARN completo. Se importa dentro, por el mismo motivo que la clave. */
  databaseSecretArn: string;
  databaseEndpoint: string;
  databasePort: string;
  redisEndpoint: string;
  redisPort: string;
  eventsTopic: ITopic;
  quantServiceQueue: IQueue;
  aiProviderApiKeyArn: string;
}

/**
 * Donde se ejecutan los servicios (ADR-001).
 *
 * ECS sobre Fargate y no Kubernetes: para el tamano de equipo de este MVP, la
 * complejidad operativa de Kubernetes no se paga con nada. Es la misma decision
 * que ya funciona en el otro proyecto del cliente.
 *
 * Los secretos NO viajan como variables de entorno en texto plano: se inyectan
 * desde Secrets Manager en el arranque de la tarea (ADR-008). El servicio nunca
 * los ve escritos en la definicion.
 */
export class ComputeStack extends Stack {
  public readonly apiGatewayRepository: Repository;
  public readonly quantServiceRepository: Repository;
  public readonly loadBalancerDns: string;
  /** Nombres que CloudWatch usa como dimensiones de metrica. */
  public readonly loadBalancerFullName: string;
  public readonly targetGroupFullName: string;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { environmentName } = props;
    // Clave y secretos se importan por ARN. Si se pasaran los objetos, CDK
    // anadiria permisos a la POLITICA DE LA CLAVE, que vive en la pila de
    // secretos, creando un ciclo: Secrets referenciaria al rol de ejecucion de
    // Compute mientras Compute referencia la clave de Secrets.
    const encryptionKey: IKey = Key.fromKeyArn(this, "EncryptionKey", props.encryptionKeyArn);
    const databaseSecret: ISecret = Secret.fromSecretCompleteArn(
      this,
      "DatabaseSecret",
      props.databaseSecretArn,
    );
    const aiProviderApiKey: ISecret = Secret.fromSecretCompleteArn(
      this,
      "AiProviderApiKey",
      props.aiProviderApiKeyArn,
    );
    const esProduccion = environmentName === "prod";

    // Etiquetas inmutables: una imagen etiquetada no puede reescribirse. Sin
    // esto, "la version desplegada" deja de ser una referencia fiable y un
    // despliegue reproducible es imposible.
    const repositorio = (nombre: string): Repository =>
      new Repository(this, `${nombre}Repository`, {
        repositoryName: `robox-${environmentName}-${nombre.toLowerCase()}`,
        imageTagMutability: TagMutability.IMMUTABLE,
        imageScanOnPush: true,
        removalPolicy: esProduccion ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
        emptyOnDelete: !esProduccion,
      });

    this.apiGatewayRepository = repositorio("ApiGateway");
    this.quantServiceRepository = repositorio("QuantService");

    const cluster = new Cluster(this, "Cluster", {
      clusterName: `robox-${environmentName}`,
      vpc: props.vpc,
      containerInsightsV2: ContainerInsights.ENABLED,
    });

    const logGroup = new LogGroup(this, "ServiceLogs", {
      logGroupName: `/ecs/robox-${environmentName}`,
      // Los logs llevan el rastro de operaciones sobre dinero: se retienen mas en
      // produccion. El archivo de largo plazo vive en la cuenta de seguridad.
      retention: esProduccion ? RetentionDays.ONE_YEAR : RetentionDays.ONE_MONTH,
      encryptionKey,
      removalPolicy: esProduccion ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const entornoComun = {
      ENVIRONMENT: environmentName,
      LOG_LEVEL: esProduccion ? "log" : "debug",
      AWS_REGION: this.region,
      // Fuera de local, leer secretos de variables de entorno esta prohibido y el
      // servicio se niega a arrancar si se intenta (ADR-008).
      SECRETS_PROVIDER: "aws",
      EVENT_BUS_DRIVER: "sns-sqs",
      EVENT_BUS_TOPIC_ARN: props.eventsTopic.topicArn,
      EVENT_BUS_QUEUE_URL: props.quantServiceQueue.queueUrl,
      POSTGRES_HOST: props.databaseEndpoint,
      POSTGRES_PORT: props.databasePort,
      POSTGRES_DB: "robox",
      REDIS_HOST: props.redisEndpoint,
      REDIS_PORT: props.redisPort,
    };

    const apiGateway = this.crearServicio({
      nombre: "ApiGateway",
      cluster,
      logGroup,
      props,
      puerto: 3000,
      imagen: this.apiGatewayRepository,
      entorno: { ...entornoComun, SERVICE_NAME: "api-gateway" },
      secretos: {
        POSTGRES_USER: EcsSecret.fromSecretsManager(databaseSecret, "username"),
        POSTGRES_PASSWORD: EcsSecret.fromSecretsManager(databaseSecret, "password"),
      },
    });

    const quantService = this.crearServicio({
      nombre: "QuantService",
      cluster,
      logGroup,
      props,
      puerto: 8000,
      imagen: this.quantServiceRepository,
      entorno: { ...entornoComun, SERVICE_NAME: "quant-service" },
      secretos: {
        AI_PROVIDER_API_KEY: EcsSecret.fromSecretsManager(aiProviderApiKey),
      },
    });

    // Solo el api-gateway se expone: es el unico punto de entrada autenticado y
    // el quant-service no debe ser alcanzable desde fuera de la VPC (RFP §8).
    const alb = new ApplicationLoadBalancer(this, "LoadBalancer", {
      loadBalancerName: `robox-${environmentName}-alb`,
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      // El grupo se declara en NetworkStack: si naciera aqui, la regla de entrada
      // hacia la aplicacion crearia un ciclo entre las pilas Network y Compute.
      securityGroup: props.albSecurityGroup,
    });

    // Sin defaultAction: addTargets convierte al api-gateway en el destino por
    // defecto. Declarar aqui una respuesta fija seria codigo muerto, porque CDK
    // la reemplaza sin avisar mas que con una advertencia.
    const listener = alb.addListener("Http", {
      port: 80,
      protocol: ApplicationProtocol.HTTP,
    });

    const targetGroup = listener.addTargets("ApiGatewayTarget", {
      port: 3000,
      protocol: ApplicationProtocol.HTTP,
      targets: [apiGateway],
      healthCheck: {
        path: "/health",
        interval: Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      // Un despliegue no debe cortar peticiones en curso.
      deregistrationDelay: Duration.seconds(30),
    });

    props.eventsTopic.grantPublish(apiGateway.taskDefinition.taskRole);
    props.quantServiceQueue.grantConsumeMessages(quantService.taskDefinition.taskRole);
    // Permiso en el rol y no en la clave, por el motivo explicado arriba.
    const usoDeClave = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"],
      resources: [props.encryptionKeyArn],
    });
    for (const servicio of [apiGateway, quantService]) {
      servicio.taskDefinition.taskRole.addToPrincipalPolicy(usoDeClave);
      servicio.taskDefinition.obtainExecutionRole().addToPrincipalPolicy(usoDeClave);
    }

    this.loadBalancerDns = alb.loadBalancerDnsName;
    this.loadBalancerFullName = alb.loadBalancerFullName;
    this.targetGroupFullName = targetGroup.targetGroupFullName;

    new CfnOutput(this, "LoadBalancerDns", { value: this.loadBalancerDns });
    new CfnOutput(this, "ApiGatewayRepositoryUri", {
      value: this.apiGatewayRepository.repositoryUri,
    });
    new CfnOutput(this, "QuantServiceRepositoryUri", {
      value: this.quantServiceRepository.repositoryUri,
    });

    Tags.of(this).add("robox:environment", environmentName);
    Tags.of(this).add("robox:managed-by", "cdk");
  }

  private crearServicio(opciones: {
    nombre: string;
    cluster: Cluster;
    logGroup: LogGroup;
    props: ComputeStackProps;
    puerto: number;
    imagen: Repository;
    entorno: Record<string, string>;
    secretos: Record<string, EcsSecret>;
  }): FargateService {
    const { nombre, cluster, logGroup, props, puerto, imagen, entorno, secretos } = opciones;

    const taskDefinition = new FargateTaskDefinition(this, `${nombre}Task`, {
      family: `robox-${props.environmentName}-${nombre.toLowerCase()}`,
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    taskDefinition.addContainer(`${nombre}Container`, {
      // "bootstrap" es una etiqueta marcador: el pipeline despliega la imagen
      // real por commit. CDK exige una imagen valida para sintetizar, pero la
      // version desplegada nunca se decide aqui.
      image: ContainerImage.fromEcrRepository(imagen, "bootstrap"),
      environment: entorno,
      secrets: secretos,
      logging: new AwsLogDriver({ streamPrefix: nombre.toLowerCase(), logGroup }),
      portMappings: [{ containerPort: puerto }],
    });

    return new FargateService(this, `${nombre}Service`, {
      serviceName: `robox-${props.environmentName}-${nombre.toLowerCase()}`,
      cluster,
      taskDefinition,
      securityGroups: [props.appSecurityGroup],
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      desiredCount: props.environmentName === "prod" ? 2 : 1,
      // Explicito: con una sola tarea en desarrollo se acepta una interrupcion
      // durante el despliegue; en produccion no se baja de la capacidad actual.
      minHealthyPercent: props.environmentName === "prod" ? 100 : 0,
      // Sin esto, un despliegue fallido deja el servicio caido en lugar de
      // revertir a la version anterior que si funcionaba.
      circuitBreaker: { rollback: true },
      enableExecuteCommand: props.environmentName !== "prod",
    });
  }
}
