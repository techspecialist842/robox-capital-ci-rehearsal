import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

/**
 * Gestion de secretos (ADR-008).
 *
 * La Definicion de Hecho de la Fase 1 exige que ningun secreto viva en el codigo,
 * en el control de versiones ni en variables de entorno en texto plano. Fuera de
 * la maquina del desarrollador eso se cumple leyendo de AWS Secrets Manager, que
 * ademas resuelve la rotacion sin redespliegue.
 *
 * El proveedor "env" existe unicamente para desarrollo local, donde no hay cuenta
 * AWS. Se rechaza de forma explicita en cualquier otro entorno para que un
 * despliegue mal configurado falle al arrancar en vez de correr inseguro.
 */
export type SecretsProvider = "env" | "aws";

@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private readonly cache = new Map<string, string>();
  private client?: SecretsManagerClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const provider = this.provider();
    const environment = this.config.get<string>("environment", "local");

    if (provider === "env" && environment !== "local" && environment !== "test") {
      throw new Error(
        `SECRETS_PROVIDER=env no esta permitido en el entorno "${environment}": ` +
          "los secretos deben venir de AWS Secrets Manager (ADR-008).",
      );
    }

    if (provider === "aws") {
      this.client = new SecretsManagerClient({
        region: this.config.get<string>("aws.region", "us-east-1"),
      });
    }

    this.logger.log(`proveedor de secretos: ${provider} (entorno: ${environment})`);
  }

  /**
   * Devuelve el valor de un secreto. `name` es el nombre logico (p. ej.
   * "jwt-secret"); en AWS se resuelve como roboX-{entorno}-{name}, la convencion
   * de nombres de la Seccion 7 del Paso 0.
   */
  async get(name: string): Promise<string | undefined> {
    const cached = this.cache.get(name);
    if (cached !== undefined) {
      return cached;
    }

    const value =
      this.provider() === "aws" ? await this.fromSecretsManager(name) : this.fromEnv(name);

    if (value !== undefined) {
      this.cache.set(name, value);
    }
    return value;
  }

  /** Falla el arranque si falta un secreto obligatorio, en lugar de degradarse en caliente. */
  async require(name: string): Promise<string> {
    const value = await this.get(name);
    if (value === undefined || value.length === 0) {
      throw new Error(`falta el secreto obligatorio "${name}"`);
    }
    return value;
  }

  private provider(): SecretsProvider {
    return this.config.get<SecretsProvider>("secrets.provider", "env");
  }

  private fromEnv(name: string): string | undefined {
    // "jwt-secret" -> JWT_SECRET
    return process.env[name.toUpperCase().replace(/-/g, "_")];
  }

  private async fromSecretsManager(name: string): Promise<string | undefined> {
    const environment = this.config.get<string>("environment", "local");
    const secretId = `roboX-${environment}-${name}`;

    try {
      const response = await this.client!.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );
      return response.SecretString;
    } catch (error) {
      // No se registra el nombre completo del secreto ni el error crudo del SDK:
      // ambos pueden acabar en un destino de logs compartido.
      this.logger.error(`no se pudo leer el secreto "${name}" de Secrets Manager`);
      throw error;
    }
  }
}
