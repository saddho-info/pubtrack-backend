import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '../../generated/prisma/client';
import {
  hashRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../common/utils/password';
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

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matches = verifyRefreshToken(refreshToken, user.refreshTokenHash);
    if (!matches) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  async logoutSession(
    accessToken?: string,
    refreshToken?: string,
  ): Promise<void> {
    if (accessToken) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload>(accessToken, {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
        await this.logout(payload.sub);
        return;
      } catch {
        // Access may already be expired; fall through to refresh token.
      }
    }
    await this.logoutWithRefreshToken(refreshToken);
  }

  async logoutWithRefreshToken(
    refreshToken: string | undefined,
  ): Promise<void> {
    if (!refreshToken) {
      return;
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      await this.prisma.user.updateMany({
        where: { id: payload.sub },
        data: { refreshTokenHash: null },
      });
    } catch {
      return;
    }
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
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      publisherId: user.publisherId,
      libraryId: user.libraryId,
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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashRefreshToken(refreshToken) },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessExpiresInSeconds,
      tokenType: 'Bearer',
      user: toPublicUser(user),
    };
  }
}
