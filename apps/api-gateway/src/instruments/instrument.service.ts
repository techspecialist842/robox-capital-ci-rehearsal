import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InstrumentEntity } from "../database/entities/instrument.entity";
import { AuditService } from "../common/audit/audit.service";
import { CreateInstrumentDto } from "./dto/create-instrument.dto";

@Injectable()
export class InstrumentService {
  constructor(
    @InjectRepository(InstrumentEntity)
    private readonly instruments: Repository<InstrumentEntity>,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateInstrumentDto, actorUserId: string): Promise<InstrumentEntity> {
    const symbol = dto.symbol.toUpperCase();
    if (await this.instruments.findOne({ where: { symbol } })) {
      throw new ConflictException(`El instrumento ${symbol} ya esta registrado`);
    }

    const creado = await this.instruments.save(
      this.instruments.create({
        symbol,
        name: dto.name,
        assetClass: dto.assetClass,
        currency: dto.currency.toUpperCase(),
        exchange: dto.exchange ?? null,
        tickSize: dto.tickSize,
        active: true,
      }),
    );

    await this.audit.record("instrument.registered", actorUserId, {
      instrumentId: creado.id,
      symbol: creado.symbol,
    });

    return creado;
  }

  async findAll(soloActivos = false): Promise<InstrumentEntity[]> {
    return this.instruments.find({
      where: soloActivos ? { active: true } : {},
      order: { symbol: "ASC" },
    });
  }

  async findBySymbol(symbol: string): Promise<InstrumentEntity> {
    const instrumento = await this.instruments.findOne({
      where: { symbol: symbol.toUpperCase() },
    });
    if (!instrumento) {
      throw new NotFoundException(`Instrumento ${symbol} no encontrado`);
    }
    return instrumento;
  }

  /**
   * Los instrumentos se desactivan, nunca se borran: pueden estar referenciados
   * por versiones de estrategias y por operaciones ya registradas, y borrarlos
   * dejaria esa evidencia sin sentido.
   */
  async deactivate(symbol: string, actorUserId: string): Promise<InstrumentEntity> {
    const instrumento = await this.findBySymbol(symbol);
    await this.instruments.update(instrumento.id, { active: false });
    instrumento.active = false;

    await this.audit.record("instrument.deactivated", actorUserId, {
      instrumentId: instrumento.id,
      symbol: instrumento.symbol,
    });

    return instrumento;
  }
}
