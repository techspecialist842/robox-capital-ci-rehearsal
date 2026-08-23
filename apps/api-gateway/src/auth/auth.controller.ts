import { Body, Controller, Delete, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { VerifyMfaDto } from "./dto/verify-mfa.dto";
import { ActivateMfaDto } from "./dto/activate-mfa.dto";
import {
  LoginResponseDto,
  MfaEnrollmentResponseDto,
  SessionResponseDto,
} from "./dto/auth-responses.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { MfaEnrollmentGuard } from "./guards/mfa-enrollment.guard";
import { CurrentUser } from "./decorators/current-user.decorator";
import { AuthenticatedUser } from "./jwt-payload.interface";

@ApiTags("Autenticacion")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @ApiOperation({
    summary: "Valida credenciales",
    description:
      "Con el MFA obligatorio activo, unas credenciales correctas NO devuelven una " +
      "sesion: devuelven un desafio de segundo factor o un token de alta.",
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401, description: "Credenciales invalidas" })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Post("mfa/verify")
  @HttpCode(200)
  @ApiOperation({ summary: "Valida el codigo TOTP y emite la sesion" })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 403, description: "Codigo MFA incorrecto" })
  verifyMfa(@Body() dto: VerifyMfaDto): Promise<LoginResponseDto> {
    return this.authService.verifyMfa(dto);
  }

  /**
   * Alta de MFA, paso 1. Devuelve el secreto y la URL otpauth:// para el codigo QR.
   * Requiere el token acotado que entrega /auth/login cuando falta el segundo factor.
   */
  @UseGuards(MfaEnrollmentGuard)
  @ApiBearerAuth()
  @Post("mfa/enroll")
  @HttpCode(200)
  @ApiOperation({
    summary: "Alta de MFA, paso 1: genera el secreto",
    description: "Requiere el enrollmentToken de /auth/login. El factor queda inactivo.",
  })
  @ApiResponse({ status: 200, type: MfaEnrollmentResponseDto })
  @ApiResponse({ status: 403, description: "Se requiere un token de alta de MFA" })
  enrollMfa(@CurrentUser() user: AuthenticatedUser): Promise<MfaEnrollmentResponseDto> {
    return this.authService.startMfaEnrollment(user.userId);
  }

  /** Alta de MFA, paso 2: confirma el codigo, activa el factor y emite la sesion. */
  @UseGuards(MfaEnrollmentGuard)
  @ApiBearerAuth()
  @Post("mfa/activate")
  @HttpCode(200)
  @ApiOperation({ summary: "Alta de MFA, paso 2: activa el factor y emite la sesion" })
  @ApiResponse({ status: 200, type: SessionResponseDto })
  @ApiResponse({ status: 403, description: "Codigo MFA incorrecto" })
  activateMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ActivateMfaDto,
  ): Promise<SessionResponseDto> {
    return this.authService.activateMfa(user.userId, dto.otpCode);
  }

  /** Revoca la sesion actual — "puedo ver las sesiones activas y revocar una sesion". */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete("sessions/current")
  @HttpCode(204)
  @ApiOperation({
    summary: "Revoca la sesion actual",
    description: "El token deja de aceptarse en la siguiente peticion.",
  })
  @ApiResponse({ status: 204, description: "Sesion revocada" })
  async revokeCurrentSession(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.revokeSession(user.sessionId, user.tokenId);
  }
}
