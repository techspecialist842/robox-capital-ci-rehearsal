import { JsonLogger } from "./json-logger.service";
import { CorrelationStore } from "./correlation.store";

describe("JsonLogger", () => {
  const logger = new JsonLogger("api-gateway", "test");

  it("emite un registro con los campos que CloudWatch consulta", () => {
    const record = logger.buildRecord("log", "sesion creada", "AuthService");

    expect(record.level).toBe("log");
    expect(record.service).toBe("api-gateway");
    expect(record.environment).toBe("test");
    expect(record.message).toBe("sesion creada");
    expect(record.context).toBe("AuthService");
    expect(() => new Date(record.timestamp).toISOString()).not.toThrow();
  });

  it("adjunta el ID de correlacion de la peticion en curso", () => {
    const record = CorrelationStore.run({ correlationId: "abc-123" }, () =>
      logger.buildRecord("log", "dentro de la peticion"),
    );

    expect(record.correlationId).toBe("abc-123");
  });

  it("adjunta el usuario una vez que la autenticacion lo resolvio", () => {
    const record = CorrelationStore.run({ correlationId: "abc-123" }, () => {
      CorrelationStore.setUserId("user-1");
      return logger.buildRecord("log", "ya autenticado");
    });

    expect(record.userId).toBe("user-1");
  });

  it("no filtra el ID de correlacion entre peticiones distintas", () => {
    CorrelationStore.run({ correlationId: "primera" }, () =>
      logger.buildRecord("log", "una"),
    );
    const fuera = logger.buildRecord("log", "sin peticion");

    expect(fuera.correlationId).toBeUndefined();
  });

  it("serializa mensajes que no son texto", () => {
    const record = logger.buildRecord("error", { code: "E_DB", intento: 2 });

    expect(record.message).toBe('{"code":"E_DB","intento":2}');
  });
});
