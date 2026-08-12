import { Body, Controller, Delete, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { VerifyMfaDto } from "./dto/verify-mfa.dto";
import { ActivateMfaDto } from "./dto/activate-mfa.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { MfaEnrollmentGuard } from "./guards/mfa-enrollment.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AuthenticatedUser } from "./jwt-payload.interface";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("mfa/verify")
  @HttpCode(200)
  verifyMfa(@Body() dto: VerifyMfaDto) {
    return this.authService.verifyMfa(dto);
  }

  /**
   * Alta de MFA, paso 1. Devuelve el secreto y la URL otpauth:// para el codigo QR.
   * Requiere el token acotado que entrega /auth/login cuando falta el segundo factor.
   */
  @UseGuards(MfaEnrollmentGuard)
  @Post("mfa/enroll")
  @HttpCode(200)
  enrollMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.startMfaEnrollment(user.userId);
  }

  /** Alta de MFA, paso 2: confirma el codigo, activa el factor y emite la sesion. */
  @UseGuards(MfaEnrollmentGuard)
  @Post("mfa/activate")
  @HttpCode(200)
  activateMfa(@CurrentUser() user: AuthenticatedUser, @Body() dto: ActivateMfaDto) {
    return this.authService.activateMfa(user.userId, dto.otpCode);
  }

  /** Revoca la sesion actual — "puedo ver las sesiones activas y revocar una sesion". */
  @UseGuards(JwtAuthGuard)
  @Delete("sessions/current")
  @HttpCode(204)
  async revokeCurrentSession(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.revokeSession(user.sessionId, user.tokenId);
  }
}
