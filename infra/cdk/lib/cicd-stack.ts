import { CfnOutput, Stack, StackProps, Tags } from "aws-cdk-lib";
import {
  Effect,
  OpenIdConnectPrincipal,
  OpenIdConnectProvider,
  PolicyStatement,
  Role,
} from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface CicdStackProps extends StackProps {
  environmentName: string;
  /** "propietario/repositorio" en GitHub, p. ej. "roboX-Capital/plataforma". */
  githubRepository: string;
  /** Rama desde la que se permite desplegar a este entorno. */
  githubBranch: string;
}

/**
 * Acceso de despliegue desde GitHub Actions mediante OIDC (ADR-004).
 *
 * Sin claves de larga duracion: GitHub presenta un token firmado de la ejecucion
 * concreta y AWS lo intercambia por credenciales temporales. Una clave permanente
 * guardada como secreto del repositorio es un objetivo que no caduca; esto no
 * existe fuera de la ejecucion que lo pidio.
 *
 * La confianza se acota a un repositorio y una rama concretos. Sin esa condicion,
 * cualquier repositorio de GitHub podria asumir el rol.
 */
export class CicdStack extends Stack {
  public readonly deployRole: Role;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const { environmentName, githubRepository, githubBranch } = props;
    const [duenno, repositorio] = githubRepository.split("/");

    const provider = new OpenIdConnectProvider(this, "GitHubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    this.deployRole = new Role(this, "DeployRole", {
      roleName: `robox-${environmentName}-github-deploy`,
      description: `Despliegue de roboX ${environmentName} desde GitHub Actions`,
      assumedBy: new OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        // Los patrones toleran los identificadores numericos que GitHub incrusta
        // en la afirmacion "sub" cuando el repositorio usa identificadores
        // inmutables. El valor real observado es:
        //
        //   repo:duenno@301936007/repositorio@1331166378:environment:dev
        //
        // y no "repo:duenno/repositorio:environment:dev" como cabria esperar. Esa
        // funcion protege frente a renombrados y transferencias: el identificador
        // no cambia aunque el nombre si. No es opcional ni predecible desde fuera,
        // asi que se aceptan ambas formas.
        //
        // "@*" es preciso: el nombre debe coincidir exacto y solo el identificador
        // que le sigue es variable.
        //
        // Ademas se aceptan las dos variantes de contexto: cuando un job declara
        // un "environment", GitHub emite "environment:<nombre>" en lugar de
        // "ref:refs/heads/<rama>".
        //
        // Se descubrio leyendo el token real; deducirlo no era posible.
        StringLike: {
          "token.actions.githubusercontent.com:sub": [
            `repo:${duenno}@*/${repositorio}@*:environment:${environmentName}`,
            `repo:${duenno}@*/${repositorio}@*:ref:refs/heads/${githubBranch}`,
            `repo:${githubRepository}:environment:${environmentName}`,
            `repo:${githubRepository}:ref:refs/heads/${githubBranch}`,
          ],
        },
      }),
    });

    // Publicar imagenes. El token de autenticacion de ECR no admite recurso
    // concreto, por eso va separado con "*".
    this.deployRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      }),
    );
    this.deployRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ],
        resources: [
          `arn:aws:ecr:${this.region}:${this.account}:repository/robox-${environmentName}-*`,
        ],
      }),
    );

    // Desplegar y ejecutar la tarea de migraciones.
    this.deployRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          "ecs:DescribeServices",
          "ecs:UpdateService",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:RunTask",
          "ecs:DescribeTasks",
          "ecs:ListTasks",
        ],
        resources: ["*"],
        conditions: {
          // Restringe la accion al clúster de este entorno: sin esto, el rol
          // podria operar sobre cualquier clúster de la cuenta.
          ArnEquals: {
            "ecs:cluster": `arn:aws:ecs:${this.region}:${this.account}:cluster/robox-${environmentName}`,
          },
        },
      }),
    );

    // Necesario para que ECS pueda asumir los roles de la tarea al lanzarla.
    this.deployRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: ["*"],
        conditions: {
          StringEquals: { "iam:PassedToService": "ecs-tasks.amazonaws.com" },
        },
      }),
    );

    new CfnOutput(this, "DeployRoleArn", { value: this.deployRole.roleArn });

    Tags.of(this).add("robox:environment", environmentName);
    Tags.of(this).add("robox:managed-by", "cdk");
  }
}
