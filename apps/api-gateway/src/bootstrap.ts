import { INestApplication, ValidationPipe } from "@nestjs/common";
import { correlationIdMiddleware } from "./common/logging/correlation-id.middleware";
import { RequestLoggingInterceptor } from "./common/logging/request-logging.interceptor";
import { setupSwaggerUi } from "./openapi";

/**
 * Configuracion compartida de la aplicacion.
 *
 * Vive aqui y no en main.ts para que las pruebas de integracion arranquen con
 * exactamente la misma configuracion que produccion. Cuando estaba en main.ts, la
 * aplicacion de prueba no tenia el middleware de correlacion y las pruebas pasaban
 * sobre una configuracion que no existe en ningun entorno real.
 */
export function configureApp(app: INestApplication): void {
  // Primero en la cadena: todo lo que ocurra despues queda ligado al mismo ID de
  // correlacion, incluidos los logs de error.
  app.use(correlationIdMiddleware);

  // RFP §8/§9: validar toda entrada externa antes de que llegue a los servicios internos.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.enableCors({ exposedHeaders: ["x-correlation-id"] });

  // La documentacion interactiva describe cada endpoint y su forma de autenticacion.
  // Se sirve en todos los entornos salvo produccion: alli es superficie de ataque
  // gratuita, y el contrato ya viaja versionado en openapi.json.
  if ((process.env.ENVIRONMENT ?? "local") !== "production") {
    setupSwaggerUi(app);
  }
}
