import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ENTIDADES, MIGRACIONES } from "./schema";
import { configuracionTls } from "./ssl";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres",
        host: config.get<string>("database.host"),
        port: config.get<number>("database.port"),
        database: config.get<string>("database.database"),
        username: config.get<string>("database.username"),
        password: config.get<string>("database.password"),
        ssl: configuracionTls(),
        entities: ENTIDADES,
        migrations: MIGRACIONES,
        // Las migraciones se ejecutan explicitamente (npm run migration:run), nunca
        // synchronize:true fuera de pruebas locales rapidas.
        synchronize: false,
        autoLoadEntities: true,
      }),
    }),
    TypeOrmModule.forFeature(ENTIDADES),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
