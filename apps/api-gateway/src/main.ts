import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { JsonLogger } from "./common/logging/json-logger.service";
import { configureApp } from "./bootstrap";

async function bootstrap(): Promise<void> {
  // El logger se construye antes que la app para que los propios mensajes de
  // arranque salgan ya en JSON y no en el formato por defecto de Nest.
  const logger = new JsonLogger(
    process.env.SERVICE_NAME ?? "api-gateway",
    process.env.ENVIRONMENT ?? "local",
    process.env.LOG_LEVEL ?? "log",
  );

  const app = await NestFactory.create(AppModule, { logger });

  configureApp(app);

  const config = app.get(ConfigService);
  const port = config.get<number>("apiGatewayPort", 3000);

  await app.listen(port);
  logger.log(`api-gateway escuchando en el puerto ${port}`, "Bootstrap");
}

bootstrap();
