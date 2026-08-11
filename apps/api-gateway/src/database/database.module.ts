import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "./entities/user.entity";
import { CreateUsers1700000000000 } from "./migrations/1700000000000-CreateUsers";

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
        entities: [UserEntity],
        migrations: [CreateUsers1700000000000],
        // Las migraciones se ejecutan explicitamente (npm run migration:run), nunca
        // synchronize:true fuera de pruebas locales rapidas.
        synchronize: false,
        autoLoadEntities: true,
      }),
    }),
    TypeOrmModule.forFeature([UserEntity]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
