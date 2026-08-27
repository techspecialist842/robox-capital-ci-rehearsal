import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StrategyEntity } from "../database/entities/strategy.entity";
import { StrategyVersionEntity } from "../database/entities/strategy-version.entity";
import { AuditModule } from "../common/audit/audit.module";
import { StrategyService } from "./strategy.service";
import { StrategyController } from "./strategy.controller";

@Module({
  imports: [TypeOrmModule.forFeature([StrategyEntity, StrategyVersionEntity]), AuditModule],
  controllers: [StrategyController],
  providers: [StrategyService],
  exports: [StrategyService],
})
export class StrategyModule {}
