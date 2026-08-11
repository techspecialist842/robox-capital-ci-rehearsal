#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { NetworkStack } from "../lib/network-stack";
import { SecretsStack } from "../lib/secrets-stack";
import { DatabaseStack } from "../lib/database-stack";

/**
 * Punto de entrada de CDK. La cuenta/region se resuelven de las credenciales de
 * AWS activas (CDK_DEFAULT_ACCOUNT/CDK_DEFAULT_REGION) — no se fijan aqui a
 * proposito, para que el mismo codigo sirva para dev/staging/prod segun el
 * perfil de AWS que use quien ejecuta el despliegue. Ver Kickoff de la Fase 1,
 * Seccion 3: el despliegue real depende de que el cliente otorgue acceso a la
 * AWS Organization (Open Item 5).
 */
const app = new App();

const environmentName = app.node.tryGetContext("environment") ?? "dev";

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const network = new NetworkStack(app, `RoboX-${environmentName}-Network`, {
  environmentName,
  env,
});

const secrets = new SecretsStack(app, `RoboX-${environmentName}-Secrets`, {
  environmentName,
  env,
});

new DatabaseStack(app, `RoboX-${environmentName}-Database`, {
  environmentName,
  vpc: network.vpc,
  encryptionKey: secrets.encryptionKey,
  env,
});
