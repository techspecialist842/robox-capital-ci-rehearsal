import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { authenticator } from "otplib";

/**
 * MFA basado en TOTP (RFC 6238), consistente con el criterio de aceptacion de la
 * Fase 1 "Inicio de sesion seguro + MFA + RBAC verificados".
 */
@Injectable()
export class MfaService {
  constructor(private readonly config: ConfigService) {}

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  buildOtpAuthUrl(email: string, secret: string): string {
    const issuer = this.config.get<string>("auth.mfaIssuer", "roboXCapital");
    return authenticator.keyuri(email, issuer, secret);
  }

  verifyToken(token: string, secret: string): boolean {
    return authenticator.check(token, secret);
  }

  /** Codigo vigente para un secreto. Lo usan las pruebas y el alta asistida. */
  generateToken(secret: string): string {
    return authenticator.generate(secret);
  }
}
