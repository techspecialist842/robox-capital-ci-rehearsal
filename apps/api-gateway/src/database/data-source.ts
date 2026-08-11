import "reflect-metadata";
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { UserEntity } from "./entities/user.entity";
import { CreateUsers1700000000000 } from "./migrations/1700000000000-CreateUsers";

config({ path: "../../.env" });

/**
 * DataSource plano (sin Nest DI) para el CLI de TypeORM — usado por
 * "npm run migration:run" (ver package.json). El runtime de la app usa
 * database.module.ts en su lugar.
 */
export default new DataSource({
  type: "postgres",
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
  database: process.env.POSTGRES_DB ?? "robox",
  username: process.env.POSTGRES_USER ?? "robox",
  password: process.env.POSTGRES_PASSWORD ?? "robox_dev_only",
  entities: [UserEntity],
  migrations: [CreateUsers1700000000000],
});
