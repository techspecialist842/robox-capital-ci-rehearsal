export interface JwtPayload {
  sub: string; // user id
  email: string;
  roles: string[];
  sid: string; // session id (para revocacion via Redis)
  jti: string; // token id (para blocklist de revocacion)
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  roles: string[];
  sessionId: string;
  tokenId: string;
}
