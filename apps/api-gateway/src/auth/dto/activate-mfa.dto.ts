import { IsString, Length } from "class-validator";

export class ActivateMfaDto {
  @IsString()
  @Length(6, 6)
  otpCode!: string;
}
