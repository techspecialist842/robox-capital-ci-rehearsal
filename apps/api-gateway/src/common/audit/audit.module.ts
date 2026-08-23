import { Module } from "@nestjs/common";
import { EventsModule } from "../../events/events.module";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { AuditService } from "./audit.service";

// FeatureFlagsModule es @Global, pero se importa de forma explicita para que la
// dependencia sea visible aqui y no dependa de que AppModule lo cargue.
@Module({
  imports: [EventsModule, FeatureFlagsModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
