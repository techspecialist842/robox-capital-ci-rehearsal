import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";

/**
 * Marca un endpoint con los roles autorizados; RolesGuard lo lee via Reflector.
 * RBAC se aplica siempre del lado del servidor (nunca confiando en el cliente).
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
