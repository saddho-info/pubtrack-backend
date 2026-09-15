import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthUser, isPublisherRole, isSuperAdmin } from '../types/auth-user';

@Injectable()
export class PublisherScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser; params: Record<string, string> }>();
    const user = request.user;
    if (!user) {
      return false;
    }
    if (isSuperAdmin(user.role)) {
      return true;
    }
    if (!isPublisherRole(user.role) || !user.publisherId) {
      throw new ForbiddenException('Publisher scope required');
    }

    const resourceId = request.params.id ?? request.params.publisherId;
    if (resourceId && resourceId !== user.publisherId) {
      throw new ForbiddenException('Cannot access another publisher');
    }
    return true;
  }
}
