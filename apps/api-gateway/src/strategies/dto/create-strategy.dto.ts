import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateStrategyDto {
  @ApiProperty({ example: "Momento Oro/BTC", minLength: 3, maxLength: 120 })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    example: { ventana: 20, umbralEntrada: 1.5 },
    description:
      "Parametros de la version inicial. Se guardan tal cual y quedan inmutables: " +
      "son la evidencia de con que configuracion se decidio cada operacion.",
  })
  @IsObject()
  parameters!: Record<string, unknown>;

  @ApiProperty({ type: [String], format: "uuid", example: [] })
  @IsArray()
  @IsUUID("4", { each: true })
  instrumentIds!: string[];
}
