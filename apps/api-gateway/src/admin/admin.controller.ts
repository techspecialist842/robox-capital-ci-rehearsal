import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";

/**
 * Ejemplo de referencia de un endpoint administrativo protegido por RBAC —
 * demuestra el patron que deben seguir los modulos de Estrategias/Decisiones/
 * Administracion que se construyen en las Fases 2-5 (RFP §4/§8).
 */
@ApiTags("Administracion")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get("ping")
  @Roles("admin")
  @ApiOperation({ summary: "Endpoint de referencia protegido por RBAC (rol admin)" })
  @ApiResponse({ status: 200, description: "Acceso concedido" })
  @ApiResponse({ status: 401, description: "Sin sesion valida" })
  @ApiResponse({ status: 403, description: "Rol insuficiente, o token de alta de MFA" })
  ping(@CurrentUser() user: AuthenticatedUser) {
    return { status: "ok", requestedBy: user.email };
  }
}
