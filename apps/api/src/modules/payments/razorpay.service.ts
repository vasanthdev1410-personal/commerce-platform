import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import { Prisma, type PaymentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { VerifyRazorpayPaymentDto } from './dto/verify-razorpay-payment.dto';

interface ProviderRefundResult {
  id: string;
  amount: number;
  status: string;
  receipt: string | null;
}

class InventoryRecoveryUnavailable extends Error {}

@Injectable()
export class RazorpayService {
  private readonly keyId: string | null;
  private readonly keySecret: string | null;
  private readonly webhookSecret: string | null;
  private readonly client: Razorpay | null;
  private readonly mock: boolean;
  private readonly mockRefundFailureAmount: number | null;
  private readonly mockRefunds = new Map<string, ProviderRefundResult[]>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.keyId = config.get<string>('RAZORPAY_KEY_ID') || null;
    this.keySecret = config.get<string>('RAZORPAY_KEY_SECRET') || null;
    this.webhookSecret = config.get<string>('RAZORPAY_WEBHOOK_SECRET') || null;
    this.mock =
      config.get('NODE_ENV') === 'test' &&
      config.get('RAZORPAY_MOCK_MODE') === 'true';
    const failure = Number(
      config.get<string>('RAZORPAY_MOCK_REFUND_FAILURE_AMOUNT'),
    );
    this.mockRefundFailureAmount =
      Number.isSafeInteger(failure) && failure > 0 ? failure : null;
    this.client =
      !this.mock && this.keyId && this.keySecret
        ? new Razorpay({ key_id: this.keyId, key_secret: this.keySecret })
        : null;
  }

  async create(userId: string, orderId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockOrder(tx, orderId);
        const order = await tx.order.findFirst({
          where: { id: orderId, userId },
          include: { payments: true },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.status !== 'PENDING') {
          throw new BadRequestException('Order is not awaiting payment');
        }
        if (!order.reservationExpiresAt || order.reservationExpiresAt <= new Date()) {
          throw new ConflictException('Order reservation has expired');
        }

        const current = order.payments[0];
        if (current?.status === 'CAPTURED_REQUIRES_ACTION') {
          throw new ConflictException(
            'Payment is captured and awaiting reconciliation',
          );
        }
        if (current && current.status !== 'PENDING') {
          throw new ConflictException('Payment is not awaiting initialization');
        }
        if (current?.providerOrderId && current.status === 'PENDING') {
          return this.checkout(order, current.providerOrderId);
        }

        let providerOrderId: string;
        if (this.mock) {
          providerOrderId = `order_${randomBytes(12).toString('hex')}`;
        } else {
          try {
            const providerOrder = await this.requireClient().orders.create({
              amount: order.totalPaise,
              currency: 'INR',
              receipt: order.orderNumber.slice(0, 40),
              notes: { internalOrderId: order.id },
            });
            providerOrderId = providerOrder.id;
          } catch {
            throw new ServiceUnavailableException('Payment service is unavailable');
          }
        }

        await tx.payment.upsert({
          where: { orderId },
          update: {
            provider: 'RAZORPAY',
            providerOrderId,
            status: 'PENDING',
            amountPaise: order.totalPaise,
          },
          create: {
            orderId,
            provider: 'RAZORPAY',
            providerOrderId,
            status: 'PENDING',
            amountPaise: order.totalPaise,
          },
        });
        return this.checkout(order, providerOrderId);
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }

  async verify(userId: string, dto: VerifyRazorpayPaymentDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId: dto.orderId },
      include: { order: true },
    });
    if (!payment || payment.order.userId !== userId) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.providerOrderId !== dto.razorpay_order_id) {
      throw new BadRequestException('Payment could not be verified');
    }
    this.assertSignature(
      `${dto.razorpay_order_id}|${dto.razorpay_payment_id}`,
      dto.razorpay_signature,
      this.requireSecret(),
    );

    let amount = payment.amountPaise;
    let status = 'captured';
    let providerOrderId = dto.razorpay_order_id;
    if (!this.mock) {
      try {
        const entity = await this.requireClient().payments.fetch(
          dto.razorpay_payment_id,
        );
        amount = Number(entity.amount);
        status = entity.status;
        providerOrderId = String(entity.order_id);
      } catch {
        throw new BadRequestException('Payment could not be verified');
      }
    }
    if (
      status !== 'captured' ||
      providerOrderId !== payment.providerOrderId ||
      amount !== payment.order.totalPaise
    ) {
      throw new BadRequestException('Payment could not be verified');
    }
    return this.processCapturedPayment(
      payment.id,
      dto.razorpay_payment_id,
      amount,
    );
  }

  async webhook(
    raw: Buffer | undefined,
    signature: string | undefined,
    payload: unknown,
  ) {
    if (!raw || !signature || !this.webhookSecret) {
      throw new ForbiddenException('Invalid webhook signature');
    }
    this.assertSignature(raw, signature, this.webhookSecret);
    const event = payload as {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            order_id?: string;
            amount?: number;
            status?: string;
          };
        };
      };
    };
    const entity = event.payload?.payment?.entity;
    if (
      event.event !== 'payment.captured' ||
      !entity?.id ||
      !entity.order_id ||
      entity.status !== 'captured'
    ) {
      return { status: 'ignored' as const };
    }
    const payment = await this.prisma.payment.findUnique({
      where: { providerOrderId: entity.order_id },
      include: { order: true },
    });
    if (!payment) return { status: 'ignored' as const };
    if (entity.amount !== payment.order.totalPaise) {
      throw new BadRequestException('Payment amount mismatch');
    }
    const result = await this.processCapturedPayment(
      payment.id,
      entity.id,
      entity.amount,
    );
    return { status: 'ok' as const, result };
  }

  async status(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { payments: { select: { status: true, provider: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const paymentStatus = order.payments[0]?.status ?? 'PENDING';
    return {
      paymentStatus,
      provider: order.payments[0]?.provider ?? null,
      orderStatus: order.status,
      recoveryAction:
        paymentStatus === 'CAPTURED_REQUIRES_ACTION'
          ? 'RETRY_RECONCILIATION_OR_REFUND'
          : null,
    };
  }

  async refundProviderPayment(
    providerPaymentId: string,
    amountPaise: number,
    internalRefundId: string,
  ): Promise<ProviderRefundResult> {
    if (this.mock) {
      if (amountPaise === this.mockRefundFailureAmount) {
        throw new ServiceUnavailableException('Refund service is unavailable');
      }
      const result = {
        id: `rfnd_${randomBytes(12).toString('hex')}`,
        amount: amountPaise,
        status: 'processed',
        receipt: internalRefundId,
      };
      const rows = this.mockRefunds.get(providerPaymentId) ?? [];
      rows.push(result);
      this.mockRefunds.set(providerPaymentId, rows);
      return result;
    }
    try {
      const refund = await this.requireClient().payments.refund(
        providerPaymentId,
        {
          amount: amountPaise,
          receipt: internalRefundId,
          notes: { internalRefundId },
        },
      );
      return {
        id: String(refund.id),
        amount: Number(refund.amount),
        status: String(refund.status),
        receipt: refund.receipt ? String(refund.receipt) : null,
      };
    } catch {
      throw new ServiceUnavailableException('Refund service is unavailable');
    }
  }

  async findProviderRefund(
    providerPaymentId: string,
    internalRefundId: string,
    providerRefundId?: string | null,
  ): Promise<ProviderRefundResult | null> {
    if (this.mock) {
      return (
        (this.mockRefunds.get(providerPaymentId) ?? []).find(
          (row) =>
            row.id === providerRefundId || row.receipt === internalRefundId,
        ) ?? null
      );
    }
    try {
      if (providerRefundId) {
        const refund = await this.requireClient().refunds.fetch(
          providerRefundId,
          { payment_id: providerPaymentId },
        );
        return {
          id: String(refund.id),
          amount: Number(refund.amount),
          status: String(refund.status),
          receipt: refund.receipt ? String(refund.receipt) : null,
        };
      }
      const response = (await this.requireClient().payments.fetchMultipleRefund(
        providerPaymentId,
        { count: 100 },
      )) as { items?: Array<{ id: string; amount?: number; status?: string; receipt?: string | null; notes?: Record<string, unknown> }> };
      const refund = response.items?.find(
        (row) =>
          row.receipt === internalRefundId ||
          row.notes?.internalRefundId === internalRefundId,
      );
      return refund
        ? {
            id: String(refund.id),
            amount: Number(refund.amount),
            status: String(refund.status),
            receipt: refund.receipt ? String(refund.receipt) : null,
          }
        : null;
    } catch {
      throw new ServiceUnavailableException('Refund service is unavailable');
    }
  }

  async fetchProviderPayment(providerPaymentId: string) {
    if (this.mock) {
      return {
        id: providerPaymentId,
        status: 'captured',
        amount: null as number | null,
        orderId: null as string | null,
      };
    }
    try {
      const entity = await this.requireClient().payments.fetch(providerPaymentId);
      return {
        id: String(entity.id),
        status: String(entity.status),
        amount: Number(entity.amount),
        orderId: entity.order_id ? String(entity.order_id) : null,
      };
    } catch {
      throw new ServiceUnavailableException('Payment service is unavailable');
    }
  }

  async reconcilePayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)) {
      return {
        changed: false,
        paymentStatus: payment.status,
        orderStatus: payment.order.status,
      };
    }
    if (!payment.providerPaymentId) {
      throw new ConflictException('Provider payment ID is unavailable');
    }
    const provider = await this.fetchProviderPayment(payment.providerPaymentId);
    const amount = provider.amount ?? payment.amountPaise;
    const providerOrderId = provider.orderId ?? payment.providerOrderId;
    if (
      provider.status !== 'captured' ||
      amount !== payment.amountPaise ||
      amount !== payment.order.totalPaise ||
      providerOrderId !== payment.providerOrderId
    ) {
      throw new ConflictException(
        'Provider payment is not a matching captured payment',
      );
    }
    const result = await this.processCapturedPayment(
      payment.id,
      payment.providerPaymentId,
      amount,
    );
    return { changed: result.paymentStatus !== payment.status, ...result };
  }

  private async processCapturedPayment(
    paymentId: string,
    providerPaymentId: string,
    amount: number,
  ) {
    await this.persistCapture(paymentId, providerPaymentId, amount);
    try {
      return await this.withSerializableRetry(() =>
        this.finalizeCapturedPayment(paymentId, providerPaymentId, amount),
      );
    } catch (error) {
      if (!(error instanceof InventoryRecoveryUnavailable)) throw error;
      const payment = await this.prisma.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { order: true },
      });
      return {
        paymentStatus: payment.status,
        orderStatus: payment.order.status,
        orderId: payment.orderId,
        amountPaidPaise: amount,
        recoveryAction: 'RETRY_RECONCILIATION_OR_REFUND' as const,
      };
    }
  }

  private async persistCapture(
    paymentId: string,
    providerPaymentId: string,
    amount: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { orderId: true },
      });
      if (!candidate) throw new NotFoundException('Payment not found');
      await this.lockOrder(tx, candidate.orderId);
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId },
        include: { order: true },
      });
      if (payment.amountPaise !== amount || payment.order.totalPaise !== amount) {
        throw new BadRequestException('Payment amount mismatch');
      }
      if (
        payment.providerPaymentId &&
        payment.providerPaymentId !== providerPaymentId
      ) {
        throw new ConflictException(
          'A different provider payment is already recorded',
        );
      }
      if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)) {
        return;
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId,
          status: 'CAPTURED_REQUIRES_ACTION',
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: 'PAYMENT_CAPTURED',
          message: 'Provider payment captured; fulfillment confirmation pending',
          actorType: 'SYSTEM',
          metadata: { paymentId: payment.id },
        },
      });
    });
  }

  private finalizeCapturedPayment(
    paymentId: string,
    providerPaymentId: string,
    amount: number,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const candidate = await tx.payment.findUnique({
          where: { id: paymentId },
          select: { orderId: true },
        });
        if (!candidate) throw new NotFoundException('Payment not found');
        await this.lockOrder(tx, candidate.orderId);
        const payment = await tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
          include: {
            refunds: { where: { status: 'PROCESSED' } },
            order: {
              include: {
                items: true,
                inventoryReservations: { where: { releasedAt: null } },
              },
            },
          },
        });
        if (payment.providerPaymentId !== providerPaymentId) {
          throw new ConflictException('Provider payment identity mismatch');
        }
        if (['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)) {
          return {
            paymentStatus: payment.status,
            orderStatus: payment.order.status,
            orderId: payment.orderId,
            amountPaidPaise: payment.amountPaise,
            recoveryAction: null,
          };
        }
        if (payment.status !== 'CAPTURED_REQUIRES_ACTION') {
          throw new ConflictException('Payment is not awaiting confirmation');
        }
        if (payment.amountPaise !== amount || payment.order.totalPaise !== amount) {
          throw new BadRequestException('Payment amount mismatch');
        }

        const reservations = new Map(
          payment.order.inventoryReservations.map((row) => [row.variantId, row]),
        );
        const canUseReservations = payment.order.items.every((item) => {
          const reservation = reservations.get(item.variantId);
          return reservation && reservation.quantity === item.quantity;
        });

        if (canUseReservations) {
          for (const item of payment.order.items) {
            const reservation = reservations.get(item.variantId)!;
            const changed = await tx.$executeRaw`UPDATE "Inventory"
              SET "stockQuantity" = "stockQuantity" - ${item.quantity},
                  "reservedQuantity" = "reservedQuantity" - ${item.quantity}
              WHERE "variantId" = ${item.variantId}::uuid
                AND "stockQuantity" >= ${item.quantity}
                AND "reservedQuantity" >= ${item.quantity}`;
            if (changed !== 1) throw new InventoryRecoveryUnavailable();
            await tx.inventoryReservation.update({
              where: { id: reservation.id },
              data: { releasedAt: new Date() },
            });
          }
        } else {
          const expiredCancellation =
            payment.order.status === 'CANCELLED' &&
            payment.order.reservationExpiresAt !== null &&
            payment.order.reservationExpiresAt <= new Date();
          if (
            payment.order.status !== 'PENDING' &&
            !expiredCancellation
          ) {
            throw new InventoryRecoveryUnavailable();
          }
          const now = new Date();
          for (const item of payment.order.items) {
            const changed = await tx.$executeRaw`UPDATE "Inventory"
              SET "stockQuantity" = "stockQuantity" - ${item.quantity}
              WHERE "variantId" = ${item.variantId}::uuid
                AND "stockQuantity" - "reservedQuantity" >= ${item.quantity}`;
            if (changed !== 1) throw new InventoryRecoveryUnavailable();
            await tx.inventoryReservation.create({
              data: {
                orderId: payment.orderId,
                variantId: item.variantId,
                quantity: item.quantity,
                expiresAt: now,
                releasedAt: now,
              },
            });
          }
        }

        const refundedPaise = payment.refunds.reduce(
          (sum, refund) => sum + refund.amountPaise,
          0,
        );
        const finalPaymentStatus: PaymentStatus =
          refundedPaise > 0 ? 'PARTIALLY_REFUNDED' : 'PAID';
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: finalPaymentStatus },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: 'CONFIRMED' },
        });
        await tx.orderEvent.create({
          data: {
            orderId: payment.orderId,
            type: 'PAYMENT_CONFIRMED',
            message: 'Captured payment and inventory confirmed',
            actorType: 'SYSTEM',
            metadata: { paymentId: payment.id },
          },
        });
        return {
          paymentStatus: finalPaymentStatus,
          orderStatus: 'CONFIRMED' as const,
          orderId: payment.orderId,
          amountPaidPaise: amount,
          recoveryAction: null,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Payment confirmation could not be completed');
  }

  private lockOrder(tx: Prisma.TransactionClient, orderId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
  }

  private checkout(
    order: { id: string; totalPaise: number; orderNumber: string },
    providerOrderId: string,
  ) {
    return {
      internalOrderId: order.id,
      providerOrderId,
      amountPaise: order.totalPaise,
      currency: 'INR',
      keyId: this.mock ? 'rzp_test_mock' : this.keyId,
      orderNumber: order.orderNumber,
    };
  }

  private assertSignature(
    data: string | Buffer,
    received: string,
    secret: string,
  ): void {
    const expected = createHmac('sha256', secret).update(data).digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new BadRequestException('Payment could not be verified');
    }
  }

  private requireSecret(): string {
    if (this.mock) return 'test_key_secret';
    if (!this.keySecret) {
      throw new ServiceUnavailableException('Payment service is not configured');
    }
    return this.keySecret;
  }

  private requireClient(): Razorpay {
    if (!this.client) {
      throw new ServiceUnavailableException('Payment service is not configured');
    }
    return this.client;
  }
}
