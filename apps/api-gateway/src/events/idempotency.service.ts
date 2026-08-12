import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

const PROCESSED_PREFIX = "event-processed:";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 horas

/**
 * Regla 1 de la semantica del bus: SQS entrega al menos una vez, asi que un
 * consumidor sin memoria procesa duplicados. Aqui esa memoria son claves en Redis
 * con TTL.
 *
 * La marca se pone ANTES de ejecutar el manejador y con SET NX, que es atomico:
 * si dos copias del mismo mensaje llegan a la vez a dos instancias, solo una gana
 * la clave. Marcar despues del manejador dejaria abierta esa ventana.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Devuelve true si este evento debe procesarse, false si ya se proceso.
   * Reservar y comprobar son la misma operacion a proposito: separarlas
   * reintroduce la condicion de carrera que este servicio existe para evitar.
   */
  async claim(eventId: string, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<boolean> {
    return this.redis.setIfAbsent(`${PROCESSED_PREFIX}${eventId}`, "1", ttlSeconds);
  }

  /**
   * Libera la marca. Se usa cuando el manejador falla y queremos que el reintento
   * de SQS vuelva a intentarlo de verdad en lugar de descartarlo por "duplicado".
   */
  async release(eventId: string): Promise<void> {
    await this.redis.del(`${PROCESSED_PREFIX}${eventId}`);
  }
}
