import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNumberString, IsOptional, IsString, Length, MaxLength } from "class-validator";

export const CLASES_DE_ACTIVO = ["metal", "cripto", "renta_variable", "divisa"] as const;

export class CreateInstrumentDto {
  @ApiProperty({ example: "XAUUSD" })
  @IsString()
  @Length(2, 20)
  symbol!: string;

  @ApiProperty({ example: "Oro contra dolar" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: CLASES_DE_ACTIVO, example: "metal" })
  @IsIn(CLASES_DE_ACTIVO as unknown as string[])
  assetClass!: string;

  @ApiProperty({ example: "USD", minLength: 3, maxLength: 3 })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({ example: "COMEX" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  exchange?: string;

  @ApiProperty({
    example: "0.01",
    description:
      "Incremento minimo de precio, como cadena. No se usa un numero de coma " +
      "flotante: 0.01 no es exactamente representable y el error se acumula.",
  })
  @IsNumberString()
  tickSize!: string;
}
