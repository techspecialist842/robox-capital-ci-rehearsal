import { CfnOutput, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Port, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
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

  /**
   * Grupo de seguridad de los servicios de aplicacion.
   *
   * Se declara aqui, y no en la pila de computo, para romper un ciclo entre
   * pilas: las reglas de entrada las anade la pila que posee el grupo destino
   * (base de datos), asi que si este grupo naciera en computo, Database tendria
   * que referenciar a Compute y Compute a Database a la vez. Ya ocurrio un ciclo
   * asi entre Secrets y Database.
   */
  public readonly appSecurityGroup: SecurityGroup;

  /** Grupo del balanceador. Vive aqui por el mismo motivo que el anterior. */
  public readonly albSecurityGroup: SecurityGroup;

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

    this.appSecurityGroup = new SecurityGroup(this, "AppSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: `robox-${props.environmentName}-app`,
      description: "Servicios de aplicacion (api-gateway, quant-service)",
      allowAllOutbound: true,
    });

    this.albSecurityGroup = new SecurityGroup(this, "AlbSecurityGroup", {
      vpc: this.vpc,
      securityGroupName: `robox-${props.environmentName}-alb`,
      description: "Balanceador publico; unico expuesto a internet",
      allowAllOutbound: true,
    });

    // El api-gateway solo acepta trafico del balanceador, nunca directo.
    this.appSecurityGroup.addIngressRule(
      this.albSecurityGroup,
      Port.tcp(3000),
      "api-gateway desde el balanceador",
    );

    // Ambos servicios comparten grupo, asi que hablarse entre ellos requiere una
    // regla explicita: pertenecer al mismo grupo no habilita el trafico por si solo.
    this.appSecurityGroup.addIngressRule(
      this.appSecurityGroup,
      Port.tcp(8000),
      "quant-service desde el api-gateway",
    );

    // Salidas y no etiquetas: el pipeline necesita estos valores para lanzar la
    // tarea de migraciones, y las etiquetas de subred que genera CDK dependen de
    // la ruta del constructo, no del nombre de la VPC. Una salida es un contrato
    // estable; una etiqueta, un detalle de implementacion.
    new CfnOutput(this, "AppSubnetIds", {
      value: this.vpc.selectSubnets({ subnetType: SubnetType.PRIVATE_WITH_EGRESS })
        .subnetIds.join(","),
      description: "Subredes de aplicacion, separadas por comas",
    });

    new CfnOutput(this, "AppSecurityGroupId", {
      value: this.appSecurityGroup.securityGroupId,
    });

    Tags.of(this).add("robox:environment", props.environmentName);
    Tags.of(this).add("robox:managed-by", "cdk");
  }
}
