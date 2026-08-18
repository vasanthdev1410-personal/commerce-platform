import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import type { InventoryQueryDto } from './dto/inventory-query.dto';
import type { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(query: InventoryQueryDto) {
    const where = query.search
      ? {
          variant: {
            OR: [
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { product: { name: { contains: query.search, mode: 'insensitive' as const } } },
            ],
          },
        }
      : {};
    const [total, data] = await this.prisma.$transaction([
      this.prisma.inventory.count({ where }),
      this.prisma.inventory.findMany({
        where,
        select: {
          variantId: true,
          stockQuantity: true,
          reservedQuantity: true,
          reorderLevel: true,
          updatedAt: true,
          variant: {
            select: {
              sku: true,
              name: true,
              isActive: true,
              product: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async update(variantId: string, dto: UpdateInventoryDto, adminUserId: string) {
    if (!(await this.prisma.inventory.findUnique({ where: { variantId }, select: { id: true } }))) {
      throw new NotFoundException('Inventory not found');
    }
    return this.prisma.$transaction(async (transaction) => {
      const inventory = await transaction.inventory.update({
        where: { variantId },
        data: {
          ...(dto.stockQuantity !== undefined && {
            stockQuantity: dto.stockQuantity,
          }),
          ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
        },
        select: {
          variantId: true,
          stockQuantity: true,
          reservedQuantity: true,
          reorderLevel: true,
          updatedAt: true,
        },
      });
      await this.audit.record(
        {
          adminUserId,
          action: 'INVENTORY_UPDATE',
          entityType: 'Inventory',
          entityId: variantId,
          metadata: { changedFields: Object.keys(dto) },
        },
        transaction,
      );
      return inventory;
    });
  }
}
