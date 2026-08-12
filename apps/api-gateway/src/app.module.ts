import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import configuration from "./config/configuration";
import { HealthModule } from "./health/health.module";
import { DatabaseModule } from "./database/database.module";
import { RedisModule } from "./redis/redis.module";
import { EventsModule } from "./events/events.module";
import { AuditModule } from "./common/audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { FeatureFlagsModule } from "./common/feature-flags/feature-flags.module";
import { SecretsModule } from "./common/secrets/secrets.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    SecretsModule,
    DatabaseModule,
    RedisModule,
    EventsModule,
    AuditModule,
    FeatureFlagsModule,
    AuthModule,
    AdminModule,
    HealthModule,
  ],
})
export class AppModule {}
