import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../dist/generated/prisma/client.js';
import { GlobalExceptionFilter } from '../dist/common/filters/global-exception.filter.js';
import { TaxService } from '../dist/modules/financial/tax.service.js';
import { ShippingService } from '../dist/modules/fulfillment/shipping.service.js';
import { InventoryService } from '../dist/modules/inventory/inventory.service.js';
import { RazorpayService } from '../dist/modules/payments/razorpay.service.js';
import { ReviewsService } from '../dist/modules/reviews/reviews.service.js';
import { AdminOrdersService } from '../dist/modules/admin-orders/admin-orders.service.js';

const createdAt = new Date('2026-01-01T00:00:00Z');
const rule = (overrides = {}) => ({
  id: crypto.randomUUID(), name: 'rule', stateCode: null, pricingMode: null,
  countryCode: 'IN', minSubtotalPaise: 0, maxSubtotalPaise: null,
  shippingPaise: 10000, priority: 0, isActive: true, createdAt, updatedAt: createdAt,
  ...overrides,
});

function shippingService(rows) {
  return new ShippingService({
    shippingRule: {
      findMany: async ({ where }) => {
        const stateCode = where.AND[1].OR[1].stateCode;
        const subtotal = where.minSubtotalPaise.lte;
        const pricingMode = where.OR[1].pricingMode;
        return rows.filter((row) => row.isActive && row.countryCode === where.countryCode &&
          row.minSubtotalPaise <= subtotal && (row.maxSubtotalPaise == null || row.maxSubtotalPaise >= subtotal) &&
          (row.pricingMode == null || row.pricingMode === pricingMode) &&
          (row.stateCode == null || row.stateCode === stateCode));
      },
    },
  }, { record: async () => undefined });
}

test('state-aware shipping selection', async (suite) => {
  await suite.test('Tamil Nadu aliases select the TN rule', async () => {
    const service = shippingService([rule({ name: 'India' }), rule({ name: 'Tamil Nadu', stateCode: 'TN', shippingPaise: 5000 })]);
    for (const state of ['Tamil Nadu', 'TAMIL NADU', 'TN']) assert.equal((await service.calculate('IN', state, 'RETAIL', 50000)).shippingPaise, 5000);
  });
  await suite.test('another state uses the country fallback', async () => {
    const service = shippingService([rule({ stateCode: 'TN', shippingPaise: 5000 }), rule({ shippingPaise: 9000 })]);
    assert.equal((await service.calculate('IN', 'Karnataka', 'RETAIL', 50000)).shippingPaise, 9000);
  });
  await suite.test('a free threshold outranks a lower threshold', async () => {
    const service = shippingService([rule({ shippingPaise: 9000 }), rule({ minSubtotalPaise: 100000, shippingPaise: 0 })]);
    assert.equal((await service.calculate('IN', 'KA', 'RETAIL', 125000)).shippingPaise, 0);
  });
  await suite.test('retail and wholesale rules are distinct', async () => {
    const service = shippingService([rule({ pricingMode: 'RETAIL', shippingPaise: 8000 }), rule({ pricingMode: 'WHOLESALE', shippingPaise: 2000 })]);
    assert.equal((await service.calculate('IN', 'KA', 'WHOLESALE', 50000)).shippingPaise, 2000);
  });
  await suite.test('inactive rules are ignored', async () => {
    const service = shippingService([rule({ isActive: false, shippingPaise: 0 }), rule({ shippingPaise: 7000 })]);
    assert.equal((await service.calculate('IN', 'KA', 'RETAIL', 50000)).shippingPaise, 7000);
  });
  await suite.test('priority breaks otherwise equivalent conflicts', async () => {
    const service = shippingService([rule({ priority: 1, shippingPaise: 7000 }), rule({ priority: 5, shippingPaise: 3000 })]);
    assert.equal((await service.calculate('IN', 'KA', 'RETAIL', 50000)).shippingPaise, 3000);
  });
  await suite.test('no applicable rule fails safely', async () => {
    await assert.rejects(() => shippingService([]).calculate('IN', 'KA', 'RETAIL', 50000), BadRequestException);
  });
});

test('GST snapshots and state normalization', async (suite) => {
  const config = { get: (key) => key === 'SELLER_STATE' ? 'Tamil Nadu' : undefined };
  await suite.test('same-state tax splits CGST and SGST', () => {
    const result = new TaxService(config).calculate([{ amountPaise: 10000, rateBasisPoints: 1800 }], 0, 'tn');
    assert.deepEqual({ cgst: result.cgstPaise, sgst: result.sgstPaise, igst: result.igstPaise, state: result.buyerStateCode }, { cgst: 900, sgst: 900, igst: 0, state: 'TN' });
  });
  await suite.test('interstate tax uses IGST and retains per-line totals', () => {
    const result = new TaxService(config).calculate([{ amountPaise: 10000, rateBasisPoints: 1800 }, { amountPaise: 5000, rateBasisPoints: 500 }], 1500, 'Karnataka');
    assert.equal(result.taxPaise, result.lines.reduce((sum, line) => sum + line.taxPaise, 0));
    assert.equal(result.cgstPaise + result.sgstPaise, 0);
    assert.equal(result.igstPaise, result.taxPaise);
  });
  await suite.test('invalid Indian state is rejected', () => {
    assert.throws(() => new TaxService(config).calculate([], 0, 'Not a state'), BadRequestException);
  });
});

test('inventory updates preserve reserved stock', async (suite) => {
  const make = (current) => {
    let updated = false;
    const tx = {
      $queryRaw: async () => current ? [current] : [],
      inventory: { update: async ({ data }) => { updated = true; return { ...current, ...data, variantId: 'v' }; } },
    };
    return { service: new InventoryService({ $transaction: (callback) => callback(tx) }, { record: async () => undefined }), wasUpdated: () => updated };
  };
  await suite.test('stock below reserved returns conflict without updating', async () => {
    const context = make({ stockQuantity: 10, reservedQuantity: 4, reorderLevel: 0 });
    await assert.rejects(() => context.service.update('v', { stockQuantity: 3 }, 'admin'), ConflictException);
    assert.equal(context.wasUpdated(), false);
  });
  await suite.test('normal stock update succeeds', async () => {
    const context = make({ stockQuantity: 10, reservedQuantity: 4, reorderLevel: 0 });
    assert.equal((await context.service.update('v', { stockQuantity: 5 }, 'admin')).stockQuantity, 5);
  });
  await suite.test('missing inventory returns not found', async () => {
    await assert.rejects(() => make(null).service.update('v', { stockQuantity: 5 }, 'admin'), NotFoundException);
  });
});

function serialTransactions(tx) {
  let tail = Promise.resolve();
  return (callback) => {
    const result = tail.then(() => callback(tx));
    tail = result.catch(() => undefined);
    return result;
  };
}

test('payment initialization and captured recovery are idempotent', async (suite) => {
  const config = { get: (key) => ({ NODE_ENV: 'test', RAZORPAY_MOCK_MODE: 'true', RAZORPAY_KEY_SECRET: 'test_key_secret' })[key] };
  await suite.test('concurrent create calls reuse one provider order', async () => {
    let payment = null;
    let writes = 0;
    const order = { id: 'order-id', userId: 'user-id', status: 'PENDING', reservationExpiresAt: new Date(Date.now() + 60000), totalPaise: 1000, orderNumber: 'ORD-1' };
    const tx = {
      $executeRaw: async () => 1,
      order: { findFirst: async () => ({ ...order, payments: payment ? [payment] : [] }) },
      payment: { upsert: async ({ create, update }) => { writes += 1; payment = payment ? { ...payment, ...update } : { id: 'payment-id', ...create }; return payment; } },
    };
    const prisma = { $transaction: serialTransactions(tx) };
    const service = new RazorpayService(prisma, config);
    const [first, second] = await Promise.all([service.create('user-id', 'order-id'), service.create('user-id', 'order-id')]);
    assert.equal(first.providerOrderId, second.providerOrderId);
    assert.equal(writes, 1);
    assert.equal(first.amountPaise, 1000);
  });

  const recoveryContext = (stockQuantity) => {
    const state = {
      payment: { id: 'payment-id', orderId: 'order-id', amountPaise: 2000, providerPaymentId: null, status: 'PENDING' },
      order: { id: 'order-id', status: 'CANCELLED', totalPaise: 2000, reservationExpiresAt: new Date(Date.now() - 60000), items: [{ variantId: 'variant-id', quantity: 2 }], inventoryReservations: [] },
      stockQuantity,
      reservations: [],
      events: [],
    };
    const completePayment = () => ({ ...state.payment, refunds: [], order: { ...state.order, inventoryReservations: state.order.inventoryReservations } });
    const tx = {
      payment: {
        findUnique: async () => ({ orderId: state.payment.orderId }),
        findUniqueOrThrow: async () => completePayment(),
        update: async ({ data }) => Object.assign(state.payment, data),
      },
      order: { update: async ({ data }) => Object.assign(state.order, data) },
      orderEvent: { create: async ({ data }) => state.events.push(data) },
      inventoryReservation: { create: async ({ data }) => { state.reservations.push(data); return data; }, update: async () => undefined },
      $executeRaw: async (strings) => {
        const sql = strings.join(' ');
        if (!sql.includes('UPDATE "Inventory"')) return 1;
        if (state.stockQuantity < 2) return 0;
        state.stockQuantity -= 2;
        return 1;
      },
    };
    const prisma = {
      $transaction: async (callback) => callback(tx),
      payment: { findUniqueOrThrow: async () => completePayment() },
    };
    return { service: new RazorpayService(prisma, config), state };
  };

  await suite.test('captured payment after expiry recovers stock exactly once', async () => {
    const context = recoveryContext(5);
    const first = await context.service.processCapturedPayment('payment-id', 'pay-provider', 2000);
    const second = await context.service.processCapturedPayment('payment-id', 'pay-provider', 2000);
    assert.equal(first.paymentStatus, 'PAID');
    assert.equal(second.paymentStatus, 'PAID');
    assert.equal(context.state.stockQuantity, 3);
    assert.equal(context.state.reservations.length, 1);
    assert.equal(context.state.order.status, 'CONFIRMED');
  });

  await suite.test('insufficient recovery stock preserves captured state and requires action', async () => {
    const context = recoveryContext(1);
    const result = await context.service.processCapturedPayment('payment-id', 'pay-provider', 2000);
    assert.equal(result.paymentStatus, 'CAPTURED_REQUIRES_ACTION');
    assert.equal(result.recoveryAction, 'RETRY_RECONCILIATION_OR_REFUND');
    assert.equal(context.state.stockQuantity, 1);
    assert.equal(context.state.order.status, 'CANCELLED');
  });
});

test('review media changes return approved content to moderation', async (suite) => {
  await suite.test('confirmation is atomic and rebuilds public statistics', async () => {
    const state = { status: 'APPROVED', media: [], statsRebuilt: false, lockCalls: 0 };
    const review = { id: 'review-id', userId: 'user-id', productId: 'product-id', deletedAt: null, status: state.status };
    const tx = {
      $executeRaw: async () => { state.lockCalls += 1; return 1; },
      productReview: {
        findFirst: async () => ({ ...review, status: state.status }),
        update: async ({ data }) => { Object.assign(state, data); return { ...review, ...data }; },
        groupBy: async () => [],
      },
      productReviewMedia: {
        count: async () => state.media.length,
        create: async ({ data }) => { const row = { id: crypto.randomUUID(), ...data }; state.media.push(row); return row; },
      },
      productReviewStats: { upsert: async () => { state.statsRebuilt = true; } },
    };
    const prisma = {
      productReview: { findFirst: async () => review },
      $transaction: async (callback) => callback(tx),
    };
    const storage = { getFile: async () => ({ filePath: '/reviews/user-id/review-id/file.webp', publicUrl: 'https://images.test.invalid/file.webp', contentType: 'image/webp', contentLength: 100 }) };
    const service = new ReviewsService(prisma, storage, { record: async () => undefined });
    await service.confirmMedia('user-id', 'review-id', { fileId: 'file-id', sortOrder: 0 });
    assert.equal(state.status, 'PENDING');
    assert.equal(state.media.length, 1);
    assert.equal(state.statsRebuilt, true);
    assert.equal(state.lockCalls, 1);
  });

  await suite.test('serialized confirmations cannot exceed five images', async () => {
    const state = { media: Array.from({ length: 4 }, (_, index) => ({ id: String(index) })) };
    const review = { id: 'review-id', userId: 'user-id', productId: 'product-id', deletedAt: null, status: 'PENDING' };
    const tx = {
      $executeRaw: async () => 1,
      productReview: { findFirst: async () => review },
      productReviewMedia: { count: async () => state.media.length, create: async ({ data }) => { state.media.push(data); return data; } },
    };
    const prisma = { productReview: { findFirst: async () => review }, $transaction: serialTransactions(tx) };
    const storage = { getFile: async (id) => ({ filePath: `/reviews/user-id/review-id/${id}.webp`, publicUrl: `https://images.test.invalid/${id}.webp`, contentType: 'image/webp', contentLength: 100 }) };
    const service = new ReviewsService(prisma, storage, { record: async () => undefined });
    const outcomes = await Promise.allSettled([
      service.confirmMedia('user-id', 'review-id', { fileId: 'one', sortOrder: 0 }),
      service.confirmMedia('user-id', 'review-id', { fileId: 'two', sortOrder: 1 }),
    ]);
    assert.equal(outcomes.filter((row) => row.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((row) => row.status === 'rejected').length, 1);
    assert.equal(state.media.length, 5);
  });
});

test('refund persistence and reconciliation remain idempotent', async (suite) => {
  const context = ({ amountPaise = 1000, refundAmount = 400, paymentStatus = 'PAID', providerStatus = 'processed' } = {}) => {
    const state = {
      refund: { id: 'refund-id', paymentId: 'payment-id', amountPaise: refundAmount, status: 'PENDING', providerRefundId: null, idempotencyKey: 'idempotency-key-long', requestedByAdminId: 'admin-id' },
      payment: { id: 'payment-id', orderId: 'order-id', amountPaise, status: paymentStatus, providerPaymentId: 'pay-provider', order: { id: 'order-id', status: paymentStatus === 'CAPTURED_REQUIRES_ACTION' ? 'CANCELLED' : 'CONFIRMED' } },
      events: [], paymentWrites: 0, orderWrites: 0,
    };
    const completeRefund = () => ({ ...state.refund, payment: { ...state.payment, order: state.payment.order } });
    const tx = {
      $executeRaw: async () => 1,
      paymentRefund: {
        findUnique: async () => completeRefund(),
        update: async ({ data }) => Object.assign(state.refund, data),
      },
      payment: { update: async ({ data }) => { state.paymentWrites += 1; return Object.assign(state.payment, data); } },
      order: { update: async ({ data }) => { state.orderWrites += 1; return Object.assign(state.payment.order, data); } },
      orderEvent: { create: async ({ data }) => state.events.push(data) },
      paymentRefundAggregate: null,
    };
    tx.paymentRefund.aggregate = async () => ({ _sum: { amountPaise: state.refund.status === 'PROCESSED' ? state.refund.amountPaise : 0 } });
    const prisma = {
      $transaction: async (callback) => callback(tx),
      paymentRefund: { findUnique: async () => completeRefund(), update: async ({ data }) => Object.assign(state.refund, data) },
    };
    const razorpay = { findProviderRefund: async () => ({ id: 'rfnd-provider', amount: refundAmount, status: providerStatus, receipt: 'refund-id' }) };
    const service = new AdminOrdersService(prisma, razorpay, { record: async () => undefined });
    return { service, state, tx, prisma, razorpay };
  };

  await suite.test('partial refund changes balance once', async () => {
    const testContext = context();
    const provider = { id: 'rfnd-provider', amount: 400, status: 'processed', receipt: 'refund-id' };
    const first = await testContext.service.applyProviderRefund('admin-id', 'refund-id', provider);
    const second = await testContext.service.applyProviderRefund('admin-id', 'refund-id', provider);
    assert.equal(first.paymentStatus, 'PARTIALLY_REFUNDED');
    assert.equal(second.status, 'PROCESSED');
    assert.equal(testContext.state.paymentWrites, 1);
    assert.equal(testContext.state.events.length, 1);
  });

  await suite.test('full refund from recoverable capture closes payment and order', async () => {
    const testContext = context({ refundAmount: 1000, paymentStatus: 'CAPTURED_REQUIRES_ACTION' });
    const result = await testContext.service.reconcileRefund('admin-id', 'refund-id');
    assert.equal(result.paymentStatus, 'REFUNDED');
    assert.equal(testContext.state.payment.status, 'REFUNDED');
    assert.equal(testContext.state.payment.order.status, 'REFUNDED');
  });

  await suite.test('provider pending result does not alter internal payment balance', async () => {
    const testContext = context({ providerStatus: 'pending' });
    const result = await testContext.service.reconcileRefund('admin-id', 'refund-id');
    assert.equal(result.status, 'PENDING');
    assert.equal(testContext.state.payment.status, 'PAID');
    assert.equal(testContext.state.paymentWrites, 0);
  });

  await suite.test('duplicate idempotency key does not call the provider', async () => {
    const existing = { id: 'existing-refund', idempotencyKey: 'idempotency-key-long', status: 'PENDING' };
    let providerCalls = 0;
    const tx = {
      $executeRaw: async () => 1,
      payment: { findUnique: async () => ({ id: 'payment-id', providerPaymentId: 'pay-provider', status: 'PAID', amountPaise: 1000, order: { status: 'CONFIRMED' }, refunds: [existing] }) },
    };
    const service = new AdminOrdersService(
      { $transaction: async (callback) => callback(tx) },
      { refundProviderPayment: async () => { providerCalls += 1; } },
      { record: async () => undefined },
    );
    assert.equal((await service.refund('admin-id', 'order-id', existing.idempotencyKey, { amountPaise: 400 })).id, existing.id);
    assert.equal(providerCalls, 0);
  });
});

function filtered(exception) {
  let result;
  const response = { status(code) { this.code = code; return this; }, json(body) { result = { code: this.code, body }; } };
  const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ method: 'GET', url: '/safe-test' }) }) };
  new GlobalExceptionFilter().catch(exception, host);
  return result;
}

test('global exception filter emits safe predictable errors', async (suite) => {
  await suite.test('validation arrays remain compatible', () => assert.deepEqual(filtered(new BadRequestException(['rating must be an integer'])).body, { statusCode: 400, message: ['rating must be an integer'], error: 'Bad Request' }));
  await suite.test('not found is preserved', () => assert.equal(filtered(new NotFoundException('Order not found')).code, 404));
  await suite.test('conflict is preserved', () => assert.equal(filtered(new ConflictException('Conflict')).code, 409));
  await suite.test('unexpected details are sanitized', () => {
    const result = filtered(new Error('DATABASE_URL=postgres://secret SQL SELECT *'));
    assert.deepEqual(result.body, { statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' });
  });
  await suite.test('Prisma unique errors are sanitized as conflict', () => {
    const error = new Prisma.PrismaClientKnownRequestError('raw query and secret', { code: 'P2002', clientVersion: '7.9.1' });
    assert.deepEqual(filtered(error).body, { statusCode: 409, message: 'Resource already exists', error: 'Conflict' });
  });
});
