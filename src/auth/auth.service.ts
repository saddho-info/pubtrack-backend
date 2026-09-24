import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RefreshSession, User } from '../../generated/prisma/client';
import { hashRefreshToken, verifyPassword } from '../common/utils/password';
import { toPublicUser } from '../common/utils/public-user';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokensDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types/jwt-payload';

const REFRESH_COOKIE_NAME = 'refresh_token';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  get refreshCookieName(): string {
    return REFRESH_COOKIE_NAME;
  }

  get accessExpiresInSeconds(): number {
    return this.config.get<number>('JWT_ACCESS_EXPIRES_SECONDS') ?? 900;
  }

  get refreshExpiresInSeconds(): number {
    return this.config.get<number>('JWT_REFRESH_EXPIRES_SECONDS') ?? 604800;
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordOk = await verifyPassword(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthTokensDto> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.revokedAt) {
      if (session.replacedById) {
        await this.revokeSessionChain(session.id);
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.rotateSession(user, session);
  }

  async logoutSession(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<void> {
    if (refreshToken) {
      await this.logoutWithRefreshToken(refreshToken);
      return;
    }

    if (!accessToken) {
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(accessToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.sid) {
        await this.revokeSession(payload.sid);
      }
    } catch {
      return;
    }
  }

  async logoutWithRefreshToken(
    refreshToken: string | undefined,
  ): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });
    if (!session || session.revokedAt) {
      return;
    }
    await this.revokeSession(session.id);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return toPublicUser(user);
  }

  private async issueTokens(user: User): Promise<AuthTokensDto> {
    const sessionId = randomUUID();
    const tokens = await this.signTokenPair(user, sessionId);

    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: hashRefreshToken(tokens.refreshToken),
        expiresAt: this.refreshExpiresAt(),
      },
    });

    return tokens;
  }

  private async rotateSession(
    user: User,
    current: RefreshSession,
  ): Promise<AuthTokensDto> {
    const sessionId = randomUUID();
    const tokens = await this.signTokenPair(user, sessionId);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.refreshSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: hashRefreshToken(tokens.refreshToken),
          expiresAt: this.refreshExpiresAt(),
        },
      }),
      this.prisma.refreshSession.update({
        where: { id: current.id },
        data: { revokedAt: now, replacedById: sessionId },
      }),
    ]);

    return tokens;
  }

  private async signTokenPair(
    user: User,
    sessionId: string,
  ): Promise<AuthTokensDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      publisherId: user.publisherId,
      libraryId: user.libraryId,
      sid: sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessExpiresInSeconds,
      }),
      this.jwt.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.refreshExpiresInSeconds,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessExpiresInSeconds,
      tokenType: 'Bearer',
      user: toPublicUser(user),
    };
  }

  private refreshExpiresAt(): Date {
    return new Date(Date.now() + this.refreshExpiresInSeconds * 1000);
  }

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeSessionChain(sessionId: string): Promise<void> {
    const now = new Date();
    let currentId: string | null = sessionId;

    while (currentId) {
      const current = await this.prisma.refreshSession.findUnique({
        where: { id: currentId },
      });
      if (!current) {
        return;
      }
      if (!current.revokedAt) {
        await this.prisma.refreshSession.update({
          where: { id: current.id },
          data: { revokedAt: now },
        });
      }
      currentId = current.replacedById;
    }
  }
}
