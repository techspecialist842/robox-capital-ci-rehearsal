import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { StrategyService } from "./strategy.service";
import { CreateStrategyDto } from "./dto/create-strategy.dto";
import { CreateStrategyVersionDto } from "./dto/create-strategy-version.dto";
import { ChangeStrategyStatusDto } from "./dto/change-status.dto";

/**
 * Registro de estrategias (Fase 2).
 *
 * Lectura para cualquier rol autenticado; escritura solo para quien define
 * estrategias o administra. Suspender una estrategia detiene decisiones con
 * dinero de por medio, asi que no puede quedar al alcance de un rol de consulta.
 */
@ApiTags("Estrategias")
@ApiBearerAuth()
@Controller("strategies")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StrategyController {
  constructor(private readonly strategies: StrategyService) {}

  @Get()
  @ApiOperation({ summary: "Lista las estrategias" })
  findAll() {
    return this.strategies.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Obtiene una estrategia" })
  @ApiResponse({ status: 404, description: "Estrategia no encontrada" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.strategies.findOne(id);
  }

  @Get(":id/versions")
  @ApiOperation({ summary: "Historial de versiones, de la mas reciente a la mas antigua" })
  listVersions(@Param("id", ParseUUIDPipe) id: string) {
    return this.strategies.listVersions(id);
  }

  @Post()
  @Roles("admin", "analista-estrategias")
  @ApiOperation({ summary: "Crea una estrategia y su version inicial" })
  @ApiResponse({ status: 409, description: "Ya existe una estrategia con ese nombre" })
  create(@Body() dto: CreateStrategyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.strategies.create(dto, user.userId);
  }

  @Post(":id/versions")
  @Roles("admin", "analista-estrategias")
  @ApiOperation({
    summary: "Crea una version nueva",
    description: "Las versiones anteriores permanecen intactas: el historial es inmutable.",
  })
  createVersion(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateStrategyVersionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.strategies.createVersion(id, dto, user.userId);
  }

  @Patch(":id/status")
  @Roles("admin", "analista-estrategias")
  @ApiOperation({ summary: "Activa, suspende o archiva una estrategia" })
  @ApiResponse({ status: 409, description: "Transicion de estado no permitida" })
  changeStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeStrategyStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.strategies.changeStatus(id, dto.status, user.userId);
  }
}
