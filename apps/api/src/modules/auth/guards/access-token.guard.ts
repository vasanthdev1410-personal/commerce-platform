import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { TokenService } from '../token.service';
import type { AuthenticatedRequest } from '../auth.types';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      if (!payload.sub || !payload.sid) throw new Error('Invalid token payload');

      const session = await this.prisma.authSession.findUnique({
        where: { id: payload.sid },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              accountType: true,
              wholesaleStatus: true,
              isActive: true,
            },
          },
        },
      });

      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        !session.user.isActive
      ) {
        throw new Error('Invalid session');
      }

      (request as AuthenticatedRequest).user = {
        ...session.user,
        sessionId: session.id,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
