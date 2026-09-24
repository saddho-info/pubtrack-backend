import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('../common/utils/password', () => ({
  hashRefreshToken: jest.fn((token: string) => `hashed:${token}`),
  verifyPassword: jest.fn(
    async (plain: string, hash: string) => hash === `pw:${plain}`,
  ),
  verifyRefreshToken: jest.fn(
    (token: string, hash: string) => hash === `hashed:${token}`,
  ),
}));

const user = {
  id: 'user_1',
  email: 'leo.a@example.org',
  passwordHash: 'pw:secret',
  firstName: 'Super',
  lastName: 'Admin',
  role: Role.SUPER_ADMIN,
  isActive: true,
  refreshTokenHash: null,
  publisherId: null,
  libraryId: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const activeSession = {
  id: 'session_old',
  userId: 'user_1',
  tokenHash: 'hashed:refresh-old',
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  replacedById: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwt = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_EXPIRES_SECONDS') return 900;
      if (key === 'JWT_REFRESH_EXPIRES_SECONDS') return 604800;
      return undefined;
    }),
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      throw new Error(key);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jwt.signAsync.mockImplementation(async (payload: { jti?: string }) =>
      payload.jti ? `refresh-token-${payload.jti}` : 'access-token',
    );
    prisma.refreshSession.create.mockImplementation(async (args: { data: { id: string } }) => ({
      ...activeSession,
      id: args.data.id,
    }));
    prisma.refreshSession.update.mockResolvedValue(activeSession);
    prisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('logs in with valid credentials and creates a refresh session', async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await service.login({
      email: 'leo.a@example.org',
      password: 'secret',
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toMatch(/^refresh-token-/);
    expect(result.user.email).toBe('leo.a@example.org');
    expect(prisma.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        tokenHash: `hashed:${result.refreshToken}`,
      }),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects unknown or wrong passwords with the same message', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.login({ email: 'nobody@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    prisma.user.findUnique.mockResolvedValue(user);
    await expect(
      service.login({ email: 'leo.a@example.org', password: 'nope' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects inactive accounts', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    await expect(
      service.login({ email: 'leo.a@example.org', password: 'secret' }),
    ).rejects.toThrow('Account is disabled');
  });

  it('rotates only the presented refresh session', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue(activeSession);
    prisma.user.findUnique.mockResolvedValue(user);
    jwt.verifyAsync.mockResolvedValue({ sub: 'user_1' });

    const result = await service.refresh('refresh-old');
    expect(result.refreshToken).toMatch(/^refresh-token-/);
    expect(prisma.refreshSession.update).toHaveBeenCalledWith({
      where: { id: 'session_old' },
      data: expect.objectContaining({
        revokedAt: expect.any(Date),
        replacedById: expect.any(String),
      }),
    });
    expect(prisma.refreshSession.updateMany).not.toHaveBeenCalled();
  });

  it('revokes only the rotated chain when a reused refresh token is presented', async () => {
    const rotated = {
      ...activeSession,
      revokedAt: new Date('2026-01-02'),
      replacedById: 'session_new',
    };
    const replacement = {
      ...activeSession,
      id: 'session_new',
      tokenHash: 'hashed:refresh-new',
      revokedAt: null,
      replacedById: null,
    };

    prisma.refreshSession.findUnique.mockImplementation(
      async (args: { where: { tokenHash?: string; id?: string } }) => {
        if (
          args.where.tokenHash === 'hashed:refresh-old' ||
          args.where.id === 'session_old'
        ) {
          return rotated;
        }
        if (args.where.id === 'session_new') {
          return replacement;
        }
        return null;
      },
    );
    jwt.verifyAsync.mockResolvedValue({ sub: 'user_1' });

    await expect(service.refresh('refresh-old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshSession.update).toHaveBeenCalledWith({
      where: { id: 'session_new' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('revokes only the presented session on logout', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue(activeSession);

    await service.logoutSession(undefined, 'refresh-old');

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session_old', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('leaves a second session untouched when logging out another', async () => {
    prisma.refreshSession.findUnique.mockResolvedValue(activeSession);

    await service.logoutSession(undefined, 'refresh-old');

    expect(prisma.refreshSession.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session_old', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
