import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type OrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RazorpayService } from '../payments/razorpay.service';
import type {
  AdminOrderQueryDto,
  AdminPaymentQueryDto,
  RefundPaymentDto,
} from './dto/admin-order.dto';

const paymentSafe = {
  id: true,
  provider: true,
  providerOrderId: true,
  providerPaymentId: true,
  status: true,
  amountPaise: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;
const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly audit: AdminAuditService,
  ) {}
  async orders(q: AdminOrderQueryDto) {
    const where: Prisma.OrderWhereInput = {
      status: q.status,
      pricingMode: q.pricingMode,
      ...(q.paymentStatus && {
        payments: { some: { status: q.paymentStatus } },
      }),
      ...(q.search && {
        OR: [
          { orderNumber: { contains: q.search, mode: 'insensitive' } },
          { user: { email: { contains: q.search, mode: 'insensitive' } } },
          { user: { phone: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
      ...((q.dateFrom || q.dateTo) && {
        createdAt: {
          gte: q.dateFrom ? new Date(q.dateFrom) : undefined,
          lte: q.dateTo ? new Date(q.dateTo) : undefined,
        },
      }),
    };
    const select = {
      id: true,
      orderNumber: true,
      status: true,
      pricingMode: true,
      totalPaise: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
        },
      },
      payments: { select: paymentSafe },
    } satisfies Prisma.OrderSelect;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        select,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async order(id: string) {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            accountType: true,
          },
        },
        items: true,
        payments: {
          select: {
            ...paymentSafe,
            refunds: {
              select: {
                id: true,
                providerRefundId: true,
                amountPaise: true,
                reason: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        inventoryReservations: {
          select: {
            id: true,
            variantId: true,
            quantity: true,
            expiresAt: true,
            releasedAt: true,
          },
        },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException('Order not found');
    const {
      shippingFullName,
      shippingPhone,
      shippingAddressLine1,
      shippingAddressLine2,
      shippingCity,
      shippingState,
      shippingPostalCode,
      shippingCountryCode,
      ...safe
    } = row;
    return {
      ...safe,
      shippingSnapshot: {
        fullName: shippingFullName,
        phone: shippingPhone,
        addressLine1: shippingAddressLine1,
        addressLine2: shippingAddressLine2,
        city: shippingCity,
        state: shippingState,
        postalCode: shippingPostalCode,
        countryCode: shippingCountryCode,
      },
    };
  }
  async changeStatus(adminId: string, id: string, next: OrderStatus) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id },
          include: {
            payments: true,
            inventoryReservations: { where: { releasedAt: null } },
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (!transitions[order.status].includes(next))
          throw new ConflictException('Invalid order status transition');
        const paid = order.payments.some((p) =>
          ['PAID', 'PARTIALLY_REFUNDED'].includes(p.status),
        );
        if (next === 'CONFIRMED' && !paid)
          throw new ConflictException('Unpaid order cannot be confirmed');
        if (next === 'CANCELLED' && paid)
          throw new ConflictException(
            'Paid orders must use the refund workflow',
          );
        if (next === 'CANCELLED')
          for (const reservation of order.inventoryReservations) {
            await tx.$executeRaw`UPDATE "Inventory" SET "reservedQuantity"=GREATEST(0,"reservedQuantity"-${reservation.quantity}) WHERE "variantId"=${reservation.variantId}::uuid`;
            await tx.inventoryReservation.update({
              where: { id: reservation.id },
              data: { releasedAt: new Date() },
            });
          }
        const updated = await tx.order.update({
          where: { id },
          data: { status: next },
        });
        const type = next === 'CANCELLED' ? 'ORDER_CANCELLED' : `ORDER_${next}`;
        await tx.orderEvent.create({
          data: {
            orderId: id,
            type,
            message: `Order status changed from ${order.status} to ${next}`,
            actorType: 'ADMIN',
            actorUserId: adminId,
            metadata: { oldStatus: order.status, newStatus: next },
          },
        });
        await this.audit.record(
          {
            adminUserId: adminId,
            action:
              next === 'CANCELLED'
                ? 'ORDER_CANCEL_ADMIN'
                : 'ORDER_STATUS_CHANGE',
            entityType: 'Order',
            entityId: id,
            metadata: { oldStatus: order.status, newStatus: next },
          },
          tx,
        );
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async payments(q: AdminPaymentQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      status: q.status,
      provider: q.provider
        ? { equals: q.provider, mode: 'insensitive' }
        : undefined,
      order: q.orderNumber
        ? { orderNumber: { contains: q.orderNumber, mode: 'insensitive' } }
        : undefined,
      ...((q.dateFrom || q.dateTo) && {
        createdAt: {
          gte: q.dateFrom ? new Date(q.dateFrom) : undefined,
          lte: q.dateTo ? new Date(q.dateTo) : undefined,
        },
      }),
    };
    const select = {
      ...paymentSafe,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          user: { select: { id: true, email: true } },
        },
      },
      refunds: {
        select: { id: true, amountPaise: true, status: true, createdAt: true },
      },
    } satisfies Prisma.PaymentSelect;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        select,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    };
  }
  async payment(id: string) {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      select: {
        ...paymentSafe,
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalPaise: true,
            createdAt: true,
          },
        },
        refunds: {
          select: {
            id: true,
            providerRefundId: true,
            amountPaise: true,
            reason: true,
            status: true,
            requestedByAdminId: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('Payment not found');
    return row;
  }
  async refund(
    adminId: string,
    orderId: string,
    key: string | undefined,
    dto: RefundPaymentDto,
  ) {
    if (!key || key.length < 16 || key.length > 200) {
      throw new BadRequestException('A valid Idempotency-Key is required');
    }
    const prepared = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
        const payment = await tx.payment.findUnique({
          where: { orderId },
          include: { order: true, refunds: true },
        });
        if (!payment) throw new NotFoundException('Payment not found');
        const existing = payment.refunds.find((r) => r.idempotencyKey === key);
        if (existing) return { existing };
        if (!payment.providerPaymentId || !['PAID', 'PARTIALLY_REFUNDED', 'CAPTURED_REQUIRES_ACTION'].includes(payment.status)) {
          throw new ConflictException('Payment is not refundable');
        }
        const used = payment.refunds
          .filter((r) => r.status === 'PROCESSED' || r.status === 'PENDING')
          .reduce((sum, row) => sum + row.amountPaise, 0);
        if (dto.amountPaise > payment.amountPaise - used) {
          throw new ConflictException('Refund amount exceeds refundable balance');
        }
        const created = await tx.paymentRefund.create({
          data: {
            paymentId: payment.id,
            amountPaise: dto.amountPaise,
            reason: dto.reason,
            idempotencyKey: key,
            requestedByAdminId: adminId,
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId,
            type: 'REFUND_REQUESTED',
            message: 'Refund requested',
            actorType: 'ADMIN',
            actorUserId: adminId,
            metadata: { refundId: created.id, amountPaise: dto.amountPaise },
          },
        });
        await this.audit.record(
          {
            adminUserId: adminId,
            action: 'REFUND_CREATE',
            entityType: 'PaymentRefund',
            entityId: created.id,
            metadata: {
              paymentId: payment.id,
              orderId,
              amountPaise: dto.amountPaise,
            },
          },
          tx,
        );
        return { created, payment };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if ('existing' in prepared) return prepared.existing;
    try {
      const provider = await this.razorpay.refundProviderPayment(
        prepared.payment.providerPaymentId!,
        dto.amountPaise,
        prepared.created.id,
      );
      if (provider.amount !== dto.amountPaise) {
        throw new ConflictException('Provider refund amount mismatch');
      }
      return this.applyProviderRefund(adminId, prepared.created.id, provider);
    } catch (error) {
      // A provider timeout can happen after the provider accepted the refund.
      // Keep the row pending so reconciliation can recover it by our receipt ID.
      await this.prisma.$transaction(async (tx) => {
        await tx.paymentRefund.updateMany({
          where: { id: prepared.created.id, status: 'PENDING' },
          data: { providerStatus: 'UNKNOWN', lastReconciledAt: new Date() },
        });
        await tx.orderEvent.create({
          data: {
            orderId,
            type: 'REFUND_RECONCILIATION_REQUIRED',
            message: 'Refund provider result is awaiting reconciliation',
            actorType: 'ADMIN',
            actorUserId: adminId,
            metadata: {
              refundId: prepared.created.id,
              amountPaise: dto.amountPaise,
            },
          },
        });
        await this.audit.record(
          {
            adminUserId: adminId,
            action: 'REFUND_RECONCILIATION_REQUIRED',
            entityType: 'PaymentRefund',
            entityId: prepared.created.id,
            metadata: {
              paymentId: prepared.payment.id,
              orderId,
              amountPaise: dto.amountPaise,
            },
          },
          tx,
        );
      });
      throw error;
    }
  }

  async reconcileRefund(adminId: string, refundId: string) {
    const refund = await this.prisma.paymentRefund.findUnique({
      where: { id: refundId },
      include: { payment: { include: { order: true } } },
    });
    if (!refund) throw new NotFoundException('Refund not found');
    if (refund.status === 'PROCESSED') return refund;
    if (!refund.payment.providerPaymentId) {
      throw new ConflictException('Provider payment ID is unavailable');
    }
    const provider = await this.razorpay.findProviderRefund(
      refund.payment.providerPaymentId,
      refund.id,
      refund.providerRefundId,
    );
    if (!provider) {
      await this.prisma.paymentRefund.update({
        where: { id: refund.id },
        data: { providerStatus: 'NOT_FOUND', lastReconciledAt: new Date() },
      });
      return { ...refund, reconciliationStatus: 'NOT_FOUND' as const };
    }
    if (provider.amount !== refund.amountPaise) {
      throw new ConflictException('Provider refund amount mismatch');
    }
    return this.applyProviderRefund(adminId, refund.id, provider);
  }

  private async applyProviderRefund(
    adminId: string,
    refundId: string,
    provider: { id: string; amount: number; status: string; receipt: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.paymentRefund.findUnique({
        where: { id: refundId },
        include: { payment: { include: { order: true } } },
      });
      if (!current) throw new NotFoundException('Refund not found');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${current.payment.orderId}))`;
      if (current.status === 'PROCESSED') return current;
      const processed = provider.status === 'processed';
      const failed = provider.status === 'failed';
      const refund = await tx.paymentRefund.update({
        where: { id: current.id },
        data: {
          providerRefundId: provider.id,
          providerStatus: provider.status,
          lastReconciledAt: new Date(),
          status: processed ? 'PROCESSED' : failed ? 'FAILED' : 'PENDING',
        },
      });
      if (!processed) {
        await this.audit.record({
          adminUserId: adminId,
          action: 'REFUND_RECONCILE',
          entityType: 'PaymentRefund',
          entityId: refund.id,
          metadata: { providerStatus: provider.status },
        }, tx);
        return refund;
      }

      const sums = await tx.paymentRefund.aggregate({
        where: { paymentId: current.paymentId, status: 'PROCESSED' },
        _sum: { amountPaise: true },
      });
      const total = sums._sum.amountPaise ?? 0;
      const full = total === current.payment.amountPaise;
      const paymentStatus = full
        ? 'REFUNDED'
        : current.payment.status === 'CAPTURED_REQUIRES_ACTION'
          ? 'CAPTURED_REQUIRES_ACTION'
          : 'PARTIALLY_REFUNDED';
      await tx.payment.update({ where: { id: current.paymentId }, data: { status: paymentStatus } });
      if (full) await tx.order.update({ where: { id: current.payment.orderId }, data: { status: 'REFUNDED' } });
      await tx.orderEvent.create({
        data: {
          orderId: current.payment.orderId,
          type: 'REFUND_COMPLETED',
          message: full ? 'Payment fully refunded' : 'Payment partially refunded',
          actorType: 'ADMIN',
          actorUserId: adminId,
          metadata: { refundId: refund.id, amountPaise: refund.amountPaise, totalRefundedPaise: total },
        },
      });
      await this.audit.record({
        adminUserId: adminId,
        action: 'REFUND_COMPLETE',
        entityType: 'PaymentRefund',
        entityId: refund.id,
        metadata: { paymentId: current.paymentId, orderId: current.payment.orderId, amountPaise: refund.amountPaise, totalRefundedPaise: total },
      }, tx);
      return {
        ...refund,
        totalRefundedPaise: total,
        refundablePaise: current.payment.amountPaise - total,
        paymentStatus,
        orderStatus: full ? 'REFUNDED' : current.payment.order.status,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async reconcile(adminId: string, paymentId: string) {
    const before = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, orderId: true },
    });
    if (!before) throw new NotFoundException('Payment not found');
    const result = await this.razorpay.reconcilePayment(paymentId);
    await this.prisma.$transaction(async (tx) => {
      if (result.changed)
        await tx.orderEvent.create({
          data: {
            orderId: before.orderId,
            type: 'PAYMENT_CONFIRMED',
            message: 'Payment reconciled with provider',
            actorType: 'ADMIN',
            actorUserId: adminId,
            metadata: {
              oldStatus: before.status,
              newStatus: result.paymentStatus,
            },
          },
        });
      await this.audit.record(
        {
          adminUserId: adminId,
          action: 'PAYMENT_RECONCILE',
          entityType: 'Payment',
          entityId: paymentId,
          metadata: {
            oldStatus: before.status,
            newStatus: result.paymentStatus,
            changed: result.changed,
          },
        },
        tx,
      );
    });
    return result;
  }
}
