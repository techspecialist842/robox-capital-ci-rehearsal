import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { authenticator } from "otplib";
import * as bcrypt from "bcryptjs";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/bootstrap";

/**
 * Prueba de extremo a extremo del criterio de Puerta 1 "Inicio de sesion seguro +
 * MFA + RBAC verificados", contra PostgreSQL y Redis reales.
 *
 * Las pruebas unitarias verifican cada pieza por separado con dobles. Esta
 * verifica lo que ninguna de ellas puede: que las guardas esten efectivamente
 * conectadas a las rutas, que el token firmado se valide de vuelta, y que la
 * revocacion via Redis surta efecto en la siguiente peticion.
 *
 * Cada prueba crea su propio usuario. Compartirlo acoplaria las pruebas al orden
 * de ejecucion, porque activar el MFA cambia el flujo de inicio de sesion.
 */
describe("Autenticacion, MFA y RBAC (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const password = "contrasena-de-prueba";
  const creados: string[] = [];

  interface Usuario {
    id: string;
    email: string;
  }

  const crearUsuario = async (roles: string[]): Promise<Usuario> => {
    const email = `e2e-${creados.length}-${Date.now()}@robox.capital`;
    const hash = await bcrypt.hash(password, 10);
    const [row] = await dataSource.query(
      `INSERT INTO users (email, password_hash, roles, active, mfa_enabled)
       VALUES ($1, $2, $3, true, false) RETURNING id`,
      [email, hash, `{${roles.join(",")}}`],
    );
    creados.push(email);
    return { id: row.id, email };
  };

  /** Recorre el alta completa de MFA y devuelve un token de sesion utilizable. */
  const altaCompletaDeMfa = async (email: string): Promise<string> => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password })
      .expect(200);

    expect(login.body.requiresMfaEnrollment).toBe(true);
    expect(login.body.accessToken).toBeUndefined();

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // La misma configuracion que produccion, no una replica que puede desviarse.
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
  }, 30000);

  afterAll(async () => {
    if (dataSource && creados.length > 0) {
      await dataSource.query(`DELETE FROM users WHERE email = ANY($1)`, [creados]);
    }
    await app?.close();
  });

  describe("el MFA no se puede evitar", () => {
    it("credenciales correctas sin segundo factor NO entregan sesion", async () => {
      const { email } = await crearUsuario(["admin"]);

      const respuesta = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password })
        .expect(200);

      expect(respuesta.body.accessToken).toBeUndefined();
      expect(respuesta.body.requiresMfaEnrollment).toBe(true);
      expect(respuesta.body.enrollmentToken).toBeDefined();
    });

    it("el token de alta NO da acceso a un endpoint protegido", async () => {
      const { email } = await crearUsuario(["admin"]);

      const login = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password })
        .expect(200);

      await request(app.getHttpServer())
        .get("/admin/ping")
        .set("Authorization", `Bearer ${login.body.enrollmentToken}`)
        .expect(403);
    });

    it("rechaza credenciales incorrectas", async () => {
      const { email } = await crearUsuario(["admin"]);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password: "incorrecta" })
        .expect(401);
    });

    it("un codigo TOTP incorrecto no activa el factor", async () => {
      const { email } = await crearUsuario(["analista"]);

      const login = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password })
        .expect(200);

      await request(app.getHttpServer())
        .post("/auth/mfa/enroll")
        .set("Authorization", `Bearer ${login.body.enrollmentToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post("/auth/mfa/activate")
        .set("Authorization", `Bearer ${login.body.enrollmentToken}`)
        .send({ otpCode: "000000" })
        .expect(403);
    });
  });

  describe("RBAC del lado del servidor", () => {
    it("tras activar el MFA, el rol correcto accede", async () => {
      const { email } = await crearUsuario(["admin"]);
      const token = await altaCompletaDeMfa(email);

      const respuesta = await request(app.getHttpServer())
        .get("/admin/ping")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(respuesta.body.requestedBy).toBe(email);
    });

    it("un rol insuficiente recibe 403 aunque la sesion sea valida", async () => {
      const { email } = await crearUsuario(["analista"]);
      const token = await altaCompletaDeMfa(email);

      await request(app.getHttpServer())
        .get("/admin/ping")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });

    it("sin token no se llega al endpoint", async () => {
      await request(app.getHttpServer()).get("/admin/ping").expect(401);
    });
  });

  describe("revocacion de sesion", () => {
    it("tras revocar, el mismo token deja de servir", async () => {
      const { email } = await crearUsuario(["admin"]);
      const token = await altaCompletaDeMfa(email);

      await request(app.getHttpServer())
        .get("/admin/ping")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete("/auth/sessions/current")
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .get("/admin/ping")
        .set("Authorization", `Bearer ${token}`)
        .expect(401);
    });
  });

  describe("auditoria", () => {
    it("el alta y la creacion de sesion quedan registradas para ese usuario", async () => {
      const { id, email } = await crearUsuario(["admin"]);
      await altaCompletaDeMfa(email);

      const filas = await dataSource.query(
        `SELECT event_type FROM audit_events WHERE actor_user_id = $1`,
        [id],
      );
      const tipos = filas.map((f: { event_type: string }) => f.event_type);

      expect(tipos).toContain("auth.mfa_enrollment_required");
      expect(tipos).toContain("auth.mfa_activated");
      expect(tipos).toContain("auth.session_created");
    });
  });

  describe("correlacion", () => {
    it("toda respuesta incluye x-correlation-id", async () => {
      const respuesta = await request(app.getHttpServer()).get("/health").expect(200);

      expect(respuesta.headers["x-correlation-id"]).toBeDefined();
    });

    it("respeta un ID entrante para poder seguir una operacion entre servicios", async () => {
      const respuesta = await request(app.getHttpServer())
        .get("/health")
        .set("x-correlation-id", "traza-de-prueba")
        .expect(200);

      expect(respuesta.headers["x-correlation-id"]).toBe("traza-de-prueba");
    });
  });
});
