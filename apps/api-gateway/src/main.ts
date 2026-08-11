import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // RFP §8/§9: validar toda entrada externa antes de que llegue a los servicios internos.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  const config = app.get(ConfigService);
  const port = config.get<number>("apiGatewayPort", 3000);

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`api-gateway escuchando en http://localhost:${port}`);
}

bootstrap();
