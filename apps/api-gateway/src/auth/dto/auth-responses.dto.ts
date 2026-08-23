import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Un contrato de API describe lo que se recibe y lo que se devuelve. Declarar solo
 * las entradas dejaria fuera la mitad que los clientes realmente consumen, que es
 * ademas la que rompe una app movil desplegada cuando cambia.
 */
export class LoginResponseDto {
  @ApiProperty({
    description:
      "true si hace falta un segundo factor. Con MFA obligatorio, un login correcto " +
      "nunca devuelve accessToken directamente.",
  })
  requiresMfa!: boolean;

  @ApiPropertyOptional({
    description: "true si el usuario aun no ha configurado su segundo factor.",
  })
  requiresMfaEnrollment?: boolean;

  @ApiPropertyOptional({
    format: "uuid",
    description: "Identificador a devolver en /auth/mfa/verify.",
  })
  challengeUserId?: string;

  @ApiPropertyOptional({
    description: "Solo presente si el MFA obligatorio esta desactivado por feature flag.",
  })
  accessToken?: string;

  @ApiPropertyOptional({
    description:
      "Token acotado, valido 10 minutos, que solo habilita /auth/mfa/enroll y " +
      "/auth/mfa/activate. No da acceso a ningun recurso de negocio.",
  })
  enrollmentToken?: string;
}

export class MfaEnrollmentResponseDto {
  @ApiProperty({ description: "Secreto TOTP en base32. Mostrar una sola vez." })
  secret!: string;

  @ApiProperty({
    example: "otpauth://totp/roboXCapital:analista@robox.capital?secret=...&issuer=roboXCapital",
    description: "URL para el codigo QR de la aplicacion de autenticacion.",
  })
  otpAuthUrl!: string;
}

export class SessionResponseDto {
  @ApiProperty({ description: "JWT de sesion. Enviar como Bearer en el resto de peticiones." })
  accessToken!: string;
}
