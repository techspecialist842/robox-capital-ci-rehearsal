import { Stack, StackProps, Tags } from "aws-cdk-lib";
import { Vpc, SubnetType } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface NetworkStackProps extends StackProps {
  /** dev | staging | prod — ver Seccion 7 (Estructura de Entornos y Cuentas) */
  environmentName: string;
}

/**
 * VPC separada por entorno; almacenes de datos unicamente en subredes privadas,
 * sin endpoints publicos de base de datos (Entregables del Paso 0, Seccion 7).
 */
export class NetworkStack extends Stack {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    this.vpc = new Vpc(this, "Vpc", {
      vpcName: `robox-${props.environmentName}-vpc`,
      maxAzs: 2,
      natGateways: props.environmentName === "prod" ? 2 : 1,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "private-app",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "private-data",
          subnetType: SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    Tags.of(this).add("robox:environment", props.environmentName);
    Tags.of(this).add("robox:managed-by", "cdk");
  }
}
