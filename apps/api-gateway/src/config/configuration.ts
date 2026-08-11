export default () => ({
  apiGatewayPort: parseInt(process.env.API_GATEWAY_PORT ?? "3000", 10),

  database: {
    host: process.env.POSTGRES_HOST ?? "localhost",
    port: parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: process.env.POSTGRES_DB ?? "robox",
    username: process.env.POSTGRES_USER ?? "robox",
    password: process.env.POSTGRES_PASSWORD ?? "robox_dev_only",
  },

  redis: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "15m",
    mfaIssuer: process.env.MFA_ISSUER ?? "roboXCapital",
  },

  eventBus: {
    // "memory" en desarrollo local; el adaptador SNS/SQS (ADR-002) se activa en AWS
    // una vez resuelta la infraestructura de la Fase 1/2 (infra/cdk).
    driver: process.env.EVENT_BUS_DRIVER ?? "memory",
  },

  providers: {
    // ADR-007 — capa de adaptadores: el nombre del proveedor selecciona la implementacion
    // concreta detras de una interfaz comun; nunca se referencia el proveedor fuera de aqui.
    broker: process.env.BROKER_PROVIDER ?? "interactive_brokers",
    marketData: process.env.MARKET_DATA_PROVIDER ?? "interactive_brokers",
    ai: process.env.AI_PROVIDER ?? "openai",
  },
});
