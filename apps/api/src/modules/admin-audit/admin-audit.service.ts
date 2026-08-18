import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(
    data: {
      adminUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Prisma.InputJsonValue;
    },
    transaction: Prisma.TransactionClient = this.prisma,
  ) {
    return transaction.adminAuditLog.create({
      data: {
        adminUserId: data.adminUserId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: data.metadata,
      },
      select: { id: true },
    });
  }
}
