import { ConfigService } from "@nestjs/config";
import { RedisService } from "../../redis/redis.service";
import { FeatureFlagsService } from "./feature-flags.service";

describe("FeatureFlagsService", () => {
  let redis: jest.Mocked<Pick<RedisService, "get" | "set" | "del">>;
  let service: FeatureFlagsService;

  beforeEach(() => {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    service = new FeatureFlagsService(redis as unknown as RedisService, config);
  });

  it("usa el valor por defecto cuando no hay anulacion", async () => {
    await expect(service.isEnabled("auth.require-mfa")).resolves.toBe(true);
    await expect(service.isEnabled("platform.maintenance-mode")).resolves.toBe(false);
  });

  it("la anulacion en Redis tiene prioridad sobre el valor por defecto", async () => {
    redis.get.mockResolvedValue("false");

    await expect(service.isEnabled("auth.require-mfa")).resolves.toBe(false);
  });

  it("un flag desconocido queda desactivado", async () => {
    await expect(service.isEnabled("no.existe")).resolves.toBe(false);
  });

  it("si Redis falla no cambia el comportamiento: cae al valor por defecto", async () => {
    redis.get.mockRejectedValue(new Error("conexion rechazada"));

    await expect(service.isEnabled("auth.require-mfa")).resolves.toBe(true);
  });

  it("expone el estado efectivo de todos los flags conocidos", async () => {
    const snapshot = await service.snapshot();

    expect(snapshot).toEqual({
      "auth.require-mfa": true,
      "events.publish-enabled": true,
      "platform.maintenance-mode": false,
    });
  });
});
