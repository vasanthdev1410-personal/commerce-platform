import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import type { PublicAuthUser } from '../users/user.types';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

interface AuthenticationResult {
  user: PublicAuthUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const publicUser = (user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'CUSTOMER' | 'ADMIN';
  accountType: 'RETAIL' | 'WHOLESALE';
}): PublicAuthUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  accountType: user.accountType,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthenticationResult> {
    const passwordHash = await this.passwords.hash(dto.password);
    const refreshToken = this.tokens.createRefreshToken();
    const refreshTokenHash = this.tokens.hashRefreshToken(refreshToken);
    const refreshExpiresAt = this.tokens.refreshExpiresAt();

    try {
      const { user, session } = await this.prisma.$transaction(
        async (transaction) => {
          const user = await this.users.createCustomer(
            {
              email: dto.email,
              passwordHash,
              firstName: dto.firstName,
              lastName: dto.lastName,
            },
            transaction,
          );
          const session = await transaction.authSession.create({
            data: {
              userId: user.id,
              refreshTokenHash,
              expiresAt: refreshExpiresAt,
            },
          });
          return { user, session };
        },
      );
      const accessToken = await this.tokens.issueAccessToken({
        sub: user.id,
        sid: session.id,
        role: user.role,
      });
      return {
        user: publicUser(user),
        accessToken,
        refreshToken,
        refreshExpiresAt,
      };
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Unable to register account');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthenticationResult> {
    const user = await this.users.findByEmail(dto.email);
    const passwordMatches = await this.passwords.verifyOrDummy(
      user?.passwordHash,
      dto.password,
    );
    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const refreshToken = this.tokens.createRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiresAt();
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });
    const accessToken = await this.tokens.issueAccessToken({
      sub: user.id,
      sid: session.id,
      role: user.role,
    });
    return {
      user: publicUser(user),
      accessToken,
      refreshToken,
      refreshExpiresAt,
    };
  }

  async refresh(rawToken: string | undefined): Promise<AuthenticationResult> {
    if (!rawToken) throw new UnauthorizedException();

    const currentHash = this.tokens.hashRefreshToken(rawToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: currentHash },
      include: { user: true },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      !session.user.isActive
    ) {
      throw new UnauthorizedException();
    }

    const refreshToken = this.tokens.createRefreshToken();
    const refreshTokenHash = this.tokens.hashRefreshToken(refreshToken);
    const refreshExpiresAt = this.tokens.refreshExpiresAt();
    const accessToken = await this.tokens.issueAccessToken({
      sub: session.user.id,
      sid: session.id,
      role: session.user.role,
    });
    const rotated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: currentHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { refreshTokenHash, expiresAt: refreshExpiresAt },
    });
    if (rotated.count !== 1) throw new UnauthorizedException();

    return {
      user: publicUser(session.user),
      accessToken,
      refreshToken,
      refreshExpiresAt,
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.authSession.updateMany({
      where: {
        refreshTokenHash: this.tokens.hashRefreshToken(rawToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
