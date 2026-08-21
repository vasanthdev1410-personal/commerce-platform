import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PricingMode } from '../../generated/prisma/client';
import { normalizeSubdivision } from '../../common/utils/india-state.util';
import { PrismaService } from '../../database/prisma.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import type { ShippingRuleDto, UpdateShippingRuleDto } from './dto/fulfillment.dto';

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async calculate(
    countryCode: string,
    state: string,
    pricingMode: PricingMode,
    subtotalPaise: number,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const country = countryCode.toUpperCase();
    const stateCode = normalizeSubdivision(country, state);
    if (!stateCode) {
      throw new BadRequestException('A valid shipping state is required');
    }
    const rules = await tx.shippingRule.findMany({
      where: {
        countryCode: country,
        isActive: true,
        minSubtotalPaise: { lte: subtotalPaise },
        OR: [{ pricingMode: null }, { pricingMode }],
        AND: [
          { OR: [{ maxSubtotalPaise: null }, { maxSubtotalPaise: { gte: subtotalPaise } }] },
          { OR: [{ stateCode: null }, { stateCode }] },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { minSubtotalPaise: 'desc' },
        { createdAt: 'asc' },
      ],
    });
    rules.sort((left, right) => {
      const specificity = Number(right.stateCode === stateCode) - Number(left.stateCode === stateCode);
      if (specificity !== 0) return specificity;
      if (right.priority !== left.priority) return right.priority - left.priority;
      if (right.minSubtotalPaise !== left.minSubtotalPaise) {
        return right.minSubtotalPaise - left.minSubtotalPaise;
      }
      return left.createdAt.getTime() - right.createdAt.getTime();
    });
    const rule = rules[0];
    if (!rule) {
      throw new BadRequestException('No shipping rule is available for this order');
    }
    return {
      shippingPaise: rule.shippingPaise,
      matchedRule: { id: rule.id, name: rule.name, stateCode: rule.stateCode },
    };
  }

  list() {
    return this.prisma.shippingRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(adminId: string, dto: ShippingRuleDto) {
    this.range(dto.minSubtotalPaise, dto.maxSubtotalPaise);
    const countryCode = dto.countryCode.toUpperCase();
    const stateCode = this.normalizedState(countryCode, dto.stateCode);
    const row = await this.prisma.shippingRule.create({
      data: { ...dto, countryCode, stateCode },
    });
    await this.audit.record({
      adminUserId: adminId,
      action: 'SHIPPING_RULE_CREATE',
      entityType: 'ShippingRule',
      entityId: row.id,
      metadata: { name: row.name, shippingPaise: row.shippingPaise, stateCode },
    });
    return row;
  }

  async update(adminId: string, id: string, dto: UpdateShippingRuleDto) {
    const old = await this.prisma.shippingRule.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('Shipping rule not found');
    this.range(
      dto.minSubtotalPaise ?? old.minSubtotalPaise,
      dto.maxSubtotalPaise === undefined ? old.maxSubtotalPaise : dto.maxSubtotalPaise,
    );
    const countryCode = (dto.countryCode ?? old.countryCode).toUpperCase();
    const stateCode =
      dto.stateCode === undefined
        ? old.stateCode
        : this.normalizedState(countryCode, dto.stateCode);
    const row = await this.prisma.shippingRule.update({
      where: { id },
      data: { ...dto, countryCode, stateCode },
    });
    await this.audit.record({
      adminUserId: adminId,
      action: 'SHIPPING_RULE_UPDATE',
      entityType: 'ShippingRule',
      entityId: id,
      metadata: { isActive: row.isActive, shippingPaise: row.shippingPaise, stateCode },
    });
    return row;
  }

  deactivate(adminId: string, id: string) {
    return this.update(adminId, id, { isActive: false });
  }

  private normalizedState(countryCode: string, value: string | null | undefined): string | null {
    if (value === null) return null;
    if (!value) return null;
    const normalized = normalizeSubdivision(countryCode, value);
    if (!normalized) throw new BadRequestException('Shipping state is invalid');
    return normalized;
  }

  private range(min: number, max: number | null | undefined): void {
    if (max != null && max < min) {
      throw new BadRequestException(
        'Maximum subtotal must not be less than minimum subtotal',
      );
    }
  }
}
