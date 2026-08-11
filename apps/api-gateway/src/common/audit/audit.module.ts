import { Module } from "@nestjs/common";
import { EventsModule } from "../../events/events.module";
import { AuditService } from "./audit.service";

@Module({
  imports: [EventsModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
