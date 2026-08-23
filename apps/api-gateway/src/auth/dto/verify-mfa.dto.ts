import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUUID, Length } from "class-validator";

export class VerifyMfaDto {
  @ApiProperty({
    format: "uuid",
    description: "Valor devuelto por /auth/login cuando el usuario ya tiene MFA activo.",
  })
  @IsUUID()
  challengeUserId!: string;

  @ApiProperty({ minLength: 6, maxLength: 6, example: "123456" })
  @IsString()
  @Length(6, 6)
  otpCode!: string;
}
