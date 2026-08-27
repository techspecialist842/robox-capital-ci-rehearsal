import { UserEntity } from "./entities/user.entity";
import { InstrumentEntity } from "./entities/instrument.entity";
import { StrategyEntity } from "./entities/strategy.entity";
import { StrategyVersionEntity } from "./entities/strategy-version.entity";
import { CreateUsers1700000000000 } from "./migrations/1700000000000-CreateUsers";
import { CreateInstrumentsAndStrategies1700000001000 } from "./migrations/1700000001000-CreateInstrumentsAndStrategies";
import { EnforceAppendOnly1700000002000 } from "./migrations/1700000002000-EnforceAppendOnly";

/**
 * Fuente unica de entidades y migraciones.
 *
 * La aplicacion (database.module.ts) y el CLI de migraciones (data-source.ts)
 * leen de aqui. Cuando cada uno tenia su propia lista, era cuestion de tiempo que
 * alguien anadiera una migracion a una sola: la aplicacion arrancaria contra un
 * esquema que las migraciones no crean, y el fallo aparece en el despliegue.
 *
 * El orden de MIGRACIONES importa: se aplican en secuencia.
 */
export const ENTIDADES = [
  UserEntity,
  InstrumentEntity,
  StrategyEntity,
  StrategyVersionEntity,
];

export const MIGRACIONES = [
  CreateUsers1700000000000,
  CreateInstrumentsAndStrategies1700000001000,
  EnforceAppendOnly1700000002000,
];
