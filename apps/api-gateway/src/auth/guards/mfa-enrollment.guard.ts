import { ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthenticatedUser } from "../jwt-payload.interface";

/**
 * Contrapartida de JwtAuthGuard: protege unicamente los endpoints de alta de MFA
 * y solo acepta tokens con scope "mfa_enrollment". Una sesion ya completa no
 * necesita pasar por aqui y se rechaza para que el alta no pueda repetirse desde
 * una sesion valida.
 */
@Injectable()
export class MfaEnrollmentGuard extends AuthGuard("jwt") {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const authenticated = super.handleRequest(err, user, info, context, status) as TUser;

    if ((authenticated as AuthenticatedUser)?.scope !== "mfa_enrollment") {
      throw new ForbiddenException("Se requiere un token de alta de MFA");
    }

    return authenticated;
  }
}
