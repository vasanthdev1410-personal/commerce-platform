import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '../../generated/prisma/enums';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: UserRole;
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly accessTtlSeconds: number;
  readonly refreshTtlDays: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.accessTtlSeconds = Number(config.get('JWT_ACCESS_TTL_SECONDS', 900));
    this.refreshTtlDays = Number(config.get('REFRESH_TOKEN_TTL_DAYS', 30));
  }

  issueAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtlSeconds,
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.accessSecret,
    });
  }

  createRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshExpiresAt(): Date {
    return new Date(Date.now() + this.refreshTtlDays * 86_400_000);
  }
}
