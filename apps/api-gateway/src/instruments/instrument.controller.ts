import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { InstrumentService } from "./instrument.service";
import { CreateInstrumentDto } from "./dto/create-instrument.dto";

@ApiTags("Instrumentos")
@ApiBearerAuth()
@Controller("instruments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InstrumentController {
  constructor(private readonly instruments: InstrumentService) {}

  @Get()
  @ApiOperation({ summary: "Lista los instrumentos registrados" })
  @ApiQuery({ name: "activos", required: false, type: Boolean })
  findAll(@Query("activos") activos?: string) {
    return this.instruments.findAll(activos === "true");
  }

  @Get(":symbol")
  @ApiOperation({ summary: "Obtiene un instrumento por simbolo" })
  @ApiResponse({ status: 404, description: "Instrumento no encontrado" })
  findOne(@Param("symbol") symbol: string) {
    return this.instruments.findBySymbol(symbol);
  }

  @Post()
  @Roles("admin", "analista-estrategias")
  @ApiOperation({ summary: "Registra un instrumento" })
  @ApiResponse({ status: 409, description: "El instrumento ya esta registrado" })
  create(@Body() dto: CreateInstrumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.instruments.create(dto, user.userId);
  }

  @Delete(":symbol")
  @Roles("admin")
  @ApiOperation({
    summary: "Desactiva un instrumento",
    description:
      "No lo borra: puede estar referenciado por versiones de estrategias y por " +
      "operaciones ya registradas.",
  })
  deactivate(@Param("symbol") symbol: string, @CurrentUser() user: AuthenticatedUser) {
    return this.instruments.deactivate(symbol, user.userId);
  }
}
