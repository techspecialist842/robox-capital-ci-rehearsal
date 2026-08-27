import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsObject, IsUUID } from "class-validator";

export class CreateStrategyVersionDto {
  @ApiProperty({
    type: "object",
    additionalProperties: true,
    example: { ventana: 30, umbralEntrada: 1.2 },
  })
  @IsObject()
  parameters!: Record<string, unknown>;

  @ApiProperty({ type: [String], format: "uuid", example: [] })
  @IsArray()
  @IsUUID("4", { each: true })
  instrumentIds!: string[];
}
