# Infraestructura como código (AWS CDK) — ADR-004

Stacks base de la Fase 1, uno por entorno (`dev`, `staging`, `prod` — ver Entregables del
Paso 0 §7):

- **`RoboX-{env}-Network`** — VPC dedicada, subredes públicas + privadas con egreso +
  privadas aisladas (los almacenes de datos solo viven en estas últimas).
- **`RoboX-{env}-Secrets`** — clave KMS de la aplicación y el secreto de la API key del
  proveedor de IA (ADR-007/ADR-008). Las credenciales de PostgreSQL se generan dentro de
  `Database` (ver nota abajo).
- **`RoboX-{env}-Database`** — instancia de PostgreSQL (RDS, ADR-003) y clúster de Redis
  (ElastiCache), ambos en la subred privada aislada, cifrados con la clave KMS del stack
  de Secrets, credenciales rotables en Secrets Manager.

## Nota de diseño: por qué las credenciales de la base de datos viven en `Database`, no en `Secrets`

El patrón obvio sería crear el secreto de credenciales en `SecretsStack` y pasarlo a
`DatabaseStack`. Al intentarlo, `cdk synth` falla con un ciclo de dependencia: la
construcción `DatabaseInstance` de CDK "adjunta" (`Secret.attach()`) el secreto a la
instancia, lo que crea un recurso `AWS::SecretsManager::SecretTargetAttachment` **en el
stack donde vive el secreto** que referencia de vuelta al ARN de la instancia — y esa
instancia vive en el otro stack. Resultado: `Secrets -> Database` y `Database ->
Secrets` al mismo tiempo. Por eso las credenciales de PostgreSQL se generan con
`Credentials.fromGeneratedSecret(...)` directamente dentro de `DatabaseStack`
(co-localizadas con la instancia), y solo la clave KMS compartida cruza stacks.

## Uso

```bash
npm install
npm run build

# Sintetizar CloudFormation sin desplegar (no requiere cuenta AWS real, solo valida el codigo)
npx cdk synth --context environment=dev --app "node dist/bin/app.js"

# Ver diferencias contra lo desplegado (requiere credenciales validas)
npm run diff -- --context environment=dev

# Desplegar (requiere acceso a la AWS Organization del cliente — Open Item 5)
npx cdk deploy --all --context environment=dev
```

Si `cdk synth`/`tsc` se quedan sin memoria en una máquina con poca RAM libre, correr con
`NODE_OPTIONS="--max-old-space-size=768"` y usar el binario compilado
(`--app "node dist/bin/app.js"`) en vez de `ts-node` — consume bastante menos memoria.

## Estado: no desplegado

Este código fue **verificado con `cdk synth`** (sintetiza correctamente a plantillas de
CloudFormation válidas para los tres stacks) pero **nunca desplegado a una cuenta AWS
real**, porque el proveedor todavía no tiene acceso a la AWS Organization de roboX
Capital (Open Item 5, ver Kickoff de la Fase 1 y Entregables del Paso 0 §11). En cuanto
el cliente otorgue el acceso federado al Arquitecto de Soluciones vía AWS IAM Identity
Center, el Día 1 del plan de arranque continúa con `cdk bootstrap` + `cdk deploy` contra
la cuenta de desarrollo.
