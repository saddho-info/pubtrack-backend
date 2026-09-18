import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import {
  libraryAdminUser,
  publisherAdminUser,
  superAdminUser,
} from '../testing/auth-user.fixture';
import { PublisherScopeGuard } from './publisher-scope.guard';

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

describe('PublisherScopeGuard', () => {
  const guard = new PublisherScopeGuard();

  it('denies unauthenticated requests', () => {
    expect(guard.canActivate(contextWith(undefined))).toBe(false);
  });

  it('allows super admins', () => {
    expect(guard.canActivate(contextWith(superAdminUser, { id: 'any' }))).toBe(
      true,
    );
  });

  it('allows a publisher accessing its own resource', () => {
    expect(
      guard.canActivate(
        contextWith(publisherAdminUser('pub_1'), { id: 'pub_1' }),
      ),
    ).toBe(true);
  });

  it('rejects cross-publisher access', () => {
    expect(() =>
      guard.canActivate(
        contextWith(publisherAdminUser('pub_1'), { publisherId: 'pub_2' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects library users', () => {
    expect(() =>
      guard.canActivate(contextWith(libraryAdminUser('lib_1'))),
    ).toThrow(ForbiddenException);
  });
});
