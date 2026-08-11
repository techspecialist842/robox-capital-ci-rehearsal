import { ConfigService } from "@nestjs/config";
import { MfaService } from "./mfa.service";
import { authenticator } from "otplib";

describe("MfaService", () => {
  const service = new MfaService(new ConfigService({}));

  it("genera un secreto y valida un codigo TOTP correcto", () => {
    const secret = service.generateSecret();
    const validCode = authenticator.generate(secret);

    expect(service.verifyToken(validCode, secret)).toBe(true);
  });

  it("rechaza un codigo TOTP incorrecto", () => {
    const secret = service.generateSecret();
    expect(service.verifyToken("000000", secret)).toBe(false);
  });

  it("arma una URL otpauth:// valida para el enrolamiento de MFA", () => {
    const secret = service.generateSecret();
    const url = service.buildOtpAuthUrl("analista@robox.capital", secret);
    expect(url).toContain("otpauth://totp/");
    expect(url).toContain("roboXCapital");
  });
});
