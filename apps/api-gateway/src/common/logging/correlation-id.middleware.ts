import { NextFunction, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { CorrelationStore } from "./correlation.store";

export const CORRELATION_HEADER = "x-correlation-id";

/**
 * Abre el contexto de correlacion de cada peticion. Respeta un ID entrante para
 * poder seguir una operacion que cruza varios servicios, y lo devuelve siempre en
 * la respuesta para que el cliente pueda citarlo al reportar un incidente.
 *
 * Se aplica con app.use() en el arranque, no con forRoutes("*"): Express 5 exige
 * comodines con nombre y aplicarlo globalmente evita depender de esa sintaxis.
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[CORRELATION_HEADER];
  const correlationId =
    typeof incoming === "string" && incoming.trim().length > 0 ? incoming : uuid();

  res.setHeader(CORRELATION_HEADER, correlationId);
  CorrelationStore.run({ correlationId }, () => next());
}
