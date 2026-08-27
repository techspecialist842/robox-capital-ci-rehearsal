import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { authenticator } from "otplib";
import * as bcrypt from "bcryptjs";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";

/**
 * Criterio de aceptacion de la Fase 2: "las estrategias pueden crearse,
 * versionarse y suspenderse", contra PostgreSQL real.
 *
 * Lo que solo se puede comprobar aqui: que las restricciones de la base de datos
 * existen de verdad (el CHECK del estado, la unicidad de version) y que el
 * historial es realmente inmutable, no solo que el codigo no lo modifique.
 */
describe("Estrategias e instrumentos (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tokenAdmin: string;
  let tokenAnalista: string;
  const creados: string[] = [];
  const sufijo = Date.now();

  const password = "contrasena-de-prueba";

  const crearUsuarioConSesion = async (roles: string[]): Promise<string> => {
    const email = `e2e-str-${creados.length}-${sufijo}@robox.capital`;
    const hash = await bcrypt.hash(password, 10);
    await dataSource.query(
      `INSERT INTO users (email, password_hash, roles, active, mfa_enabled)
       VALUES ($1, $2, $3, true, false)`,
      [email, hash, `{${roles.join(",")}}`],
    );
    creados.push(email);

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);

    const alta = await request(app.getHttpServer())
      .post("/auth/mfa/enroll")
      .set("Authorization", `Bearer ${login.body.enrollmentToken}`)
      .expect(200);

    const activacion = await request(app.getHttpServer())
      .post("/auth/mfa/activate")
      .set("Authorization", `Bearer ${login.body.enrollmentToken}`)
      .send({ otpCode: authenticator.generate(alta.body.secret) })
      .expect(200);

    return activacion.body.accessToken;
  };

  const crearEstrategia = async (nombre: string) =>
    request(app.getHttpServer())
      .post("/strategies")
      .set("Authorization", `Bearer ${tokenAdmin}`)
      .send({ name: nombre, parameters: { ventana: 20 }, instrumentIds: [] })
      .expect(201);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    tokenAdmin = await crearUsuarioConSesion(["admin"]);
    tokenAnalista = await crearUsuarioConSesion(["visor"]);
  }, 60000);

  afterAll(async () => {
    // Las estrategias NO se borran: su historial de versiones es de solo
    // insercion, asi que el borrado en cascada falla por diseno. Por eso cada
    // ejecucion usa nombres unicos en lugar de limpiar lo anterior.
    if (dataSource) {
      await dataSource.query(`DELETE FROM instruments WHERE symbol LIKE $1`, [`E2E%`]);
      await dataSource.query(`DELETE FROM users WHERE email = ANY($1)`, [creados]);
    }
    await app?.close();
  });

  describe("ciclo de vida", () => {
    it("se crea con estado draft y version 1", async () => {
      const respuesta = await crearEstrategia(`Estrategia A ${sufijo}`);

      expect(respuesta.body.status).toBe("draft");
      expect(respuesta.body.currentVersion).toBe(1);
    });

    it("se puede activar y despues suspender", async () => {
      const creada = await crearEstrategia(`Estrategia B ${sufijo}`);
      const ruta = `/strategies/${creada.body.id}/status`;

      await request(app.getHttpServer())
        .patch(ruta)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "active" })
        .expect(200);

      const suspendida = await request(app.getHttpServer())
        .patch(ruta)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "suspended" })
        .expect(200);

      expect(suspendida.body.status).toBe("suspended");
    });

    it("archivar es definitivo: no se puede reactivar", async () => {
      const creada = await crearEstrategia(`Estrategia C ${sufijo}`);
      const ruta = `/strategies/${creada.body.id}/status`;

      await request(app.getHttpServer())
        .patch(ruta)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "archived" })
        .expect(200);

      await request(app.getHttpServer())
        .patch(ruta)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "active" })
        .expect(409);
    });

    it("la base de datos rechaza un estado fuera del ciclo de vida", async () => {
      const creada = await crearEstrategia(`Estrategia D ${sufijo}`);

      await expect(
        dataSource.query(`UPDATE strategies SET status = 'liquidada' WHERE id = $1`, [
          creada.body.id,
        ]),
      ).rejects.toThrow();
    });
  });

  describe("versionado", () => {
    it("cada version nueva incrementa el numero y conserva las anteriores", async () => {
      const creada = await crearEstrategia(`Estrategia E ${sufijo}`);
      const ruta = `/strategies/${creada.body.id}/versions`;

      const segunda = await request(app.getHttpServer())
        .post(ruta)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ parameters: { ventana: 30 }, instrumentIds: [] })
        .expect(201);

      expect(segunda.body.version).toBe(2);

      const historial = await request(app.getHttpServer())
        .get(ruta)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(historial.body.map((v: { version: number }) => v.version)).toEqual([2, 1]);
      expect(historial.body[1].parameters).toEqual({ ventana: 20 });
    });

    it("el historial de versiones es inmutable en la base de datos", async () => {
      const creada = await crearEstrategia(`Estrategia F ${sufijo}`);

      await expect(
        dataSource.query(
          `UPDATE strategy_versions SET parameters = '{"alterado": true}' WHERE strategy_id = $1`,
          [creada.body.id],
        ),
      ).rejects.toThrow();
    });

    it("no se pueden crear dos versiones con el mismo numero", async () => {
      const creada = await crearEstrategia(`Estrategia G ${sufijo}`);

      await expect(
        dataSource.query(
          `INSERT INTO strategy_versions (strategy_id, version, parameters, created_by)
           VALUES ($1, 1, '{}', $2)`,
          [creada.body.id, creada.body.createdBy],
        ),
      ).rejects.toThrow();
    });
  });

  describe("RBAC", () => {
    it("un rol de solo consulta no puede crear estrategias", async () => {
      await request(app.getHttpServer())
        .post("/strategies")
        .set("Authorization", `Bearer ${tokenAnalista}`)
        .send({ name: `Prohibida ${sufijo}`, parameters: {}, instrumentIds: [] })
        .expect(403);
    });

    it("un rol de solo consulta no puede suspender una estrategia", async () => {
      const creada = await crearEstrategia(`Estrategia H ${sufijo}`);

      await request(app.getHttpServer())
        .patch(`/strategies/${creada.body.id}/status`)
        .set("Authorization", `Bearer ${tokenAnalista}`)
        .send({ status: "archived" })
        .expect(403);
    });

    it("pero si puede consultarlas", async () => {
      await request(app.getHttpServer())
        .get("/strategies")
        .set("Authorization", `Bearer ${tokenAnalista}`)
        .expect(200);
    });
  });

  describe("instrumentos", () => {
    it("se registran y se consultan por simbolo", async () => {
      const simbolo = `E2E${sufijo}`.slice(0, 20);

      await request(app.getHttpServer())
        .post("/instruments")
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({
          symbol: simbolo,
          name: "Instrumento de prueba",
          assetClass: "metal",
          currency: "USD",
          tickSize: "0.01",
        })
        .expect(201);

      const consulta = await request(app.getHttpServer())
        .get(`/instruments/${simbolo}`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .expect(200);

      expect(consulta.body.symbol).toBe(simbolo);
      expect(consulta.body.tickSize).toBe("0.01000000");
    });
  });

  describe("auditoria", () => {
    it("crear y suspender una estrategia queda registrado", async () => {
      const creada = await crearEstrategia(`Estrategia I ${sufijo}`);
      await request(app.getHttpServer())
        .patch(`/strategies/${creada.body.id}/status`)
        .set("Authorization", `Bearer ${tokenAdmin}`)
        .send({ status: "active" })
        .expect(200);

      const filas = await dataSource.query(
        `SELECT event_type FROM audit_events WHERE payload->>'strategyId' = $1`,
        [creada.body.id],
      );
      const tipos = filas.map((f: { event_type: string }) => f.event_type);

      expect(tipos).toContain("strategy.created");
      expect(tipos).toContain("strategy.status_changed");
    });
  });
});
