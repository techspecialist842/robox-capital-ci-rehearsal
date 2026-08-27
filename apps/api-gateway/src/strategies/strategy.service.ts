import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { StrategyEntity, StrategyStatus } from "../database/entities/strategy.entity";
import { StrategyVersionEntity } from "../database/entities/strategy-version.entity";
import { AuditService } from "../common/audit/audit.service";
import { CreateStrategyDto } from "./dto/create-strategy.dto";
import { CreateStrategyVersionDto } from "./dto/create-strategy-version.dto";

/**
 * Transiciones permitidas del ciclo de vida.
 *
 * Se declara la tabla completa en vez de comprobar casos sueltos: asi las
 * transiciones prohibidas lo son por omision. Con condiciones dispersas, olvidar
 * una deja un hueco que nadie ve hasta que alguien lo usa.
 *
 * "archived" no tiene salida a proposito: retirar una estrategia es definitivo.
 * Si se quisiera volver a operar la misma idea, se crea otra y queda constancia
 * de que es una decision nueva.
 */
const TRANSICIONES: Record<StrategyStatus, StrategyStatus[]> = {
  draft: ["active", "archived"],
  active: ["suspended", "archived"],
  suspended: ["active", "archived"],
  archived: [],
};

@Injectable()
export class StrategyService {
  constructor(
    @InjectRepository(StrategyEntity)
    private readonly strategies: Repository<StrategyEntity>,
    @InjectRepository(StrategyVersionEntity)
    private readonly versions: Repository<StrategyVersionEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateStrategyDto, actorUserId: string): Promise<StrategyEntity> {
    if (await this.strategies.findOne({ where: { name: dto.name } })) {
      throw new ConflictException(`Ya existe una estrategia llamada "${dto.name}"`);
    }

    // La estrategia y su primera version se crean juntas o no se crea ninguna:
    // una estrategia sin version no tiene parametros y no significa nada.
    const estrategia = await this.dataSource.transaction(async (manager) => {
      const creada = await manager.save(
        manager.create(StrategyEntity, {
          name: dto.name,
          description: dto.description ?? null,
          status: "draft",
          currentVersion: 1,
          createdBy: actorUserId,
        }),
      );

      await manager.save(
        manager.create(StrategyVersionEntity, {
          strategyId: creada.id,
          version: 1,
          parameters: dto.parameters,
          instrumentIds: dto.instrumentIds,
          createdBy: actorUserId,
        }),
      );

      return creada;
    });

    await this.audit.record("strategy.created", actorUserId, {
      strategyId: estrategia.id,
      name: estrategia.name,
      version: 1,
    });

    return estrategia;
  }

  async findAll(): Promise<StrategyEntity[]> {
    return this.strategies.find({ order: { createdAt: "DESC" } });
  }

  async findOne(id: string): Promise<StrategyEntity> {
    const estrategia = await this.strategies.findOne({ where: { id } });
    if (!estrategia) {
      throw new NotFoundException("Estrategia no encontrada");
    }
    return estrategia;
  }

  /** Crea una version nueva. Las anteriores no se tocan. */
  async createVersion(
    id: string,
    dto: CreateStrategyVersionDto,
    actorUserId: string,
  ): Promise<StrategyVersionEntity> {
    const estrategia = await this.findOne(id);
    if (estrategia.status === "archived") {
      throw new ConflictException("Una estrategia archivada no admite versiones nuevas");
    }

    const version = await this.dataSource.transaction(async (manager) => {
      // Se relee dentro de la transaccion y con bloqueo: dos peticiones simultaneas
      // calcularian el mismo numero de version y una de las dos se perderia.
      const actual = await manager.findOne(StrategyEntity, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      const siguiente = (actual?.currentVersion ?? 0) + 1;

      const creada = await manager.save(
        manager.create(StrategyVersionEntity, {
          strategyId: id,
          version: siguiente,
          parameters: dto.parameters,
          instrumentIds: dto.instrumentIds,
          createdBy: actorUserId,
        }),
      );

      await manager.update(StrategyEntity, id, { currentVersion: siguiente });
      return creada;
    });

    await this.audit.record("strategy.version_created", actorUserId, {
      strategyId: id,
      version: version.version,
    });

    return version;
  }

  async listVersions(id: string): Promise<StrategyVersionEntity[]> {
    await this.findOne(id);
    return this.versions.find({ where: { strategyId: id }, order: { version: "DESC" } });
  }

  async changeStatus(
    id: string,
    nuevo: StrategyStatus,
    actorUserId: string,
  ): Promise<StrategyEntity> {
    const estrategia = await this.findOne(id);

    if (estrategia.status === nuevo) {
      return estrategia;
    }

    if (!TRANSICIONES[estrategia.status].includes(nuevo)) {
      throw new ConflictException(
        `Transicion no permitida: ${estrategia.status} -> ${nuevo}`,
      );
    }

    await this.strategies.update(id, { status: nuevo });
    estrategia.status = nuevo;

    // Suspender o archivar una estrategia detiene decisiones con dinero de por
    // medio: queda auditado igual que una accion de autenticacion.
    await this.audit.record("strategy.status_changed", actorUserId, {
      strategyId: id,
      status: nuevo,
    });

    return estrategia;
  }
}
