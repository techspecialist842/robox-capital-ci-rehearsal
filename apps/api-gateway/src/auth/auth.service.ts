import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { Repository } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";
import { RedisService } from "../redis/redis.service";
import { AuditService } from "../common/audit/audit.service";
import { MfaService } from "./mfa.service";
import { LoginDto } from "./dto/login.dto";
import { VerifyMfaDto } from "./dto/verify-mfa.dto";

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas

export interface LoginResult {
  requiresMfa: boolean;
  challengeUserId?: string;
  accessToken?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly jwt: JwtService,
    private readonly mfa: MfaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Paso 1: valida credenciales. Si el usuario tiene MFA activo, exige un segundo paso. */
  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.users.findOne({ where: { email: dto.email, active: true } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Credenciales invalidas");
    }

    if (user.mfaEnabled) {
      return { requiresMfa: true, challengeUserId: user.id };
    }

    return { requiresMfa: false, accessToken: await this.issueSession(user) };
  }

  /** Paso 2 (si MFA esta habilitado): valida el codigo TOTP y emite la sesion. */
  async verifyMfa(dto: VerifyMfaDto): Promise<LoginResult> {
    const user = await this.users.findOne({ where: { id: dto.challengeUserId, active: true } });
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException("Desafio de MFA invalido");
    }
    if (!this.mfa.verifyToken(dto.otpCode, user.mfaSecret)) {
      throw new ForbiddenException("Codigo MFA incorrecto");
    }
    return { requiresMfa: false, accessToken: await this.issueSession(user) };
  }

  async revokeSession(sessionId: string, jti: string): Promise<void> {
    await this.redis.revokeSession(sessionId);
    await this.redis.revokeToken(jti, SESSION_TTL_SECONDS);
  }

  private async issueSession(user: UserEntity): Promise<string> {
    const sessionId = uuid();
    const jti = uuid();

    await this.redis.setSession(sessionId, user.id, SESSION_TTL_SECONDS);

    // jti va en el payload; no se repite como opcion "jwtid" (jsonwebtoken
    // rechaza esa combinacion con "Bad options.jwtid ... already has jti").
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, roles: user.roles, sid: sessionId, jti },
      {
        secret: this.config.get<string>("auth.jwtSecret"),
        expiresIn: this.config.get<string>("auth.jwtExpiresIn", "15m"),
      },
    );

    // Criterio de aceptacion de la Fase 1: eventos de auditoria para acciones de autenticacion.
    await this.audit.record("auth.session_created", user.id, {
      userId: user.id,
      sessionId,
      mfaVerified: user.mfaEnabled,
      roles: user.roles,
    });

    return accessToken;
  }
}
