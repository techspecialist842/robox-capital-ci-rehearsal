import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import {
  InstanceClass,
  InstanceSize,
  InstanceType,

  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { CfnCacheCluster, CfnSubnetGroup } from "aws-cdk-lib/aws-elasticache";
import { Key } from "aws-cdk-lib/aws-kms";
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { ISecret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface DatabaseStackProps extends StackProps {
  environmentName: string;
  vpc: Vpc;
  encryptionKey: Key;
  /** Grupo de seguridad de los servicios; unico origen autorizado. */
  appSecurityGroup: SecurityGroup;
}

/**
 * ADR-003: PostgreSQL como sistema de registro; Redis solo para sesion/cache.
 * Ambos en subredes privadas aisladas (private-data), sin endpoint publico.
 */
export class DatabaseStack extends Stack {
  public readonly databaseSecret: ISecret;
  public readonly databaseEndpoint: string;
  public readonly databasePort: string;
  public readonly redisEndpoint: string;
  public readonly redisPort: string;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const dataSubnets = props.vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_ISOLATED });

    const dbSecurityGroup = new SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc: props.vpc,
      description: "Acceso a PostgreSQL unicamente desde la subred de aplicacion",
      allowAllOutbound: false,
    });

    // El origen es el grupo de la aplicacion, no un rango de red: si mañana la
    // aplicacion cambia de subred, la regla sigue siendo correcta.
    dbSecurityGroup.addIngressRule(
      props.appSecurityGroup,
      Port.tcp(5432),
      "PostgreSQL desde los servicios de aplicacion",
    );

    const postgres = new DatabaseInstance(this, "PostgresInstance", {
      instanceIdentifier: `robox-${props.environmentName}-postgres`,
      vpc: props.vpc,
      vpcSubnets: dataSubnets,
      securityGroups: [dbSecurityGroup],
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_16 }),
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      // Secreto generado y co-localizado en este mismo stack (ver nota en
      // secrets-stack.ts) — evita el ciclo de dependencia entre stacks.
      credentials: Credentials.fromGeneratedSecret("robox", {
        secretName: `robox-${props.environmentName}-database-credentials`,
        encryptionKey: props.encryptionKey,
      }),
      storageEncrypted: true,
      storageEncryptionKey: props.encryptionKey,
      allocatedStorage: 20,
      multiAz: props.environmentName === "prod",
      deletionProtection: props.environmentName === "prod",
      removalPolicy:
        props.environmentName === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      publiclyAccessible: false,
      // El RPO aprobado es de 5 minutos para datos transaccionales. Lo cubre la
      // recuperacion a un punto en el tiempo de RDS, que solo existe si hay
      // copias automaticas: con retencion 0 no habria a donde recuperar.
      // La ventana determina hasta cuando se puede retroceder.
      backupRetention: Duration.days(props.environmentName === "prod" ? 30 : 7),
    });

    const redisSubnetGroup = new CfnSubnetGroup(this, "RedisSubnetGroup", {
      description: `Subnet group de Redis para ${props.environmentName}`,
      subnetIds: dataSubnets.subnetIds,
    });

    const redisSecurityGroup = new SecurityGroup(this, "RedisSecurityGroup", {
      vpc: props.vpc,
      description: "Acceso a Redis unicamente desde la subred de aplicacion",
      allowAllOutbound: false,
    });

    redisSecurityGroup.addIngressRule(
      props.appSecurityGroup,
      Port.tcp(6379),
      "Redis desde los servicios de aplicacion",
    );

    const redis = new CfnCacheCluster(this, "RedisCluster", {
      clusterName: `robox-${props.environmentName}-redis`,
      engine: "redis",
      cacheNodeType: "cache.t3.micro",
      numCacheNodes: 1,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
    });

    this.databaseSecret = postgres.secret!;
    this.databaseEndpoint = postgres.dbInstanceEndpointAddress;
    this.databasePort = postgres.dbInstanceEndpointPort;
    this.redisEndpoint = redis.attrRedisEndpointAddress;
    this.redisPort = redis.attrRedisEndpointPort;

    new CfnOutput(this, "PostgresEndpoint", { value: this.databaseEndpoint });
    new CfnOutput(this, "RedisEndpoint", { value: this.redisEndpoint });

    Tags.of(this).add("robox:environment", props.environmentName);
    Tags.of(this).add("robox:managed-by", "cdk");

  }
}
