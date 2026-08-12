import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../redis/redis.service";

const OVERRIDE_PREFIX = "feature-flag:";

/**
 * Registro de configuracion de la plataforma (Fase 1, Kickoff Dia 6-7).
 *
 * Dos niveles, de menor a mayor prioridad:
 *  1. Valor por defecto declarado en el codigo — el comportamiento conocido.
 *  2. Anulacion en Redis — permite apagar una funcionalidad en caliente sin
 *     desplegar, que es el motivo por el que existe un feature flag.
 *
 * La consola de administracion de la Fase 5 escribe sobre el nivel 2. Se elige
 * Redis y no la base de datos porque una lectura por peticion debe ser barata y
 * porque una anulacion es estado operativo, no dato de negocio que auditar.
 */
export const FEATURE_FLAG_DEFAULTS: Record<string, boolean> = {
  // Exige MFA a todos los roles. La Definicion de Hecho de la Fase 1 lo requiere;
  // el flag existe para poder desactivarlo en un incidente de acceso, no para
  // operarlo apagado de forma habitual.
  "auth.require-mfa": true,

  // Publica los eventos de dominio en el bus. Se apaga si el bus se degrada,
  // para que la autenticacion siga funcionando aunque la mensajeria falle.
  "events.publish-enabled": true,

  // Modo mantenimiento: rechaza operaciones de escritura de negocio.
  "platform.maintenance-mode": false,
};

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async isEnabled(flag: string): Promise<boolean> {
    const fallback = this.defaultFor(flag);

    try {
      const override = await this.redis.get(`${OVERRIDE_PREFIX}${flag}`);
      if (override === null) {
        return fallback;
      }
      return override === "true";
    } catch (error) {
      // Un fallo del registro no puede cambiar el comportamiento de la plataforma
      // en silencio: se cae al valor por defecto y se deja constancia.
      this.logger.warn(
        `no se pudo leer el flag "${flag}", se usa el valor por defecto (${fallback}): ${String(error)}`,
      );
      return fallback;
    }
  }

  async setOverride(flag: string, enabled: boolean): Promise<void> {
    await this.redis.set(`${OVERRIDE_PREFIX}${flag}`, String(enabled));
  }

  async clearOverride(flag: string): Promise<void> {
    await this.redis.del(`${OVERRIDE_PREFIX}${flag}`);
  }

  /** Estado efectivo de todos los flags conocidos, para la consola de administracion. */
  async snapshot(): Promise<Record<string, boolean>> {
    const entries = await Promise.all(
      Object.keys(FEATURE_FLAG_DEFAULTS).map(
        async (flag) => [flag, await this.isEnabled(flag)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  private defaultFor(flag: string): boolean {
    const configured = this.config.get<boolean>(`featureFlags.${flag}`);
    return configured ?? FEATURE_FLAG_DEFAULTS[flag] ?? false;
  }
}
