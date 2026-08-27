import { ConflictException, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AuditService } from "../common/audit/audit.service";
import { StrategyEntity, StrategyStatus } from "../database/entities/strategy.entity";
import { StrategyVersionEntity } from "../database/entities/strategy-version.entity";
import { StrategyService } from "./strategy.service";

/**
 * Cubre el criterio de aceptacion de la Fase 2 "las estrategias pueden
 * crearse/versionarse/suspenderse", y sobre todo las transiciones PROHIBIDAS: una
 * estrategia reactivada por error vuelve a decidir operaciones con dinero.
 */
describe("StrategyService", () => {
  let service: StrategyService;
  let estrategia: StrategyEntity;
  let strategies: { findOne: jest.Mock; find: jest.Mock; update: jest.Mock };
  let versions: { find: jest.Mock };
  let audit: { record: jest.Mock };

  const conEstado = (status: StrategyStatus): void => {
    estrategia.status = status;
  };

  beforeEach(() => {
    estrategia = {
      id: "estrategia-1",
      name: "Momento Oro/BTC",
      status: "draft",
      currentVersion: 1,
      createdBy: "user-1",
    } as StrategyEntity;

    strategies = {
      findOne: jest.fn().mockImplementation(async ({ where }) =>
        where?.name && where.name !== estrategia.name ? null : estrategia,
      ),
      find: jest.fn().mockResolvedValue([estrategia]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    versions = { find: jest.fn().mockResolvedValue([]) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    service = new StrategyService(
      strategies as never,
      versions as never,
      {} as DataSource,
      audit as unknown as AuditService,
    );
  });

  describe("transiciones de estado permitidas", () => {
    it.each([
      ["draft", "active"],
      ["draft", "archived"],
      ["active", "suspended"],
      ["active", "archived"],
      ["suspended", "active"],
      ["suspended", "archived"],
    ] as [StrategyStatus, StrategyStatus][])("%s -> %s", async (desde, hasta) => {
      conEstado(desde);

      const resultado = await service.changeStatus(estrategia.id, hasta, "user-1");

      expect(resultado.status).toBe(hasta);
      expect(strategies.update).toHaveBeenCalledWith(estrategia.id, { status: hasta });
    });
  });

  describe("transiciones prohibidas", () => {
    it.each([
      ["archived", "active"],
      ["archived", "draft"],
      ["archived", "suspended"],
      ["active", "draft"],
      ["suspended", "draft"],
    ] as [StrategyStatus, StrategyStatus][])("RECHAZA %s -> %s", async (desde, hasta) => {
      conEstado(desde);

      await expect(
        service.changeStatus(estrategia.id, hasta, "user-1"),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(strategies.update).not.toHaveBeenCalled();
    });

    it("archivar es definitivo: no hay ninguna salida", async () => {
      conEstado("archived");
      const destinos: StrategyStatus[] = ["draft", "active", "suspended"];

      for (const destino of destinos) {
        await expect(
          service.changeStatus(estrategia.id, destino, "user-1"),
        ).rejects.toBeInstanceOf(ConflictException);
      }
    });
  });

  it("cambiar al mismo estado no hace nada ni genera auditoria", async () => {
    conEstado("active");

    const resultado = await service.changeStatus(estrategia.id, "active", "user-1");

    expect(resultado.status).toBe("active");
    expect(strategies.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("suspender queda auditado", async () => {
    conEstado("active");

    await service.changeStatus(estrategia.id, "suspended", "user-1");

    expect(audit.record).toHaveBeenCalledWith(
      "strategy.status_changed",
      "user-1",
      expect.objectContaining({ strategyId: estrategia.id, status: "suspended" }),
    );
  });

  it("rechaza un nombre duplicado", async () => {
    await expect(
      service.create(
        { name: estrategia.name, parameters: {}, instrumentIds: [] },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("una estrategia inexistente da 404", async () => {
    strategies.findOne.mockResolvedValue(null);

    await expect(service.findOne("no-existe")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("una estrategia archivada no admite versiones nuevas", async () => {
    conEstado("archived");

    await expect(
      service.createVersion(estrategia.id, { parameters: {}, instrumentIds: [] }, "user-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("listar versiones exige que la estrategia exista", async () => {
    strategies.findOne.mockResolvedValue(null);

    await expect(service.listVersions("no-existe")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("devuelve el historial de versiones", async () => {
    versions.find.mockResolvedValue([
      { version: 2 } as StrategyVersionEntity,
      { version: 1 } as StrategyVersionEntity,
    ]);

    const historial = await service.listVersions(estrategia.id);

    expect(historial.map((v) => v.version)).toEqual([2, 1]);
  });
});
