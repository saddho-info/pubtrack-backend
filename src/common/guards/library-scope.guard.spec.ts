import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../testing/auth-user.fixture';
import { LibraryScopeGuard } from './library-scope.guard';

function contextWith(
  user: unknown,
  params: Record<string, string> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  } as unknown as ExecutionContext;
}

describe('LibraryScopeGuard', () => {
  const guard = new LibraryScopeGuard();

  it('denies unauthenticated requests', () => {
    expect(guard.canActivate(contextWith(undefined))).toBe(false);
  });

  it('allows super admins and publisher roles', () => {
    expect(guard.canActivate(contextWith(superAdminUser))).toBe(true);
    expect(guard.canActivate(contextWith(publisherAdminUser('pub_1')))).toBe(
      true,
    );
  });

  it('allows a library user accessing its own resource', () => {
    expect(
      guard.canActivate(
        contextWith(libraryAdminUser('lib_1'), { libraryId: 'lib_1' }),
      ),
    ).toBe(true);
  });

  it('rejects cross-library access', () => {
    expect(() =>
      guard.canActivate(
        contextWith(libraryAdminUser('lib_1'), { id: 'lib_2' }),
      ),
    ).toThrow(ForbiddenException);
  });
});
