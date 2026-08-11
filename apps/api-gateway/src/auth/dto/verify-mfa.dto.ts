import { IsString, IsUUID, Length } from "class-validator";

export class VerifyMfaDto {
  @IsUUID()
  challengeUserId!: string;

  @IsString()
  @Length(6, 6)
  otpCode!: string;
}
