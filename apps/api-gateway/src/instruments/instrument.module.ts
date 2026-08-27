import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InstrumentEntity } from "../database/entities/instrument.entity";
import { AuditModule } from "../common/audit/audit.module";
import { InstrumentService } from "./instrument.service";
import { InstrumentController } from "./instrument.controller";

@Module({
  imports: [TypeOrmModule.forFeature([InstrumentEntity]), AuditModule],
  controllers: [InstrumentController],
  providers: [InstrumentService],
  exports: [InstrumentService],
})
export class InstrumentModule {}
