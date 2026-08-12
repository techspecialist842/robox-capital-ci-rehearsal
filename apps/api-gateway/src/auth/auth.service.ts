import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { Repository } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";
import { RedisService } from "../redis/redis.service";
import { AuditService } from "../common/audit/audit.service";
import { FeatureFlagsService } from "../common/feature-flags/feature-flags.service";
import { MfaService } from "./mfa.service";
import { LoginDto } from "./dto/login.dto";
import { VerifyMfaDto } from "./dto/verify-mfa.dto";
import { TokenScope } from "./jwt-payload.interface";

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas
const ENROLLMENT_TTL = "10m";

export interface LoginResult {
  requiresMfa: boolean;
  /** El usuario tiene credenciales validas pero aun no configuro su segundo factor. */
  requiresMfaEnrollment?: boolean;
  challengeUserId?: string;
  accessToken?: string;
  /** Token acotado que solo habilita /auth/mfa/enroll y /auth/mfa/activate. */
  enrollmentToken?: string;
}

export interface EnrollmentResult {
  secret: string;
  otpAuthUrl: string;
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
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  /** Paso 1: valida credenciales y decide si hace falta MFA o darlo de alta. */
  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.users.findOne({ where: { email: dto.email, active: true } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Credenciales invalidas");
    }

    if (user.mfaEnabled) {
      return { requiresMfa: true, challengeUserId: user.id };
    }

    // Definicion de Hecho de la Fase 1: "Login + MFA obligatorios para todos los
    // roles". Sin segundo factor no se emite sesion; solo un token de alta.
    if (await this.featureFlags.isEnabled("auth.require-mfa")) {
      await this.audit.record("auth.mfa_enrollment_required", user.id, {
        userId: user.id,
        email: user.email,
      });
      return {
        requiresMfa: true,
        requiresMfaEnrollment: true,
        challengeUserId: user.id,
        enrollmentToken: (await this.issueToken(user, "mfa_enrollment", ENROLLMENT_TTL)).token,
      };
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

  /**
   * Alta de MFA, paso 1: genera el secreto y lo guarda sin activarlo todavia.
   * Queda inactivo a proposito: si se activara aqui, un fallo al guardar el
   * secreto en la app de autenticacion dejaria al usuario sin poder entrar.
   */
  async startMfaEnrollment(userId: string): Promise<EnrollmentResult> {
    const user = await this.users.findOne({ where: { id: userId, active: true } });
    if (!user) {
      throw new UnauthorizedException("Usuario invalido");
    }
    if (user.mfaEnabled) {
      throw new ForbiddenException("El MFA ya esta activo para este usuario");
    }

    const secret = this.mfa.generateSecret();
    await this.users.update(user.id, { mfaSecret: secret, mfaEnabled: false });

    return { secret, otpAuthUrl: this.mfa.buildOtpAuthUrl(user.email, secret) };
  }

  /** Alta de MFA, paso 2: confirma que el usuario guardo el secreto y activa el factor. */
  async activateMfa(userId: string, otpCode: string): Promise<{ accessToken: string }> {
    const user = await this.users.findOne({ where: { id: userId, active: true } });
    if (!user?.mfaSecret) {
      throw new ForbiddenException("No hay un alta de MFA en curso");
    }
    if (!this.mfa.verifyToken(otpCode, user.mfaSecret)) {
      throw new ForbiddenException("Codigo MFA incorrecto");
    }

    await this.users.update(user.id, { mfaEnabled: true });
    user.mfaEnabled = true;

    await this.audit.record("auth.mfa_activated", user.id, {
      userId: user.id,
      email: user.email,
    });

    return { accessToken: await this.issueSession(user) };
  }

  async revokeSession(sessionId: string, jti: string): Promise<void> {
    await this.redis.revokeSession(sessionId);
    await this.redis.revokeToken(jti, SESSION_TTL_SECONDS);
  }

  private async issueSession(user: UserEntity): Promise<string> {
    const { token, sessionId } = await this.issueToken(
      user,
      "session",
      this.config.get<string>("auth.jwtExpiresIn", "15m"),
      SESSION_TTL_SECONDS,
    );

    // Criterio de aceptacion de la Fase 1: eventos de auditoria para acciones de autenticacion.
    await this.audit.record("auth.session_created", user.id, {
      userId: user.id,
      sessionId,
      mfaVerified: user.mfaEnabled,
      roles: user.roles,
    });

    return token;
  }

  private async issueToken(
    user: UserEntity,
    scope: TokenScope,
    expiresIn: string,
    sessionTtlSeconds?: number,
  ): Promise<{ token: string; sessionId: string }> {
    const sessionId = uuid();
    const jti = uuid();

    if (sessionTtlSeconds) {
      await this.redis.setSession(sessionId, user.id, sessionTtlSeconds);
    }

    // jti va en el payload; no se repite como opcion "jwtid" (jsonwebtoken
    // rechaza esa combinacion con "Bad options.jwtid ... already has jti").
    const token = await this.jwt.signAsync(
      { sub: user.id, email: user.email, roles: user.roles, sid: sessionId, jti, scope },
      {
        secret: this.config.get<string>("auth.jwtSecret"),
        expiresIn: expiresIn as JwtSignOptions["expiresIn"],
      },
    );

    return { token, sessionId };
  }
}
