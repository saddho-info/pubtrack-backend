import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { AuthService } from './auth.service';
import { AuthTokensDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOkResponse({ type: AuthTokensDto, description: 'Authenticated session' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensDto> {
    const tokens = await this.authService.login(dto);
    this.setRefreshCookie(response, tokens.refreshToken);
    return tokens;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOkResponse({ type: AuthTokensDto, description: 'Rotated tokens' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensDto> {
    const refreshToken = this.readRefreshToken(request, dto.refreshToken);
    const tokens = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(response, tokens.refreshToken);
    return tokens;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOkResponse({ description: 'Refresh token revoked' })
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;

    await this.authService.logoutSession(
      bearer,
      this.readRefreshToken(request, dto.refreshToken),
    );
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ description: 'Current authenticated user' })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.id);
  }

  private readRefreshToken(
    request: Request,
    bodyToken?: string,
  ): string | undefined {
    if (bodyToken) {
      return bodyToken;
    }
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[this.authService.refreshCookieName];
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    const isProd = process.env.NODE_ENV === 'production';
    response.cookie(this.authService.refreshCookieName, refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: this.authService.refreshExpiresInSeconds * 1000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    const isProd = process.env.NODE_ENV === 'production';
    response.clearCookie(this.authService.refreshCookieName, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/v1/auth',
    });
  }
}
