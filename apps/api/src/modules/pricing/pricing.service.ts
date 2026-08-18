import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AccountType, PricingMode, WholesaleStatus } from '../../generated/prisma/enums';

interface PricingUser { accountType: AccountType; wholesaleStatus: WholesaleStatus; isActive: boolean }
interface PriceableVariant { retailPricePaise: number; wholesalePricePaise: number | null; wholesaleMinQty: number }

@Injectable()
export class PricingService {
  assertModeAllowed(mode: PricingMode, user: PricingUser): void {
    if (mode === 'WHOLESALE' && (!user.isActive || user.accountType !== 'WHOLESALE' || user.wholesaleStatus !== 'APPROVED')) {
      throw new ForbiddenException('Wholesale pricing requires an approved wholesale account');
    }
  }

  resolveUnitPrice(mode: PricingMode, user: PricingUser, variant: PriceableVariant, quantity: number): number {
    this.assertModeAllowed(mode, user);
    if (mode === 'RETAIL') return variant.retailPricePaise;
    if (variant.wholesalePricePaise === null) throw new BadRequestException('This item is not available for wholesale pricing');
    if (quantity < variant.wholesaleMinQty) throw new BadRequestException(`Minimum wholesale quantity is ${variant.wholesaleMinQty}`);
    return variant.wholesalePricePaise;
  }

  lineTotal(unitPricePaise: number, quantity: number): number {
    const total = unitPricePaise * quantity;
    if (!Number.isSafeInteger(total)) throw new BadRequestException('Cart amount is too large');
    return total;
  }
}
