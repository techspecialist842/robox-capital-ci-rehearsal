import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  correlationId: string;
  userId?: string;
}

/**
 * Propaga el ID de correlacion por toda la cadena asincrona de una peticion sin
 * tener que pasarlo como parametro a cada servicio. Cualquier log emitido durante
 * la peticion queda ligado a ella, que es lo que hace util un log centralizado
 * (ADR-009).
 */
const storage = new AsyncLocalStorage<RequestContext>();

export const CorrelationStore = {
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  /** Permite enriquecer el contexto una vez que la autenticacion resolvio el usuario. */
  setUserId(userId: string): void {
    const current = storage.getStore();
    if (current) {
      current.userId = userId;
    }
  },
};
