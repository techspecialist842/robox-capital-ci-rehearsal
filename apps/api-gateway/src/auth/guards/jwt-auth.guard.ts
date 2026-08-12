import { ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthenticatedUser } from "../jwt-payload.interface";
import { CorrelationStore } from "../../common/logging/correlation.store";

/**
 * Guarda estandar de la plataforma. Ademas de validar el token, rechaza los
 * tokens de enrolamiento de MFA: si no lo hiciera, un usuario sin segundo factor
 * podria usar ese token para llegar a recursos de negocio y el MFA obligatorio
 * seria evitable.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const authenticated = super.handleRequest(err, user, info, context, status) as TUser;
    const candidate = authenticated as AuthenticatedUser;

    if (candidate?.scope === "mfa_enrollment") {
      throw new ForbiddenException("Complete el alta de MFA antes de continuar");
    }

    if (candidate?.userId) {
      // Enlaza los logs de la peticion con el usuario ya resuelto.
      CorrelationStore.setUserId(candidate.userId);
    }

    return authenticated;
  }
}
