import { RedisService } from "../redis/redis.service";
import { IdempotencyService } from "./idempotency.service";

/** Redis en memoria con la semantica de SET NX, que es lo que se esta probando. */
class FakeRedis {
  private readonly keys = new Set<string>();

  async setIfAbsent(key: string): Promise<boolean> {
    if (this.keys.has(key)) {
      return false;
    }
    this.keys.add(key);
    return true;
  }

  async del(key: string): Promise<void> {
    this.keys.delete(key);
  }
}

describe("IdempotencyService", () => {
  let redis: FakeRedis;
  let service: IdempotencyService;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new IdempotencyService(redis as unknown as RedisService);
  });

  it("la primera reserva gana y la segunda no", async () => {
    await expect(service.claim("evento-1")).resolves.toBe(true);
    await expect(service.claim("evento-1")).resolves.toBe(false);
  });

  it("eventos distintos no se estorban", async () => {
    await expect(service.claim("evento-1")).resolves.toBe(true);
    await expect(service.claim("evento-2")).resolves.toBe(true);
  });

  it("solo una de varias reservas simultaneas gana", async () => {
    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => service.claim("mismo-evento")),
    );

    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it("liberar permite que el reintento vuelva a ejecutarse", async () => {
    await service.claim("evento-1");
    await service.release("evento-1");

    await expect(service.claim("evento-1")).resolves.toBe(true);
  });
});
