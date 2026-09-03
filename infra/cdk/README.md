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
npm run diff -- --context environment=dev -c account=<ID de la cuenta roboX>

# Desplegar
npx cdk deploy --all --context environment=dev -c account=<ID de la cuenta roboX>
```

## Pilas

| Pila | Contiene |
|---|---|
| `Network` | VPC, subredes pública / aplicación / datos, y los grupos de seguridad de aplicación y balanceador |
| `Secrets` | Clave KMS y secreto del proveedor de IA |
| `Database` | PostgreSQL y Redis en subredes aisladas, con acceso solo desde la aplicación |
| `Events` | Tópico SNS, cola SQS y cola de fallidos |
| `Compute` | Registros ECR, clúster ECS, servicios Fargate y balanceador |
| `Observability` | Alarmas contra los objetivos aprobados y tópico de notificación |

**Los grupos de seguridad de aplicación y balanceador viven en `Network`, no en
`Compute`.** No es una cuestión de gusto: las reglas de entrada las añade CDK a la
pila que posee el grupo destino, así que declararlos en `Compute` genera ciclos
entre pilas. Lo mismo ocurre con la clave KMS y los secretos, que `Compute`
importa por ARN en lugar de recibir como objetos — pasar el objeto hace que CDK
modifique la política del recurso original y vuelve a crear el ciclo.

Este proyecto ya se topó con ese ciclo tres veces (Secrets↔Database,
Network↔Compute y Secrets↔Compute). Si aparece uno nuevo, la causa suele ser la
misma: un permiso que se concede sobre el recurso en vez de sobre el rol.

## La cuenta de destino es obligatoria y explícita

`bin/app.ts` **no hereda la cuenta del perfil de AWS activo**. Hay que declararla con
`-c account=<ID>` o con `ROBOX_AWS_ACCOUNT_ID`, y la región tampoco se toma de
`CDK_DEFAULT_REGION`.

No es celo excesivo: las máquinas del equipo también tienen credenciales de REMATA, otro
proyecto del mismo cliente que comparte la AWS Organization y tiene **producción en
vivo**. Heredar la cuenta del perfil activo permitía desplegar roboX dentro de REMATA sin
un solo aviso. La cuenta de REMATA (`793835018474`) está además rechazada de forma
explícita en el código.

Para validar las plantillas sin credenciales —lo que hace el pipeline de CI— se usa
`-c account=agnostic`, que sintetiza sin cuenta ni región. Sirve para comprobar que el
código de infraestructura es válido; **no sirve para desplegar**.

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
