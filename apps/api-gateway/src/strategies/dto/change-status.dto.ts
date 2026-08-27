import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { StrategyStatus } from "../../database/entities/strategy.entity";

export class ChangeStrategyStatusDto {
  @ApiProperty({
    enum: ["draft", "active", "suspended", "archived"],
    description:
      "Transiciones permitidas: draft->active|archived, active->suspended|archived, " +
      "suspended->active|archived. 'archived' es definitivo y no tiene salida.",
  })
  @IsIn(["draft", "active", "suspended", "archived"])
  status!: StrategyStatus;
}
