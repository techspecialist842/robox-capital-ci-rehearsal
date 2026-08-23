import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class ActivateMfaDto {
  @ApiProperty({
    minLength: 6,
    maxLength: 6,
    example: "123456",
    description: "Codigo TOTP generado con el secreto entregado por /auth/mfa/enroll.",
  })
  @IsString()
  @Length(6, 6)
  otpCode!: string;
}
