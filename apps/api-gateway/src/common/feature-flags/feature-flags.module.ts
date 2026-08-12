import { Global, Module } from "@nestjs/common";
import { RedisModule } from "../../redis/redis.module";
import { FeatureFlagsService } from "./feature-flags.service";

/**
 * Global: cualquier modulo puede consultar un flag sin volver a importarlo, que es
 * la forma en que un registro de configuracion resulta util en la practica.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
