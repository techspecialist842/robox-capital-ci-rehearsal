import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticatedUser } from "../jwt-payload.interface";
import { RolesGuard } from "./roles.guard";

/**
 * Cubre el criterio de Puerta 1 "RBAC verificado del lado del servidor en cada
 * solicitud". Hasta ahora esa afirmacion descansaba en pruebas del servicio de
 * autenticacion, no en la guarda que realmente aplica la autorizacion.
 */
describe("RolesGuard", () => {
  const contextWith = (user?: Partial<AuthenticatedUser>): ExecutionContext =>
    ({
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const guardRequiring = (roles: string[] | undefined): RolesGuard => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it("permite el paso cuando el endpoint no exige rol", () => {
    expect(guardRequiring(undefined).canActivate(contextWith({ roles: [] }))).toBe(true);
  });

  it("permite el paso cuando la lista de roles exigidos esta vacia", () => {
    expect(guardRequiring([]).canActivate(contextWith({ roles: [] }))).toBe(true);
  });

  it("permite el paso si el usuario tiene el rol exigido", () => {
    const guard = guardRequiring(["admin"]);

    expect(guard.canActivate(contextWith({ roles: ["admin"] }))).toBe(true);
  });

  it("basta con uno de los roles exigidos", () => {
    const guard = guardRequiring(["admin", "riesgo"]);

    expect(guard.canActivate(contextWith({ roles: ["riesgo"] }))).toBe(true);
  });

  it("RECHAZA si el usuario no tiene ninguno de los roles exigidos", () => {
    const guard = guardRequiring(["admin"]);

    expect(guard.canActivate(contextWith({ roles: ["analista"] }))).toBe(false);
  });

  it("RECHAZA si el usuario no tiene ningun rol", () => {
    const guard = guardRequiring(["admin"]);

    expect(guard.canActivate(contextWith({ roles: [] }))).toBe(false);
  });

  it("RECHAZA si no hay usuario en la peticion", () => {
    const guard = guardRequiring(["admin"]);

    expect(guard.canActivate(contextWith(undefined))).toBe(false);
  });

  it("distingue mayusculas: 'Admin' no concede el rol 'admin'", () => {
    const guard = guardRequiring(["admin"]);

    expect(guard.canActivate(contextWith({ roles: ["Admin"] }))).toBe(false);
  });

  it("un rol que solo contiene el exigido como subcadena no basta", () => {
    const guard = guardRequiring(["admin"]);

    expect(guard.canActivate(contextWith({ roles: ["administrador-de-lectura"] }))).toBe(
      false,
    );
  });
});
