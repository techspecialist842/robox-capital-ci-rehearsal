import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { UserEntity } from "../database/entities/user.entity";

/**
 * Cubre el criterio de la Definicion de Hecho de la Fase 1: "Login + MFA
 * obligatorios para todos los roles". La prueba central es que unas credenciales
 * correctas sin segundo factor NO producen una sesion utilizable.
 */
describe("AuthService — MFA obligatorio", () => {
  const password = "contrasena-de-prueba";
  let user: UserEntity;
  let service: AuthService;
  let repo: { findOne: jest.Mock; update: jest.Mock };
  let audit: { record: jest.Mock };
  let requireMfa: boolean;

  const mfa = new MfaService({
    get: jest.fn().mockReturnValue("roboXCapital"),
  } as never);

  beforeEach(async () => {
    requireMfa = true;
    user = {
      id: "user-1",
      email: "analista@robox.capital",
      passwordHash: await bcrypt.hash(password, 10),
      mfaEnabled: false,
      mfaSecret: null,
      roles: ["analista"],
      active: true,
    } as UserEntity;

    repo = {
      findOne: jest.fn().mockImplementation(async () => user),
      update: jest.fn().mockImplementation(async (_id, patch) => {
        Object.assign(user, patch);
      }),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    service = new AuthService(
      repo as never,
      { signAsync: jest.fn().mockResolvedValue("token-firmado") } as never,
      mfa,
      {
        setSession: jest.fn().mockResolvedValue(undefined),
        revokeSession: jest.fn().mockResolvedValue(undefined),
        revokeToken: jest.fn().mockResolvedValue(undefined),
      } as never,
      audit as never,
      { get: jest.fn().mockReturnValue("15m") } as never,
      { isEnabled: jest.fn().mockImplementation(async () => requireMfa) } as never,
    );
  });

  it("rechaza credenciales incorrectas", async () => {
    await expect(
      service.login({ email: user.email, password: "incorrecta" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("sin segundo factor no emite sesion, solo token de alta", async () => {
    const result = await service.login({ email: user.email, password });

    expect(result.requiresMfaEnrollment).toBe(true);
    expect(result.accessToken).toBeUndefined();
    expect(result.enrollmentToken).toBe("token-firmado");
    expect(audit.record).toHaveBeenCalledWith(
      "auth.mfa_enrollment_required",
      user.id,
      expect.anything(),
    );
  });

  it("si el flag se desactiva, vuelve a emitir sesion directa", async () => {
    requireMfa = false;

    const result = await service.login({ email: user.email, password });

    expect(result.requiresMfaEnrollment).toBeUndefined();
    expect(result.accessToken).toBe("token-firmado");
  });

  it("con MFA ya activo pide el segundo factor y no emite sesion", async () => {
    user.mfaEnabled = true;
    user.mfaSecret = mfa.generateSecret();

    const result = await service.login({ email: user.email, password });

    expect(result.requiresMfa).toBe(true);
    expect(result.accessToken).toBeUndefined();
    expect(result.challengeUserId).toBe(user.id);
  });

  it("el alta guarda el secreto pero deja el factor inactivo", async () => {
    const enrollment = await service.startMfaEnrollment(user.id);

    expect(enrollment.otpAuthUrl).toContain("otpauth://totp/");
    expect(user.mfaSecret).toBe(enrollment.secret);
    expect(user.mfaEnabled).toBe(false);
  });

  it("la activacion rechaza un codigo incorrecto y no activa el factor", async () => {
    await service.startMfaEnrollment(user.id);

    await expect(service.activateMfa(user.id, "000000")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(user.mfaEnabled).toBe(false);
  });

  it("la activacion con un codigo valido activa el factor y emite sesion", async () => {
    const enrollment = await service.startMfaEnrollment(user.id);
    const code = mfa.generateToken(enrollment.secret);

    const result = await service.activateMfa(user.id, code);

    expect(user.mfaEnabled).toBe(true);
    expect(result.accessToken).toBe("token-firmado");
    expect(audit.record).toHaveBeenCalledWith(
      "auth.mfa_activated",
      user.id,
      expect.anything(),
    );
  });

  it("no se puede volver a dar de alta un MFA ya activo", async () => {
    user.mfaEnabled = true;

    await expect(service.startMfaEnrollment(user.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
