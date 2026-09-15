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
  refreshTokenHash: 'hashed:refresh-old',
  publisherId: null,
  libraryId: null,
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
    prisma.user.update.mockResolvedValue(user);

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

  it('logs in with valid credentials and rotates the refresh hash', async () => {
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await service.login({
      email: 'leo.a@example.org',
      password: 'secret',
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toMatch(/^refresh-token-/);
    expect(result.user.email).toBe('leo.a@example.org');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { refreshTokenHash: `hashed:${result.refreshToken}` },
    });
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

  it('rotates refresh tokens when the presented token matches', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      refreshTokenHash: 'hashed:refresh-old',
    });
    jwt.verifyAsync.mockResolvedValue({ sub: 'user_1' });

    const result = await service.refresh('refresh-old');
    expect(result.refreshToken).toMatch(/^refresh-token-/);
  });

  it('revokes the stored hash when a reused refresh token is presented', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...user,
      refreshTokenHash: 'hashed:other-token',
    });
    jwt.verifyAsync.mockResolvedValue({ sub: 'user_1' });

    await expect(service.refresh('refresh-old')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { refreshTokenHash: null },
    });
  });

  it('clears the refresh hash on logout', async () => {
    await service.logout('user_1');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { refreshTokenHash: null },
    });
  });
});
