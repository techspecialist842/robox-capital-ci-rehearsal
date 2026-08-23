import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "analista@robox.capital" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, description: "Nunca se registra en los logs." })
  @IsString()
  @MinLength(8)
  password!: string;
}
