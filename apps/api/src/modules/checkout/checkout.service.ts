import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { ShippingService } from '../fulfillment/shipping.service';
import { CouponService } from '../financial/coupon.service';
import { TaxService } from '../financial/tax.service';
import type {
  CheckoutAddressDto,
  ShippingAddressDto,
} from './dto/checkout-address.dto';
const checkoutInclude = {
  user: {
    select: { accountType: true, wholesaleStatus: true, isActive: true },
  },
  items: {
    include: {
      variant: {
        include: { inventory: true, product: true, taxProfile: true },
      },
    },
  },
} satisfies Prisma.CartInclude;
@Injectable()
export class CheckoutService {
  private readonly ttl: number;
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly shipping: ShippingService,
    private readonly coupons: CouponService,
    private readonly tax: TaxService,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('ORDER_RESERVATION_TTL_MINUTES', 15);
  }
  async preview(userId: string, dto: CheckoutAddressDto) {
    const [cart, address] = await Promise.all([
      this.loadCart(userId),
      this.address(userId, dto),
    ]);
    const calculated = this.calculate(cart);
    const coupon = await this.coupons.validate(
      userId,
      dto.couponCode,
      calculated.subtotalPaise,
    );
    const taxes = this.tax.calculate(
      calculated.items.map((i) => ({
        amountPaise: i.lineTotalPaise,
        rateBasisPoints: i.rateBasisPoints,
      })),
      coupon.discountPaise,
      address.state,
    );
    const shipping = await this.shipping.calculate(
      address.countryCode,
      address.state,
      calculated.pricingMode,
      calculated.subtotalPaise,
    );
    return {
      ...calculated,
      ...coupon,
      ...taxes,
      ...shipping,
      totalPaise: taxes.taxablePaise + taxes.taxPaise + shipping.shippingPaise,
      shippingAddress: address,
    };
  }
  async create(
    userId: string,
    key: string | undefined,
    dto: CheckoutAddressDto,
  ) {
    if (!key || key.length < 16 || key.length > 200)
      throw new BadRequestException('A valid Idempotency-Key is required');
    const existing = await this.prisma.checkoutIdempotency.findUnique({
      where: { userId_key: { userId, key } },
      select: { orderId: true },
    });
    if (existing) return this.getOrder(userId, existing.orderId);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const orderId = await this.prisma.$transaction(
          async (tx) => {
            const duplicate = await tx.checkoutIdempotency.findUnique({
              where: { userId_key: { userId, key } },
              select: { orderId: true },
            });
            if (duplicate) return duplicate.orderId;
            const cart = await tx.cart.findUnique({
              where: { userId },
              include: checkoutInclude,
            });
            if (!cart || !cart.items.length)
              throw new BadRequestException('Cart is empty');
            const address = await this.address(userId, dto, tx);
            const calculated = this.calculate(cart);
            const coupon = await this.coupons.validate(
              userId,
              dto.couponCode,
              calculated.subtotalPaise,
              tx,
              true,
            );
            const taxes = this.tax.calculate(
              calculated.items.map((i) => ({
                amountPaise: i.lineTotalPaise,
                rateBasisPoints: i.rateBasisPoints,
              })),
              coupon.discountPaise,
              address.state,
            );
            const shipping = await this.shipping.calculate(
              address.countryCode,
              address.state,
              calculated.pricingMode,
              calculated.subtotalPaise,
              tx,
            );
            const expiresAt = new Date(Date.now() + this.ttl * 60_000);
            for (const line of calculated.items) {
              const inventory = cart.items.find(
                (item) => item.variantId === line.variantId,
              )!.variant.inventory!;
              if (
                inventory.stockQuantity - inventory.reservedQuantity <
                line.quantity
              )
                throw new ConflictException(
                  'An item no longer has sufficient stock',
                );
              await tx.inventory.update({
                where: { variantId: line.variantId },
                data: { reservedQuantity: { increment: line.quantity } },
              });
            }
            const order = await tx.order.create({
              data: {
                orderNumber: this.orderNumber(),
                userId,
                status: 'PENDING',
                pricingMode: cart.pricingMode,
                subtotalPaise: calculated.subtotalPaise,
                discountPaise: coupon.discountPaise,
                taxablePaise: taxes.taxablePaise,
                taxPaise: taxes.taxPaise,
                cgstPaise: taxes.cgstPaise,
                sgstPaise: taxes.sgstPaise,
                igstPaise: taxes.igstPaise,
                couponCode: coupon.couponCode,
                shippingPaise: shipping.shippingPaise,
                totalPaise:
                  taxes.taxablePaise + taxes.taxPaise + shipping.shippingPaise,
                reservationExpiresAt: expiresAt,
                shippingFullName: address.fullName,
                shippingPhone: address.phone,
                shippingAddressLine1: address.addressLine1,
                shippingAddressLine2: address.addressLine2 ?? null,
                shippingCity: address.city,
                shippingState: taxes.buyerStateCode,
            shippingPostalCode: address.postalCode,
            shippingCountryCode: address.countryCode,
            shippingLatitude: address.latitude,
            shippingLongitude: address.longitude,
            shippingLocationProvider: address.locationProvider,
            shippingProviderPlaceId: address.providerPlaceId,
            shippingFormattedAddress: address.formattedAddress,
                items: {
                  create: calculated.items.map((line, index) => ({
                    variantId: line.variantId,
                    productName: line.productName,
                    variantName: line.variantName,
                    sku: line.sku,
                    quantity: line.quantity,
                    unitPricePaise: line.unitPricePaise,
                    totalPricePaise: line.lineTotalPaise,
                    hsnCode: line.hsnCode,
                    taxRateBasisPoints: line.rateBasisPoints,
                    taxablePaise: taxes.lines[index].taxablePaise,
                    taxPaise: taxes.lines[index].taxPaise,
                    cgstPaise: taxes.lines[index].cgstPaise,
                    sgstPaise: taxes.lines[index].sgstPaise,
                    igstPaise: taxes.lines[index].igstPaise,
                  })),
                },
                inventoryReservations: {
                  create: calculated.items.map((line) => ({
                    variantId: line.variantId,
                    quantity: line.quantity,
                    expiresAt,
                  })),
                },
              },
              select: { id: true },
            });
            if (coupon.coupon)
              await tx.couponRedemption.create({
                data: {
                  couponId: coupon.coupon.id,
                  userId,
                  orderId: order.id,
                  discountPaise: coupon.discountPaise,
                },
              });
            await tx.checkoutIdempotency.create({
              data: { userId, key, orderId: order.id },
            });
            await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
            return order.id;
          },
          { isolationLevel: 'Serializable' },
        );
        return this.getOrder(userId, orderId);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2002') &&
          attempt < 2
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException('Checkout could not be completed');
  }
  async addresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      select: {
        id: true,
        label: true,
        fullName: true,
        phone: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        countryCode: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }
  private async loadCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: checkoutInclude,
    });
    if (!cart || !cart.items.length)
      throw new BadRequestException('Cart is empty');
    return cart;
  }
  private calculate(
    cart: Prisma.CartGetPayload<{ include: typeof checkoutInclude }>,
  ) {
    let subtotalPaise = 0;
    const items = cart.items.map((item) => {
      const v = item.variant;
      if (
        !v.isActive ||
        !v.product.isActive ||
        v.product.deletedAt ||
        !v.inventory
      )
        throw new BadRequestException('A cart item is unavailable');
      if (
        v.inventory.stockQuantity - v.inventory.reservedQuantity <
        item.quantity
      )
        throw new ConflictException('An item no longer has sufficient stock');
      const unitPricePaise = this.pricing.resolveUnitPrice(
        cart.pricingMode,
        cart.user,
        v,
        item.quantity,
      );
      const lineTotalPaise = this.pricing.lineTotal(
        unitPricePaise,
        item.quantity,
      );
      subtotalPaise = this.pricing.lineTotal(1, subtotalPaise + lineTotalPaise);
      this.tax.assertActive(v.taxProfile);
      return {
        variantId: v.id,
        rateBasisPoints: v.taxProfile?.rateBasisPoints ?? 0,
        productName: v.product.name,
        variantName: v.name,
        sku: v.sku,
        hsnCode: v.hsnCode,
        attributes: v.attributes,
        quantity: item.quantity,
        unitPricePaise,
        lineTotalPaise,
      };
    });
    return {
      pricingMode: cart.pricingMode,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotalPaise,
    };
  }
  private async address(
    userId: string,
    dto: CheckoutAddressDto,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ShippingAddressDto> {
    if (dto.addressId) {
      const found = await tx.address.findFirst({
        where: { id: dto.addressId, userId },
      });
      if (!found) throw new NotFoundException('Address not found');
      return {
        fullName: found.fullName,
        phone: found.phone,
        addressLine1: found.addressLine1,
        addressLine2: found.addressLine2 ?? undefined,
        city: found.city,
        state: found.state,
        postalCode: found.postalCode,
        countryCode: found.countryCode,
        latitude: found.latitude ? Number(found.latitude) : undefined,
        longitude: found.longitude ? Number(found.longitude) : undefined,
        locationProvider: found.locationProvider ?? undefined,
        providerPlaceId: found.providerPlaceId ?? undefined,
        formattedAddress: found.formattedAddress ?? undefined,
      };
    }
    if (dto.shippingAddress) return dto.shippingAddress;
    throw new BadRequestException('Shipping address is required');
  }
  private orderNumber() {
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `ORD-${date}-${randomBytes(6).toString('hex').toUpperCase()}`;
  }
  async getOrder(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      ...order,
      userId: undefined,
      shippingAddress: {
        fullName: order.shippingFullName,
        phone: order.shippingPhone,
        addressLine1: order.shippingAddressLine1,
        addressLine2: order.shippingAddressLine2,
        city: order.shippingCity,
        state: order.shippingState,
        postalCode: order.shippingPostalCode,
        countryCode: order.shippingCountryCode,
        latitude: order.shippingLatitude,
        longitude: order.shippingLongitude,
        locationProvider: order.shippingLocationProvider,
        providerPlaceId: order.shippingProviderPlaceId,
        formattedAddress: order.shippingFormattedAddress,
      },
    };
  }
}
