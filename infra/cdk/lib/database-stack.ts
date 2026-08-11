import { RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { InstanceClass, InstanceSize, InstanceType, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { CfnCacheCluster, CfnSubnetGroup } from "aws-cdk-lib/aws-elasticache";
import { Key } from "aws-cdk-lib/aws-kms";
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

export interface DatabaseStackProps extends StackProps {
  environmentName: string;
  vpc: Vpc;
  encryptionKey: Key;
}

/**
 * ADR-003: PostgreSQL como sistema de registro; Redis solo para sesion/cache.
 * Ambos en subredes privadas aisladas (private-data), sin endpoint publico.
 */
export class DatabaseStack extends Stack {
  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const dataSubnets = props.vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_ISOLATED });

    const dbSecurityGroup = new SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc: props.vpc,
      description: "Acceso a PostgreSQL unicamente desde la subred de aplicacion",
      allowAllOutbound: false,
    });

    new DatabaseInstance(this, "PostgresInstance", {
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

    new CfnCacheCluster(this, "RedisCluster", {
      clusterName: `robox-${props.environmentName}-redis`,
      engine: "redis",
      cacheNodeType: "cache.t3.micro",
      numCacheNodes: 1,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
    });

    Tags.of(this).add("robox:environment", props.environmentName);
    Tags.of(this).add("robox:managed-by", "cdk");
  }
}
