import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { getDataSourceToken } from "@nestjs/typeorm";
import { AuditModule } from "./audit.module";
import { AuditService } from "./audit.service";
import { RedisService } from "../../redis/redis.service";
import configuration from "../../config/configuration";

/**
 * Las pruebas unitarias construyen AuditService a mano, asi que no verifican que
 * sus dependencias se resuelvan por inyeccion. Esta si: si alguien anade un
 * parametro al constructor y olvida importar su modulo, aqui falla.
 *
 * Solo se sustituyen las dependencias externas al proceso. Se declaran globales
 * porque asi las registra la aplicacion real: TypeOrmModule.forRoot expone
 * DataSource de forma global, y RedisModule hace lo propio con RedisService.
 */
@Global()
@Module({
  providers: [
    { provide: getDataSourceToken(), useValue: { query: jest.fn() } },
    { provide: RedisService, useValue: { get: jest.fn().mockResolvedValue(null) } },
  ],
  exports: [getDataSourceToken(), RedisService],
})
class DependenciasExternasFalsas {}

describe("AuditModule (grafo de dependencias)", () => {
  it("resuelve AuditService con todas sus dependencias", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        DependenciasExternasFalsas,
        AuditModule,
      ],
    }).compile();

    expect(moduleRef.get(AuditService)).toBeInstanceOf(AuditService);
  });
});
