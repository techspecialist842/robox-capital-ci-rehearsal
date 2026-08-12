import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { JsonLogger } from "./common/logging/json-logger.service";
import { RequestLoggingInterceptor } from "./common/logging/request-logging.interceptor";
import { correlationIdMiddleware } from "./common/logging/correlation-id.middleware";

async function bootstrap(): Promise<void> {
  // El logger se construye antes que la app para que los propios mensajes de
  // arranque salgan ya en JSON y no en el formato por defecto de Nest.
  const logger = new JsonLogger(
    process.env.SERVICE_NAME ?? "api-gateway",
    process.env.ENVIRONMENT ?? "local",
    process.env.LOG_LEVEL ?? "log",
  );

  const app = await NestFactory.create(AppModule, { logger });

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

  const config = app.get(ConfigService);
  const port = config.get<number>("apiGatewayPort", 3000);

  await app.listen(port);
  logger.log(`api-gateway escuchando en el puerto ${port}`, "Bootstrap");
}

bootstrap();
