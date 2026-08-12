export default () => ({
  apiGatewayPort: parseInt(process.env.API_GATEWAY_PORT ?? "3000", 10),

  // Identifica el origen de cada linea de log en un destino compartido (ADR-009).
  serviceName: process.env.SERVICE_NAME ?? "api-gateway",
  environment: process.env.ENVIRONMENT ?? "local",

  logging: {
    level: process.env.LOG_LEVEL ?? "log",
  },

  aws: {
    region: process.env.AWS_REGION ?? "us-east-1",
    // Solo se define contra LocalStack en las pruebas de integracion; en AWS real
    // se deja vacio para que el SDK resuelva el endpoint por si mismo.
    endpoint: process.env.AWS_ENDPOINT_URL,
  },

  secrets: {
    // "env" solo se acepta en local/test; en dev, staging y produccion debe ser
    // "aws" o el arranque falla (ADR-008).
    provider: process.env.SECRETS_PROVIDER ?? "env",
  },

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
    // "memory" solo para desarrollo local en un unico proceso; "sns-sqs" es el
    // adaptador real (ADR-002). La semantica que deben cumplir productores y
    // consumidores esta en packages/event-contracts/SEMANTICA.md.
    driver: process.env.EVENT_BUS_DRIVER ?? "memory",
    topicArn: process.env.EVENT_BUS_TOPIC_ARN,
    queueUrl: process.env.EVENT_BUS_QUEUE_URL,
  },

  providers: {
    // ADR-007 — capa de adaptadores: el nombre del proveedor selecciona la implementacion
    // concreta detras de una interfaz comun; nunca se referencia el proveedor fuera de aqui.
    broker: process.env.BROKER_PROVIDER ?? "interactive_brokers",
    marketData: process.env.MARKET_DATA_PROVIDER ?? "interactive_brokers",
    ai: process.env.AI_PROVIDER ?? "openai",
  },
});
