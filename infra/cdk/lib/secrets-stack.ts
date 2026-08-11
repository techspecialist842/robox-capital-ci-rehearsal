import { RemovalPolicy, Stack, StackProps, Tags } from "aws-cdk-lib";
import { Key } from "aws-cdk-lib/aws-kms";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface SecretsStackProps extends StackProps {
  environmentName: string;
}

/**
 * ADR-008: secretos de la aplicacion en AWS Secrets Manager, claves de cifrado en
 * KMS. Los valores reales (contrasena de DB, claves de proveedores) se rotan e
 * inyectan fuera de CDK — aqui solo se declara la forma del secreto.
 */
export class SecretsStack extends Stack {
  public readonly encryptionKey: Key;
  public readonly aiProviderApiKey: Secret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    this.encryptionKey = new Key(this, "AppEncryptionKey", {
      alias: `robox-${props.environmentName}-app-key`,
      enableKeyRotation: true,
      removalPolicy:
        props.environmentName === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Nota: las credenciales de PostgreSQL se generan dentro de DatabaseStack
    // (no aqui) para evitar el ciclo de dependencia conocido de CDK cuando
    // DatabaseInstance."attach()" a un Secret que vive en otro stack —
    // RDS crea una SecretTargetAttachment en el stack del secreto que
    // referencia de vuelta a la instancia, formando un ciclo entre stacks.

    // ADR-007 — la clave del proveedor de IA (OpenAI) vive unicamente aqui; el
    // servicio la lee en tiempo de ejecucion, nunca en codigo ni variables de
    // entorno en texto plano.
    this.aiProviderApiKey = new Secret(this, "AiProviderApiKey", {
      secretName: `robox-${props.environmentName}-ai-provider-api-key`,
      encryptionKey: this.encryptionKey,
      description: "Clave de API de OpenAI (ADR-007). Valor real cargado fuera de CDK.",
    });

    Tags.of(this).add("robox:environment", props.environmentName);
    Tags.of(this).add("robox:managed-by", "cdk");
  }
}
