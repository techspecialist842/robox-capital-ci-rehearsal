import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";

/**
 * Requiere PostgreSQL y Redis arriba (docker compose up -d) — no se ejecuta en el
 * job "api-gateway" de CI (que solo corre pruebas unitarias); se agrega como job
 * separado con servicios de PostgreSQL/Redis una vez estabilizada la Fase 1.
 */
describe("HealthController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health -> 200 { status: ok }", () => {
    return request(app.getHttpServer())
      .get("/health")
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe("ok");
        expect(res.body.service).toBe("api-gateway");
      });
  });
});
