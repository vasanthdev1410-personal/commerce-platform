import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: new URL('../.env', import.meta.url) });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error(
    'TEST_DATABASE_URL is required; financial E2E must not use the development database',
  );

const port = 4019;
const base = `http://localhost:${port}/api/v1`;
const marker = `step14-${Date.now()}-${randomUUID().slice(0, 8)}`;
const suffix = marker.replaceAll('-', '').slice(-18).toUpperCase();
const pool = new pg.Pool({ connectionString: databaseUrl });
const created = {
  userIds: new Set(),
  orderIds: new Set(),
  paymentIds: new Set(),
  couponIds: new Set(),
  addressIds: new Set(),
  taxProfileId: null,
  productId: null,
  variantId: null,
  inventoryId: null,
};
let api,
  tokenA,
  tokenB,
  adminToken,
  userAId,
  userBId,
  adminId,
  primaryOrderId,
  raceOrderId;
const couponCodes = Object.fromEntries(
  ['save', 'expired', 'future', 'inactive', 'minimum', 'limit'].map((name) => [
    name,
    `${name.toUpperCase()}${suffix}`,
  ]),
);

const request = (path, { token, method = 'GET', body, key } = {}) =>
  fetch(base + path, {
    method,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(body && { 'content-type': 'application/json' }),
      ...(key && { 'Idempotency-Key': key }),
    },
    body: body && JSON.stringify(body),
  });
const register = async (role) => {
  const response = await request('/auth/register', {
    method: 'POST',
    body: {
      email: `${marker}-${role}@example.com`,
      password: 'correct horse battery staple',
      firstName: 'Tax',
      lastName: role,
    },
  });
  assert.equal(response.status, 201);
  return (await response.json()).accessToken;
};
const createCoupon = async (body) => {
  const response = await request('/admin/coupons', {
    method: 'POST',
    token: adminToken,
    body,
  });
  assert.equal(response.status, 201);
  const coupon = await response.json();
  created.couponIds.add(coupon.id);
  return coupon;
};

const cleanup = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const users = (
      await client.query(
        'SELECT id FROM "User" WHERE email = ANY($1::text[])',
        [['a', 'b', 'admin'].map((role) => `${marker}-${role}@example.com`)],
      )
    ).rows.map((row) => row.id);
    users.forEach((id) => created.userIds.add(id));
    if (created.variantId && created.userIds.size) {
      const orders = (
        await client.query(
          'SELECT DISTINCT o.id FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o.id WHERE oi."variantId" = $1 AND o."userId" = ANY($2::uuid[])',
          [created.variantId, [...created.userIds]],
        )
      ).rows;
      orders.forEach((row) => created.orderIds.add(row.id));
    }
    const orderIds = [...created.orderIds],
      userIds = [...created.userIds],
      couponIds = [...created.couponIds];
    if (orderIds.length) {
      const paymentIds = (
        await client.query(
          'SELECT id FROM "Payment" WHERE "orderId" = ANY($1::uuid[])',
          [orderIds],
        )
      ).rows.map((row) => row.id);
      paymentIds.forEach((id) => created.paymentIds.add(id));
      const itemIds = (
        await client.query(
          'SELECT id FROM "OrderItem" WHERE "orderId" = ANY($1::uuid[])',
          [orderIds],
        )
      ).rows.map((row) => row.id);
      await client.query(
        'DELETE FROM "Invoice" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      if (created.paymentIds.size)
        await client.query(
          'DELETE FROM "PaymentRefund" WHERE "paymentId" = ANY($1::uuid[])',
          [[...created.paymentIds]],
        );
      await client.query(
        'DELETE FROM "Payment" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      await client.query(
        'DELETE FROM "CouponRedemption" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      if (itemIds.length)
        await client.query(
          'DELETE FROM "ReturnItem" WHERE "orderItemId" = ANY($1::uuid[])',
          [itemIds],
        );
      await client.query(
        'DELETE FROM "ReturnRequest" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      await client.query(
        'DELETE FROM "Shipment" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      await client.query(
        'DELETE FROM "OrderEvent" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      await client.query(
        'DELETE FROM "CheckoutIdempotency" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      await client.query(
        'DELETE FROM "InventoryReservation" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      await client.query(
        'DELETE FROM "OrderItem" WHERE "orderId" = ANY($1::uuid[])',
        [orderIds],
      );
      await client.query('DELETE FROM "Order" WHERE id = ANY($1::uuid[])', [
        orderIds,
      ]);
    }
    if (couponIds.length) {
      await client.query(
        'DELETE FROM "CouponRedemption" WHERE "couponId" = ANY($1::uuid[])',
        [couponIds],
      );
      await client.query('DELETE FROM "Coupon" WHERE id = ANY($1::uuid[])', [
        couponIds,
      ]);
    }
    if (userIds.length) {
      const cartIds = (
        await client.query(
          'SELECT id FROM "Cart" WHERE "userId" = ANY($1::uuid[])',
          [userIds],
        )
      ).rows.map((row) => row.id);
      if (cartIds.length)
        await client.query(
          'DELETE FROM "CartItem" WHERE "cartId" = ANY($1::uuid[])',
          [cartIds],
        );
      await client.query(
        'DELETE FROM "Cart" WHERE "userId" = ANY($1::uuid[])',
        [userIds],
      );
      await client.query(
        'DELETE FROM "Address" WHERE "userId" = ANY($1::uuid[])',
        [userIds],
      );
      await client.query(
        'DELETE FROM "AuthSession" WHERE "userId" = ANY($1::uuid[])',
        [userIds],
      );
      await client.query(
        'DELETE FROM "AdminAuditLog" WHERE "adminUserId" = ANY($1::uuid[])',
        [userIds],
      );
      await client.query(
        'DELETE FROM "WholesaleApplication" WHERE "userId" = ANY($1::uuid[]) OR "reviewedByAdminId" = ANY($1::uuid[])',
        [userIds],
      );
      await client.query(
        'DELETE FROM "ProductReview" WHERE "userId" = ANY($1::uuid[])',
        [userIds],
      );
    }
    if (created.variantId)
      await client.query('DELETE FROM "Inventory" WHERE "variantId" = $1', [
        created.variantId,
      ]);
    if (created.productId) {
      await client.query(
        'DELETE FROM "ProductReviewStats" WHERE "productId" = $1',
        [created.productId],
      );
      await client.query('DELETE FROM "ProductImage" WHERE "productId" = $1', [
        created.productId,
      ]);
      await client.query(
        'DELETE FROM "ProductCategory" WHERE "productId" = $1',
        [created.productId],
      );
    }
    if (created.variantId)
      await client.query('DELETE FROM "ProductVariant" WHERE id = $1', [
        created.variantId,
      ]);
    if (created.productId)
      await client.query('DELETE FROM "Product" WHERE id = $1', [
        created.productId,
      ]);
    if (created.taxProfileId)
      await client.query('DELETE FROM "TaxProfile" WHERE id = $1', [
        created.taxProfileId,
      ]);
    if (userIds.length)
      await client.query('DELETE FROM "User" WHERE id = ANY($1::uuid[])', [
        userIds,
      ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

test('Step 14 tax, coupons, invoices, and fixture lifecycle', async (suite) => {
  api = spawn(process.execPath, ['dist/main.js'], {
    stdio: 'ignore',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      NODE_ENV: 'test',
      SELLER_STATE: 'Delhi',
      SELLER_LEGAL_NAME: 'Test Seller',
      SELLER_GSTIN: 'TESTGSTIN',
      SELLER_BILLING_ADDRESS: 'Seller Road',
      RAZORPAY_MOCK_MODE: 'true',
      RAZORPAY_KEY_ID: 'rzp_test',
      RAZORPAY_KEY_SECRET: 'test-only-secret',
      RAZORPAY_WEBHOOK_SECRET: 'test-only-secret',
    },
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await request('/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(ready, true, 'API did not become healthy');
  try {
    await suite.test('admin tax/coupon CRUD and fixtures', async () => {
      tokenA = await register('a');
      tokenB = await register('b');
      adminToken = await register('admin');
      const users = (
        await pool.query(
          'SELECT id,email FROM "User" WHERE email = ANY($1::text[])',
          [['a', 'b', 'admin'].map((role) => `${marker}-${role}@example.com`)],
        )
      ).rows;
      assert.equal(users.length, 3);
      users.forEach((user) => created.userIds.add(user.id));
      userAId = users.find((user) => user.email.endsWith('-a@example.com')).id;
      userBId = users.find((user) => user.email.endsWith('-b@example.com')).id;
      adminId = users.find((user) =>
        user.email.endsWith('-admin@example.com'),
      ).id;
      await pool.query('UPDATE "User" SET role = \'ADMIN\' WHERE id = $1', [
        adminId,
      ]);
      assert.equal(
        (
          await request('/admin/tax-profiles', {
            method: 'POST',
            token: tokenA,
            body: { name: 'Hack', code: 'H', rateBasisPoints: 0 },
          })
        ).status,
        403,
      );
      const taxResponse = await request('/admin/tax-profiles', {
        method: 'POST',
        token: adminToken,
        body: { name: 'Test 18', code: marker, rateBasisPoints: 1800 },
      });
      assert.equal(taxResponse.status, 201);
      const tax = await taxResponse.json();
      created.taxProfileId = tax.id;
      await createCoupon({
        code: ` ${couponCodes.save} `,
        name: 'Save',
        type: 'PERCENTAGE',
        value: 1000,
        maxDiscountPaise: 500,
        minimumSubtotalPaise: 1000,
      });
      created.productId = randomUUID();
      created.variantId = randomUUID();
      created.inventoryId = randomUUID();
      const addressA = randomUUID(),
        addressB = randomUUID();
      created.addressIds.add(addressA);
      created.addressIds.add(addressB);
      await pool.query(
        'INSERT INTO "Product"(id,name,slug,"isActive","createdAt","updatedAt") VALUES($1,$2,$2,true,now(),now())',
        [created.productId, marker],
      );
      await pool.query(
        'INSERT INTO "ProductVariant"(id,"productId",sku,name,attributes,"retailPricePaise","wholesaleMinQty","isActive","taxProfileId","createdAt","updatedAt") VALUES($1,$2,$3,\'Default\',$4,1000,1,true,$5,now(),now())',
        [created.variantId, created.productId, marker, {}, tax.id],
      );
      await pool.query(
        'INSERT INTO "Inventory"(id,"variantId","stockQuantity","reservedQuantity","reorderLevel","updatedAt") VALUES($1,$2,20,0,0,now())',
        [created.inventoryId, created.variantId],
      );
      for (const [id, userId] of [
        [addressA, userAId],
        [addressB, userBId],
      ])
        await pool.query(
          'INSERT INTO "Address"(id,"userId",label,"fullName",phone,"addressLine1",city,state,"postalCode","countryCode","isDefault","createdAt","updatedAt") VALUES($1,$2,\'Home\',\'Tax User\',\'9876543210\',\'Road\',\'Delhi\',\'Delhi\',\'110001\',\'IN\',true,now(),now())',
          [id, userId],
        );
    });

    await suite.test(
      'server totals, complete snapshots, and Razorpay',
      async () => {
        const [addressA] = [...created.addressIds];
        assert.equal(
          (
            await request('/cart/items', {
              method: 'POST',
              token: tokenA,
              body: { variantId: created.variantId, quantity: 3 },
            })
          ).status,
          201,
        );
        assert.equal(
          (
            await request('/checkout/preview', {
              method: 'POST',
              token: tokenA,
              body: {
                addressId: addressA,
                couponCode: couponCodes.save,
                taxPaise: 0,
                totalPaise: 1,
              },
            })
          ).status,
          400,
        );
        const preview = await (
          await request('/checkout/preview', {
            method: 'POST',
            token: tokenA,
            body: {
              addressId: addressA,
              couponCode: couponCodes.save.toLowerCase(),
            },
          })
        ).json();
        assert.deepEqual(
          [
            preview.subtotalPaise,
            preview.discountPaise,
            preview.taxablePaise,
            preview.cgstPaise,
            preview.sgstPaise,
            preview.igstPaise,
            preview.taxPaise,
            preview.totalPaise,
          ],
          [3000, 300, 2700, 243, 243, 0, 486, 3186],
        );
        const response = await request('/checkout/order', {
          method: 'POST',
          token: tokenA,
          key: `${marker}-primary`,
          body: { addressId: addressA, couponCode: couponCodes.save },
        });
        assert.equal(response.status, 201);
        const order = await response.json();
        primaryOrderId = order.id;
        created.orderIds.add(order.id);
        assert.equal(order.totalPaise, 3186);
        const item = (
          await pool.query(
            'SELECT "taxRateBasisPoints","taxablePaise","taxPaise","cgstPaise","sgstPaise","igstPaise" FROM "OrderItem" WHERE "orderId" = $1',
            [primaryOrderId],
          )
        ).rows[0];
        assert.deepEqual(
          [
            item.taxRateBasisPoints,
            item.taxablePaise,
            item.taxPaise,
            item.cgstPaise,
            item.sgstPaise,
            item.igstPaise,
          ],
          [1800, 2700, 486, 243, 243, 0],
        );
        const payment = await request('/payments/razorpay/create', {
          method: 'POST',
          token: tokenA,
          body: { orderId: primaryOrderId },
        });
        assert.equal(payment.status, 201);
        assert.equal((await payment.json()).amountPaise, 3186);
      },
    );

    await suite.test(
      'coupon validation and race-safe usage limit',
      async () => {
        const [, addressB] = [...created.addressIds];
        assert.equal(
          (
            await request('/cart/items', {
              method: 'POST',
              token: tokenB,
              body: { variantId: created.variantId, quantity: 1 },
            })
          ).status,
          201,
        );
        await pool.query(
          'UPDATE "Address" SET state = \'Haryana\' WHERE id = $1',
          [addressB],
        );
        const interstate = await (
          await request('/checkout/preview', {
            method: 'POST',
            token: tokenB,
            body: { addressId: addressB },
          })
        ).json();
        assert.deepEqual(
          [interstate.cgstPaise, interstate.sgstPaise, interstate.igstPaise],
          [0, 0, 180],
        );
        await pool.query(
          'UPDATE "Address" SET state = \'Delhi\' WHERE id = $1',
          [addressB],
        );
        for (const [code, extra] of [
          [
            couponCodes.expired,
            { expiresAt: new Date(Date.now() - 1000).toISOString() },
          ],
          [
            couponCodes.future,
            { startsAt: new Date(Date.now() + 86400000).toISOString() },
          ],
          [couponCodes.inactive, { isActive: false }],
          [couponCodes.minimum, { minimumSubtotalPaise: 999999 }],
        ]) {
          await createCoupon({
            code,
            name: code,
            type: 'FIXED',
            value: 100,
            ...extra,
          });
          assert.equal(
            (
              await request('/checkout/preview', {
                method: 'POST',
                token: tokenB,
                body: { addressId: addressB, couponCode: code },
              })
            ).status,
            400,
          );
        }
        const limit = await createCoupon({
          code: couponCodes.limit,
          name: 'Limit',
          type: 'FIXED',
          value: 100,
          usageLimit: 1,
        });
        await request('/cart/items', {
          method: 'POST',
          token: tokenA,
          body: { variantId: created.variantId, quantity: 1 },
        });
        const responses = await Promise.all([
          request('/checkout/order', {
            method: 'POST',
            token: tokenA,
            key: `${marker}-race-a`,
            body: {
              addressId: [...created.addressIds][0],
              couponCode: couponCodes.limit,
            },
          }),
          request('/checkout/order', {
            method: 'POST',
            token: tokenB,
            key: `${marker}-race-b`,
            body: { addressId: addressB, couponCode: couponCodes.limit },
          }),
        ]);
        assert.equal(
          responses.filter((response) => response.status === 201).length,
          1,
        );
        assert.equal(
          responses.filter((response) => response.status === 409).length,
          1,
        );
        raceOrderId = (
          await responses.find((response) => response.status === 201).json()
        ).id;
        created.orderIds.add(raceOrderId);
        assert.equal(
          Number(
            (
              await pool.query(
                'SELECT count(*) FROM "CouponRedemption" WHERE "couponId" = $1',
                [limit.id],
              )
            ).rows[0].count,
          ),
          1,
        );
      },
    );

    await suite.test(
      'invoice idempotency and legacy NULL snapshots',
      async () => {
        const primaryPaymentId = `pay_invoice_${randomUUID().replaceAll('-', '')}`;
        const updated = await pool.query(
          'UPDATE "Payment" SET status = \'PAID\', "providerPaymentId" = $1 WHERE "orderId" = $2 RETURNING id',
          [primaryPaymentId, primaryOrderId],
        );
        updated.rows.forEach((row) => created.paymentIds.add(row.id));
        await pool.query(
          'UPDATE "Order" SET status = \'CONFIRMED\' WHERE id = $1',
          [primaryOrderId],
        );
        assert.equal(
          (
            await request(`/orders/${primaryOrderId}/invoice`, {
              token: tokenB,
            })
          ).status,
          404,
        );
        let response = await request(`/orders/${primaryOrderId}/invoice`, {
          token: tokenA,
        });
        const first = await response.json();
        assert.equal(response.status, 200);
        assert.match(first.invoiceNumber, /^INV-\d{4}-[A-F0-9]{16}$/);
        assert.deepEqual(
          [
            first.financialSnapshot.items[0].taxRateBasisPoints,
            first.financialSnapshot.items[0].taxablePaise,
            first.financialSnapshot.items[0].taxPaise,
          ],
          [1800, 2700, 486],
        );
        await pool.query(
          'UPDATE "ProductVariant" SET "retailPricePaise" = 999999 WHERE id = $1',
          [created.variantId],
        );
        const second = await (
          await request(`/orders/${primaryOrderId}/invoice`, { token: tokenA })
        ).json();
        assert.equal(second.id, first.id);
        assert.equal(second.financialSnapshot.totalPaise, 3186);
        assert.equal(
          (
            await request(`/admin/orders/${primaryOrderId}/invoice`, {
              token: adminToken,
            })
          ).status,
          200,
        );
        const raceOrder = (
          await pool.query(
            'SELECT "userId","totalPaise","taxPaise" FROM "Order" WHERE id = $1',
            [raceOrderId],
          )
        ).rows[0];
        const legacyPaymentId = randomUUID();
        created.paymentIds.add(legacyPaymentId);
        await pool.query(
          'INSERT INTO "Payment"(id,"orderId",provider,"providerOrderId","providerPaymentId",status,"amountPaise","createdAt","updatedAt") VALUES($1,$2,\'RAZORPAY\',$3,$4,\'PAID\',$5,now(),now())',
          [
            legacyPaymentId,
            raceOrderId,
            `order_${randomUUID().replaceAll('-', '').slice(0, 24)}`,
            `pay_invoice_${randomUUID().replaceAll('-', '')}`,
            raceOrder.totalPaise,
          ],
        );
        await pool.query(
          'UPDATE "Order" SET status = \'CONFIRMED\' WHERE id = $1',
          [raceOrderId],
        );
        await pool.query(
          'UPDATE "OrderItem" SET "taxRateBasisPoints"=NULL,"taxablePaise"=NULL,"taxPaise"=NULL,"cgstPaise"=NULL,"sgstPaise"=NULL,"igstPaise"=NULL WHERE "orderId"=$1',
          [raceOrderId],
        );
        assert.equal(
          Number(
            (
              await pool.query(
                'SELECT count(DISTINCT "providerPaymentId") FROM "Payment" WHERE "orderId" = ANY($1::uuid[])',
                [[primaryOrderId, raceOrderId]],
              )
            ).rows[0].count,
          ),
          2,
        );
        response = await request(`/orders/${raceOrderId}/invoice`, {
          token: raceOrder.userId === userAId ? tokenA : tokenB,
        });
        const legacy = await response.json();
        assert.equal(response.status, 200);
        assert.deepEqual(
          [
            legacy.financialSnapshot.items[0].taxRateBasisPoints,
            legacy.financialSnapshot.items[0].taxablePaise,
            legacy.financialSnapshot.items[0].taxPaise,
          ],
          [null, null, null],
        );
        assert.equal(legacy.financialSnapshot.taxPaise, raceOrder.taxPaise);
        assert.equal(
          Number(
            (
              await pool.query(
                'SELECT count(*) FROM "Invoice" WHERE "orderId" = ANY($1::uuid[])',
                [[primaryOrderId, raceOrderId]],
              )
            ).rows[0].count,
          ),
          2,
        );
      },
    );
  } finally {
    if (api && api.exitCode === null) {
      api.kill();
      await Promise.race([
        once(api, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    await cleanup();
    await pool.end();
  }
});
