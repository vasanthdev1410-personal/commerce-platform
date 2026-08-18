import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PricingMode } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PricingService } from '../pricing/pricing.service';

const cartInclude = {
  user: { select: { accountType: true, wholesaleStatus: true, isActive: true } },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          inventory: true,
          product: {
            include: {
              images: {
                select: { publicUrl: true, altText: true, isPrimary: true, position: true },
                orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }],
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;
type FullCart = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService, private readonly pricing: PricingService) {}

  async get(userId: string) { return this.toResponse(await this.getOrCreate(userId)); }

  async setPricingMode(userId: string, pricingMode: PricingMode) {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.getOrCreate(userId, tx);
      this.pricing.assertModeAllowed(pricingMode, cart.user);
      const failures: string[] = [];
      for (const item of cart.items) {
        try { this.assertCatalog(item.variant); this.pricing.resolveUnitPrice(pricingMode, cart.user, item.variant, item.quantity); }
        catch { failures.push(item.variant.product.name); }
      }
      if (failures.length) throw new BadRequestException({ message: 'Some cart items do not qualify for the requested pricing mode', items: failures });
      await tx.cart.update({ where: { id: cart.id }, data: { pricingMode } });
    });
    return this.get(userId);
  }

  async add(userId: string, variantId: string, quantity: number) {
    await this.prisma.$transaction(async (tx) => {
      const cart = await this.getOrCreate(userId, tx);
      const variant = await this.requireVariant(variantId, tx);
      const existing = cart.items.find((item) => item.variantId === variantId);
      const finalQuantity = (existing?.quantity ?? 0) + quantity;
      this.assertQuantityAvailable(variant.inventory, finalQuantity);
      this.pricing.resolveUnitPrice(cart.pricingMode, cart.user, variant, finalQuantity);
      if (existing) await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: finalQuantity } });
      else await tx.cartItem.create({ data: { cartId: cart.id, variantId, quantity: finalQuantity } });
    });
    return this.get(userId);
  }

  async update(userId: string, cartItemId: string, quantity: number) {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.cartItem.findFirst({ where: { id: cartItemId, cart: { userId } }, include: { cart: { include: { user: { select: { accountType: true, wholesaleStatus: true, isActive: true } } } }, variant: { include: { inventory: true, product: true } } } });
      if (!item) throw new NotFoundException('Cart item not found');
      this.assertCatalog(item.variant);
      this.assertQuantityAvailable(item.variant.inventory, quantity);
      this.pricing.resolveUnitPrice(item.cart.pricingMode, item.cart.user, item.variant, quantity);
      await tx.cartItem.update({ where: { id: cartItemId }, data: { quantity } });
    });
    return this.get(userId);
  }

  async remove(userId: string, cartItemId: string) {
    const result = await this.prisma.cartItem.deleteMany({ where: { id: cartItemId, cart: { userId } } });
    if (!result.count) throw new NotFoundException('Cart item not found');
    return { status: 'ok' as const };
  }

  async clear(userId: string) { await this.prisma.cartItem.deleteMany({ where: { cart: { userId } } }); return { status: 'ok' as const }; }

  private async getOrCreate(userId: string, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<FullCart> {
    await tx.cart.upsert({ where: { userId }, update: {}, create: { userId } });
    return tx.cart.findUniqueOrThrow({ where: { userId }, include: cartInclude });
  }

  private async requireVariant(id: string, tx: Prisma.TransactionClient) {
    const variant = await tx.productVariant.findFirst({ where: { id, isActive: true, product: { isActive: true, deletedAt: null } }, include: { inventory: true, product: true } });
    if (!variant || !variant.inventory) throw new NotFoundException('Product variant not found');
    return variant;
  }

  private assertCatalog(variant: { isActive: boolean; product: { isActive: boolean; deletedAt: Date | null }; inventory: unknown }): void {
    if (!variant.isActive || !variant.product.isActive || variant.product.deletedAt || !variant.inventory) throw new BadRequestException('A cart item is no longer available');
  }

  private assertQuantityAvailable(inventory: { stockQuantity: number; reservedQuantity: number } | null, quantity: number): void {
    if (!inventory || quantity > inventory.stockQuantity - inventory.reservedQuantity) throw new ConflictException('Requested quantity is not available');
  }

  private toResponse(cart: FullCart) {
    let subtotalPaise = 0;
    const items = cart.items.map((item) => {
      this.assertCatalog(item.variant);
      const unitPricePaise = this.pricing.resolveUnitPrice(cart.pricingMode, cart.user, item.variant, item.quantity);
      const lineTotalPaise = this.pricing.lineTotal(unitPricePaise, item.quantity);
      subtotalPaise = this.pricing.lineTotal(1, subtotalPaise + lineTotalPaise);
      const available = item.variant.inventory!.stockQuantity - item.variant.inventory!.reservedQuantity;
      const image = item.variant.product.images.find((candidate) => candidate.isPrimary) ?? item.variant.product.images[0];
      return { cartItemId: item.id, variantId: item.variantId, productId: item.variant.productId, productSlug: item.variant.product.slug, productName: item.variant.product.name, variantName: item.variant.name, attributes: item.variant.attributes, image: image ? { url: image.publicUrl, altText: image.altText } : null, quantity: item.quantity, unitPricePaise, lineTotalPaise, stockStatus: available <= 0 ? 'OUT_OF_STOCK' : available <= item.variant.inventory!.reorderLevel ? 'LOW_STOCK' : 'IN_STOCK', isAvailable: item.quantity <= available };
    });
    return { id: cart.id, pricingMode: cart.pricingMode, items, itemCount: items.reduce((sum, item) => sum + item.quantity, 0), subtotalPaise };
  }
}
