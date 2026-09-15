import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AuthUser,
  isLibraryRole,
  isPublisherRole,
  isSuperAdmin,
} from '../types/auth-user';

@Injectable()
export class LibraryScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthUser; params: Record<string, string> }>();
    const user = request.user;
    if (!user) {
      return false;
    }
    if (isSuperAdmin(user.role) || isPublisherRole(user.role)) {
      return true;
    }
    if (!isLibraryRole(user.role) || !user.libraryId) {
      throw new ForbiddenException('Library scope required');
    }

    const resourceId = request.params.id ?? request.params.libraryId;
    if (resourceId && resourceId !== user.libraryId) {
      throw new ForbiddenException('Cannot access another library');
    }
    return true;
  }
}
