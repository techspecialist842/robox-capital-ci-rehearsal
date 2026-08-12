import { LoggerService } from "@nestjs/common";
import { CorrelationStore } from "./correlation.store";

const LEVEL_ORDER: Record<string, number> = {
  debug: 10,
  verbose: 20,
  log: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface JsonLogRecord {
  timestamp: string;
  level: string;
  service: string;
  environment: string;
  message: string;
  context?: string;
  correlationId?: string;
  userId?: string;
  stack?: string;
}

/**
 * Logger de la plataforma: una linea JSON por evento a stdout (ADR-009).
 *
 * En ECS/Fargate el driver de logs recoge stdout y lo entrega a CloudWatch sin
 * agente adicional, por lo que no hay dependencia de AWS en el codigo. El formato
 * de una linea por registro es el que CloudWatch Logs Insights puede consultar
 * directamente por campo.
 */
export class JsonLogger implements LoggerService {
  private readonly threshold: number;

  constructor(
    private readonly service: string,
    private readonly environment: string,
    level = "log",
  ) {
    this.threshold = LEVEL_ORDER[level] ?? LEVEL_ORDER.log;
  }

  log(message: unknown, context?: string): void {
    this.write("log", message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write("error", message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write("verbose", message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write("fatal", message, context);
  }

  /** Expuesto para las pruebas: construye el registro sin escribirlo. */
  buildRecord(
    level: string,
    message: unknown,
    context?: string,
    stack?: string,
  ): JsonLogRecord {
    const request = CorrelationStore.get();
    return {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      environment: this.environment,
      message: typeof message === "string" ? message : JSON.stringify(message),
      ...(context ? { context } : {}),
      ...(request?.correlationId ? { correlationId: request.correlationId } : {}),
      ...(request?.userId ? { userId: request.userId } : {}),
      ...(stack ? { stack } : {}),
    };
  }

  private write(level: string, message: unknown, context?: string, stack?: string): void {
    if ((LEVEL_ORDER[level] ?? 0) < this.threshold) {
      return;
    }
    const record = this.buildRecord(level, message, context, stack);
    const stream = level === "error" || level === "fatal" ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(record)}\n`);
  }
}
