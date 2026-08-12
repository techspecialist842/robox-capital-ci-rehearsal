import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { RedisService } from "../../redis/redis.service";
import { AuthenticatedUser, JwtPayload } from "../jwt-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("auth.jwtSecret", "dev-only-change-me"),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (await this.redis.isTokenRevoked(payload.jti)) {
      throw new UnauthorizedException("Sesion revocada");
    }
    return {
      userId: payload.sub,
      email: payload.email,
      roles: payload.roles,
      sessionId: payload.sid,
      tokenId: payload.jti,
      // Los tokens emitidos antes de introducir el scope no lo traen; se tratan
      // como sesion normal para no invalidarlos de golpe.
      scope: payload.scope ?? "session",
    };
  }
}
