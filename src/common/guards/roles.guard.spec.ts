import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../generated/prisma/client';
import {
  publisherAdminUser,
  superAdminUser,
} from '../testing/auth-user.fixture';
import { RolesGuard } from './roles.guard';

function contextWithUser(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows public routes', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(true);
  });

  it('allows authenticated users when no roles are declared', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined);
    expect(guard.canActivate(contextWithUser(superAdminUser))).toBe(true);
  });

  it('allows a matching role and rejects others', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([Role.SUPER_ADMIN]);
    expect(guard.canActivate(contextWithUser(superAdminUser))).toBe(true);

    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([Role.SUPER_ADMIN]);
    expect(
      guard.canActivate(contextWithUser(publisherAdminUser('pub_1'))),
    ).toBe(false);
  });
});
