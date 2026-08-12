import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, JwtSignOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "../database/entities/user.entity";
import { RedisModule } from "../redis/redis.module";
import { AuditModule } from "../common/audit/audit.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { MfaEnrollmentGuard } from "./guards/mfa-enrollment.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    RedisModule,
    AuditModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("auth.jwtSecret"),
        // jsonwebtoken tipa expiresIn como literal de plantilla ("15m", "7d", ...);
        // la configuracion solo puede darnos string en tiempo de ejecucion.
        signOptions: {
          expiresIn: config.get<string>(
            "auth.jwtExpiresIn",
            "15m",
          ) as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, JwtStrategy, MfaEnrollmentGuard],
  exports: [AuthService],
})
export class AuthModule {}
