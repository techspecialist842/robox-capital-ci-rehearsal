import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";

/**
 * Documento OpenAPI del API Gateway.
 *
 * Se construye en un solo sitio para que la especificacion publicada en /api/docs
 * y la que valida el pipeline sean literalmente la misma. Si se generasen por
 * separado, podrian divergir y la prueba de contrato dejaria de significar nada.
 *
 * La version se fija a mano y NO se toma de package.json: es la version del
 * contrato, no la del artefacto. Un cambio incompatible debe subirla de forma
 * deliberada, no como efecto colateral de publicar una correccion.
 */
export const API_CONTRACT_VERSION = "1.0.0";

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("roboX Capital — API Gateway")
    .setDescription(
      "Punto de entrada autenticado de la plataforma. El MFA es obligatorio: unas " +
        "credenciales correctas no bastan para obtener una sesion.",
    )
    .setVersion(API_CONTRACT_VERSION)
    .addBearerAuth()
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwaggerUi(app: INestApplication): void {
  SwaggerModule.setup("api/docs", app, buildOpenApiDocument(app));
}
