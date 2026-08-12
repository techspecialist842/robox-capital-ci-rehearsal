import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Observable, tap } from "rxjs";

/**
 * Una linea de acceso por peticion, con la latencia incluida. Es la base sobre la
 * que se configuran las metricas y alertas de la Fase 1 (p. ej. tasa de 5xx y
 * percentiles de latencia), sin necesitar todavia un exportador dedicado.
 */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const startedAt = Date.now();

    const emit = (statusCode: number): void => {
      this.logger.log(
        `${request.method} ${request.originalUrl} ${statusCode} ${Date.now() - startedAt}ms`,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => emit(http.getResponse<Response>().statusCode),
        error: (err: { status?: number }) => emit(err?.status ?? 500),
      }),
    );
  }
}
