import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAuthGuard but never throws — sets req.user to null when
 * the Authorization header is missing or the token is invalid.
 * Use on public routes that need optional user context (e.g. showing
 * a seller their own draft listing).
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // Do not throw — return null when unauthenticated
    return user || null;
  }
}
