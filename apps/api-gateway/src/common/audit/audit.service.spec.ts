import { DataSource } from "typeorm";
import { EventBus } from "../../events/event-bus.interface";
import { FeatureFlagsService } from "../feature-flags/feature-flags.service";
import { AuditService } from "./audit.service";

/**
 * Cubre el criterio de Puerta 1 "eventos de auditoria generados para acciones de
 * autenticacion", y sobre todo la diferencia de criticidad entre las dos
 * escrituras: la fila de auditoria es obligatoria, la publicacion no.
 */
describe("AuditService", () => {
  let query: jest.Mock;
  let publish: jest.Mock;
  let isEnabled: jest.Mock;
  let service: AuditService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue(undefined);
    publish = jest.fn().mockResolvedValue(undefined);
    isEnabled = jest.fn().mockResolvedValue(true);

    service = new AuditService(
      { query } as unknown as DataSource,
      { publish } as unknown as EventBus,
      { isEnabled } as unknown as FeatureFlagsService,
    );
  });

  it("escribe la fila de auditoria y publica el evento", async () => {
    await service.record("auth.session_created", "user-1", { sessionId: "s-1" });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("INSERT INTO audit_events");
    expect(params).toEqual([
      "auth.session_created",
      "user-1",
      JSON.stringify({ sessionId: "s-1" }),
    ]);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({
      eventType: "auth.session_created",
      eventVersion: 1,
      producer: "api-gateway",
      payload: { sessionId: "s-1" },
    });
  });

  it("solo inserta, nunca actualiza ni borra", async () => {
    await service.record("auth.session_created", "user-1", {});

    const sql: string = query.mock.calls[0][0];
    expect(sql).not.toMatch(/UPDATE|DELETE/i);
  });

  it("si falla la escritura de auditoria, la operacion falla", async () => {
    query.mockRejectedValue(new Error("base de datos caida"));

    await expect(service.record("auth.session_created", "user-1", {})).rejects.toThrow(
      "base de datos caida",
    );
    expect(publish).not.toHaveBeenCalled();
  });

  it("si falla la publicacion, la operacion continua", async () => {
    publish.mockRejectedValue(new Error("bus degradado"));

    await expect(
      service.record("auth.session_created", "user-1", {}),
    ).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("el feature flag apaga la publicacion sin afectar a la auditoria", async () => {
    isEnabled.mockResolvedValue(false);

    await service.record("auth.session_created", "user-1", {});

    expect(query).toHaveBeenCalledTimes(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it("acepta acciones sin actor identificado", async () => {
    await service.record("platform.maintenance_started", null, {});

    expect(query.mock.calls[0][1][1]).toBeNull();
  });
});
