import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { normalizeEmail } from './email.util';
import type { SafeUser } from './user.types';

const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  accountType: true,
  wholesaleStatus: true,
  isActive: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { ...safeUserSelect, passwordHash: true },
    });
  }

  findById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: safeUserSelect });
  }

  createCustomer(
    data: {
      email: string;
      passwordHash: string;
      firstName: string;
      lastName: string;
    },
    transaction: Prisma.TransactionClient,
  ) {
    return transaction.user.create({
      data: {
        email: normalizeEmail(data.email),
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'CUSTOMER',
        accountType: 'RETAIL',
        wholesaleStatus: 'NOT_REQUESTED',
        isActive: true,
      },
      select: safeUserSelect,
    });
  }
}
