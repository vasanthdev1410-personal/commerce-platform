import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { SafeUser } from '../users/user.types';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import type { AuthenticatedUser } from './auth.types';

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
}

const REFRESH_COOKIE = 'commerce_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get('NODE_ENV') === 'production';
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(dto);
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto);
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(request.cookies[REFRESH_COOKIE]);
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.cookies[REFRESH_COOKIE]);
    this.clearRefreshCookie(response);
    return { status: 'ok' as const };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(user.id);
    this.clearRefreshCookie(response);
    return { status: 'ok' as const };
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentUser() user: AuthenticatedUser): Omit<SafeUser, 'isActive'> {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      accountType: user.accountType,
      wholesaleStatus: user.wholesaleStatus,
    };
  }

  private setRefreshCookie(
    response: Response,
    token: string,
    expires: Date,
  ): void {
    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
    });
  }
}
