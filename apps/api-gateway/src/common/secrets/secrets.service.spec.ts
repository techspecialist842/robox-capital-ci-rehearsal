import { ConfigService } from "@nestjs/config";
import { SecretsService } from "./secrets.service";

const configOf = (values: Record<string, string>): ConfigService =>
  ({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  }) as unknown as ConfigService;

describe("SecretsService", () => {
  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it("en local lee de variables de entorno", async () => {
    process.env.JWT_SECRET = "valor-local";
    const service = new SecretsService(
      configOf({ "secrets.provider": "env", environment: "local" }),
    );
    service.onModuleInit();

    await expect(service.get("jwt-secret")).resolves.toBe("valor-local");
  });

  it("falla el arranque si se intenta usar variables de entorno en staging", () => {
    const service = new SecretsService(
      configOf({ "secrets.provider": "env", environment: "staging" }),
    );

    expect(() => service.onModuleInit()).toThrow(/no esta permitido en el entorno/);
  });

  it("falla el arranque si se intenta usar variables de entorno en produccion", () => {
    const service = new SecretsService(
      configOf({ "secrets.provider": "env", environment: "production" }),
    );

    expect(() => service.onModuleInit()).toThrow(/AWS Secrets Manager/);
  });

  it("require() falla cuando el secreto no existe", async () => {
    const service = new SecretsService(
      configOf({ "secrets.provider": "env", environment: "local" }),
    );
    service.onModuleInit();

    await expect(service.require("no-existe")).rejects.toThrow(/falta el secreto/);
  });
});
