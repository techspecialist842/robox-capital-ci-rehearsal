import { Body, Controller, Delete, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { VerifyMfaDto } from "./dto/verify-mfa.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
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

  /** Revoca la sesion actual — "puedo ver las sesiones activas y revocar una sesion". */
  @UseGuards(JwtAuthGuard)
  @Delete("sessions/current")
  @HttpCode(204)
  async revokeCurrentSession(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.revokeSession(user.sessionId, user.tokenId);
  }
}
