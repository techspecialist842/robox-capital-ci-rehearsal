import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Redis se usa unicamente para sesion/cache (ADR-003) — nunca como fuente de verdad.
 * Aqui respalda: (a) el TTL de sesiones y (b) la lista de revocacion de tokens (jti blocklist),
 * que soporta el criterio de aceptacion "sesiones revocables" de la Fase 1.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>("redis.host"),
      port: this.config.get<number>("redis.port"),
      lazyConnect: true,
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  async setSession(sessionId: string, userId: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`session:${sessionId}`, userId, "EX", ttlSeconds);
  }

  async getSession(sessionId: string): Promise<string | null> {
    return this.client.get(`session:${sessionId}`);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.client.del(`session:${sessionId}`);
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    const revoked = await this.client.get(`revoked-jti:${jti}`);
    return revoked !== null;
  }

  async revokeToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.client.set(`revoked-jti:${jti}`, "1", "EX", ttlSeconds);
  }
}
