/**
 * Un token con scope "mfa_enrollment" solo sirve para completar el alta de MFA.
 * Se emite cuando las credenciales son correctas pero el usuario aun no tiene
 * segundo factor, y no da acceso a ningun recurso de negocio.
 */
export type TokenScope = "session" | "mfa_enrollment";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  roles: string[];
  sid: string; // session id (para revocacion via Redis)
  jti: string; // token id (para blocklist de revocacion)
  scope: TokenScope;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  roles: string[];
  sessionId: string;
  tokenId: string;
  scope: TokenScope;
}
