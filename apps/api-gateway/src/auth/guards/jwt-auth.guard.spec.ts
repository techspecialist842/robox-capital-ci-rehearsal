import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { AuthenticatedUser } from "../jwt-payload.interface";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { MfaEnrollmentGuard } from "./mfa-enrollment.guard";
import { CorrelationStore } from "../../common/logging/correlation.store";

/**
 * Estas dos guardas son la frontera que hace obligatorio el MFA. Si JwtAuthGuard
 * dejara pasar un token de enrolamiento, el segundo factor seria evitable y las
 * pruebas de AuthService seguirian en verde igualmente: el fallo solo se ve aqui.
 */
const context = {} as ExecutionContext;

const userWith = (scope: string): AuthenticatedUser => ({
  userId: "user-1",
  email: "analista@robox.capital",
  roles: ["analista"],
  sessionId: "s-1",
  tokenId: "t-1",
  scope: scope as AuthenticatedUser["scope"],
});

describe("JwtAuthGuard", () => {
  const guard = new JwtAuthGuard();

  it("acepta un token de sesion normal", () => {
    const user = userWith("session");

    expect(guard.handleRequest(null, user, null, context)).toBe(user);
  });

  it("RECHAZA un token de enrolamiento de MFA", () => {
    expect(() => guard.handleRequest(null, userWith("mfa_enrollment"), null, context)).toThrow(
      ForbiddenException,
    );
  });

  it("propaga el fallo de autenticacion cuando no hay usuario", () => {
    expect(() => guard.handleRequest(null, false, null, context)).toThrow(
      UnauthorizedException,
    );
  });

  it("propaga el error original si passport reporta uno", () => {
    const error = new UnauthorizedException("token caducado");

    expect(() => guard.handleRequest(error, false, null, context)).toThrow("token caducado");
  });

  it("enlaza el usuario al contexto de correlacion para los logs", () => {
    const capturado = CorrelationStore.run({ correlationId: "c-1" }, () => {
      guard.handleRequest(null, userWith("session"), null, context);
      return CorrelationStore.get();
    });

    expect(capturado?.userId).toBe("user-1");
  });
});

describe("MfaEnrollmentGuard", () => {
  const guard = new MfaEnrollmentGuard();

  it("acepta un token de enrolamiento", () => {
    const user = userWith("mfa_enrollment");

    expect(guard.handleRequest(null, user, null, context)).toBe(user);
  });

  it("RECHAZA una sesion ya completa: el alta no se repite desde una sesion valida", () => {
    expect(() => guard.handleRequest(null, userWith("session"), null, context)).toThrow(
      ForbiddenException,
    );
  });

  it("las dos guardas son mutuamente excluyentes", () => {
    const sesion = userWith("session");
    const alta = userWith("mfa_enrollment");
    const jwt = new JwtAuthGuard();

    expect(jwt.handleRequest(null, sesion, null, context)).toBe(sesion);
    expect(() => guard.handleRequest(null, sesion, null, context)).toThrow();

    expect(guard.handleRequest(null, alta, null, context)).toBe(alta);
    expect(() => jwt.handleRequest(null, alta, null, context)).toThrow();
  });
});
