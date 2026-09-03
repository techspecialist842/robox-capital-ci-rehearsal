#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { SecretsStack } from "../lib/secrets-stack";
import { DatabaseStack } from "../lib/database-stack";
import { EventsStack } from "../lib/events-stack";
import { ComputeStack } from "../lib/compute-stack";
import { ObservabilityStack } from "../lib/observability-stack";
import { CicdStack } from "../lib/cicd-stack";

/**
 * Punto de entrada de CDK.
 *
 * La cuenta de destino se declara de forma EXPLICITA, no se hereda de las
 * credenciales activas. El motivo es concreto: las maquinas del equipo tambien
 * tienen credenciales de otros proyectos del mismo cliente, y resolver la cuenta
 * desde el perfil activo permite desplegar roboX dentro de la cuenta equivocada
 * sin ningun aviso. Declararla obliga a CDK a rechazar el despliegue si las
 * credenciales no corresponden.
 */
const app = new App();

const environmentName = app.node.tryGetContext("environment") ?? "dev";

/** Cuentas que NUNCA deben recibir infraestructura de roboX. */
const FORBIDDEN_ACCOUNTS: Record<string, string> = {
  "793835018474": "REMATA (cuenta de gestion de la Organization, con produccion en vivo)",
};

const targetAccount =
  app.node.tryGetContext("account") ?? process.env.ROBOX_AWS_ACCOUNT_ID;

if (!targetAccount) {
  throw new Error(
    "Falta la cuenta de destino. Indicala de forma explicita:\n" +
      "  cdk deploy -c environment=dev -c account=<ID de la cuenta roboX>\n" +
      "o exporta ROBOX_AWS_ACCOUNT_ID. Para validar plantillas sin credenciales\n" +
      "(por ejemplo en CI): cdk synth -c account=agnostic.\n" +
      "No se hereda del perfil de AWS activo a proposito: ver la cabecera.",
  );
}

if (FORBIDDEN_ACCOUNTS[targetAccount]) {
  throw new Error(
    `La cuenta ${targetAccount} corresponde a ${FORBIDDEN_ACCOUNTS[targetAccount]}. ` +
      "La infraestructura de roboX Capital no puede desplegarse ahi (ADR-004).",
  );
}

/**
 * "agnostic" genera plantillas sin cuenta ni region para validarlas en CI, donde
 * no hay credenciales. No sirve para desplegar: CDK rechaza un despliegue real
 * de una pila agnostica que necesite buscar recursos existentes.
 *
 * La region tampoco se hereda de CDK_DEFAULT_REGION: en una maquina con el perfil
 * de otro proyecto activo, esa variable trae la region de ese proyecto.
 */
const env =
  targetAccount === "agnostic"
    ? undefined
    : {
        account: targetAccount,
        region:
          app.node.tryGetContext("region") ?? process.env.ROBOX_AWS_REGION ?? "us-east-1",
      };

const network = new NetworkStack(app, `RoboX-${environmentName}-Network`, {
  environmentName,
  env,
});

const secrets = new SecretsStack(app, `RoboX-${environmentName}-Secrets`, {
  environmentName,
  env,
});

const database = new DatabaseStack(app, `RoboX-${environmentName}-Database`, {
  environmentName,
  vpc: network.vpc,
  encryptionKey: secrets.encryptionKey,
  appSecurityGroup: network.appSecurityGroup,
  env,
});

const events = new EventsStack(app, `RoboX-${environmentName}-Events`, {
  environmentName,
  encryptionKey: secrets.encryptionKey,
  env,
});

const compute = new ComputeStack(app, `RoboX-${environmentName}-Compute`, {
  environmentName,
  vpc: network.vpc,
  appSecurityGroup: network.appSecurityGroup,
  albSecurityGroup: network.albSecurityGroup,
  encryptionKeyArn: secrets.encryptionKey.keyArn,
  databaseSecretArn: database.databaseSecret.secretArn,
  databaseEndpoint: database.databaseEndpoint,
  databasePort: database.databasePort,
  redisEndpoint: database.redisEndpoint,
  redisPort: database.redisPort,
  eventsTopic: events.topic,
  quantServiceQueue: events.quantServiceQueue,
  aiProviderApiKeyArn: secrets.aiProviderApiKey.secretArn,
  env,
});

// El repositorio se pasa por contexto: hoy apunta al de ensayo, y cambia al del
// cliente cuando exista, sin tocar el codigo.
new CicdStack(app, `RoboX-${environmentName}-Cicd`, {
  environmentName,
  githubRepository:
    app.node.tryGetContext("githubRepository") ??
    "techspecialist842/robox-capital-ci-rehearsal",
  githubBranch: app.node.tryGetContext("githubBranch") ?? "main",
  env,
});

new ObservabilityStack(app, `RoboX-${environmentName}-Observability`, {
  environmentName,
  encryptionKeyArn: secrets.encryptionKey.keyArn,
  loadBalancerFullName: compute.loadBalancerFullName,
  targetGroupFullName: compute.targetGroupFullName,
  deadLetterQueue: events.deadLetterQueue,
  env,
});
